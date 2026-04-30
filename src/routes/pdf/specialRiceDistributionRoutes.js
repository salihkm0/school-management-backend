// routes/specialRiceDistributionRoutes.js
const express = require('express');
const router = express.Router();
const specialRiceDistributionController = require('../../controllers/pdf/specialRiceDistributionController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// Get list (JSON)
router.get('/list/:classId', specialRiceDistributionController.getSpecialRiceDistributionList);

// View/Print PDF
router.get('/view/:classId/:month?/:year?', specialRiceDistributionController.generateSpecialRiceDistributionPDF);

// Download PDF
router.get('/download/:classId/:month?/:year?', specialRiceDistributionController.downloadSpecialRiceDistributionPDF);

module.exports = router;