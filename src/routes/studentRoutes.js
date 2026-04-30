// routes/studentRoutes.js - FIXED
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const { validate, idParam, classIdParam, paginationQuery, studentValidation } = require('../middleware/validation');
const {
  getStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  importStudents,
  importStudentsFromSamboorna,
  getImportBatchStatus,
  getImportHistory,
  promoteStudents,
  getStudentsByClass,
  getStudentMarks,
  getStudentAcademicInfo
} = require('../controllers/studentController');

router.use(protect);

router.get('/', validate(paginationQuery), getStudents);
router.post('/', authorize('admin'), validate(studentValidation), createStudent);
router.post('/import', authorize('admin'), uploadSingle('file'), importStudents);
router.post('/import/samboorna', authorize('admin'), uploadSingle('file'), importStudentsFromSamboorna);
router.get('/import/batch/:batchId', authorize('admin'), getImportBatchStatus);
router.get('/import/history', authorize('admin'), getImportHistory);
router.post('/promote', authorize('admin'), promoteStudents);

// FIXED: Use classIdParam instead of idParam
router.get('/class/:classId', validate([classIdParam]), getStudentsByClass);

router.get('/:id', validate([idParam]), getStudent);
router.get('/:id/marks', validate([idParam]), getStudentMarks);
router.get('/:id/academic-info', validate([idParam]), getStudentAcademicInfo);
router.put('/:id', authorize('admin'), validate([idParam]), updateStudent);
router.delete('/:id', authorize('admin'), validate([idParam]), deleteStudent);

module.exports = router;