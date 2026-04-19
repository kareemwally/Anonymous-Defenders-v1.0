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
 * Checks upload quota for registered users.
 */
function isQuotaExceeded(userDoc, isApiKeyRequest) {
  if (!userDoc || userDoc.isGuest) return false;
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
 * Interacts with AI Model and optionally creates a DB report.
 * newFileDoc may be null when called for files that failed hashing —
 * in that case the AI result is returned but not persisted.
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

    // Only persist the report when we have a DB file record to link to
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
  } catch (aiError) {
    console.error(`AI Model Error for ${samplePath}:`, aiError);
    return { dbStatus: 'ai_failed', aiResult: null, dbReport: null };
  }
}

/**
 * Handles individual sample logic (hashing, DB check, AI).
 * Returns savedToDb: true only when File.create ran — used for accurate quota counting.
 *
 * Order of operations (intentional):
 *   1. Bail early only when we have NO file path at all.
 *   2. Hash the file.
 *   3. Check DB for duplicates.
 *   4. Store in DB (File.create) — even if Python analysis errored (e.g. size check).
 *   5. Skip AI if Python already flagged an error; otherwise send to AI.
 *
 * This keeps archive-file behaviour consistent with standalone-file behaviour:
 * a file that is too small/large is still stored in DB (so quota is consumed and
 * history is recorded) but the AI call is skipped.
 */
async function processSampleData(sample, userId, filePath) {
  const sampleFile = sample.filename;
  const samplePath = sample.file_path;
  const plotLinks = (sample.plots || []).map(p => `${PLOTS_BASE_URL}/api/plots/${path.basename(p)}`);

  console.log(`[processSample] ---- ${sampleFile} ----`);
  console.log(`[processSample] file_path: ${samplePath}`);
  console.log(`[processSample] analysis.error: ${sample.analysis?.error ?? 'none'}`);

  // No file path returned by the Python script — nothing we can do
  if (!samplePath) {
    return {
      filename: sampleFile,
      analysis: sample.analysis,
      plots: plotLinks,
      hash: null,
      dbStatus: 'not_available',
      savedToDb: false,
      dbReport: null,
      aiResult: null
    };
  }

  const hashResult = await generateFileHash(samplePath);
  console.log(`[processSample] hashResult for ${sampleFile}:`, JSON.stringify(hashResult));

  // Hash failed — still send to AI so the user gets a result,
  // but we cannot store in DB without a reliable key
  if (!hashResult || !hashResult.md5) {
    console.warn(`[processSample] Hash failed for ${sampleFile} (path: ${samplePath})`);
    const { dbStatus, aiResult, dbReport } = await processAIModel(samplePath, null);
    return {
      filename: sampleFile,
      analysis: sample.analysis,
      plots: plotLinks,
      hash: null,
      dbStatus: dbStatus === 'ai_analyzed' ? 'ai_analyzed_no_hash' : dbStatus,
      savedToDb: false,
      dbReport,
      aiResult
    };
  }

  // Already in this user's history — return cached report
  const existingFile = await File.findOne({ hash: hashResult.md5, userId: userId });
  console.log(`[processSample] existingFile for ${sampleFile}: ${existingFile ? existingFile._id : 'not found'}`);
  if (existingFile) {
    const dbReport = await AnalysisReport.findOne({ fileId: existingFile._id });
    return {
      filename: sampleFile,
      analysis: sample.analysis,
      plots: plotLinks,
      hash: hashResult,
      dbStatus: 'already_uploaded_by_user',
      savedToDb: false,
      dbReport,
      aiResult: null
    };
  }

  // New file — store in DB regardless of whether Python analysis errored.
  // (e.g. "file size isn't suitable" from the Python script still deserves a DB record
  //  so quota is accurate and the file appears in the user's history.)
  console.log(`[processSample] Calling File.create for ${sampleFile} (hash: ${hashResult.md5})`);
  const newFileDoc = await File.create({
    name: sampleFile,
    hash: hashResult.md5,
    status: 'analyzed',
    uploadDate: new Date(),
    userId: userId
  });

  // If the Python script already flagged an error, skip the AI call
  if (sample.analysis && sample.analysis.error) {
    const isSizeError = sample.analysis.error.includes('file size');
    return {
      filename: sampleFile,
      analysis: sample.analysis,
      plots: plotLinks,
      hash: hashResult,
      dbStatus: isSizeError ? 'size_unsuitable' : 'analysis_error',
      savedToDb: true,
      dbReport: null,
      aiResult: null,
      error: sample.analysis.error
    };
  }

  // No prior error — send to AI server
  const { dbStatus, aiResult, dbReport } = await processAIModel(samplePath, newFileDoc);

  return {
    filename: sampleFile,
    analysis: sample.analysis,
    plots: plotLinks,
    hash: hashResult,
    dbStatus,
    savedToDb: true,
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

    console.log(`[Upload] Python returned ${analysisResult.results?.length ?? 0} result(s)`);
    analysisResult.results?.forEach((s, i) =>
      console.log(`[Upload] result[${i}]: filename=${s.filename}, file_path=${s.file_path}, analysis_error=${s.analysis?.error ?? 'none'}`)
    );

    const results = [];
    for (const sample of analysisResult.results || []) {
      if (sample.file_path && sample.file_path !== filePath) {
        filesToCleanup.push(sample.file_path);
      }
      const processedSample = await processSampleData(sample, userId, filePath);
      results.push(processedSample);
    }

    // Only count files actually stored in DB — not failures or duplicates
    const newSamplesCount = results.filter(r => r.savedToDb).length;
    console.log(`[Upload] newSamplesCount (stored in DB): ${newSamplesCount}`);

    // Post-extraction quota enforcement.
    // We can only know how many files an archive contains after the Python script
    // runs, so we validate here — before touching the DB — to prevent quota abuse
    // via archives stuffed with many files.
    if (userDoc && newSamplesCount > 0) {
      let remainingQuota;

      if (userDoc.isGuest) {
        // req.remainingUploads is set by guestAbuse middleware; fall back to computing it
        const dailyLimit = userDoc.dailyUploadLimit ?? 3;
        remainingQuota = req.remainingUploads ?? Math.max(0, dailyLimit - (userDoc.uploadCount || 0));
      } else {
        remainingQuota = Math.max(0, (userDoc.uploadQuota || 3) - (userDoc.uploadCount || 0));
      }

      if (newSamplesCount > remainingQuota) {
        return res.status(429).json({
          error: 'Upload limit exceeded',
          message: `This upload contains ${newSamplesCount} file(s) but you only have ${remainingQuota} upload(s) remaining. Every file inside an archive counts as one upload.`,
          remainingUploads: remainingQuota,
          samplesInUpload: newSamplesCount
        });
      }
    }

    if (userDoc && newSamplesCount > 0) {
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

