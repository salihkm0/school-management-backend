const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, idParam, paginationQuery, classValidation } = require('../middleware/validation');
const {
  getClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
  assignClassTeacher,
  addSubjects,
  updateTimetable
} = require('../controllers/classController');

router.use(protect);

router.get('/', validate(paginationQuery), getClasses);
router.get('/:id', validate([idParam]), getClass);
router.post('/', authorize('admin'), validate(classValidation), createClass);
router.put('/:id', authorize('admin'), validate([idParam]), updateClass);
router.delete('/:id', authorize('admin'), validate([idParam]), deleteClass);
router.post('/:id/assign-teacher', authorize('admin'), validate([idParam]), assignClassTeacher);
router.post('/:id/subjects', authorize('admin'), validate([idParam]), addSubjects);
router.put('/:id/timetable', authorize('admin'), validate([idParam]), updateTimetable);

module.exports = router;