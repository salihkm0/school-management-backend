const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, idParam, paginationQuery } = require('../middleware/validation');
const {
  getSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,
  getSubjectsByClass,
  getSubjectsByTeacher,
  getSubjectStats,
  bulkImportSubjects,
  assignSubjectToClasses
} = require('../controllers/subjectController');

// Public routes (with authentication)
router.use(protect);

// Stats route (admin only)
router.get('/stats', authorize('admin'), getSubjectStats);

// Bulk import (admin only)
router.post('/bulk-import', authorize('admin'), bulkImportSubjects);

// Get subjects by class or teacher
router.get('/class/:classId', validate([idParam]), getSubjectsByClass);
router.get('/teacher/:staffId', validate([idParam]), getSubjectsByTeacher);

// Assign subject to classes (admin only)
router.post('/:id/assign-to-classes', authorize('admin'), validate([idParam]), assignSubjectToClasses);

// CRUD operations
router.get('/', validate(paginationQuery), getSubjects);
router.get('/:id', validate([idParam]), getSubject);
router.post('/', authorize('admin'), createSubject);
router.put('/:id', authorize('admin'), validate([idParam]), updateSubject);
router.delete('/:id', authorize('admin'), validate([idParam]), deleteSubject);

module.exports = router;