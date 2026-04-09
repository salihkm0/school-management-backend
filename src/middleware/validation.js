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

const idParam = param('id').isMongoId().withMessage('Invalid ID format');

const paginationQuery = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sort').optional().isString(),
  query('search').optional().isString()
];

const registerValidation = [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').notEmpty().withMessage('Name required'),
  body('role').isIn(['admin', 'staff', 'parent']).withMessage('Invalid role')
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required')
];

const studentValidation = [
  body('admissionNumber').notEmpty().withMessage('Admission number required'),
  body('name').notEmpty().withMessage('Student name required'),
  body('dateOfBirth').isISO8601().withMessage('Valid date required'),
  body('classId').isMongoId().withMessage('Valid class ID required')
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
  body('academicYear').notEmpty().withMessage('Academic year required')
];

const examValidation = [
  body('name').notEmpty().withMessage('Exam name required'),
  body('startDate').isISO8601().withMessage('Valid start date required'),
  body('endDate').isISO8601().withMessage('Valid end date required'),
  body('classIds').isArray().withMessage('Classes must be an array'),
  body('term').isIn(['first', 'second', 'final', 'mid', 'quarterly', 'half_yearly', 'annual'])
    .withMessage('Invalid term')
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

module.exports = {
  validate,
  idParam,
  paginationQuery,
  registerValidation,
  loginValidation,
  studentValidation,
  staffValidation,
  classValidation,
  examValidation,
  markValidation,
  dutyValidation
};