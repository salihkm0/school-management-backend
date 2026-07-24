// routes/subjectRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, idParam, paginationQuery } = require('../middleware/validation');
const { cacheRoute, invalidateCache } = require('../middleware/cacheMiddleware');
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

router.get('/', validate(paginationQuery), cacheRoute(3600, 'subjects'), getSubjects);
router.get('/stats', authorize('admin'), cacheRoute(3600, 'subjects'), getSubjectStats);
router.get('/languages', cacheRoute(3600, 'subjects'), getLanguageSubjects);
router.get('/template/:className', cacheRoute(3600, 'subjects'), getSubjectsByTemplate);
router.get('/class/:classId', validate([idParam]), cacheRoute(3600, 'subjects'), getSubjectsByClass);
router.get('/teacher/:staffId', validate([idParam]), cacheRoute(3600, 'subjects'), getSubjectsByTeacher);
router.get('/:id', validate([idParam]), cacheRoute(3600, 'subjects'), getSubject);

router.post('/', authorize('admin'), invalidateCache('subjects'), createSubject);
router.post('/bulk-import', authorize('admin'), invalidateCache('subjects'), bulkImportSubjects);
router.post('/:id/assign-to-classes', authorize('admin'), validate([idParam]), invalidateCache('subjects'), assignSubjectToClasses);

router.put('/:id', authorize('admin'), validate([idParam]), invalidateCache('subjects'), updateSubject);
router.delete('/:id', authorize('admin'), validate([idParam]), invalidateCache('subjects'), deleteSubject);

module.exports = router;