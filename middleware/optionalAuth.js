const jwt = require('jsonwebtoken');
const User = require('../models/User');

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
            if (user) {
        // Daily reset for free registered users
        const today = new Date().toDateString();
                if (!user.isActiveSubscription) {
            const lastUpload = user.lastUploadDate ? new Date(user.lastUploadDate).toDateString() : null;
            if (lastUpload !== today) {
                user.uploadCount = 0;
                await user.save();
            }
        }


        // Check for subscription expiry

        if (user.isActiveSubscription && user.subscriptionEndDate && new Date() > user.subscriptionEndDate) {
          user.isActiveSubscription = false;
          user.subscriptionTier = 'free';
          user.uploadQuota = 3;
          await user.save();
        }
        req.user = user;
      }
    } catch (err) {
      // Invalid token, ignore and treat as guest
    }
  }
  next();
};


module.exports = optionalAuth; 