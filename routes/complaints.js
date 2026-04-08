const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const complaintController = require('../controllers/complaintController');

const complaintsRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    error: 'Too many complaints submitted from this IP, please try again after an hour.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', complaintsRateLimit, complaintController.submitComplaint);

module.exports = router;
