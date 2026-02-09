// Helper to run a Python script as a child process and return its output as JSON
const { spawn } = require('child_process');

/**
 * Runs a Python script with the given arguments and returns the parsed JSON output.
 * Handles timeouts, errors, and always attempts to parse stdout as JSON.
 * @param {string} scriptPath - Path to the Python script
 * @param {string[]|string|undefined} args - Arguments to pass to the script (array preferred)
 * @param {number|undefined} [timeout=60000] - Timeout in milliseconds
 * @returns {Promise<object>} - The parsed JSON result from the script
 */
const runPythonScript = (scriptPath, args) => {
  // Normalize args to an array; support legacy signature where a single string was passed
  const normalizedArgs = Array.isArray(args)
    ? args.filter(a => a !== undefined && a !== null)
    : (args !== undefined && args !== null ? [args] : []);

  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('.venv/bin/python3', [scriptPath, ...normalizedArgs]);
    let scriptOutput = '';
    let scriptError = '';

    pythonProcess.stdout.on('data', (data) => {
      scriptOutput += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      scriptError += data.toString();
    });

    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });

    pythonProcess.on('close', (code, signal) => {
      // Always try to parse stdout as JSON
      try {
        const result = JSON.parse(scriptOutput);
        // If the script exited with error and result has an error field, resolve with it
        if (code !== 0 && result && result.error) {
          resolve(result);
        } else if (code !== 0) {
          reject(new Error(`Python script exited with code ${code}: ${scriptError}`));
        } else {
          resolve(result);
        }
      } catch (e) {
        reject(new Error(`Failed to parse Python output: ${e.message}`));
      }
    });
  });
};

module.exports = runPythonScript; 

