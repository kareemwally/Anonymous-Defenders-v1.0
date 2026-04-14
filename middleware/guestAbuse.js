const crypto = require('crypto');
const User = require('../models/User');

// Anonymous Guest Abuse Prevention Middleware
const guestAbusePrevention = async (req, res, next) => {
    try {
        // Skip for authenticated users
        if (req.user && !req.user.isGuest) {
            return next();
        }
        
        // Get client IP for tracking (Handle potential proxy list)
        let clientIP = req.headers['x-forwarded-for'] || 
                       req.headers['x-real-ip'] || 
                       req.connection.remoteAddress || 
                       req.socket.remoteAddress;
        
        // If x-forwarded-for contains a list, take the first one
        if (clientIP && typeof clientIP === 'string' && clientIP.includes(',')) {
            clientIP = clientIP.split(',')[0].trim();
        }
        
        // Strip port number if present (e.g., ::ffff:192.168.1.1:12345 or 169.254.169.126:36706)
        if (typeof clientIP === 'string') {
            const parts = clientIP.split(':');
            if (parts.length === 2) {
                clientIP = parts[0];
            } else if (parts.length > 2 && clientIP.includes('.')) {
                const lastPartIndex = clientIP.lastIndexOf(':');
                const possiblePort = clientIP.substring(lastPartIndex + 1);
                if (!isNaN(possiblePort)) {
                    clientIP = clientIP.substring(0, lastPartIndex);
                }
            }
        }
        
        // Check if this is a guest upload endpoint
        if (req.path.includes('/upload') && req.method === 'POST') {
            
            // Find anonymous guest by IP
            const guestUser = await User.findOne({
                ipAddress: clientIP,
                isGuest: true
            });
            
            if (guestUser) {
                // Check if user is blocked
                if (guestUser.isBlocked) {
                    return res.status(403).json({
                        error: 'Access denied. IP address is blocked due to abuse.',
                        isBlocked: true,
                        clientIP: clientIP
                    });
                }
                
                // Check daily upload limit
                const today = new Date();
                const lastUpload = guestUser.lastUploadDate;
                const isNewDay = !lastUpload || 
                    new Date(lastUpload).toDateString() !== today.toDateString();
                
                let currentUploadCount = guestUser.uploadCount;
                
                // Reset counter if it's a new day
                if (isNewDay) {
                    currentUploadCount = 0;
                    await User.findByIdAndUpdate(guestUser._id, {
                        uploadCount: 0,
                        lastUploadDate: today
                    });
                }
                
                // Check if over limit
                if (currentUploadCount >= guestUser.dailyUploadLimit) {
                    return res.status(429).json({
                        error: 'Daily upload limit exceeded for anonymous users',
                        limit: guestUser.dailyUploadLimit,
                        currentUploads: currentUploadCount,
                        remainingUploads: 0,
                        resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000), // Next day
                        clientIP: clientIP,
                        message: 'Anonymous users have a daily limit of 3 uploads. Please try again tomorrow.'
                    });
                }
                
                // Add guest info to request for tracking
                req.guestUser = guestUser;
                req.remainingUploads = guestUser.dailyUploadLimit - currentUploadCount;
                req.clientIP = clientIP;
            } else {
                // Create new anonymous guest in DB to track them properly with guaranteed uniqueness
                const randomId = crypto.randomBytes(4).toString('hex');
                const newGuest = await User.create({
                    name: 'Guest User',
                    username: `guest_${randomId}_${Date.now()}`,
                    email: `guest_${randomId}@anonymous-defenders.com`, 
                    isGuest: true,
                    ipAddress: clientIP,
                    uploadCount: 0,
                    dailyUploadLimit: 3,
                    lastUploadDate: new Date()
                });
                
                req.guestUser = newGuest;
                req.clientIP = clientIP;
                req.remainingUploads = 3;
            }
        }
        
        next();
        
    } catch (error) {
        console.error('Guest abuse prevention error:', error);
        res.status(500).json({
            error: 'Server error during abuse prevention check'
        });
    }
};

module.exports = guestAbusePrevention;
