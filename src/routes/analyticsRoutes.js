// routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getDashboardAnalytics,
  getGradeAnalysis,
  getFullAPlusStudents,
  getNearFullAPlusStudents,
  generateReportCard,
  generateClassReportCards,
  getPerformanceAnalytics,
  getAttendanceAnalytics,
  getTopPerformingClasses,
  getStudentProgressTrend,
  generateReportCardPDF,
  generateClassReportCardsPDF,
  getRecentActivities,
  subscribeDashboard
} = require('../controllers/analyticsController');

router.use(protect);

// Dashboard
router.get('/dashboard', getDashboardAnalytics);
router.get('/recent-activities', getRecentActivities);
router.post('/dashboard/subscribe', subscribeDashboard);

// Grade Analysis
router.get('/grade-analysis', getGradeAnalysis);
router.get('/full-aplus', getFullAPlusStudents);
router.get('/near-full-aplus', getNearFullAPlusStudents);

// Report Cards
router.get('/report-card/:studentId/:academicYearId?', generateReportCardPDF);
router.get('/class-report-cards/:classId/:academicYearId', authorize('admin', 'staff'), generateClassReportCardsPDF);

// Performance & Attendance
router.get('/performance', getPerformanceAnalytics);
router.get('/attendance', getAttendanceAnalytics);
router.get('/top-classes', getTopPerformingClasses);
router.get('/student-progress/:studentId', getStudentProgressTrend);

module.exports = router;