// routes/studentListRoutes.js
const express = require('express');
const router = express.Router();
const studentListController = require('../../controllers/pdf/studentListController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// Get student list (JSON)
router.get('/:classId/:academicYearId?', studentListController.getStudentList);

// Generate PDF for student list
router.get('/pdf/:classId/:academicYearId?', studentListController.generateStudentListPDF);

module.exports = router;