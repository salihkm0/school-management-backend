// routes/studentRoutes.js - FIXED
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const { validate, idParam, classIdParam, paginationQuery, studentValidation } = require('../middleware/validation');
const { cacheRoute, invalidateCache } = require('../middleware/cacheMiddleware');
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
  getStudentAcademicInfo,
  exportStudents,
  bulkUpdateRollNumbers
} = require('../controllers/studentController');

router.use(protect);

router.get('/', validate(paginationQuery), cacheRoute(1800, 'students'), getStudents);
router.post('/', authorize('admin'), validate(studentValidation), invalidateCache('students'), createStudent);
router.post('/import', authorize('admin'), uploadSingle('file'), invalidateCache('students'), importStudents);
router.post('/import/samboorna', authorize('admin'), uploadSingle('file'), invalidateCache('students'), importStudentsFromSamboorna);
router.get('/import/batch/:batchId', authorize('admin'), getImportBatchStatus);
router.get('/import/history', authorize('admin'), getImportHistory);
router.post('/promote', authorize('admin'), invalidateCache('students'), promoteStudents);

// FIXED: Use classIdParam instead of idParam
router.get('/class/:classId', validate([classIdParam]), cacheRoute(1800, 'students'), getStudentsByClass);

// Bulk Update Roll Numbers
router.put('/bulk-update-roll-numbers', authorize('admin', 'staff'), invalidateCache('students'), bulkUpdateRollNumbers);

// Export all students as CSV (must be before /:id)
router.get('/export/excel', exportStudents);

router.get('/:id', validate([idParam]), cacheRoute(1800, 'students'), getStudent);
router.get('/:id/marks', validate([idParam]), getStudentMarks); // Marks can be cached elsewhere or individually
router.get('/:id/academic-info', validate([idParam]), cacheRoute(1800, 'students'), getStudentAcademicInfo);
router.put('/:id', authorize('admin'), validate([idParam]), invalidateCache('students'), updateStudent);
router.delete('/:id', authorize('admin'), validate([idParam]), invalidateCache('students'), deleteStudent);

module.exports = router;