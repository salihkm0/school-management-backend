// routes/studentFilterRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  filterStudents,
  getTopPerformers,
  getStudentsBySubjectGrade,
  getStudentsByMixedGrades,
  getStudentsByRank,
  getStudentsByPercentage,
  exportFilteredStudents,
  getFilterOptions
} = require('../controllers/studentFilterController');

router.use(protect);

// Filter options
router.get('/options/:examId', getFilterOptions);

// Filter endpoints
router.post('/filter', authorize('staff', 'admin'), filterStudents);
router.post('/export', authorize('staff', 'admin'), exportFilteredStudents);

// Specific filters
router.get('/top-performers', getTopPerformers);
router.get('/by-subject-grade', getStudentsBySubjectGrade);
router.post('/by-mixed-grades', getStudentsByMixedGrades);
router.get('/by-rank', getStudentsByRank);
router.get('/by-percentage', getStudentsByPercentage);

module.exports = router;