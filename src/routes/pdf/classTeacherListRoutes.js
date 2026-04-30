// routes/classTeacherListRoutes.js
const express = require('express');
const router = express.Router();
const classTeacherListController = require('../../controllers/pdf/classTeacherListController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// Get class teacher list (JSON)
router.get('/data/:academicYearId?', classTeacherListController.getClassTeacherListData);

// View/Print PDF
router.get('/view/:academicYearId?', classTeacherListController.generateClassTeacherListPDF);

// Download PDF
router.get('/download/:academicYearId?', classTeacherListController.downloadClassTeacherListPDF);

module.exports = router;