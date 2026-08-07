// routes/reportCardRoutes.js
const express = require('express');
const router = express.Router();
const reportCardController = require('../../controllers/pdf/reportCardController');
const { protect } = require('../../middleware/auth');

// All routes require authentication
router.use(protect);

// Single student report cards (with optional exam ID)
router.get('/view/:studentId/:examId?/:academicYearId?', reportCardController.generateReportCardPDF);
router.get('/download/:studentId/:examId?/:academicYearId?', reportCardController.downloadReportCardPDF);

// Class report cards (multiple students with optional exam ID)
router.get('/class/view/:classId/:examId?/:academicYearId?', reportCardController.generateClassReportCardsPDF);
router.get('/class/download/:classId/:examId?/:academicYearId?', reportCardController.downloadClassReportCardsPDF);

// Class marks table (landscape table view of all students)
router.get('/class-marks/download/:classId/:examId?', reportCardController.downloadClassMarksTablePDF);

module.exports = router;