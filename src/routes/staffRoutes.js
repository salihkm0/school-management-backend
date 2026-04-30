// routes/staffRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, idParam, paginationQuery, staffValidation } = require('../middleware/validation');
const {
  // Staff CRUD
  getStaff,
  getStaffMember,
  createStaff,
  updateStaff,
  deleteStaff,
  
  // Staff Assignments
  getOrCreateStaffAssignment,
  getStaffAssignmentsByYear,
  getStaffAssignmentHistory,
  assignClassTeacher,
  assignSubjects,
  removeSubject,
  updateAttendance,
  updatePerformance,
  updateSalary,
  updateTimetable,
  getStaffTimetable,
  getStaffByClass,
  promoteStaffToNextYear,
  getStaffDashboardStats,
  getStaffRoles  // Add this
} = require('../controllers/staffController');

router.use(protect);

// Dashboard stats
router.get('/dashboard-stats', authorize('admin'), getStaffDashboardStats);

// Roles route - MUST be before /:id route
router.get('/roles', authorize('admin'), getStaffRoles);

// Staff CRUD
router.get('/', validate(paginationQuery), getStaff);
router.post('/', authorize('admin'), validate(staffValidation), createStaff);
router.get('/:id', validate([idParam]), getStaffMember);
router.put('/:id', authorize('admin'), validate([idParam]), updateStaff);
router.delete('/:id', authorize('admin'), validate([idParam]), deleteStaff);

// Staff Assignment History
router.get('/:staffId/assignment-history', validate([idParam]), getStaffAssignmentHistory);

// Staff Assignment by Year
router.get('/assignment/year/:academicYearId', getStaffAssignmentsByYear);
router.get('/:staffId/assignment/:academicYearId', getOrCreateStaffAssignment);

// Class Teacher Assignment
router.post('/:staffId/assignment/:academicYearId/class-teacher', authorize('admin'), assignClassTeacher);

// Subject Assignments
router.post('/:staffId/assignment/:academicYearId/subjects', authorize('admin'), assignSubjects);
router.delete('/:staffId/assignment/:academicYearId/subjects/:subjectId/class/:classId', authorize('admin'), removeSubject);

// Attendance
router.put('/:staffId/assignment/:academicYearId/attendance', authorize('admin'), updateAttendance);

// Performance
router.put('/:staffId/assignment/:academicYearId/performance', authorize('admin'), updatePerformance);

// Salary
router.put('/:staffId/assignment/:academicYearId/salary', authorize('admin'), updateSalary);

// Timetable
router.put('/:staffId/assignment/:academicYearId/timetable', authorize('admin', 'teacher'), updateTimetable);
router.get('/:staffId/timetable', getStaffTimetable);

// Get staff by class
router.get('/class/:classId', getStaffByClass);

// Promote staff to next year
router.post('/:staffId/promote', authorize('admin'), promoteStaffToNextYear);

module.exports = router;