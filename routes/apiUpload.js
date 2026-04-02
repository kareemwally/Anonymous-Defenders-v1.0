const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { apiKeyAuth, requirePermission } = require('../middleware/apiKeyAuth');

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
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/zip',
      'application/x-rar-compressed',
      'application/x-7z-compressed'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`), false);
    }
  }
});

// API Upload endpoint
router.post('/upload', apiKeyAuth, requirePermission('upload'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file uploaded',
        message: 'Please provide a file to upload'
      });
    }
    
    console.log(`API Upload - User: ${req.user.name}, File: ${req.file.originalname}, Key: ${req.apiKey.key}`);
    
    // Process the file (similar to main upload logic)
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const fileExt = path.extname(originalName).toLowerCase();
    
    // Initialize analysis result
    let analysisResult = {
      fileName: originalName,
      fileSize: req.file.size,
      uploadTime: new Date().toISOString(),
      status: 'processing',
      apiKey: req.apiKey.key,
      apiKeyName: req.apiKey.name
    };
    
    try {
      // Process different file types
      if (fileExt === '.pdf') {
        analysisResult = await processPDF(filePath, analysisResult);
      } else if (['.doc', '.docx'].includes(fileExt)) {
        analysisResult = await processDocument(filePath, analysisResult);
      } else if (['.xls', '.xlsx'].includes(fileExt)) {
        analysisResult = await processSpreadsheet(filePath, analysisResult);
      } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(fileExt)) {
        analysisResult = await processImage(filePath, analysisResult);
      } else if (['.zip', '.rar', '.7z'].includes(fileExt)) {
        analysisResult = await processArchive(filePath, analysisResult);
      } else {
        analysisResult.status = 'unsupported';
        analysisResult.error = 'Unsupported file type';
      }
      
      // Add API usage info
      analysisResult.apiUsage = {
        keyId: req.apiKeyInfo.keyId,
        permissions: req.apiKeyInfo.permissions,
        rateLimit: req.apiKeyInfo.rateLimit,
        usage: req.apiKeyInfo.usage
      };
      
      // Clean up uploaded file
      await fs.unlink(filePath);
      
      res.json({
        success: true,
        message: 'File uploaded and processed successfully',
        data: analysisResult
      });
      
    } catch (processingError) {
      console.error('File processing error:', processingError);
      
      // Clean up on error
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
      
      res.status(500).json({
        error: 'File processing failed',
        message: processingError.message,
        fileName: originalName
      });
    }
    
  } catch (error) {
    console.error('API upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed',
      message: error.message 
    });
  }
});

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

// Helper functions (reuse from main application)
async function processPDF(filePath, result) {
  try {
    // Add PDF processing logic here
    result.status = 'completed';
    result.fileType = 'PDF';
    result.analysis = { message: 'PDF processing completed' };
    return result;
  } catch (error) {
    result.status = 'error';
    result.error = error.message;
    return result;
  }
}

async function processDocument(filePath, result) {
  try {
    // Add document processing logic here
    result.status = 'completed';
    result.fileType = 'Document';
    result.analysis = { message: 'Document processing completed' };
    return result;
  } catch (error) {
    result.status = 'error';
    result.error = error.message;
    return result;
  }
}

async function processSpreadsheet(filePath, result) {
  try {
    // Add spreadsheet processing logic here
    result.status = 'completed';
    result.fileType = 'Spreadsheet';
    result.analysis = { message: 'Spreadsheet processing completed' };
    return result;
  } catch (error) {
    result.status = 'error';
    result.error = error.message;
    return result;
  }
}

async function processImage(filePath, result) {
  try {
    // Add image processing logic here
    result.status = 'completed';
    result.fileType = 'Image';
    result.analysis = { message: 'Image processing completed' };
    return result;
  } catch (error) {
    result.status = 'error';
    result.error = error.message;
    return result;
  }
}

async function processArchive(filePath, result) {
  try {
    // Add archive processing logic here
    result.status = 'completed';
    result.fileType = 'Archive';
    result.analysis = { message: 'Archive processing completed' };
    return result;
  } catch (error) {
    result.status = 'error';
    result.error = error.message;
    return result;
  }
}

module.exports = router;
