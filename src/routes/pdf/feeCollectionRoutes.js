// routes/feeCollectionRoutes.js
const express = require('express');
const router = express.Router();
const feeCollectionController = require('../../controllers/pdf/feeCollectionController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// Get fee collection list (JSON)
router.get('/list/:classId?/:academicYearId?', feeCollectionController.getFeeCollectionList);

// View/Print PDF
router.get('/view/:classId?/:academicYearId?', feeCollectionController.generateFeeCollectionPDF);

// Download PDF
router.get('/download/:classId?/:academicYearId?', feeCollectionController.downloadFeeCollectionPDF);

module.exports = router;