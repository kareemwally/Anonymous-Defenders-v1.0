const jwt = require('jsonwebtoken');
const User = require('../models/User');

const optionalAuth = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '');
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (token) {
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
                await User.updateOne({ _id: user._id }, { $set: { uploadCount: 0 } });
            }
        }

        // Check for subscription expiry
        if (user.isActiveSubscription && user.subscriptionEndDate && new Date() > user.subscriptionEndDate) {
          user.isActiveSubscription = false;
          user.subscriptionTier = 'free';
          user.uploadQuota = 3;
          await User.updateOne(
            { _id: user._id },
            { $set: { isActiveSubscription: false, subscriptionTier: 'free', uploadQuota: 3 } }
          );

          // If owner: expire all active team members too
          if (user.teamRole === 'owner' && user.teamId) {
            const Team = require('../models/Team');
            const team = await Team.findById(user.teamId);
            if (team) {
              const activeMembers = team.members.filter(m => m.status === 'active' && m.userId);
              await Promise.all(activeMembers.map(m =>
                User.updateOne(
                  { _id: m.userId },
                  { $set: { isActiveSubscription: false, subscriptionTier: null, uploadQuota: 3, uploadCount: 0 } }
                )
              ));
            }
          }
        }
        req.user = user;
      }
    } catch (err) {
      console.error('optionalAuth token verification error:', err);
      // Invalid token, ignore and treat as guest
    }
  }
  next();
};


module.exports = optionalAuth; 