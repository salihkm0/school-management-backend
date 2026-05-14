// routes/analyticsRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getDashboardAnalytics,
  getRecentActivities,
  subscribeDashboard,
  getPerformanceAnalytics,
  getAttendanceAnalytics,
  getGradeAnalysis,
  getFullAPlusStudents,
  getNearFullAPlusStudents,
  getTopPerformingClasses,
  getStudentProgressTrend,
  generateReportCard,
  generateClassReportCards,
  generateReportCardPDF,
  generateClassReportCardsPDF,
} = require('../controllers/analyticsController');

// All analytics routes require authentication
router.use(protect);

// Dashboard analytics
router.get('/dashboard', authorize('admin', 'staff'), getDashboardAnalytics);
router.get('/recent-activities', authorize('admin', 'staff'), getRecentActivities);
router.post('/dashboard/subscribe', authorize('admin', 'staff'), subscribeDashboard);

// Performance analytics
router.get('/performance', authorize('admin', 'staff'), getPerformanceAnalytics);
router.get('/attendance', authorize('admin', 'staff', 'parent'), getAttendanceAnalytics);
router.get('/grade-analysis', authorize('admin', 'staff'), getGradeAnalysis);
router.get('/full-aplus', authorize('admin', 'staff'), getFullAPlusStudents);
router.get('/near-full-aplus', authorize('admin', 'staff'), getNearFullAPlusStudents);
router.get('/top-classes', authorize('admin', 'staff'), getTopPerformingClasses);
router.get('/student-progress/:studentId', authorize('admin', 'staff', 'parent'), getStudentProgressTrend);

// Report cards
router.get('/report-card/:studentId', authorize('admin', 'staff', 'parent'), generateReportCard);
router.get('/report-card/:studentId/:academicYearId', authorize('admin', 'staff', 'parent'), generateReportCard);
router.get('/class-report-cards/:classId', authorize('admin', 'staff'), generateClassReportCards);
router.get('/class-report-cards/:classId/:academicYearId', authorize('admin', 'staff'), generateClassReportCards);

// PDF generation (optional - can be implemented later)
router.get('/report-card-pdf/:studentId', authorize('admin', 'staff', 'parent'), generateReportCardPDF);
router.get('/report-card-pdf/:studentId/:academicYearId', authorize('admin', 'staff', 'parent'), generateReportCardPDF);
router.get('/class-report-cards-pdf/:classId', authorize('admin', 'staff'), generateClassReportCardsPDF);
router.get('/class-report-cards-pdf/:classId/:academicYearId', authorize('admin', 'staff'), generateClassReportCardsPDF);

module.exports = router;