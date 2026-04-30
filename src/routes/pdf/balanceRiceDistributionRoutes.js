// routes/balanceRiceDistributionRoutes.js
const express = require('express');
const router = express.Router();
const balanceRiceDistributionController = require('../../controllers/pdf/balanceRiceDistributionController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// Get balance rice distribution list (JSON)
router.get('/list/:classId', balanceRiceDistributionController.getBalanceRiceDistributionList);

// View/Print PDF
router.get('/view/:classId/:month?/:year?', balanceRiceDistributionController.generateBalanceRiceDistributionPDF);

// Download PDF
router.get('/download/:classId/:month?/:year?', balanceRiceDistributionController.downloadBalanceRiceDistributionPDF);

module.exports = router;