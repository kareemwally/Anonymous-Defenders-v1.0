const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  email: { type: String, required: true },
  status: { type: String, enum: ['pending', 'active'], default: 'pending' },
  inviteToken: { type: String, sparse: true },
  inviteExpiresAt: { type: Date },
  joinedAt: { type: Date }
}, { _id: false });

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  plan: { type: String, enum: ['C', 'D'], required: true },
  maxMembers: { type: Number, required: true },
  subscriptionEndDate: { type: Date, required: true },
  members: { type: [memberSchema], default: [] }
}, { timestamps: true });

// Plan C → 5 members max, Plan D → 10 members max (not counting owner)
teamSchema.statics.maxMembersForPlan = function (plan) {
  return plan === 'D' ? 10 : 5;
};

module.exports = mongoose.model('Team', teamSchema);
