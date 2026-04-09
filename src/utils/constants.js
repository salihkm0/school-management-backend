module.exports = {
  USER_ROLES: {
    ADMIN: 'admin',
    STAFF: 'staff',
    PARENT: 'parent'
  },
  
  STAFF_ROLES: {
    TEACHER: 'teacher',
    PRINCIPAL: 'principal',
    VICE_PRINCIPAL: 'vice_principal',
    LIBRARIAN: 'librarian',
    ADMINISTRATOR: 'administrator'
  },
  
  STUDENT_STATUS: {
    ACTIVE: 'active',
    PASSED: 'passed',
    FAILED: 'failed',
    DISCONTINUED: 'discontinued',
    TRANSFERRED: 'transferred',
    COMPLETED: 'completed'
  },
  
  EXAM_TERMS: {
    FIRST: 'first',
    SECOND: 'second',
    FINAL: 'final',
    MID: 'mid',
    QUARTERLY: 'quarterly',
    HALF_YEARLY: 'half_yearly',
    ANNUAL: 'annual'
  },
  
  DUTY_TYPES: {
    EXAM: 'exam',
    INVIGILATION: 'invigilation',
    SUPERVISION: 'supervision',
    HALL_MONITOR: 'hall_monitor',
    SECURITY: 'security'
  },
  
  GRADE_SCALE: {
    'A+': { min: 90, max: 100 },
    'A': { min: 80, max: 89 },
    'B+': { min: 70, max: 79 },
    'B': { min: 60, max: 69 },
    'C+': { min: 50, max: 59 },
    'C': { min: 40, max: 49 },
    'D': { min: 33, max: 39 },
    'F': { min: 0, max: 32 }
  },
  
  DAYS_OF_WEEK: [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ],
  
  NOTIFICATION_TYPES: {
    INFO: 'info',
    WARNING: 'warning',
    SUCCESS: 'success',
    ERROR: 'error'
  }
};