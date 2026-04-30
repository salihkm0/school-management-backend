// routes/classPtaRoutes.js
const express = require('express');
const router = express.Router();
const classPtaController = require('../../controllers/pdf/classPtaController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// View/Print PDF
router.get('/view/:classId?/:academicYearId?', classPtaController.generateClassPtaPDF);

// Download PDF
router.get('/download/:classId?/:academicYearId?', classPtaController.downloadClassPtaPDF);

module.exports = router;