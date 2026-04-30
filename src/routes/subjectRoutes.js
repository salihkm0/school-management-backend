// routes/subjectRoutes.js
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
  assignSubjectToClasses,
  getLanguageSubjects,
  getSubjectsByTemplate
} = require('../controllers/subjectController');

router.use(protect);

router.get('/', validate(paginationQuery), getSubjects);
router.get('/stats', authorize('admin'), getSubjectStats);
router.get('/languages', getLanguageSubjects);
router.get('/template/:className', getSubjectsByTemplate);
router.get('/class/:classId', validate([idParam]), getSubjectsByClass);
router.get('/teacher/:staffId', validate([idParam]), getSubjectsByTeacher);
router.get('/:id', validate([idParam]), getSubject);

router.post('/', authorize('admin'), createSubject);
router.post('/bulk-import', authorize('admin'), bulkImportSubjects);
router.post('/:id/assign-to-classes', authorize('admin'), validate([idParam]), assignSubjectToClasses);

router.put('/:id', authorize('admin'), validate([idParam]), updateSubject);
router.delete('/:id', authorize('admin'), validate([idParam]), deleteSubject);

module.exports = router;