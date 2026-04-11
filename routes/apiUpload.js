const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { apiKeyAuth, requirePermission } = require('../middleware/apiKeyAuth');
const runPythonScript = require('../helpers/runPythonScript');
const sendToAIModel = require('../helpers/sendToAIModel');
const isFileSizeSuitable = require('../helpers/isFileSizeSuitable');

const ANALYZER_SCRIPT_PATH = path.join('py-scripts', 'Static Malware Analyzer.py');
const HASH_SCRIPT_PATH = path.join('py-scripts', 'get-hashes.py');
const PLOTS_BASE_URL = process.env.PLOTS_BASE_URL || process.env.OAUTH_CALLBACK_BASE?.replace(/\/$/, '') || '';

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
router.post('/upload', apiKeyAuth, requirePermission('upload'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const password = req.body.password || '';
  const userId = req.user._id;

  try {
    const args = [filePath, originalName];
    if (password) args.push(password);
    const isArchive = /\.(zip|rar|7z)$/i.test(originalName);
    if (isArchive) args.push('--keep-extracted');

    // Run Static Analysis
    const analysisResult = await runPythonScript(ANALYZER_SCRIPT_PATH, args);

    if (analysisResult && analysisResult.error && analysisResult.error.trim() === 'password is wrong') {
      await fs.unlink(filePath).catch(() => {});
      return res.status(400).json({ error: 'Password is wrong' });
    }

    const results = [];
    const filesToCleanup = [filePath];

    for (const sample of analysisResult.results) {
      const sampleFile = sample.filename;
      const samplePath = sample.file_path;
      if (samplePath && samplePath !== filePath) filesToCleanup.push(samplePath);
      
      let hashResult = null;
      let aiResult = null;
      const plotLinks = (sample.plots || []).map(p => `${PLOTS_BASE_URL}/api/plots/${path.basename(p)}`);

      if (sample.analysis && sample.analysis.error) {
        results.push({
          filename: sampleFile,
          error: sample.analysis.error,
          status: 'error'
        });
        continue;
      }

      if (samplePath) {
        try {
          // Get Hashes
          hashResult = await runPythonScript(HASH_SCRIPT_PATH, [samplePath]);
          
          // Run AI Model if suitable
          if (isFileSizeSuitable(samplePath)) {
            try {
              aiResult = await sendToAIModel(samplePath);
            } catch (aiError) {
              console.error(`API Analysis - Sample ${sampleFile} AI Error:`, aiError);
            }
          }
        } catch (err) {
          console.error(`API Analysis - Sample ${sampleFile} Hash Error:`, err);
        }
      }

      results.push({
        filename: sampleFile,
        staticAnalysis: sample.analysis,
        plots: plotLinks,
        hashes: hashResult,
        aiPrediction: aiResult ? {
          prediction: aiResult.predictions_file,
          probability: aiResult.probability_file,
          familyPredictions: aiResult.predictions_family
        } : null
      });
    }

    // Update API Key usage stats
    await req.apiKey.updateUsage();

    res.json({ 
      success: true,
      results,
      apiUsage: {
        remainingDaily: req.apiKey.rateLimit.requestsPerDay - req.apiKey.usage.daily.count,
        limitDaily: req.apiKey.rateLimit.requestsPerDay
      }
    });

    // Cleanup files
    for (const f of filesToCleanup) {
      await fs.unlink(f).catch(() => {});
    }

  } catch (error) {
    console.error('API processing error:', error);
    await fs.unlink(filePath).catch(() => {});
    res.status(500).json({ error: 'Processing failed', message: error.message });
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
