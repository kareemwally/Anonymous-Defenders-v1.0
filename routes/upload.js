const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadController = require('../controllers/uploadController');
const optionalAuth = require('../middleware/optionalAuth');
const guestAbusePrevention = require('../middleware/guestAbuse');

const upload = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/', optionalAuth, guestAbusePrevention, upload.single('file'), uploadController.uploadFile);
router.get('/plots/:filename', uploadController.getPlot);

module.exports = router;
