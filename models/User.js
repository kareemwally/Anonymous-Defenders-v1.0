const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  password: { type: String, required: false },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: false },
  jobTitle: { type: String, required: false },
  yearsOfExperience: { type: Number, required: false },
  company: { type: String, required: false },
  googleId: { type: String, required: false, unique: true, sparse: true },
  githubId: { type: String, required: false, unique: true, sparse: true },
  
    // Guest User Fields
  isGuest: { type: Boolean, default: false },
  ipAddress: { type: String, sparse: true },
  uploadCount: { type: Number, default: 0 },

  lastUploadDate: { type: Date, sparse: true },
  dailyUploadLimit: { type: Number, default: 3 },
  isBlocked: { type: Boolean, default: false },
  
  // Subscription Fields
  subscriptionTier: { type: String, enum: ['A', 'B', 'C', 'D'], sparse: true },
  uploadQuota: { type: Number, default: 3 },
  subscriptionStartDate: { type: Date, sparse: true },
  subscriptionEndDate: { type: Date, sparse: true },
  isActiveSubscription: { type: Boolean, default: false },

  // Team Fields
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  teamRole: { type: String, enum: ['owner', 'member'], default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);