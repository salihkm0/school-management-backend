const mongoose = require('mongoose');

const EXAM_TYPES = {
  UNIT_TEST_1: 'unit_test_1',
  UNIT_TEST_2: 'unit_test_2',
  FIRST_MID_TERM: 'first_mid_term',
  FIRST_TERM: 'first_term',
  SECOND_MID_TERM: 'second_mid_term',
  SECOND_TERM: 'second_term',
  MODEL: 'model',
  ANNUAL: 'annual',
  CUSTOM: 'custom'
};

const SESSION_TIMES = {
  BF: 'BF',
  AF: 'AF',
  FULL: 'FULL'
};

const SUBMISSION_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  REVIEWED: 'reviewed',
  PUBLISHED: 'published'
};

// Subject Schedule Schema
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
  duration: Number,
  
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
  
  // Subject-level CE
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
  
  ceComponents: [{
    name: String,
    maxMarks: Number,
    weightage: Number
  }],
  
  roomNumber: String,
  building: String,
  invigilators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  }],
  invigilatorNames: [String],
  notes: String,
  isAbsentAllowed: {
    type: Boolean,
    default: true
  },
  graceTime: {
    type: Number,
    default: 0
  }
});

// Subject Config Schema
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
  termMaxMarks: {
    type: Number,
    required: true,
    min: 1
  },
  termPassingMarks: {
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
  ceComponents: [{
    name: String,
    maxMarks: Number,
    weightage: Number
  }],
  totalMaxMarks: {
    type: Number,
    default: 0
  },
  totalPassingMarks: {
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

// Class Submission Status Schema
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
  classIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  }],
  classDetails: [{
    classId: mongoose.Schema.Types.ObjectId,
    className: String,
    section: String,
    displayName: String,
    totalStudents: Number
  }],
  subjects: [SubjectConfigSchema],
  schedule: [SubjectScheduleSchema],
  schedulingMode: {
    type: String,
    enum: ['date_range', 'subject_schedule'],
    default: 'subject_schedule'
  },
  startDate: Date,
  endDate: Date,
  classSubmissionStatus: [ClassSubmissionStatusSchema],
  overallStatus: {
    type: String,
    enum: Object.values(SUBMISSION_STATUS),
    default: 'draft'
  },
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
  globalCeConfig: {
    enabled: { type: Boolean, default: false },
    maxMarks: { type: Number, default: 20 },
    passingMarks: { type: Number, default: 8 },
    components: [{
      name: String,
      maxMarks: Number,
      weightage: Number
    }]
  },
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
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  termEntryDeadline: Date,
  resultDeclarationDate: Date
}, { timestamps: true });

// Virtuals
ExamSchema.virtual('displayName').get(function() {
  const typeNames = {
    unit_test_1: 'Unit Test 1',
    unit_test_2: 'Unit Test 2',
    first_mid_term: 'First mid term examination',
    first_term: 'First term Examination',
    second_mid_term: 'Second mid term examination',
    second_term: 'Second term examination',
    model: 'Model examination',
    annual: 'Annual examination'
  };
  
  if (this.examType !== 'custom') {
    const typeName = typeNames[this.examType] || this.examType;
    return `${typeName} Exam - ${this.academicYear}`;
  }
  return `${this.name} - ${this.academicYear}`;
});

ExamSchema.virtual('totalMaxMarks').get(function() {
  return this.subjects.reduce((sum, s) => sum + (s.termMaxMarks || 0) + (s.ceMaxMarks || 0), 0);
});

// Methods
ExamSchema.methods.getSubjectConfig = function(subjectId) {
  return this.subjects.find(s => s.subjectId.toString() === subjectId.toString());
};

ExamSchema.methods.getSubjectSchedule = function(subjectId) {
  return this.schedule.find(s => s.subjectId.toString() === subjectId.toString());
};

ExamSchema.methods.getSubjectCeConfig = function(subjectId) {
  const subjectConfig = this.getSubjectConfig(subjectId);
  if (subjectConfig && subjectConfig.ceEnabled) {
    return {
      enabled: subjectConfig.ceEnabled,
      maxMarks: subjectConfig.ceMaxMarks,
      passingMarks: subjectConfig.cePassingMarks,
      components: subjectConfig.ceComponents || []
    };
  }
  return this.globalCeConfig || { enabled: false };
};

// FIX: Add the missing method
ExamSchema.methods.updateClassSubmissionStats = async function(classId) {
  try {
    const Mark = mongoose.model('Mark');
    const Student = mongoose.model('Student');
    
    const classStatus = this.classSubmissionStatus.find(
      cs => cs.classId.toString() === classId.toString()
    );
    
    if (!classStatus) return null;
    
    const totalStudents = await Student.countDocuments({ 
      classId, 
      status: 'active' 
    });
    
    const termMarksEntered = await Mark.countDocuments({
      examId: this._id,
      classId,
      isFinalized: true
    });
    
    const totalSubjects = this.subjects.length;
    const totalExpectedTermMarks = totalStudents * totalSubjects;
    
    classStatus.totalStudents = totalStudents;
    classStatus.marksEntryStats = {
      totalStudents,
      termMarksEntered,
      ceMarksEntered: 0,
      marksPending: totalExpectedTermMarks - termMarksEntered,
      completionPercentage: totalExpectedTermMarks > 0 
        ? (termMarksEntered / totalExpectedTermMarks) * 100 
        : 0
    };
    
    await this.save();
    return classStatus.marksEntryStats;
  } catch (error) {
    console.error('Error updating class submission stats:', error);
    return null;
  }
};

// Pre-save middleware
ExamSchema.pre('save', async function(next) {
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
  
  if (this.classIds && this.classIds.length > 0 && (!this.classDetails || this.classDetails.length === 0)) {
    const Class = mongoose.model('Class');
    const classes = await Class.find({ _id: { $in: this.classIds } });
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