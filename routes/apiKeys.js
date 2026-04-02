const express = require('express');
const router = express.Router();
const ApiKey = require('../models/ApiKey');
const User = require('../models/User');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Rate limiting for API key generation
const createKeyLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 keys per hour
  message: { error: 'Too many API keys created. Please try again later.' }
});

// Get user's API keys
router.get('/', auth, async (req, res) => {
  try {
    const apiKeys = await ApiKey.find({ userId: req.user._id })
      .select('-__v')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: apiKeys.map(key => ({
        id: key._id,
        name: key.name,
        key: key.key,
        permissions: key.permissions,
        rateLimit: key.rateLimit,
        usage: key.usage,
        status: key.status,
        expiresAt: key.expiresAt,
        lastUsed: key.lastUsed,
        createdAt: key.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// Create new API key
router.post('/', auth, createKeyLimit, async (req, res) => {
  try {
    const { name, permissions } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'API key name is required' });
    }
    
    // Get user's subscription plan
    const user = await User.findById(req.user._id);
    if (!user || !user.subscription) {
      return res.status(400).json({ error: 'No active subscription found' });
    }
    
    // Check API key limits based on subscription
    const userApiKeys = await ApiKey.find({ userId: req.user._id, status: 'active' });
    const planLimits = {
      'free': { maxKeys: 0, requestsPerDay: 0, requestsPerMonth: 0 },
      'A': { maxKeys: 2, requestsPerDay: 50, requestsPerMonth: 1000 },
      'B': { maxKeys: 5, requestsPerDay: 150, requestsPerMonth: 5000 },
      'C': { maxKeys: 10, requestsPerDay: 300, requestsPerMonth: 15000 },
      'D': { maxKeys: 20, requestsPerDay: 500, requestsPerMonth: 30000 }
    };
    
    const limits = planLimits[user.subscription.plan] || planLimits['free'];
    
    if (userApiKeys.length >= limits.maxKeys) {
      return res.status(400).json({ 
        error: `Maximum API keys limit reached for ${user.subscription.plan} plan (${limits.maxKeys} keys)` 
      });
    }
    
    // Generate new API key
    const newApiKey = new ApiKey({
      key: ApiKey.generateKey(),
      userId: req.user._id,
      name: name.trim(),
      permissions: permissions || ['upload', 'analyze', 'read'],
      rateLimit: {
        requestsPerDay: limits.requestsPerDay,
        requestsPerMonth: limits.requestsPerMonth
      },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        createdBy: 'user'
      }
    });
    
    await newApiKey.save();
    
    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      data: {
        id: newApiKey._id,
        name: newApiKey.name,
        key: newApiKey.key,
        permissions: newApiKey.permissions,
        rateLimit: newApiKey.rateLimit,
        status: newApiKey.status,
        expiresAt: newApiKey.expiresAt,
        createdAt: newApiKey.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// Update API key
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, permissions, status } = req.body;
    const apiKey = await ApiKey.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    if (name) apiKey.name = name.trim();
    if (permissions) apiKey.permissions = permissions;
    if (status) apiKey.status = status;
    
    await apiKey.save();
    
    res.json({
      success: true,
      message: 'API key updated successfully',
      data: {
        id: apiKey._id,
        name: apiKey.name,
        permissions: apiKey.permissions,
        status: apiKey.status,
        updatedAt: apiKey.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// Delete API key
router.delete('/:id', auth, async (req, res) => {
  try {
    const apiKey = await ApiKey.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

// Get API key usage statistics
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const apiKey = await ApiKey.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    // Calculate usage percentages
    const dailyUsagePercent = (apiKey.usage.daily.count / apiKey.rateLimit.requestsPerDay) * 100;
    const monthlyUsagePercent = (apiKey.usage.monthly.count / apiKey.rateLimit.requestsPerMonth) * 100;
    
    res.json({
      success: true,
      data: {
        keyId: apiKey._id,
        keyName: apiKey.name,
        currentUsage: {
          daily: {
            used: apiKey.usage.daily.count,
            limit: apiKey.rateLimit.requestsPerDay,
            percentage: Math.min(dailyUsagePercent, 100),
            resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000)
          },
          monthly: {
            used: apiKey.usage.monthly.count,
            limit: apiKey.rateLimit.requestsPerMonth,
            percentage: Math.min(monthlyUsagePercent, 100),
            resetTime: new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 1, 1)
          }
        },
        status: apiKey.status,
        lastUsed: apiKey.lastUsed,
        expiresAt: apiKey.expiresAt,
        isExpired: apiKey.isExpired()
      }
    });
  } catch (error) {
    console.error('Error fetching API key stats:', error);
    res.status(500).json({ error: 'Failed to fetch API key statistics' });
  }
});

module.exports = router;
