const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, idParam } = require('../middleware/validation');
const {
  getAttendance,
  getAttendanceByStudent,
  getAttendanceByClass,
  createAttendance,
  bulkCreateAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceSummary
} = require('../controllers/attendanceController');

router.use(protect);

router.get('/', getAttendance);
router.get('/summary', getAttendanceSummary);
router.get('/student/:studentId', validate([idParam]), getAttendanceByStudent);
router.get('/class/:classId', validate([idParam]), getAttendanceByClass);
router.post('/', authorize('staff', 'admin'), createAttendance);
router.post('/bulk', authorize('staff', 'admin'), bulkCreateAttendance);
router.put('/:id', authorize('staff', 'admin'), validate([idParam]), updateAttendance);
router.delete('/:id', authorize('admin'), validate([idParam]), deleteAttendance);

module.exports = router;