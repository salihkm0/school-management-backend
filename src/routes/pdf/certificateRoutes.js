// routes/certificateRoutes.js
const express = require('express');
const router = express.Router();
const certificateController = require('../../controllers/pdf/certificateController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// View/Print PDF
router.get('/view/:studentId?', certificateController.generateCertificatePDF);

// Download PDF
router.get('/download/:studentId?', certificateController.downloadCertificatePDF);

module.exports = router;