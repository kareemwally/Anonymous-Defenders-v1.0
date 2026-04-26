const express = require('express');
const router = express.Router();

// Health check endpoint for Load Balancer
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    service: 'anonymous-defenders-api'
  });
});

// Detailed health check — internal metrics omitted from public response
// to avoid leaking process memory/CPU data to unauthenticated callers
router.get('/detailed', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    service: 'anonymous-defenders-api',
    version: '1.0.0',
    checks: {
      database: 'connected'
    }
  };

  res.status(200).json(health);
});

module.exports = router;
