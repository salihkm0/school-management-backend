const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getDashboardAnalytics,
  getPerformanceAnalytics,
  getAttendanceAnalytics,
  getTopPerformingClasses,
  getStudentProgressTrend
} = require('../controllers/analyticsController');

router.use(protect);

router.get('/dashboard', authorize('admin'), getDashboardAnalytics);
router.get('/performance', getPerformanceAnalytics);
router.get('/attendance', getAttendanceAnalytics);
router.get('/top-classes', getTopPerformingClasses);
router.get('/student/:studentId/progress', getStudentProgressTrend);

module.exports = router;