const mongoose = require("mongoose");
const { calculateGradeFromPercentage } = require("../services/gradingService");

const MARK_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  REVIEWED: "reviewed",
  PUBLISHED: "published",
};

const SubjectMarkSchema = new mongoose.Schema({
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Subject",
    required: true,
  },
  subjectName: {
    type: String,
    required: true,
  },
  subjectCode: String,
  theoryScore: {
    type: Number,
    default: 0,
    min: 0,
  },
  practicalScore: {
    type: Number,
    default: 0,
    min: 0,
  },
  ceScore: {  // ADD THIS FIELD - CE marks
    type: Number,
    default: 0,
    min: 0,
  },
  totalScore: {
    type: Number,
    default: 0,
  },
  maxMarks: {
    type: Number,
    required: true,
    default: 100,
  },
  passingMarks: {
    type: Number,
    default: 40,
  },
  percentage: {
    type: Number,
    default: 0,
  },
  grade: {
    type: String,
    default: "F",
  },
  remarks: String,
  isAbsent: {
    type: Boolean,
    default: false,
  },
  isEntered: {
    type: Boolean,
    default: false,
  },
});

const MarkSchema = new mongoose.Schema(
  {
    // Identifiers
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    studentName: {
      type: String,
      required: true,
    },
    studentCode: String,
    rollNumber: String,
    admissionNo: String,
    
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },
    examName: String,
    examType: String,
    term: String,
    
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
    },
    className: String,
    
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
    },
    academicYear: String,
    
    // All subjects marks for this student in this exam
    subjects: [SubjectMarkSchema],
    
    // Summary
    totalMarks: {
      type: Number,
      default: 0,
    },
    totalMaxMarks: {
      type: Number,
      default: 0,
    },
    percentage: {
      type: Number,
      default: 0,
    },
    grade: {
      type: String,
      default: "F",
    },
    rank: Number,
    
    // Status tracking
    status: {
      type: String,
      enum: Object.values(MARK_STATUS),
      default: "draft",
    },
    
    // Metadata
    enteredBy: {
      type: String,
    },
    enteredByName: String,
    enteredAt: {
      type: Date,
      default: Date.now,
    },
    lastUpdatedBy: {
      type: String,
    },
    lastUpdatedAt: Date,
    submittedBy: {
      type: String,
    },
    submittedAt: Date,
    reviewedBy: {
      type: String,
    },
    reviewedAt: Date,
    
    // Finalization
    isFinalized: {
      type: Boolean,
      default: false,
    },
    finalizedAt: Date,
    finalizedBy: {
      type: String,
    },
    
    // Additional
    remarks: String,
  },
  { timestamps: true }
);

// Pre-save middleware to calculate totals and percentages
MarkSchema.pre("save", function (next) {
  let totalMarks = 0;
  let totalMaxMarks = 0;
  
  this.subjects.forEach(subject => {
    // Calculate total score for each subject (Theory + Practical + CE)
    subject.totalScore = (subject.theoryScore || 0) + (subject.practicalScore || 0) + (subject.ceScore || 0);
    
    // Calculate percentage for each subject
    if (subject.maxMarks > 0) {
      subject.percentage = (subject.totalScore / subject.maxMarks) * 100;
      
      // Calculate grade for each subject
      subject.grade = calculateGradeFromPercentage(subject.percentage);
    }
    
    totalMarks += subject.totalScore;
    totalMaxMarks += subject.maxMarks;
  });
  
  this.totalMarks = totalMarks;
  this.totalMaxMarks = totalMaxMarks;
  
  if (totalMaxMarks > 0) {
    this.percentage = (totalMarks / totalMaxMarks) * 100;
    
    // Calculate overall grade
    this.grade = calculateGradeFromPercentage(this.percentage);
  }
  
  next();
});

// Indexes
MarkSchema.index({ studentId: 1, examId: 1, classId: 1 }, { unique: true });
MarkSchema.index({ examId: 1, classId: 1 });
MarkSchema.index({ examId: 1, classId: 1, status: 1 });
MarkSchema.index({ academicYearId: 1 });
MarkSchema.index({ status: 1 });
MarkSchema.index({ percentage: -1 });

module.exports = mongoose.models.Mark || mongoose.model("Mark", MarkSchema);