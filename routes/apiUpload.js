const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { apiKeyAuth, requirePermission } = require('../middleware/apiKeyAuth');
const uploadController = require('../controllers/uploadController');

// Configure multer for API uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/api');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  }
});

// API Upload and Analyze endpoint
router.post('/upload', apiKeyAuth, requirePermission('upload'), upload.single('file'), uploadController.uploadFile);

// API Status endpoint
router.get('/status', apiKeyAuth, requirePermission('read'), async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'API is working correctly',
      data: {
        apiVersion: '1.0.0',
        serverTime: new Date().toISOString(),
        user: {
          name: req.user.name,
          email: req.user.email,
          subscription: req.user.subscription
        },
        apiKey: {
          id: req.apiKeyInfo.keyId,
          name: req.apiKey.name,
          permissions: req.apiKeyInfo.permissions,
          usage: req.apiKeyInfo.usage,
          rateLimit: req.apiKeyInfo.rateLimit
        }
      }
    });
  } catch (error) {
    console.error('API status error:', error);
    res.status(500).json({ error: 'Failed to get API status' });
  }
});

// API Usage endpoint
router.get('/usage', apiKeyAuth, requirePermission('read'), async (req, res) => {
  try {
    const { period = 'daily' } = req.query;
    
    let usageData;
    if (period === 'monthly') {
      usageData = {
        period: 'monthly',
        used: req.apiKeyInfo.usage.monthly.count,
        limit: req.apiKeyInfo.rateLimit.requestsPerMonth,
        percentage: Math.min((req.apiKeyInfo.usage.monthly.count / req.apiKeyInfo.rateLimit.requestsPerMonth) * 100, 100),
        resetTime: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
      };
    } else {
      usageData = {
        period: 'daily',
        used: req.apiKeyInfo.usage.daily.count,
        limit: req.apiKeyInfo.rateLimit.requestsPerDay,
        percentage: Math.min((req.apiKeyInfo.usage.daily.count / req.apiKeyInfo.rateLimit.requestsPerDay) * 100, 100),
        resetTime: new Date(new Date().setHours(24, 0, 0, 0))
      };
    }
    
    res.json({
      success: true,
      data: usageData
    });
  } catch (error) {
    console.error('API usage error:', error);
    res.status(500).json({ error: 'Failed to get usage data' });
  }
});
module.exports = router;
