// routes/bhakshyaBadrathaRoutes.js
const express = require('express');
const router = express.Router();
const bhakshyaBadrathaController = require('../../controllers/pdf/bhakshyaBadrathaController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// Get list (JSON)
router.get('/list/:classId', bhakshyaBadrathaController.getBhakshyaBadrathaList);

// View/Print PDF
router.get('/view/:classId/:academicYearId?', bhakshyaBadrathaController.generateBhakshyaBadrathaPDF);

// Download PDF
router.get('/download/:classId/:academicYearId?', bhakshyaBadrathaController.downloadBhakshyaBadrathaPDF);

module.exports = router;