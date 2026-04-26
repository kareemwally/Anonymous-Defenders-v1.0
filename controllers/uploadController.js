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

// ─── helpers ──────────────────────────────────────────────────────────────────

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

/** Returns remaining upload slots for any user type. */
function remainingQuota(userDoc, req) {
  if (!userDoc) return Infinity;
  if (userDoc.isGuest) {
    const limit = userDoc.dailyUploadLimit ?? 3;
    // req.remainingUploads is pre-computed by guestAbuse middleware
    return req.remainingUploads ?? Math.max(0, limit - (userDoc.uploadCount || 0));
  }
  return Math.max(0, (userDoc.uploadQuota || 3) - (userDoc.uploadCount || 0));
}

/** Fast pre-upload check: is the user already at their limit? */
function isQuotaExceeded(userDoc) {
  if (!userDoc) return false;
  if (userDoc.isGuest) return (userDoc.uploadCount || 0) >= (userDoc.dailyUploadLimit ?? 3);
  return (userDoc.uploadCount || 0) >= (userDoc.uploadQuota || 3);
}

async function generateFileHash(samplePath) {
  try {
    return await runPythonScript(HASH_SCRIPT_PATH, [samplePath]);
  } catch (err) {
    console.error(`[Hash] Failed for ${samplePath}:`, err.message);
    return null;
  }
}

async function processAIModel(samplePath, newFileDoc) {
  if (!isFileSizeSuitable(samplePath)) {
    return { dbStatus: 'size_unsuitable', aiResult: null, dbReport: null };
  }
  try {
    const aiResult = await sendToAIModel(samplePath);
    if (!aiResult.predictions_file) throw new Error('AI model did not return predictions_file');

    let dbReport = null;
    if (newFileDoc) {
      dbReport = await AnalysisReport.create({
        fileId: newFileDoc._id,
        analysisDate: new Date(),
        predictions_file: aiResult.predictions_file,
        probability_file: aiResult.probability_file ?? null,
        predictions_family: aiResult.predictions_family ?? [],
        probability_family: aiResult.probability_family ?? []
      });
    }
    return { dbStatus: 'ai_analyzed', aiResult, dbReport };
  } catch (err) {
    console.error(`[AI] Error for ${samplePath}:`, err.message);
    return { dbStatus: 'ai_failed', aiResult: null, dbReport: null };
  }
}

// ─── Phase 1: pre-check (hash + DB lookup, NO storing) ────────────────────────
/**
 * Hashes the file and checks the DB for duplicates.
 * Does NOT write anything — used to count genuinely new files before the quota
 * gate so we can reject an oversized archive before touching the database.
 */
async function preCheckSample(sample, userId) {
  const samplePath = sample.file_path;

  if (!samplePath) {
    return { hashResult: null, existingFile: null, isNew: false };
  }

  const hashResult = await generateFileHash(samplePath);
  if (!hashResult || !hashResult.md5) {
    // Hash failed — not storable, but still routed to AI in phase 3
    return { hashResult: null, existingFile: null, isNew: false };
  }

  const existingFile = await File.findOne({ hash: hashResult.md5, userId });
  return {
    hashResult,
    existingFile: existingFile || null,
    isNew: !existingFile           // true → this file will consume one quota slot
  };
}

// ─── Phase 3: store + AI ──────────────────────────────────────────────────────
/**
 * Persists the file and fetches/creates the AI report.
 * Receives the pre-computed hashResult and existingFile from phase 1 so we
 * never hash or query the DB twice.
 */
async function processSampleData(sample, userId, { hashResult, existingFile }) {
  const sampleFile = sample.filename;
  const samplePath = sample.file_path;
  const plotLinks = (sample.plots || []).map(p => `${PLOTS_BASE_URL}/api/plots/${path.basename(p)}`);

  const base = { filename: sampleFile, analysis: sample.analysis, plots: plotLinks };

  // No file path — nothing to hash or store
  if (!samplePath) {
    return { ...base, hash: null, dbStatus: 'not_available', savedToDb: false, dbReport: null, aiResult: null };
  }

  // Hash failed — return AI result only (cannot store without a key)
  if (!hashResult || !hashResult.md5) {
    const { dbStatus, aiResult, dbReport } = await processAIModel(samplePath, null);
    return {
      ...base,
      hash: null,
      dbStatus: dbStatus === 'ai_analyzed' ? 'ai_analyzed_no_hash' : dbStatus,
      savedToDb: false,
      dbReport,
      aiResult
    };
  }

  // Already in this user's history — return cached report
  if (existingFile) {
    const dbReport = await AnalysisReport.findOne({ fileId: existingFile._id });
    return { ...base, hash: hashResult, dbStatus: 'already_uploaded_by_user', savedToDb: false, dbReport, aiResult: null };
  }

  // New file — store in DB first (even if Python flagged a size/analysis error,
  // so quota is consumed and the file appears in history)
  const newFileDoc = await File.create({
    name: sampleFile,
    hash: hashResult.md5,
    status: 'analyzed',
    uploadDate: new Date(),
    userId
  });

  // Skip AI if Python already flagged an error
  if (sample.analysis && sample.analysis.error) {
    const isSizeError = sample.analysis.error.includes('file size');
    return {
      ...base,
      hash: hashResult,
      dbStatus: isSizeError ? 'size_unsuitable' : 'analysis_error',
      savedToDb: true,
      dbReport: null,
      aiResult: null,
      error: sample.analysis.error
    };
  }

  // Send to AI server
  const { dbStatus, aiResult, dbReport } = await processAIModel(samplePath, newFileDoc);
  return { ...base, hash: hashResult, dbStatus, savedToDb: true, dbReport, aiResult };
}

// ─── main handler ─────────────────────────────────────────────────────────────
exports.uploadFile = async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const password = req.body.password || '';

  const { userId, userDoc } = resolveUserIdentity(req);

  // Fast gate: already at limit before we even run Python
  if (isQuotaExceeded(userDoc)) {
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
      return res.status(400).json({ error: 'password is wrong' });
    }

    const samples = analysisResult.results || [];

    // Collect extracted file paths for cleanup
    for (const sample of samples) {
      if (sample.file_path && sample.file_path !== filePath) {
        filesToCleanup.push(sample.file_path);
      }
    }

    // ── Phase 1: hash every file + DB lookup, no writes ──────────────────────
    const preChecks = [];
    for (const sample of samples) {
      const check = await preCheckSample(sample, userId);
      preChecks.push(check);
    }

    // ── Phase 2: quota gate ───────────────────────────────────────────────────
    // Count only genuinely new files (not duplicates, not hash-failed)
    const newFilesCount = preChecks.filter(c => c.isNew).length;

    if (userDoc && newFilesCount > 0) {
      const quota = remainingQuota(userDoc, req);
      if (newFilesCount > quota) {
        return res.status(429).json({
          error: 'Upload limit exceeded',
          message: `This upload contains ${newFilesCount} new file(s) but you only have ${quota} upload slot(s) remaining. Every file inside an archive counts as one upload.`,
          remainingUploads: quota,
          newFilesInUpload: newFilesCount
        });
      }
    }

    // ── Phase 3: store + AI ───────────────────────────────────────────────────
    const results = [];
    for (let i = 0; i < samples.length; i++) {
      const processed = await processSampleData(samples[i], userId, preChecks[i]);
      results.push(processed);
    }

    // ── Phase 4: increment counter by files actually stored ───────────────────
    const storedCount = results.filter(r => r.savedToDb).length;
    if (userDoc && storedCount > 0) {
      await User.findByIdAndUpdate(userDoc._id, {
        $inc: { uploadCount: storedCount },
        lastUploadDate: new Date()
      });
    }

    res.json({ results });
  } catch (error) {
    console.error('[Upload] Unhandled error:', error);
    res.status(500).send(error.message);
  } finally {
    fs.unlink(filePath, () => {});
    filesToCleanup.forEach(f => fs.unlink(f, () => {}));
  }
};

exports.getPlot = async (req, res) => {
  const filename = path.basename(req.params.filename);

  // Ownership check: verify a report belonging to this user references this plot
  if (req.user) {
    const userFiles = await File.find({ userId: req.user._id }).select('_id').lean();
    const fileIds = userFiles.map(f => f._id);
    const ownsPlot = await AnalysisReport.exists({
      fileId: { $in: fileIds },
      predictions_file: { $regex: filename, $options: 'i' }
    });
    if (!ownsPlot) {
      return res.status(403).send('Access denied');
    }
  }

  const filePath = path.join(__dirname, '..', 'plots', filename);
  res.sendFile(filePath, err => {
    if (err) res.status(404).send('Plot not found');
  });
};
