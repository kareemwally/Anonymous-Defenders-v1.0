// Helper to send a file to the external AI model for analysis
const fs = require('fs');
const axios = require('axios');

/**
 * Ensures the AI model is healthy by polling its health endpoint until it responds OK
 * or the maximum wait time elapses.
 *
 * Environment overrides:
 * - AI_MODEL_HEALTH_URL: explicit health endpoint
 * - AI_HEALTH_MAX_WAIT_MS: total wait budget in ms (default 120000)
 * - AI_HEALTH_POLL_INTERVAL_MS: poll interval in ms (default 3000)
 * - AI_REQUEST_TIMEOUT_MS: per-request timeout in ms (default 120000)
 */
async function ensureAIHealthy(modelUrl, headers, explicitHealthUrl) {
  const maxWaitMs = Number(process.env.AI_HEALTH_MAX_WAIT_MS || 120000);
  const pollIntervalMs = Number(process.env.AI_HEALTH_POLL_INTERVAL_MS || 3000);
  const perRequestTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 120000);

  let healthUrl = explicitHealthUrl;
  if (!healthUrl) {
    try {
      const base = new URL(modelUrl);
      base.pathname = (base.pathname.endsWith('/') ? base.pathname : base.pathname + '/') + 'health';
      healthUrl = base.toString();
    } catch {
      // Fallback to explicit env var only
      healthUrl = process.env.AI_MODEL_HEALTH_URL;
    }
  }
  if (!healthUrl) return; // If no health URL available, skip check silently

  const start = Date.now();
  // Simple linear polling
  // Stop when: HTTP 200 with body.status === 'ok', or timeout budget exhausted
  // Treat any network/error as not-ready and retry until budget expires
  // Do not throw on individual poll errors; only throw when timed out
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await axios.get(healthUrl, {
        headers,
        timeout: Math.min(perRequestTimeoutMs, pollIntervalMs * 2)
      });
      const bodyStatus = typeof res?.data?.status === 'string' ? res.data.status.toLowerCase() : null;
      if (res && res.status === 200 && bodyStatus === 'ok') return;
    } catch (_) {
      // ignore and retry
    }
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
  throw new Error(`AI model health check failed after ${maxWaitMs}ms at ${healthUrl}`);
}

/**
 * Sends a file to the configured AI model endpoint for analysis.
 * Reads the file, encodes it as base64, and posts it to the AI model API.
 * Returns the AI model's response data.
 * Throws an error if the request fails.
 * @param {string} filePath - Path to the file to analyze
 * @param {string} [AI_MODEL_URL] - Optional override for the AI model URL
 * @param {object} [AI_MODEL_HEADERS] - Optional override for the AI model headers
 * @param {string} [AI_MODEL_HEALTH_URL] - Optional override for the AI model health URL
 * @returns {Promise<object>} - The AI model's response data
 */
async function sendToAIModel(filePath, AI_MODEL_URL, AI_MODEL_HEADERS, AI_MODEL_HEALTH_URL) {
  try {
    const fileContent = fs.readFileSync(filePath);
    const base64Content = fileContent.toString('base64');
    const payload = { file_bytes: base64Content };
    const url = AI_MODEL_URL || process.env.AI_MODEL_URL;
    const headers = AI_MODEL_HEADERS || { "Authorization": `Bearer ${process.env.AI_MODEL_TOKEN}` };
    const healthUrl = AI_MODEL_HEALTH_URL || process.env.AI_MODEL_HEALTH_URL || 'https://8000-dep-01k4nsrem33a9apxmbcx67crcj-d.cloudspaces.litng.ai/health';

    // Ensure AI server is awake/healthy before sending the file
    await ensureAIHealthy(url, headers, healthUrl);

    const timeout = Number(process.env.AI_REQUEST_TIMEOUT_MS || 120000); // default 2 minutes
    const response = await axios.post(url, payload, {
      headers,
      timeout
    });
    return response.data;
  } catch (error) {
    console.error('AI Model Error:', error.response?.data || error.message);
    throw new Error(`AI Model request failed: ${error.message}`);
  }
}

module.exports = sendToAIModel; 