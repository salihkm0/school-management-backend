// routes/statisticalDataRoutes.js
const express = require('express');
const router = express.Router();
const statisticalDataController = require('../../controllers/pdf/statisticalDataController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// Get statistical data (JSON)
router.get('/list/:classId/:academicYearId?', statisticalDataController.getStatisticalData);

// Generate PDF for statistical data
router.get('/pdf/:classId/:academicYearId?', statisticalDataController.generateStatisticalDataPDF);

module.exports = router;