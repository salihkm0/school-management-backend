// routes/classRoutes.js
// Add these routes to your existing classRoutes.js

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
router.get('/subject-teachers/:academicYearId', authorize('admin'), getAllClassesSubjectTeachers);
router.get('/teacher/:teacherId/classes', getTeacherClasses);
router.get('/teacher/:teacherId/class-teacher-classes', getTeacherClassTeacherClasses); // Add this - ONLY class teacher classes
router.get('/:id/subject-teachers', validate([idParam]), getClassSubjectTeachers);
router.post('/:id/subject-teachers', authorize('admin'), validate([idParam]), assignSubjectTeacher);
router.post('/:id/subject-teachers/bulk', authorize('admin'), validate([idParam]), bulkAssignSubjectTeachers);
router.delete('/:id/subject-teachers/:subjectId', authorize('admin'), validate([idParam]), removeSubjectTeacher);

// Subject templates bulk sync
router.post('/sync-all-templates/:academicYearId', authorize('admin'), syncAllSubjectTemplates);

// Language subjects
router.post('/:id/sync-language-subjects', authorize('admin'), validate([idParam]), syncLanguageSubjects);
router.post('/sync-all-language-subjects/:academicYearId', authorize('admin'), syncAllClassesLanguageSubjects);
router.get('/:id/language-subjects', validate([idParam]), getClassLanguageSubjects);

// CRUD operations
router.get('/', validate(paginationQuery), getClasses);
router.get('/:id', validate([idParam]), getClass);
router.post('/', authorize('admin'), validate(classValidation), createClass);
router.put('/:id', authorize('admin'), validate([idParam]), updateClass);
router.delete('/:id', authorize('admin'), validate([idParam]), deleteClass);

// Class teacher assignment (supports both assign and remove)
router.post('/:id/assign-teacher', authorize('admin'), validate([idParam]), assignClassTeacher);

// Subjects
router.post('/:id/subjects', authorize('admin'), validate([idParam]), addSubjects);
router.delete('/:id/subjects/:subjectId', authorize('admin'), validate([idParam]), removeSubject);

// Timetable
router.put('/:id/timetable', authorize('admin', 'teacher'), validate([idParam]), updateTimetable);

// Template
router.post('/:id/apply-template', authorize('admin'), validate([idParam]), applyTemplateToClass);
router.post('/:id/sync-subjects', authorize('admin'), validate([idParam]), syncClassSubjects);

module.exports = router;