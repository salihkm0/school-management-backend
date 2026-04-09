const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const { validate, idParam, paginationQuery, studentValidation } = require('../middleware/validation');
const {
  getStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  importStudents,
  promoteStudents,
  getStudentsByClass,
  getStudentMarks
} = require('../controllers/studentController');

router.use(protect);

router.get('/', validate(paginationQuery), getStudents);
router.post('/', authorize('admin'), validate(studentValidation), createStudent);
router.post('/import', authorize('admin'), uploadSingle('file'), importStudents);
router.post('/promote', authorize('admin'), promoteStudents);
router.get('/class/:classId', validate([idParam]), getStudentsByClass);
router.get('/:id', validate([idParam]), getStudent);
router.get('/:id/marks', validate([idParam]), getStudentMarks);
router.put('/:id', authorize('admin'), validate([idParam]), updateStudent);
router.delete('/:id', authorize('admin'), validate([idParam]), deleteStudent);

module.exports = router;