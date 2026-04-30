// models/ExamResult.js
const mongoose = require('mongoose');

const SubjectResultSchema = new mongoose.Schema({
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  subjectName: String,
  subjectCode: String,
  maxMarks: Number,
  obtainedMarks: Number,
  theoryMarks: Number,
  practicalMarks: Number,
  percentage: Number,
  grade: String,
  status: {
    type: String,
    enum: ['pass', 'fail', 'absent'],
    default: 'pass'
  }
});

const ExamResultSchema = new mongoose.Schema({
  // Identifiers
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  studentName: String,
  studentCode: String,
  rollNumber: String,
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },
  examName: String,
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  className: String,
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true
  },
  academicYear: String,
  term: String,
  
  // Results
  subjectResults: [SubjectResultSchema],
  totalMarks: Number,
  totalMaxMarks: Number,
  percentage: Number,
  grade: String,
  rank: Number,
  
  // Status
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: Date,
  publishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Indexes
ExamResultSchema.index({ studentId: 1, examId: 1 }, { unique: true });
ExamResultSchema.index({ examId: 1, classId: 1 });
ExamResultSchema.index({ examId: 1, rank: 1 });
ExamResultSchema.index({ isPublished: 1 });
ExamResultSchema.index({ academicYearId: 1 });

module.exports = mongoose.models.ExamResult || mongoose.model('ExamResult', ExamResultSchema);