const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { cacheRoute, invalidateCache } = require('../middleware/cacheMiddleware');
const {
  getExams,
  getExam,
  createExam,
  updateExam,
  deleteExam,
  publishExam,
  getExamTypes,
  getSessionTimes,
  getExamSchedule,
  getUpcomingExams,
  getMarksEntrySummary,
  getExamAnalytics,
  cloneExam,
  getExamClasses,
  getExamSubjects,
  getExamScheduleDetails,
  getStaffExams,
  createStaffExam
} = require('../controllers/examController');

router.use(protect);

// Public routes (authenticated but no role restriction)
router.get('/types', cacheRoute(3600, 'exams'), getExamTypes);
router.get('/session-times', cacheRoute(3600, 'exams'), getSessionTimes);
router.get('/upcoming', cacheRoute(1800, 'exams'), getUpcomingExams);
router.get('/schedule/:classId', cacheRoute(1800, 'exams'), getExamSchedule);

// Get exams for staff (class teacher only)
router.get('/staff/exams', protect, authorize('staff'), cacheRoute(1800, 'exams'), getStaffExams);

// Create exam as staff (class teacher)
router.post('/staff/exams', protect, authorize('staff'), invalidateCache('exams'), createStaffExam);

// IMPORTANT: Specific routes with :id must come BEFORE the generic /:id route
router.get('/:id/classes', authorize('admin', 'principal', 'staff'), cacheRoute(1800, 'exams'), getExamClasses);
router.get('/:id/subjects', authorize('admin', 'principal', 'staff'), cacheRoute(1800, 'exams'), getExamSubjects);
router.get('/:id/schedule-details', authorize('admin', 'principal', 'staff'), cacheRoute(1800, 'exams'), getExamScheduleDetails);
router.get('/:id/marks-summary', authorize('admin', 'principal'), getMarksEntrySummary); // Intentionally not cached as it changes frequently
router.get('/:id/analytics', cacheRoute(1800, 'exams'), getExamAnalytics);

// Generic exam CRUD - MUST COME LAST
router.get('/', cacheRoute(1800, 'exams'), getExams);
router.get('/:id', cacheRoute(1800, 'exams'), getExam);

// Admin only operations
router.post('/', authorize('admin'), invalidateCache('exams'), createExam);
router.put('/:id', authorize('admin'), invalidateCache('exams'), updateExam);
router.delete('/:id', authorize('admin'), invalidateCache('exams'), deleteExam);
router.post('/:id/publish', authorize('admin', 'principal'), invalidateCache('exams'), publishExam);
router.post('/:id/clone', authorize('admin'), invalidateCache('exams'), cloneExam);

module.exports = router;