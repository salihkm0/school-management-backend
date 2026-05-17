// routes/studentFilterRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const studentFilterController = require('../controllers/studentFilterController');

// ============================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// ============================================================
router.use(protect);

// ============================================================
// FILTER OPTIONS
// ============================================================
router.get('/options/:examId', studentFilterController.getFilterOptions);

// ============================================================
// MAIN FILTER ENDPOINTS
// ============================================================
router.post('/filter', authorize('staff', 'admin'), studentFilterController.filterStudents);
router.post('/export', authorize('staff', 'admin'), studentFilterController.exportFilteredStudents);
router.post('/bulk', authorize('staff', 'admin'), studentFilterController.bulkFilterStudents);

// ============================================================
// BASIC FILTERS
// ============================================================
router.get('/top-performers', authorize('staff', 'admin'), studentFilterController.getTopPerformers);
router.get('/by-subject-grade', authorize('staff', 'admin'), studentFilterController.getStudentsBySubjectGrade);
router.post('/by-mixed-grades', authorize('staff', 'admin'), studentFilterController.getStudentsByMixedGrades);
router.get('/by-rank', authorize('staff', 'admin'), studentFilterController.getStudentsByRank);
router.get('/by-percentage', authorize('staff', 'admin'), studentFilterController.getStudentsByPercentage);

// ============================================================
// ADVANCED ANALYSIS ENDPOINTS
// ============================================================
router.get('/grade-difference-analysis', authorize('staff', 'admin'), studentFilterController.getGradeDifferenceAnalysis);
router.get('/ce-component-analysis', authorize('staff', 'admin'), studentFilterController.getCEComponentAnalysis);

router.post('/create-sample-marks', authorize('admin'), studentFilterController.createSampleMarks);
// In studentFilterRoutes.js
router.get('/debug-transform', authorize('admin'), studentFilterController.debugTransform);

module.exports = router;