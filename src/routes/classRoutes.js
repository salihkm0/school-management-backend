// routes/classRoutes.js
// Add these routes to your existing classRoutes.js

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, idParam, paginationQuery, classValidation } = require('../middleware/validation');
const { cacheRoute, invalidateCache } = require('../middleware/cacheMiddleware');
const {
  getClasses,
  getClass,
  createClass,
  updateClass,
  deleteClass,
  assignClassTeacher,
  addSubjects,
  removeSubject,
  updateTimetable,
  applyTemplateToClass,
  syncClassSubjects,
  assignSubjectTeacher,
  bulkAssignSubjectTeachers,
  removeSubjectTeacher,
  getClassSubjectTeachers,
  getAllClassesSubjectTeachers,
  getTeacherClasses,
  getTeacherClassTeacherClasses, // Add this
  syncLanguageSubjects,
  syncAllClassesLanguageSubjects,
  getClassLanguageSubjects,
  syncAllSubjectTemplates
} = require('../controllers/classController');

router.use(protect);

// Subject-Teacher mappings
router.get('/subject-teachers/:academicYearId', authorize('admin'), cacheRoute(3600, 'classes'), getAllClassesSubjectTeachers);
router.get('/teacher/:teacherId/classes', cacheRoute(3600, 'classes'), getTeacherClasses);
router.get('/teacher/:teacherId/class-teacher-classes', cacheRoute(3600, 'classes'), getTeacherClassTeacherClasses); // Add this - ONLY class teacher classes
router.get('/:id/subject-teachers', validate([idParam]), cacheRoute(3600, 'classes'), getClassSubjectTeachers);
router.post('/:id/subject-teachers', authorize('admin'), validate([idParam]), invalidateCache('classes'), assignSubjectTeacher);
router.post('/:id/subject-teachers/bulk', authorize('admin'), validate([idParam]), invalidateCache('classes'), bulkAssignSubjectTeachers);
router.delete('/:id/subject-teachers/:subjectId', authorize('admin'), validate([idParam]), invalidateCache('classes'), removeSubjectTeacher);

// Subject templates bulk sync
router.post('/sync-all-templates/:academicYearId', authorize('admin'), invalidateCache('classes'), syncAllSubjectTemplates);

// Language subjects
router.post('/:id/sync-language-subjects', authorize('admin'), validate([idParam]), invalidateCache('classes'), syncLanguageSubjects);
router.post('/sync-all-language-subjects/:academicYearId', authorize('admin'), invalidateCache('classes'), syncAllClassesLanguageSubjects);
router.get('/:id/language-subjects', validate([idParam]), cacheRoute(3600, 'classes'), getClassLanguageSubjects);

// CRUD operations
router.get('/', validate(paginationQuery), cacheRoute(3600, 'classes'), getClasses);
router.get('/:id', validate([idParam]), cacheRoute(3600, 'classes'), getClass);
router.post('/', authorize('admin'), validate(classValidation), invalidateCache('classes'), createClass);
router.put('/:id', authorize('admin'), validate([idParam]), invalidateCache('classes'), updateClass);
router.delete('/:id', authorize('admin'), validate([idParam]), invalidateCache('classes'), deleteClass);

// Class teacher assignment (supports both assign and remove)
router.post('/:id/assign-teacher', authorize('admin'), validate([idParam]), invalidateCache('classes'), assignClassTeacher);

// Subjects
router.post('/:id/subjects', authorize('admin'), validate([idParam]), invalidateCache('classes'), addSubjects);
router.delete('/:id/subjects/:subjectId', authorize('admin'), validate([idParam]), invalidateCache('classes'), removeSubject);

// Timetable
router.put('/:id/timetable', authorize('admin', 'teacher'), validate([idParam]), invalidateCache('classes'), updateTimetable);

// Template
router.post('/:id/apply-template', authorize('admin'), validate([idParam]), invalidateCache('classes'), applyTemplateToClass);
router.post('/:id/sync-subjects', authorize('admin'), validate([idParam]), invalidateCache('classes'), syncClassSubjects);

module.exports = router;