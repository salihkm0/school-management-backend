// middleware/validation.js
const { body, param, query, validationResult } = require('express-validator');

const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    res.status(400).json({
      message: 'Validation error',
      errors: errors.array()
    });
  };
};

// Generic MongoDB ID validator
const mongoIdParam = (paramName) => param(paramName).isMongoId().withMessage(`Invalid ${paramName} format`);

// Predefined parameter validators
const idParam = mongoIdParam('id');
const classIdParam = mongoIdParam('classId');
const studentIdParam = mongoIdParam('studentId');
const examIdParam = mongoIdParam('examId');
const subjectIdParam = mongoIdParam('subjectId');
const staffIdParam = mongoIdParam('staffId');
const academicYearIdParam = mongoIdParam('academicYearId');
const batchIdParam = mongoIdParam('batchId');
const parentIdParam = mongoIdParam('parentId');
const dutyIdParam = mongoIdParam('dutyId');

const paginationQuery = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
  query('sort').optional().isString(),
  query('search').optional().isString()
];

// Phone number validator
const isValidPhone = (value) => {
  if (!value) return true;
  return /^[0-9]{10}$/.test(value);
};

const registerValidation = [
  body('email').optional().isEmail().withMessage('Valid email required'),
  body('phone').optional().custom(isValidPhone).withMessage('Enter a valid 10-digit mobile number'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').notEmpty().withMessage('Name required'),
  body('role').isIn(['admin', 'staff', 'parent']).withMessage('Invalid role')
];

// Updated login validation to support both email and phone
const loginValidation = [
  body('email').optional().isEmail().withMessage('Valid email required'),
  body('phone').optional().custom(isValidPhone).withMessage('Enter a valid 10-digit mobile number'),
  body('password').notEmpty().withMessage('Password required'),
  body().custom((value, { req }) => {
    if (!req.body.email && !req.body.phone) {
      throw new Error('Either email or phone number is required');
    }
    return true;
  })
];

// Parent registration validation (phone is required)
const parentRegisterValidation = [
  body('fullName').notEmpty().withMessage('Full name required'),
  body('phone').notEmpty().withMessage('Mobile number required').custom(isValidPhone).withMessage('Enter a valid 10-digit mobile number'),
  body('alternatePhone').optional().custom(isValidPhone).withMessage('Enter a valid 10-digit phone number'),
  body('email').optional().isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Passwords do not match');
    }
    return true;
  }),
  body('occupation').optional().isString(),
  body('address').optional().isString()
];

const studentValidation = [
  body('fullName').notEmpty().withMessage('Student full name required'),
  body('studentCode').notEmpty().withMessage('Student code required'),
  body('admissionNo').notEmpty().withMessage('Admission number required'),
  body('dateOfBirth').optional().isISO8601().withMessage('Valid date required'),
  body('classId').optional().isMongoId().withMessage('Valid class ID required'),
  body('academicYearId').notEmpty().withMessage('Academic year ID required').isMongoId().withMessage('Valid academic year ID required'),
  body('gender').optional().isIn(['M', 'F', 'Other']).withMessage('Invalid gender'),
  body('status').optional().isIn(['active', 'inactive', 'discontinued', 'transferred', 'completed']).withMessage('Invalid status')
];

const staffValidation = [
  body('name').notEmpty().withMessage('Name required'),
  body('role').notEmpty().withMessage('Role required'),
  body('qualification').notEmpty().withMessage('Qualification required'),
  body('contact').notEmpty().withMessage('Contact required'),
  body('dateOfJoining').isISO8601().withMessage('Valid date required')
];

const classValidation = [
  body('name').notEmpty().withMessage('Class name required'),
  body('academicYearId').notEmpty().withMessage('Academic year ID required').isMongoId().withMessage('Valid academic year ID required'),
  body('section').optional().isString(),
  body('capacity').optional().isInt({ min: 1, max: 100 }).withMessage('Capacity must be between 1 and 100')
];

const academicYearValidation = [
  body('name').notEmpty().withMessage('Academic year name required'),
  body('year').notEmpty().withMessage('Year required').matches(/^\d{4}-\d{4}$/).withMessage('Year must be in format YYYY-YYYY'),
  body('startDate').isISO8601().withMessage('Valid start date required'),
  body('endDate').isISO8601().withMessage('Valid end date required'),
  body('isCurrent').optional().isBoolean()
];

const examValidation = [
  body('name').notEmpty().withMessage('Exam name required'),
  body('startDate').isISO8601().withMessage('Valid start date required'),
  body('endDate').isISO8601().withMessage('Valid end date required'),
  body('classIds').isArray().withMessage('Classes must be an array'),
  body('term').optional().isIn(['first', 'second', 'third', 'fourth'])
    .withMessage('Invalid term'),
  body('examType').optional().isIn(['unit_test_1', 'unit_test_2', 'first_mid_term', 'first_term', 'second_mid_term', 'second_term', 'model', 'annual', 'custom'])
    .withMessage('Invalid exam type')
];

const markValidation = [
  body('studentId').isMongoId().withMessage('Valid student ID required'),
  body('examId').isMongoId().withMessage('Valid exam ID required'),
  body('subjectId').isMongoId().withMessage('Valid subject ID required'),
  body('theoryMarks').optional().isInt({ min: 0 }).withMessage('Theory marks must be positive'),
  body('practicalMarks').optional().isInt({ min: 0 }).withMessage('Practical marks must be positive')
];

const dutyValidation = [
  body('staffId').isMongoId().withMessage('Valid staff ID required'),
  body('classId').isMongoId().withMessage('Valid class ID required'),
  body('dutyDate').isISO8601().withMessage('Valid date required'),
  body('dutyType').isIn(['exam', 'invigilation', 'supervision', 'hall_monitor', 'security'])
    .withMessage('Invalid duty type')
];

const samboornaImportValidation = [
  body('academicYearId').notEmpty().withMessage('Academic year ID required').isMongoId().withMessage('Valid academic year ID required'),
  body('autoCreateClasses').optional().isBoolean(),
  body('updateExistingStudents').optional().isBoolean(),
  body('batchSize').optional().isInt({ min: 10, max: 500 }).withMessage('Batch size must be between 10 and 500')
];

const promoteStudentsValidation = [
  body('fromClassId').isMongoId().withMessage('Valid from class ID required'),
  body('toClassId').isMongoId().withMessage('Valid to class ID required'),
  body('newAcademicYearId').optional().isMongoId().withMessage('Valid academic year ID required'),
  body('studentStatuses').isObject().withMessage('Student statuses must be an object')
];

const subjectValidation = [
  body('name').notEmpty().withMessage('Subject name required'),
  body('code').notEmpty().withMessage('Subject code required'),
  body('type').optional().isIn(['core', 'elective', 'optional']).withMessage('Invalid subject type'),
  body('creditHours').optional().isInt({ min: 0, max: 6 }).withMessage('Credit hours must be between 0 and 6'),
  body('gradeLevel').optional().isIn(['primary', 'middle', 'high', 'all']).withMessage('Invalid grade level')
];

const assignTeacherValidation = [
  body('teacherId').isMongoId().withMessage('Valid teacher ID required')
];

const addSubjectsValidation = [
  body('subjectIds').isArray({ min: 1 }).withMessage('At least one subject ID required'),
  body('subjectIds.*').isMongoId().withMessage('Valid subject ID required')
];

const timetableValidation = [
  body('timetable').isArray().withMessage('Timetable must be an array'),
  body('timetable.*.day').isIn(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']).withMessage('Invalid day'),
  body('timetable.*.periods').isArray().withMessage('Periods must be an array'),
  body('timetable.*.periods.*.subjectId').optional().isMongoId().withMessage('Valid subject ID required'),
  body('timetable.*.periods.*.teacherId').optional().isMongoId().withMessage('Valid teacher ID required'),
  body('timetable.*.periods.*.startTime').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format (HH:MM)'),
  body('timetable.*.periods.*.endTime').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Invalid time format (HH:MM)')
];

module.exports = {
  validate,
  // Parameter validators
  idParam,
  classIdParam,
  studentIdParam,
  examIdParam,
  subjectIdParam,
  staffIdParam,
  academicYearIdParam,
  batchIdParam,
  parentIdParam,
  dutyIdParam,
  // Query validators
  paginationQuery,
  // Validation schemas
  registerValidation,
  loginValidation,
  parentRegisterValidation,  // Add this
  studentValidation,
  staffValidation,
  classValidation,
  academicYearValidation,
  examValidation,
  markValidation,
  dutyValidation,
  samboornaImportValidation,
  promoteStudentsValidation,
  subjectValidation,
  assignTeacherValidation,
  addSubjectsValidation,
  timetableValidation
};