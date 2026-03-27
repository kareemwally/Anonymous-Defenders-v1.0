const User = require('../models/User');

// Anonymous Guest Abuse Prevention Middleware
const guestAbusePrevention = async (req, res, next) => {
    try {
        // Skip for authenticated users
        if (req.user && !req.user.isGuest) {
            return next();
        }
        
        // Get client IP for tracking
        const clientIP = req.headers['x-forwarded-for'] || 
                       req.headers['x-real-ip'] || 
                       req.connection.remoteAddress || 
                       req.socket.remoteAddress;
        
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
                // New anonymous guest - they can upload
                req.clientIP = clientIP;
                req.remainingUploads = 3; // Fresh guest gets 3 uploads
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
