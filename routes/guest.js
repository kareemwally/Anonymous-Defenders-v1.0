const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Helper function to get client IP
const getClientIP = (req) => {
    return req.headers['x-forwarded-for'] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress;
};

// Generate anonymous guest ID
const generateGuestId = () => {
    return 'guest_' + Math.random().toString(36).substr(2, 9);
};

// Get Guest Status (Anonymous - no registration)
router.get('/status', async (req, res) => {
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
        
        // Update upload count and check limits
        const newUploadCount = guestUser.uploadCount + 1;
        const isOverLimit = newUploadCount > guestUser.uploadQuota;
        
        await User.findByIdAndUpdate(guestId, {
            uploadCount: newUploadCount,
            lastUploadDate: new Date(),
            isBlocked: isOverLimit
        });
        
        res.status(200).json({
            message: 'Upload recorded',
            uploadCount: newUploadCount,
            uploadQuota: guestUser.uploadQuota,
            remainingUploads: guestUser.uploadQuota - newUploadCount,
            isBlocked: isOverLimit
        });
        
    } catch (error) {
        console.error('Upload complete error:', error);
        res.status(500).json({ 
            error: 'Failed to record upload' 
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
