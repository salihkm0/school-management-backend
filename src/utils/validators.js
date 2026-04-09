const validator = require('express-validator');

const isEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isPhoneNumber = (phone) => {
  const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,5}[-\s\.]?[0-9]{1,5}$/;
  return phoneRegex.test(phone);
};

const isMongoId = (id) => {
  const mongoIdRegex = /^[0-9a-fA-F]{24}$/;
  return mongoIdRegex.test(id);
};

const isValidDate = (date) => {
  const d = new Date(date);
  return d instanceof Date && !isNaN(d);
};

const isValidNumber = (value, min = 0, max = Infinity) => {
  const num = Number(value);
  return !isNaN(num) && num >= min && num <= max;
};

const isValidPercentage = (value) => {
  const num = Number(value);
  return !isNaN(num) && num >= 0 && num <= 100;
};

const validateStudentData = (data) => {
  const errors = [];
  
  if (!data.name || data.name.length < 2) {
    errors.push('Student name must be at least 2 characters');
  }
  
  if (!data.admissionNumber) {
    errors.push('Admission number is required');
  }
  
  if (data.dateOfBirth && !isValidDate(data.dateOfBirth)) {
    errors.push('Invalid date of birth');
  }
  
  if (data.guardianEmail && !isEmail(data.guardianEmail)) {
    errors.push('Invalid guardian email');
  }
  
  if (data.guardianPhone && !isPhoneNumber(data.guardianPhone)) {
    errors.push('Invalid guardian phone number');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateStaffData = (data) => {
  const errors = [];
  
  if (!data.name || data.name.length < 2) {
    errors.push('Staff name must be at least 2 characters');
  }
  
  if (!data.role) {
    errors.push('Role is required');
  }
  
  if (!data.qualification) {
    errors.push('Qualification is required');
  }
  
  if (!data.contact || !isPhoneNumber(data.contact)) {
    errors.push('Valid contact number is required');
  }
  
  if (data.dateOfJoining && !isValidDate(data.dateOfJoining)) {
    errors.push('Invalid date of joining');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateExamData = (data) => {
  const errors = [];
  
  if (!data.name) {
    errors.push('Exam name is required');
  }
  
  if (!data.startDate || !isValidDate(data.startDate)) {
    errors.push('Valid start date is required');
  }
  
  if (!data.endDate || !isValidDate(data.endDate)) {
    errors.push('Valid end date is required');
  }
  
  if (data.startDate && data.endDate && new Date(data.startDate) > new Date(data.endDate)) {
    errors.push('Start date must be before end date');
  }
  
  if (!data.classIds || data.classIds.length === 0) {
    errors.push('At least one class is required');
  }
  
  if (!data.term) {
    errors.push('Exam term is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateMarkData = (data) => {
  const errors = [];
  
  if (!data.studentId || !isMongoId(data.studentId)) {
    errors.push('Valid student ID is required');
  }
  
  if (!data.examId || !isMongoId(data.examId)) {
    errors.push('Valid exam ID is required');
  }
  
  if (!data.subjectId || !isMongoId(data.subjectId)) {
    errors.push('Valid subject ID is required');
  }
  
  if (data.marksObtained !== undefined && !isValidNumber(data.marksObtained, 0)) {
    errors.push('Marks obtained must be a positive number');
  }
  
  if (data.maxMarks !== undefined && !isValidNumber(data.maxMarks, 1)) {
    errors.push('Max marks must be at least 1');
  }
  
  if (data.marksObtained && data.maxMarks && data.marksObtained > data.maxMarks) {
    errors.push('Marks obtained cannot exceed max marks');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateAttendanceData = (data) => {
  const errors = [];
  
  if (!data.studentId || !isMongoId(data.studentId)) {
    errors.push('Valid student ID is required');
  }
  
  if (!data.classId || !isMongoId(data.classId)) {
    errors.push('Valid class ID is required');
  }
  
  if (!data.year || !isValidNumber(data.year, 2000, 2100)) {
    errors.push('Valid year is required');
  }
  
  if (!data.month || !isValidNumber(data.month, 1, 12)) {
    errors.push('Valid month is required');
  }
  
  if (data.absentDays !== undefined && !isValidNumber(data.absentDays, 0)) {
    errors.push('Absent days must be a positive number');
  }
  
  if (data.totalDays !== undefined && !isValidNumber(data.totalDays, 1, 31)) {
    errors.push('Total days must be between 1 and 31');
  }
  
  if (data.absentDays && data.totalDays && data.absentDays > data.totalDays) {
    errors.push('Absent days cannot exceed total days');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateDutyData = (data) => {
  const errors = [];
  
  if (!data.staffId || !isMongoId(data.staffId)) {
    errors.push('Valid staff ID is required');
  }
  
  if (!data.classId || !isMongoId(data.classId)) {
    errors.push('Valid class ID is required');
  }
  
  if (!data.dutyDate || !isValidDate(data.dutyDate)) {
    errors.push('Valid duty date is required');
  }
  
  const validDutyTypes = ['exam', 'invigilation', 'supervision', 'hall_monitor', 'security'];
  if (data.dutyType && !validDutyTypes.includes(data.dutyType)) {
    errors.push('Invalid duty type');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input.trim().replace(/[<>]/g, '');
  }
  return input;
};

const sanitizeObject = (obj) => {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeInput(value);
  }
  return sanitized;
};

module.exports = {
  isEmail,
  isPhoneNumber,
  isMongoId,
  isValidDate,
  isValidNumber,
  isValidPercentage,
  validateStudentData,
  validateStaffData,
  validateExamData,
  validateMarkData,
  validateAttendanceData,
  validateDutyData,
  sanitizeInput,
  sanitizeObject
};