const ApiKey = require('../models/ApiKey');

// API Key Authentication Middleware
const apiKeyAuth = async (req, res, next) => {
  try {
    // Get API key from header
    const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace('Bearer ', '');
    
    if (!apiKey) {
      return res.status(401).json({ 
        error: 'API key required',
        message: 'Please provide an API key in X-API-Key header or Authorization header'
      });
    }
    
    // Find API key in database
    const keyDoc = await ApiKey.findOne({ key: apiKey, status: 'active' })
      .populate('userId', 'name email subscription');
    
    if (!keyDoc) {
      return res.status(401).json({ 
        error: 'Invalid API key',
        message: 'The provided API key is invalid or inactive'
      });
    }
    
    // Check if key is expired
    if (keyDoc.isExpired()) {
      return res.status(401).json({ 
        error: 'API key expired',
        message: 'Your API key has expired. Please generate a new one.'
      });
    }
    
    // Check rate limits
    const rateLimitCheck = keyDoc.isRateLimited();
    if (rateLimitCheck.limited) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        message: `Rate limit exceeded. Reason: ${rateLimitCheck.reason}`,
        resetTime: rateLimitCheck.resetTime,
        limitInfo: {
          daily: {
            used: keyDoc.usage.daily.count,
            limit: keyDoc.rateLimit.requestsPerDay
          },
          monthly: {
            used: keyDoc.usage.monthly.count,
            limit: keyDoc.rateLimit.requestsPerMonth
          }
        }
      });
    }
    
    // Update usage
    await keyDoc.updateUsage();
    
    // Add API key info to request
    req.apiKey = keyDoc;
    req.user = keyDoc.userId;
    req.apiKeyInfo = {
      keyId: keyDoc._id,
      permissions: keyDoc.permissions,
      rateLimit: keyDoc.rateLimit,
      usage: keyDoc.usage
    };
    
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Permission checking middleware
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKey || !req.apiKey.permissions.includes(permission)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `This API key requires '${permission}' permission`,
        requiredPermission: permission,
        currentPermissions: req.apiKey?.permissions || []
      });
    }
    next();
  };
};

module.exports = { apiKeyAuth, requirePermission };
