const mongoose = require('mongoose');

const HolidaySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  type: {
    type: String,
    enum: ['public', 'religious', 'school', 'emergency'],
    default: 'public'
  },
  description: String
});

const AttendanceTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  },
  month: {
    type: Number,
    min: 1,
    max: 12
  },
  year: {
    type: Number
  },
  totalWorkingDays: {
    type: Number,
    required: true,
    min: 1,
    max: 31
  },
  holidays: [HolidaySchema],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const AttendanceSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  studentName: {
    type: String,
    required: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  totalWorkingDays: {
    type: Number,
    required: true,
    default: 0
  },
  totalHolidays: {
    type: Number,
    default: 0
  },
  presentDays: {
    type: Number,
    default: 0
  },
  absentDays: {
    type: Number,
    default: 0
  },
  percentage: {
    type: Number,
    default: 0
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceTemplate'
  },
  holidays: [HolidaySchema],
  remarks: String
}, {
  timestamps: true
});

// Pre-save middleware to calculate percentage
AttendanceSchema.pre('save', function(next) {
  if (this.totalWorkingDays > 0) {
    this.percentage = (this.presentDays / this.totalWorkingDays) * 100;
  } else {
    this.percentage = 0;
  }
  next();
});

// ── Indexes ──────────────────────────────────────────────────────────
// AttendanceTemplate: the most frequent query pattern
AttendanceTemplateSchema.index({ classId: 1, year: 1, month: 1, isActive: 1 });
AttendanceTemplateSchema.index({ academicYearId: 1 });

// Attendance: already has unique index on studentId+year+month
AttendanceSchema.index({ studentId: 1, year: 1, month: 1 }, { unique: true });
AttendanceSchema.index({ classId: 1, year: 1, month: 1 });
AttendanceSchema.index({ academicYearId: 1 });

// Create models
const AttendanceModel = mongoose.models.Attendance || mongoose.model('Attendance', AttendanceSchema);
const AttendanceTemplateModel = mongoose.models.AttendanceTemplate || mongoose.model('AttendanceTemplate', AttendanceTemplateSchema);

// Export as an object with named exports
module.exports = {
  Attendance: AttendanceModel,
  AttendanceTemplate: AttendanceTemplateModel
};