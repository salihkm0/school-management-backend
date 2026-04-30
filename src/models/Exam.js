const mongoose = require('mongoose');

const EXAM_TYPES = {
  FIRST: 'first',
  SECOND: 'second',
  FINAL: 'final',
  MID: 'mid',
  QUARTERLY: 'quarterly',
  HALF_YEARLY: 'half_yearly',
  ANNUAL: 'annual',
  UNIT_TEST: 'unit_test',
  CLASS_TEST: 'class_test',
  SUBJECT_EXAM: 'subject_exam',
  CUSTOM: 'custom'
};

const SESSION_TIMES = {
  BF: 'BF', // Before Noon (9 AM - 12 PM)
  AF: 'AF', // After Noon (2 PM - 5 PM)
  FULL: 'FULL' // Full Day (9 AM - 5 PM)
};

const SUBMISSION_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  REVIEWED: 'reviewed',
  PUBLISHED: 'published'
};

// Enhanced Subject Schedule Schema with more details
const SubjectScheduleSchema = new mongoose.Schema({
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  subjectName: {
    type: String,
    required: true
  },
  subjectCode: String,
  examDate: {
    type: Date,
    required: true
  },
  session: {
    type: String,
    enum: Object.values(SESSION_TIMES),
    default: 'BF'
  },
  startTime: {
    type: String,
    default: '09:00 AM'
  },
  endTime: {
    type: String,
    default: '12:00 PM'
  },
  duration: Number, // in minutes
  
  // Marking Scheme
  maxMarks: {
    type: Number,
    required: true,
    min: 1
  },
  passingMarks: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Theory and Practical breakdown
  theoryMarks: {
    type: Number,
    default: 0,
    min: 0
  },
  practicalMarks: {
    type: Number,
    default: 0,
    min: 0
  },
  hasPractical: {
    type: Boolean,
    default: false
  },
  
  // CE (Continuous Evaluation) details
  ceEnabled: {
    type: Boolean,
    default: false
  },
  ceMaxMarks: {
    type: Number,
    default: 0
  },
  cePassingMarks: {
    type: Number,
    default: 0
  },
  ceWeightage: {
    type: Number,
    default: 20,
    min: 0,
    max: 100
  },
  termWeightage: {
    type: Number,
    default: 80,
    min: 0,
    max: 100
  },
  
  // Exam logistics
  roomNumber: String,
  building: String,
  invigilators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  }],
  invigilatorNames: [String],
  notes: String,
  
  // Additional
  isAbsentAllowed: {
    type: Boolean,
    default: true
  },
  graceTime: {
    type: Number,
    default: 0
  }
});

// Simplified Subject Config Schema (for backward compatibility)
const SubjectConfigSchema = new mongoose.Schema({
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  subjectName: {
    type: String,
    required: true
  },
  subjectCode: String,
  maxMarks: {
    type: Number,
    required: true,
    min: 1
  },
  passingMarks: {
    type: Number,
    required: true,
    min: 0
  },
  theoryMaxMarks: {
    type: Number,
    default: 0
  },
  practicalMaxMarks: {
    type: Number,
    default: 0
  },
  weightage: {
    type: Number,
    default: 100,
    min: 0,
    max: 100
  }
});

// Class-wise submission tracking
const ClassSubmissionStatusSchema = new mongoose.Schema({
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  className: String,
  classDisplayName: String,
  section: String,
  totalStudents: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: Object.values(SUBMISSION_STATUS),
    default: 'draft'
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  },
  submittedByName: String,
  submittedAt: Date,
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedByName: String,
  reviewedAt: Date,
  marksEntryStats: {
    totalStudents: { type: Number, default: 0 },
    termMarksEntered: { type: Number, default: 0 },
    ceMarksEntered: { type: Number, default: 0 },
    marksPending: { type: Number, default: 0 },
    completionPercentage: { type: Number, default: 0 }
  }
});

const ExamSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: true
  },
  examType: {
    type: String,
    enum: Object.values(EXAM_TYPES),
    required: true
  },
  description: String,
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true
  },
  academicYear: {
    type: String,
    required: true
  },
  term: {
    type: String,
    enum: ['first', 'second', 'third', 'fourth'],
    default: 'first'
  },
  
  // Target Classes with details
  classIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  }],
  
  // Detailed class information (denormalized for faster access)
  classDetails: [{
    classId: mongoose.Schema.Types.ObjectId,
    className: String,
    section: String,
    displayName: String,
    totalStudents: Number
  }],
  
  // Subjects Configuration
  subjects: [SubjectConfigSchema],
  
  // Enhanced Schedule
  schedule: [SubjectScheduleSchema],
  
  // Scheduling mode
  schedulingMode: {
    type: String,
    enum: ['date_range', 'subject_schedule'],
    default: 'subject_schedule'
  },
  
  // Date range
  startDate: Date,
  endDate: Date,
  
  // Class-wise submission tracking
  classSubmissionStatus: [ClassSubmissionStatusSchema],
  
  // Overall status
  overallStatus: {
    type: String,
    enum: Object.values(SUBMISSION_STATUS),
    default: 'draft'
  },
  
  // Settings
  settings: {
    allowCalculator: { type: Boolean, default: false },
    isOpenBook: { type: Boolean, default: false },
    graceTime: { type: Number, default: 0 },
    instructions: String,
    gradingSystem: {
      type: String,
      enum: ['GRADE', 'PERCENTAGE', 'CGPA'],
      default: 'GRADE'
    },
    allowAbsent: { type: Boolean, default: true },
    showRank: { type: Boolean, default: true }
  },
  
  // CE Configuration (global)
  ceConfig: {
    enabled: { type: Boolean, default: false },
    maxMarks: { type: Number, default: 20 },
    passingMarks: { type: Number, default: 8 },
    components: [{
      name: String,
      maxMarks: Number,
      weightage: Number
    }],
    subjectWise: { type: Boolean, default: true }
  },
  
  // Results
  isPublished: {
    type: Boolean,
    default: false
  },
  resultsPublished: {
    type: Boolean,
    default: false
  },
  resultsPublishedAt: Date,
  resultsPublishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Deadlines
  ceEntryDeadline: Date,
  termEntryDeadline: Date,
  resultDeclarationDate: Date
}, { timestamps: true });

// Virtual for display name
ExamSchema.virtual('displayName').get(function() {
  const typeNames = {
    first: 'First Term', second: 'Second Term', final: 'Final',
    mid: 'Mid Term', quarterly: 'Quarterly', half_yearly: 'Half Yearly',
    annual: 'Annual', unit_test: 'Unit Test', class_test: 'Class Test',
    subject_exam: 'Subject Exam'
  };
  
  if (this.examType !== 'custom') {
    const typeName = typeNames[this.examType] || this.examType;
    return `${typeName} Exam - ${this.academicYear}`;
  }
  return `${this.name} - ${this.academicYear}`;
});

// Virtual for total max marks
ExamSchema.virtual('totalMaxMarks').get(function() {
  return this.subjects.reduce((sum, s) => sum + s.maxMarks, 0);
});

// Virtual for class names
ExamSchema.virtual('classNames').get(function() {
  return this.classDetails.map(c => c.displayName).join(', ');
});

// Method to get subject config
ExamSchema.methods.getSubjectConfig = function(subjectId) {
  return this.subjects.find(s => s.subjectId.toString() === subjectId.toString());
};

// Method to get subject schedule
ExamSchema.methods.getSubjectSchedule = function(subjectId) {
  return this.schedule.find(s => s.subjectId.toString() === subjectId.toString());
};

// Method to update class submission stats
ExamSchema.methods.updateClassSubmissionStats = async function(classId) {
  const Mark = mongoose.model('Mark');
  const Student = mongoose.model('Student');
  
  const classStatus = this.classSubmissionStatus.find(
    cs => cs.classId.toString() === classId.toString()
  );
  
  if (!classStatus) return;
  
  const totalStudents = await Student.countDocuments({ 
    classId, 
    status: 'active' 
  });
  
  const termMarksEntered = await Mark.countDocuments({
    examId: this._id,
    classId,
    'termMarks.isFinalized': true
  });
  
  const ceMarksEntered = await Mark.countDocuments({
    examId: this._id,
    classId,
    'ceMarks.isFinalized': true
  });
  
  const totalExpectedTermMarks = totalStudents * this.subjects.length;
  const totalExpectedCEMarks = this.ceConfig?.enabled ? totalStudents * this.subjects.length : 0;
  
  classStatus.totalStudents = totalStudents;
  classStatus.marksEntryStats = {
    totalStudents,
    termMarksEntered,
    ceMarksEntered,
    marksPending: totalExpectedTermMarks - termMarksEntered,
    completionPercentage: totalExpectedTermMarks > 0 
      ? (termMarksEntered / totalExpectedTermMarks) * 100 
      : 0
  };
  
  await this.save();
  return classStatus.marksEntryStats;
};

// Pre-save middleware
ExamSchema.pre('save', async function(next) {
  // Update overall status based on class submissions
  if (this.classSubmissionStatus && this.classSubmissionStatus.length > 0) {
    const allSubmitted = this.classSubmissionStatus.every(
      cs => cs.status === 'submitted' || cs.status === 'reviewed'
    );
    const anyReviewed = this.classSubmissionStatus.some(cs => cs.status === 'reviewed');
    const anyPublished = this.classSubmissionStatus.some(cs => cs.status === 'published');
    
    if (anyPublished) {
      this.overallStatus = 'published';
    } else if (anyReviewed) {
      this.overallStatus = 'reviewed';
    } else if (allSubmitted) {
      this.overallStatus = 'submitted';
    } else {
      this.overallStatus = 'draft';
    }
  }
  
  // Populate class details if not present
  if (this.classIds && this.classIds.length > 0 && (!this.classDetails || this.classDetails.length === 0)) {
    const Class = mongoose.model('Class');
    const classes = await Class.find({ _id: { $in: this.classIds } }).populate('academicYearId');
    this.classDetails = classes.map(c => ({
      classId: c._id,
      className: c.name,
      section: c.section,
      displayName: c.section ? `${c.name}-${c.section}` : c.name,
      totalStudents: 0
    }));
  }
  
  next();
});

// Indexes
ExamSchema.index({ academicYearId: 1 });
ExamSchema.index({ classIds: 1 });
ExamSchema.index({ examType: 1 });
ExamSchema.index({ overallStatus: 1 });
ExamSchema.index({ startDate: 1, endDate: 1 });
ExamSchema.index({ 'classSubmissionStatus.classId': 1 });

module.exports = {
  Exam: mongoose.models.Exam || mongoose.model('Exam', ExamSchema),
  EXAM_TYPES,
  SESSION_TIMES,
  SUBMISSION_STATUS
};