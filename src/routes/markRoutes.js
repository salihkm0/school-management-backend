const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getTeacherPermissions,
  getMarksheetsByClass,
  getOrCreateMarksheet,
  updateStudentMarks,
  bulkUpdateMarks,
  submitMarksForReview,
  reviewMarks,
  getStudentMarksheet,
  getClassRankings,
  getClassResults,
  publishResults
} = require('../controllers/markController');

router.use(protect);

// Permissions
router.get('/permissions/:examId/:classId', authorize('staff', 'admin'), getTeacherPermissions);

// Get all marksheets for a class
router.get('/class/:examId/:classId', authorize('staff', 'admin'), getMarksheetsByClass);

// Get or create individual marksheet
router.get('/student/:examId/:classId/:studentId', authorize('staff', 'admin'), getOrCreateMarksheet);

// Get student marksheet (for viewing)
router.get('/result/:examId/:studentId', getStudentMarksheet);

// Get class rankings
router.get('/rankings/:examId/:classId', getClassRankings);

// Get class results (backward compatibility)
router.get('/results/:examId/:classId', getClassResults);

// Update single student marks
router.put('/student/:examId/:classId/:studentId', authorize('staff', 'admin'), updateStudentMarks);

// Bulk update marks for all students
router.post('/bulk/:examId/:classId', authorize('staff', 'admin'), bulkUpdateMarks);

// Submit for review (class teacher)
router.post('/submit', authorize('staff',"admin"), submitMarksForReview);

// Review marks (admin)
router.post('/review', authorize('admin', 'principal'), reviewMarks);

// Publish results (admin)
router.post('/publish', authorize('admin'), publishResults);

module.exports = router;