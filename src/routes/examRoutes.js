const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
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
router.get('/types', getExamTypes);
router.get('/session-times', getSessionTimes);
router.get('/upcoming', getUpcomingExams);
router.get('/schedule/:classId', getExamSchedule);

// Get exams for staff (class teacher only)
router.get('/staff/exams', protect, authorize('staff'), getStaffExams);

// Create exam as staff (class teacher)
router.post('/staff/exams', protect, authorize('staff'), createStaffExam);

// IMPORTANT: Specific routes with :id must come BEFORE the generic /:id route
router.get('/:id/classes', authorize('admin', 'principal', 'staff'), getExamClasses);
router.get('/:id/subjects', authorize('admin', 'principal', 'staff'), getExamSubjects);
router.get('/:id/schedule-details', authorize('admin', 'principal', 'staff'), getExamScheduleDetails);
router.get('/:id/marks-summary', authorize('admin', 'principal'), getMarksEntrySummary);
router.get('/:id/analytics', getExamAnalytics);

// Generic exam CRUD - MUST COME LAST
router.get('/', getExams);
router.get('/:id', getExam);

// Admin only operations
router.post('/', authorize('admin'), createExam);
router.put('/:id', authorize('admin'), updateExam);
router.delete('/:id', authorize('admin'), deleteExam);
router.post('/:id/publish', authorize('admin', 'principal'), publishExam);
router.post('/:id/clone', authorize('admin'), cloneExam);

module.exports = router;