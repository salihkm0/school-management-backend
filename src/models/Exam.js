const mongoose = require('mongoose');

const SubjectExamConfigSchema = new mongoose.Schema({
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  subjectName: {
    type: String,
    required: true
  },
  maxMarks: {
    type: Number,
    required: true
  },
  passingMarks: {
    type: Number,
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
  weightage: {
    type: Number,
    default: 100
  }
}, { _id: false });

const ExamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  classIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  }],
  subjectConfigs: [SubjectExamConfigSchema],
  isPublished: {
    type: Boolean,
    default: false
  },
  isGraded: {
    type: Boolean,
    default: true
  },
  gradingSystem: {
    type: String,
    enum: ['percentage', 'cgpa', 'letter'],
    default: 'percentage'
  },
  academicYear: {
    type: String,
    required: true
  },
  term: {
    type: String,
    enum: ['first', 'second', 'final', 'mid', 'quarterly', 'half_yearly', 'annual'],
    required: true
  }
}, {
  timestamps: true
});

ExamSchema.index({ classIds: 1, academicYear: 1 });

module.exports = mongoose.model('Exam', ExamSchema);