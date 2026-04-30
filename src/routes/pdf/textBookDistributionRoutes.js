// routes/textBookDistributionRoutes.js
const express = require('express');
const router = express.Router();
const textBookDistributionController = require('../../controllers/pdf/textBookDistributionController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// View/Print PDF
router.get('/view/:classId?/:academicYearId?', textBookDistributionController.generateTextBookDistributionPDF);

// Download PDF
router.get('/download/:classId?/:academicYearId?', textBookDistributionController.downloadTextBookDistributionPDF);

module.exports = router;