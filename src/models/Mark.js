const mongoose = require('mongoose');

const MarkSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  studentName: {
    type: String,
    required: true
  },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },
  examName: {
    type: String,
    required: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  subjectName: {
    type: String,
    required: true
  },
  theoryMarks: {
    type: Number,
    default: 0
  },
  practicalMarks: {
    type: Number,
    default: 0
  },
  totalMarks: {
    type: Number,
    default: 0
  },
  maxMarks: {
    type: Number,
    required: true
  },
  passingMarks: {
    type: Number,
    required: true
  },
  percentage: {
    type: Number,
    default: 0
  },
  grade: {
    type: String
  },
  remarks: {
    type: String
  },
  enteredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  enteredAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isEditable: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

MarkSchema.pre('save', function(next) {
  this.totalMarks = (this.theoryMarks || 0) + (this.practicalMarks || 0);
  this.percentage = (this.totalMarks / this.maxMarks) * 100;
  this.grade = this.calculateGrade();
  next();
});

MarkSchema.methods.calculateGrade = function() {
  const percentage = this.percentage;
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C+';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
};

MarkSchema.index({ studentId: 1, examId: 1, subjectId: 1 }, { unique: true });
MarkSchema.index({ examId: 1 });

module.exports = mongoose.model('Mark', MarkSchema);