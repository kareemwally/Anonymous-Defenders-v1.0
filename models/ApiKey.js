const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  permissions: {
    type: [String],
    enum: ['upload', 'analyze', 'read'],
    default: ['upload', 'analyze', 'read']
  },
  rateLimit: {
    requestsPerDay: {
      type: Number,
      required: true
    },
    requestsPerMonth: {
      type: Number,
      required: true
    }
  },
  usage: {
    daily: {
      date: {
        type: Date,
        default: Date.now
      },
      count: {
        type: Number,
        default: 0
      }
    },
    monthly: {
      date: {
        type: Date,
        default: () => {
          const now = new Date();
          return new Date(now.getFullYear(), now.getMonth(), 1);
        }
      },
      count: {
        type: Number,
        default: 0
      }
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  expiresAt: {
    type: Date,
    default: () => {
      const now = new Date();
      return new Date(now.setFullYear(now.getFullYear() + 1));
    }
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    createdBy: {
      type: String,
      enum: ['user', 'admin', 'auto'],
      default: 'user'
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
apiKeySchema.index({ userId: 1, status: 1 });
apiKeySchema.index({ key: 1, status: 1 });
apiKeySchema.index({ 'usage.daily.date': 1 });
apiKeySchema.index({ 'usage.monthly.date': 1 });

// Static methods
apiKeySchema.statics.generateKey = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Instance methods
apiKeySchema.methods.isExpired = function() {
  return this.expiresAt < new Date();
};

apiKeySchema.methods.isRateLimited = function() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Check daily limit
  if (this.usage.daily.date.toDateString() === today.toDateString()) {
    if (this.usage.daily.count >= this.rateLimit.requestsPerDay) {
      return { limited: true, reason: 'daily', resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    }
  }
  
  // Check monthly limit
  if (this.usage.monthly.date.toDateString() === thisMonth.toDateString()) {
    if (this.usage.monthly.count >= this.rateLimit.requestsPerMonth) {
      return { limited: true, reason: 'monthly', resetTime: new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 1, 1) };
    }
  }
  
  return { limited: false };
};

apiKeySchema.methods.updateUsage = function() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Reset daily count if new day
  if (this.usage.daily.date.toDateString() !== today.toDateString()) {
    this.usage.daily = { date: today, count: 0 };
  }
  
  // Reset monthly count if new month
  if (this.usage.monthly.date.toDateString() !== thisMonth.toDateString()) {
    this.usage.monthly = { date: thisMonth, count: 0 };
  }
  
  // Increment counts
  this.usage.daily.count++;
  this.usage.monthly.count++;
  this.lastUsed = now;
  
  return this.save();
};

module.exports = mongoose.model('ApiKey', apiKeySchema);
