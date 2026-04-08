const fs = require('fs');
const path = require('path');
const File = require('../models/File');
const AnalysisReport = require('../models/AnalysisReport');
const runPythonScript = require('../helpers/runPythonScript');
const sendToAIModel = require('../helpers/sendToAIModel');
const isFileSizeSuitable = require('../helpers/isFileSizeSuitable');

const ANALYZER_SCRIPT_PATH = path.join('py-scripts', 'Static Malware Analyzer.py');
const HASH_SCRIPT_PATH = path.join('py-scripts', 'get-hashes.py');
const PLOTS_BASE_URL = process.env.PLOTS_BASE_URL || process.env.OAUTH_CALLBACK_BASE?.replace(/\/$/, '') || '';

exports.uploadFile = async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const password = req.body.password || '';
  let userId = req.user ? req.user._id : 0;

  try {
    const args = [filePath, originalName];
    if (password) args.push(password);
    const isArchive = /\.(zip|rar|7z)$/i.test(originalName);
    if (isArchive) args.push('--keep-extracted');

    const analysisResult = await runPythonScript(ANALYZER_SCRIPT_PATH, args);

    if (analysisResult && analysisResult.error && analysisResult.error.trim() === 'password is wrong') {
      fs.unlink(filePath, () => {});
      return res.status(400).json({ error: 'password is wrong ' });
    }

    const results = [];
    const filesToCleanup = [];
    for (const sample of analysisResult.results) {
      const sampleFile = sample.filename;
      const samplePath = sample.file_path;
      if (samplePath && samplePath !== filePath) filesToCleanup.push(samplePath);
      
      let hashResult = null;
      let dbStatus = null;
      let dbReport = null;
      let aiResult = null;
      const plotLinks = (sample.plots || []).map(p => `${PLOTS_BASE_URL}/api/plots/${path.basename(p)}`);

      if (sample.analysis && sample.analysis.error) {
        results.push({
          filename: sampleFile,
          analysis: sample.analysis,
          plots: plotLinks,
          hash: null,
          dbStatus: 'analysis_error',
          dbReport: null,
          aiResult: null,
          error: sample.analysis.error
        });
        continue;
      }

      if (samplePath) {
        try {
          hashResult = await runPythonScript(HASH_SCRIPT_PATH, [samplePath]);
          if (hashResult && hashResult.md5) {
            const existingFile = await File.findOne({ hash: hashResult.md5, userId: userId });
            if (existingFile) {
              dbStatus = 'already_uploaded_by_user';
              dbReport = await AnalysisReport.findOne({ fileId: existingFile._id });
            } else {
              const newFileDoc = await File.create({
                name: sampleFile,
                hash: hashResult.md5,
                status: 'analyzed',
                uploadDate: new Date(),
                userId: userId
              });
              if (isFileSizeSuitable(samplePath)) {
                try {
                  aiResult = await sendToAIModel(samplePath);
                  if (!aiResult.predictions_file) {
                    throw new Error('AI model did not return predictions_file');
                  }
                  dbReport = await AnalysisReport.create({
                    fileId: newFileDoc._id,
                    analysisDate: new Date(),
                    predictions_file: aiResult.predictions_file,
                    probability_file: aiResult.probability_file ?? null,
                    predictions_family: aiResult.predictions_family ?? [],
                    probability_family: aiResult.probability_family ?? []
                  });
                  dbStatus = 'ai_analyzed';
                } catch (aiError) {
                  console.error(`Sample ${sampleFile}: AI Model Error:`, aiError);
                  dbStatus = 'ai_failed';
                }
              } else {
                dbStatus = 'size_unsuitable';
              }
            }
          } else {
            dbStatus = 'hash_failed';
          }
        } catch (err) {
          dbStatus = 'hash_error';
          console.error(`Sample ${sampleFile}: error during hash generation:`, err);
        }
      } else {
        dbStatus = 'not_available';
      }

      results.push({
        filename: sampleFile,
        analysis: sample.analysis,
        plots: plotLinks,
        hash: hashResult,
        dbStatus,
        dbReport,
        aiResult
      });
    }
    res.json({ results });
    fs.unlink(filePath, () => {});
    for (const f of filesToCleanup) fs.unlink(f, () => {});
  } catch (error) {
    console.error('Error processing file:', error);
    fs.unlink(filePath, () => {});
    res.status(500).send(error.message);
  }
};

exports.getPlot = (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '..', 'plots', filename);
  res.sendFile(filePath, err => {
    if (err) {
      res.status(404).send('Plot not found');
    }
  });
};
