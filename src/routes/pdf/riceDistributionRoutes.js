// routes/riceDistributionRoutes.js
const express = require('express');
const router = express.Router();
const riceDistributionController = require('../../controllers/pdf/riceDistributionController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// Get classes for dropdown
router.get('/classes', riceDistributionController.getClassesForDistribution);

// Get rice distribution list (JSON)
router.get('/list/:classId/:academicYearId?', riceDistributionController.getRiceDistributionList);

// Generate PDF for rice distribution
router.get('/pdf/:classId/:academicYearId/:distributionType?', riceDistributionController.generateRiceDistributionPDF);

module.exports = router;