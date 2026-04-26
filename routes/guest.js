const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const User = require('../models/User');

// Strict limiter for the status endpoint — it creates a DB record on first visit
const guestStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

// Helper function to get client IP
const getClientIP = (req) => {
    let ip = req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress;
           
    // If it's a comma-separated list from x-forwarded-for, get the first one
    if (typeof ip === 'string' && ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }
    
    // Strip port number if present (e.g., ::ffff:192.168.1.1:12345 or 169.254.169.126:36706)
    if (typeof ip === 'string') {
        // Handle IPv6 and IPv4
        const parts = ip.split(':');
        // If it's IPv4 with a port (contains only one colon)
        if (parts.length === 2) {
            ip = parts[0];
        } 
        // If it's IPv4 mapped IPv6 with a port (e.g., ::ffff:192.168.1.1:12345)
        else if (parts.length > 2 && ip.includes('.')) {
            const lastPartIndex = ip.lastIndexOf(':');
            const possiblePort = ip.substring(lastPartIndex + 1);
            if (!isNaN(possiblePort)) {
                ip = ip.substring(0, lastPartIndex);
            }
        }
    }
    
    return ip;
};

// Generate anonymous guest ID
const generateGuestId = () => {
    return 'guest_' + Math.random().toString(36).substr(2, 9);
};

// Get Guest Status (Anonymous - no registration)
router.get('/status', guestStatusLimiter, async (req, res) => {
    try {
        const clientIP = getClientIP(req);
        
        // Find or create anonymous guest by IP
        let guestUser = await User.findOne({
            ipAddress: clientIP,
            isGuest: true
        });
        
        // If no guest exists, create one automatically
        if (!guestUser) {
            guestUser = new User({
                username: generateGuestId(),
                email: `${generateGuestId()}@anonymous.local`,
                isGuest: true,
                ipAddress: clientIP,
                uploadCount: 0,
                dailyUploadLimit: 3,
                uploadQuota: 3
            });
            await guestUser.save();
        }
        
        // Check if it's a new day
        const today = new Date();
        const lastUpload = guestUser.lastUploadDate;
        const isNewDay = !lastUpload || 
            new Date(lastUpload).toDateString() !== today.toDateString();
        
        let remainingUploads = guestUser.uploadQuota - guestUser.uploadCount;
        
        // Reset counter if it's a new day
        if (isNewDay) {
            remainingUploads = guestUser.dailyUploadLimit;
            await User.findByIdAndUpdate(guestUser._id, {
                uploadCount: 0,
                lastUploadDate: today
            });
        }
        
        res.status(200).json({
            guestId: guestUser._id,
            username: guestUser.username,
            isGuest: true,
            uploadCount: guestUser.uploadCount,
            uploadQuota: guestUser.uploadQuota,
            dailyUploadLimit: guestUser.dailyUploadLimit,
            remainingUploads,
            lastUploadDate: guestUser.lastUploadDate,
            isBlocked: guestUser.isBlocked,
            ipAddress: clientIP
        });
        
    } catch (error) {
        console.error('Guest status error:', error);
        res.status(500).json({ 
            error: 'Failed to check guest status' 
        });
    }
});

// Update Upload Count (called after successful upload)
// DEPRECATED: uploadController.js now handles the increment securely on the backend.
// This endpoint now simply returns the current status.
router.post('/upload-complete', async (req, res) => {
    try {
        const { guestId } = req.body;
        const clientIP = getClientIP(req);
        
        // Find guest by ID and IP for security
        const guestUser = await User.findOne({
            _id: guestId,
            ipAddress: clientIP,
            isGuest: true
        });
        
        if (!guestUser) {
            return res.status(404).json({ 
                error: 'Guest not found' 
            });
        }
        
        const isOverLimit = guestUser.uploadCount > guestUser.uploadQuota;
        
        res.status(200).json({
            message: 'Upload status retrieved',
            uploadCount: guestUser.uploadCount,
            uploadQuota: guestUser.uploadQuota,
            remainingUploads: Math.max(0, guestUser.uploadQuota - guestUser.uploadCount),
            isBlocked: guestUser.isBlocked || isOverLimit
        });
        
    } catch (error) {
        console.error('Upload complete error:', error);
        res.status(500).json({ 
            error: 'Failed to retrieve upload status' 
        });
    }
});

// Check if guest can upload (before upload)
router.get('/can-upload', async (req, res) => {
    try {
        const clientIP = getClientIP(req);
        
        const guestUser = await User.findOne({
            ipAddress: clientIP,
            isGuest: true
        });
        
        if (!guestUser) {
            return res.status(200).json({
                canUpload: true,
                remainingUploads: 3,
                isNewGuest: true
            });
        }
        
        // Check if blocked
        if (guestUser.isBlocked) {
            return res.status(403).json({
                canUpload: false,
                error: 'Access denied due to abuse',
                isBlocked: true
            });
        }
        
        // Check daily limit
        const today = new Date();
        const lastUpload = guestUser.lastUploadDate;
        const isNewDay = !lastUpload || 
            new Date(lastUpload).toDateString() !== today.toDateString();
        
        let currentUploadCount = guestUser.uploadCount;
        let remainingUploads = guestUser.dailyUploadLimit - currentUploadCount;
        
        // Reset if new day
        if (isNewDay) {
            remainingUploads = guestUser.dailyUploadLimit;
        }
        
        res.status(200).json({
            canUpload: remainingUploads > 0,
            remainingUploads,
            uploadCount: currentUploadCount,
            dailyLimit: guestUser.dailyUploadLimit,
            isNewDay,
            guestId: guestUser._id
        });
        
    } catch (error) {
        console.error('Can upload check error:', error);
        res.status(500).json({ 
            error: 'Failed to check upload permission' 
        });
    }
});

module.exports = router;
