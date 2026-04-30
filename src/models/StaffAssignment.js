// models/StaffAssignment.js
const mongoose = require('mongoose');

const SubjectAssignmentSchema = new mongoose.Schema({
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  subjectName: {
    type: String,
    required: true
  },
  subjectCode: {
    type: String
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  className: {
    type: String,
    required: true
  },
  section: {
    type: String
  },
  periodsPerWeek: {
    type: Number,
    default: 1,
    min: 1,
    max: 12
  }
}, { _id: false });

const StaffAssignmentSchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true
  },
  // Class Teacher Assignment for this year
  classTeacherOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    default: null
  },
  classTeacherOfName: {
    type: String
  },
  // Subjects taught this year
  subjectsTaught: [SubjectAssignmentSchema],
  // Additional responsibilities for this year
  responsibilities: [{
    title: String,
    description: String
  }],
  // Attendance for this year
  attendance: {
    totalWorkingDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    attendancePercentage: { type: Number, default: 0 }
  },
  // Performance for this year
  performance: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    remarks: String,
    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    evaluatedAt: Date
  },
  // Salary details for this year
  salary: {
    basic: { type: Number, default: 0 },
    da: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    conveyance: { type: Number, default: 0 },
    otherAllowances: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  // Timetable for this year
  timetable: [{
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    },
    periods: [{
      classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class'
      },
      subjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject'
      },
      startTime: String,
      endTime: String,
      room: String
    }]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  remarks: {
    type: String
  }
}, {
  timestamps: true
});

// Pre-save to calculate attendance percentage and total salary
StaffAssignmentSchema.pre('save', function(next) {
  // Calculate attendance percentage
  if (this.attendance.totalWorkingDays > 0) {
    this.attendance.attendancePercentage = 
      ((this.attendance.presentDays + this.attendance.leaveDays) / this.attendance.totalWorkingDays) * 100;
  }
  
  // Calculate absent days
  this.attendance.absentDays = 
    this.attendance.totalWorkingDays - (this.attendance.presentDays + this.attendance.leaveDays);
  
  // Calculate total salary
  this.salary.total = 
    (this.salary.basic || 0) + 
    (this.salary.da || 0) + 
    (this.salary.hra || 0) + 
    (this.salary.conveyance || 0) + 
    (this.salary.otherAllowances || 0);
  
  next();
});

// Compound unique index
StaffAssignmentSchema.index({ staffId: 1, academicYearId: 1 }, { unique: true });
StaffAssignmentSchema.index({ academicYearId: 1 });
StaffAssignmentSchema.index({ classTeacherOf: 1 });
StaffAssignmentSchema.index({ 'subjectsTaught.classId': 1 });

module.exports = mongoose.models.StaffAssignment || mongoose.model('StaffAssignment', StaffAssignmentSchema);