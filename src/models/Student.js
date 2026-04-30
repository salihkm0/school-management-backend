// models/Student.js
const mongoose = require("mongoose");

const StudentSchema = new mongoose.Schema(
  {
    // Basic Information
    studentCode: {
      type: String,
      required: [true, "Student code is required"],
      trim: true,
    },
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    gender: {
      type: String,
      enum: ["M", "F", "Other"],
    },
    dateOfBirth: {
      type: Date,
    },
    birthPlace: {
      type: String,
      trim: true,
    },
    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", ""],
    },
    nationality: {
      type: String,
      default: "Indian",
    },
    religion: {
      type: String,
      trim: true,
    },
    casteName: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ["General", "OBC", "SC", "ST", ""],
    },

    // Identification
    identificationMark1: {
      type: String,
      trim: true,
    },
    identificationMark2: {
      type: String,
      trim: true,
    },
    eid: {
      type: String,
      trim: true,
    },
    reasonForNoUid: {
      type: String,
      trim: true,
    },

    // Address Information
    houseName: {
      type: String,
      trim: true,
    },
    streetName: {
      type: String,
      trim: true,
    },
    postOffice: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
    localBody: {
      type: String,
      trim: true,
    },
    municipality: {
      type: String,
      trim: true,
    },
    gramaPanchayath: {
      type: String,
      trim: true,
    },
    districtPanchayath: {
      type: String,
      trim: true,
    },
    corporation: {
      type: String,
      trim: true,
    },
    taluk: {
      type: String,
      trim: true,
    },
    blockPanchayath: {
      type: String,
      trim: true,
    },
    revenueDistrict: {
      type: String,
      trim: true,
    },

    // Contact Information
    phoneNumber: {
      type: String,
      trim: true,
    },

    // Academic Information
    admissionNo: {
      type: String,
      required: [true, "Admission number is required"],
      trim: true,
    },
    admissionDate: {
      type: Date,
    },
    classOnAdmission: {
      type: String,
      trim: true,
    },
    instructionMedium: {
      type: String,
      trim: true,
    },

    // Language Subjects (stored as ObjectIds)
    firstLanguagePaper1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
    },
    firstLanguagePaper2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
    },
    thirdLanguage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
    },
    additionalLanguage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
    },

    // Class and Academic Year Reference
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
    },
    className: {
      type: String,
      trim: true,
    },
    division: {
      type: String,
      trim: true,
    },
    rollNumber: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "discontinued", "transferred", "completed"],
      default: "active",
    },

    // Parent/Guardian Information (from Samboorna)
    fatherFullName: {
      type: String,
      trim: true,
    },
    motherFullName: {
      type: String,
      trim: true,
    },
    guardian: {
      type: String,
      trim: true,
    },
    relationOfGuardian: {
      type: String,
      trim: true,
    },
    occupationOfGuardian: {
      type: String,
      trim: true,
    },
    
    // Connected Parent IDs (references to Parent model)
    parentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Parent",
      },
    ],

    // Financial Information
    annualIncome: {
      type: Number,
    },
    apl: {
      type: Boolean,
      default: false,
    },

    // Bank Information
    bankName: {
      type: String,
      trim: true,
    },
    branchName: {
      type: String,
      trim: true,
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true,
    },
    accountNumber: {
      type: String,
      trim: true,
    },

    // Hostel Information
    hostelites: {
      type: String,
      enum: ["Y", "N", ""],
    },

    // Vaccination
    dateOfVaccination: {
      type: Date,
    },

    // Import tracking
    importBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportBatch",
    },
    samboornaId: {
      type: String,
      trim: true,
    },

    // Photo
    photoUrl: {
      type: String,
    },

    // Metadata
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ==================== VIRTUALS ====================

// Virtual for display name (full name with class)
StudentSchema.virtual("displayName").get(function () {
  const classInfo = this.className && this.division 
    ? `${this.className}-${this.division}` 
    : this.className || "";
  return classInfo ? `${this.fullName} (${classInfo})` : this.fullName;
});

// Virtual for age
StudentSchema.virtual("age").get(function () {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

// Virtual for connected parents (populated from Parent model)
StudentSchema.virtual("parents", {
  ref: "Parent",
  localField: "studentCode",
  foreignField: "students.studentCode",
  justOne: false,
});

// Virtual for current class details
StudentSchema.virtual("currentClass", {
  ref: "Class",
  localField: "classId",
  foreignField: "_id",
  justOne: true,
});

// ==================== METHODS ====================

// Method to get parents for this student
StudentSchema.methods.getParents = async function () {
  const Parent = mongoose.model("Parent");
  return await Parent.find({ "students.studentCode": this.studentCode });
};

// Method to get connected parent details with relation
StudentSchema.methods.getConnectedParents = async function () {
  const Parent = mongoose.model("Parent");
  const parents = await Parent.find({ "students.studentCode": this.studentCode })
    .select("fullName phone email relation");
  
  return parents.map(parent => {
    const connection = parent.students.find(s => s.studentCode === this.studentCode);
    return {
      parentId: parent._id,
      parentName: parent.fullName,
      phone: parent.phone,
      email: parent.email,
      relation: connection?.relation || "guardian",
      connectedSince: connection?.connectedSince
    };
  });
};

// Method to check if student has any connected parent
StudentSchema.methods.hasParents = async function () {
  const Parent = mongoose.model("Parent");
  const count = await Parent.countDocuments({ "students.studentCode": this.studentCode });
  return count > 0;
};

// Method to get guardian contact info (from Samboorna or connected parents)
StudentSchema.methods.getGuardianContact = async function () {
  // First check Samboorna guardian info
  if (this.guardian && this.phoneNumber) {
    return {
      name: this.guardian,
      relation: this.relationOfGuardian || "Guardian",
      phone: this.phoneNumber,
      source: "samboorna"
    };
  }
  
  // Check father info
  if (this.fatherFullName && this.phoneNumber) {
    return {
      name: this.fatherFullName,
      relation: "Father",
      phone: this.phoneNumber,
      source: "samboorna"
    };
  }
  
  // Check connected parents
  const parents = await this.getConnectedParents();
  if (parents.length > 0) {
    const primaryParent = parents[0];
    return {
      name: primaryParent.parentName,
      relation: primaryParent.relation,
      phone: primaryParent.phone,
      source: "connected"
    };
  }
  
  return null;
};

// Method to add parent connection
StudentSchema.methods.addParent = async function (parentId, relation = "guardian") {
  if (!this.parentIds) {
    this.parentIds = [];
  }
  
  if (!this.parentIds.includes(parentId)) {
    this.parentIds.push(parentId);
    await this.save();
  }
  
  // Also update Parent model
  const Parent = mongoose.model("Parent");
  const parent = await Parent.findById(parentId);
  if (parent && !parent.hasConnection(this.studentCode)) {
    await parent.addStudentConnection(this.studentCode, this.dateOfBirth, relation);
  }
  
  return this;
};

// Method to remove parent connection
StudentSchema.methods.removeParent = async function (parentId) {
  if (this.parentIds) {
    this.parentIds = this.parentIds.filter(id => id.toString() !== parentId.toString());
    await this.save();
  }
  return this;
};

// Method to get academic history (all records across years)
StudentSchema.methods.getAcademicHistory = async function () {
  const Student = mongoose.model("Student");
  return await Student.find({ studentCode: this.studentCode })
    .populate("academicYearId", "year name")
    .populate("classId", "name section")
    .sort({ "academicYearId.year": -1 });
};

// Method to get marks summary for current year
StudentSchema.methods.getMarksSummary = async function () {
  const Mark = mongoose.model("Mark");
  const Exam = mongoose.model("Exam");
  
  const exams = await Exam.find({
    classIds: this.classId,
    academicYearId: this.academicYearId,
    resultsPublished: true
  }).select("name examType term");
  
  const marks = await Mark.find({
    studentId: this._id,
    examId: { $in: exams.map(e => e._id) }
  }).populate("subjectId", "name code");
  
  const summary = exams.map(exam => {
    const examMarks = marks.filter(m => m.examId.toString() === exam._id.toString());
    const totalObtained = examMarks.reduce((sum, m) => sum + (m.totalScore || 0), 0);
    const totalMax = examMarks.reduce((sum, m) => sum + (m.totalMaxMarks || 0), 0);
    
    return {
      examId: exam._id,
      examName: exam.name,
      examType: exam.examType,
      term: exam.term,
      totalMarks: totalObtained,
      totalMaxMarks: totalMax,
      percentage: totalMax > 0 ? (totalObtained / totalMax) * 100 : 0,
      subjects: examMarks.length
    };
  });
  
  return summary;
};

// Method to get attendance summary for current year
StudentSchema.methods.getAttendanceSummary = async function () {
  const Attendance = mongoose.model("Attendance");
  
  const records = await Attendance.find({
    studentId: this._id,
    academicYearId: this.academicYearId
  });
  
  const totalDays = records.length;
  const presentDays = records.filter(r => r.status === "present").length;
  const absentDays = records.filter(r => r.status === "absent").length;
  const leaveDays = records.filter(r => r.status === "leave").length;
  
  return {
    totalDays,
    presentDays,
    absentDays,
    leaveDays,
    attendancePercentage: totalDays > 0 ? (presentDays / totalDays) * 100 : 0
  };
};

// ==================== STATICS ====================

// Static method to find students by parent
StudentSchema.statics.findByParent = function (parentId) {
  return this.find({ parentIds: parentId });
};

// Static method to find students with no connected parents
StudentSchema.statics.findWithNoParents = async function (academicYearId) {
  const Parent = mongoose.model("Parent");
  const allParentStudentCodes = await Parent.distinct("students.studentCode");
  
  return this.find({
    academicYearId,
    studentCode: { $nin: allParentStudentCodes },
    status: "active"
  });
};

// Static method to get student count by class
StudentSchema.statics.getCountByClass = async function (academicYearId) {
  return this.aggregate([
    { $match: { academicYearId: mongoose.Types.ObjectId(academicYearId), status: "active" } },
    { $group: { _id: "$classId", count: { $sum: 1 } } },
    { $lookup: { from: "classes", localField: "_id", foreignField: "_id", as: "class" } },
    { $unwind: "$class" },
    { $project: { className: { $concat: ["$class.name", "-", "$class.section"] }, count: 1 } },
    { $sort: { "class.name": 1, "class.section": 1 } }
  ]);
};

// Static method to get student count by category
StudentSchema.statics.getCountByCategory = async function (academicYearId) {
  return this.aggregate([
    { $match: { academicYearId: mongoose.Types.ObjectId(academicYearId), status: "active" } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
};

// Static method to get student count by gender
StudentSchema.statics.getCountByGender = async function (academicYearId) {
  return this.aggregate([
    { $match: { academicYearId: mongoose.Types.ObjectId(academicYearId), status: "active" } },
    { $group: { _id: "$gender", count: { $sum: 1 } } }
  ]);
};

// ==================== MIDDLEWARE ====================

// Pre-save middleware to sync parentIds with Parent model
StudentSchema.pre("save", async function (next) {
  // If this is a new student or parentIds changed, we don't auto-sync
  // Syncing is handled by the Parent.connectStudent method
  next();
});

// Pre-findOneAndUpdate to handle parent connections
StudentSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate();
  
  // If parentIds are being updated, we might want to sync with Parent model
  if (update.parentIds || update.$addToSet?.parentIds || update.$pull?.parentIds) {
    // This is handled by the controller methods
  }
  
  next();
});

// ==================== INDEXES ====================

// Compound unique index for student code per academic year
StudentSchema.index({ studentCode: 1, academicYearId: 1 }, { unique: true });
StudentSchema.index({ admissionNo: 1, academicYearId: 1 });
StudentSchema.index({ classId: 1 });
StudentSchema.index({ academicYearId: 1 });
StudentSchema.index({ fullName: "text" });
StudentSchema.index({ phoneNumber: 1 });
StudentSchema.index({ status: 1 });
StudentSchema.index({ dateOfBirth: 1 });
StudentSchema.index({ parentIds: 1 });
StudentSchema.index({ studentCode: 1, dateOfBirth: 1 });

// Check if model already exists before creating
module.exports =
  mongoose.models.Student || mongoose.model("Student", StudentSchema);