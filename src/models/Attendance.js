const mongoose = require('mongoose');

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
  absentDays: {
    type: Number,
    required: true,
    default: 0
  },
  totalDays: {
    type: Number,
    required: true
  },
  presentDays: {
    type: Number,
    default: 0
  },
  percentage: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

AttendanceSchema.pre('save', function(next) {
  this.presentDays = this.totalDays - this.absentDays;
  this.percentage = (this.presentDays / this.totalDays) * 100;
  next();
});

AttendanceSchema.index({ studentId: 1, year: 1, month: 1 }, { unique: true });
AttendanceSchema.index({ classId: 1, year: 1, month: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);