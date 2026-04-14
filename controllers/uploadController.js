const fs = require('fs');
const path = require('path');
const File = require('../models/File');
const AnalysisReport = require('../models/AnalysisReport');
const User = require('../models/User');
const runPythonScript = require('../helpers/runPythonScript');
const sendToAIModel = require('../helpers/sendToAIModel');
const isFileSizeSuitable = require('../helpers/isFileSizeSuitable');

const ANALYZER_SCRIPT_PATH = path.join('py-scripts', 'static_malware_analyzer.py');
const HASH_SCRIPT_PATH = path.join('py-scripts', 'get-hashes.py');
const PLOTS_BASE_URL = process.env.PLOTS_BASE_URL || process.env.OAUTH_CALLBACK_BASE?.replace(/\/$/, '') || '';

/**
 * Resolves user identity from request.
 */
function resolveUserIdentity(req) {
  let userId = 0;
  let userDoc = null;

  if (req.user) {
    userId = req.user._id;
    userDoc = req.user;
  } else if (req.guestUser) {
    userId = req.guestUser._id;
    userDoc = req.guestUser;
  }
  
  return { userId, userDoc, isApiKeyRequest: !!req.apiKey };
}

/**
 * Checks upload quota for registered non-API-key users.
 */
function isQuotaExceeded(userDoc, isApiKeyRequest) {
  if (isApiKeyRequest || !userDoc || userDoc.isGuest) return false;
  const uploadQuota = userDoc.uploadQuota || 3;
  return userDoc.uploadCount >= uploadQuota;
}

/**
 * Runs Python hash script on the given file path.
 */
async function generateFileHash(samplePath) {
  try {
    return await runPythonScript(HASH_SCRIPT_PATH, [samplePath]);
  } catch (err) {
    console.error(`Error during hash generation for ${samplePath}:`, err);
    return null;
  }
}

/**
 * Interacts with AI Model and creates a DB report.
 */
async function processAIModel(samplePath, newFileDoc) {
  if (!isFileSizeSuitable(samplePath)) {
    return { dbStatus: 'size_unsuitable', aiResult: null, dbReport: null };
  }

  console.log(`[Upload] File size suitable for AI: ${samplePath}`);
  try {
    const aiResult = await sendToAIModel(samplePath);
    console.log(`[Upload] AI Result received:`, !!aiResult);
    
    if (!aiResult.predictions_file) {
      throw new Error('AI model did not return predictions_file');
    }
    
    const dbReport = await AnalysisReport.create({
      fileId: newFileDoc._id,
      analysisDate: new Date(),
      predictions_file: aiResult.predictions_file,
      probability_file: aiResult.probability_file ?? null,
      predictions_family: aiResult.predictions_family ?? [],
      probability_family: aiResult.probability_family ?? []
    });
    
    return { dbStatus: 'ai_analyzed', aiResult, dbReport };
  } catch (aiError) {
    console.error(`AI Model Error for ${samplePath}:`, aiError);
    return { dbStatus: 'ai_failed', aiResult: null, dbReport: null };
  }
}

/**
 * Handles individual sample logic (hashing, DB check, AI).
 */
async function processSampleData(sample, userId, filePath) {
  const sampleFile = sample.filename;
  const samplePath = sample.file_path;
  const plotLinks = (sample.plots || []).map(p => `${PLOTS_BASE_URL}/api/plots/${path.basename(p)}`);

  if (sample.analysis && sample.analysis.error) {
    return {
      filename: sampleFile,
      analysis: sample.analysis,
      plots: plotLinks,
      hash: null,
      dbStatus: 'analysis_error',
      dbReport: null,
      aiResult: null,
      error: sample.analysis.error
    };
  }

  if (!samplePath) {
    return {
      filename: sampleFile,
      analysis: sample.analysis,
      plots: plotLinks,
      hash: null,
      dbStatus: 'not_available',
      dbReport: null,
      aiResult: null
    };
  }

  const hashResult = await generateFileHash(samplePath);
  if (!hashResult || !hashResult.md5) {
    return {
      filename: sampleFile,
      analysis: sample.analysis,
      plots: plotLinks,
      hash: hashResult,
      dbStatus: 'hash_failed',
      dbReport: null,
      aiResult: null
    };
  }

  const existingFile = await File.findOne({ hash: hashResult.md5, userId: userId });
  if (existingFile) {
    const dbReport = await AnalysisReport.findOne({ fileId: existingFile._id });
    return {
      filename: sampleFile,
      analysis: sample.analysis,
      plots: plotLinks,
      hash: hashResult,
      dbStatus: 'already_uploaded_by_user',
      dbReport,
      aiResult: null
    };
  }

  // New file logic
  const newFileDoc = await File.create({
    name: sampleFile,
    hash: hashResult.md5,
    status: 'analyzed',
    uploadDate: new Date(),
    userId: userId
  });

  const { dbStatus, aiResult, dbReport } = await processAIModel(samplePath, newFileDoc);

  return {
    filename: sampleFile,
    analysis: sample.analysis,
    plots: plotLinks,
    hash: hashResult,
    dbStatus,
    dbReport,
    aiResult
  };
}

exports.uploadFile = async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const password = req.body.password || '';

  const { userId, userDoc, isApiKeyRequest } = resolveUserIdentity(req);
  console.log(`[Upload] User resolved. ID: ${userId}, isGuest: ${userDoc?.isGuest}`);

  if (isQuotaExceeded(userDoc, isApiKeyRequest)) {
    console.log(`[Upload] Quota exceeded for user ${userId}.`);
    return res.status(429).json({ 
      error: 'Upload limit exceeded', 
      message: 'You have reached your daily upload limit. Please wait until tomorrow or upgrade your subscription.' 
    });
  }

  const filesToCleanup = [];
  try {
    const args = [filePath, originalName];
    if (password) args.push(password);
    if (/\.(zip|rar|7z)$/i.test(originalName)) args.push('--keep-extracted');

    const analysisResult = await runPythonScript(ANALYZER_SCRIPT_PATH, args);

    if (analysisResult?.error?.trim() === 'password is wrong') {
      return res.status(400).json({ error: 'password is wrong ' });
    }

    const results = [];
    for (const sample of analysisResult.results || []) {
      if (sample.file_path && sample.file_path !== filePath) {
        filesToCleanup.push(sample.file_path);
      }
      const processedSample = await processSampleData(sample, userId, filePath);
      results.push(processedSample);
    }

    const newSamplesCount = results.filter(r => r.dbStatus !== 'already_uploaded_by_user').length;
    console.log(`[Upload] newSamplesCount: ${newSamplesCount}`);

    if (!isApiKeyRequest && userDoc && newSamplesCount > 0) {
      console.log(`[Upload] Updating uploadCount for user ${userDoc._id}. Current count: ${userDoc.uploadCount}`);
      await User.findByIdAndUpdate(userDoc._id, { 
        $inc: { uploadCount: newSamplesCount },
        lastUploadDate: new Date()
      });
    }

    res.json({ results });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).send(error.message);
  } finally {
    fs.unlink(filePath, () => {});
    filesToCleanup.forEach(f => fs.unlink(f, () => {}));
  }
};

exports.getPlot = (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(__dirname, '..', 'plots', filename);

  res.sendFile(filePath, err => {
    if (err) res.status(404).send('Plot not found');
  });
};

