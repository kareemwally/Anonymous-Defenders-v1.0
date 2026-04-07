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

// Detailed health check
router.get('/detailed', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    service: 'anonymous-defenders-api',
    version: '1.0.0',
    checks: {
      database: 'connected', // You can add actual DB check here
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    }
  };
  
  res.status(200).json(health);
});

module.exports = router;
