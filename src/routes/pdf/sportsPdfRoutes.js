// src/routes/pdf/sportsPdfRoutes.js
const express = require('express');
const router = express.Router();
const sportsPdfController = require('../../controllers/pdf/sportsPdfController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// View/Print PDF
router.get('/view/:classId?/:academicYearId?', sportsPdfController.generateSportsPDF);

// Download PDF
router.get('/download/:classId?/:academicYearId?', sportsPdfController.downloadSportsPDF);

module.exports = router;
