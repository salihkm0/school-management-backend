// models/Parent.js
const mongoose = require('mongoose');
const Student = require('./Student');  // ← ADD THIS LINE - Student model is needed!

const StudentConnectionSchema = new mongoose.Schema({
  studentCode: {
    type: String,
    required: true,
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  relation: {
    type: String,
    enum: ['father', 'mother', 'guardian'],
    default: 'father'
  },
  // Denormalized fields for quick display (cached from current student)
  studentFullName: {
    type: String
  },
  className: {
    type: String
  },
  // Track when this connection was first established
  connectedSince: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const ParentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Personal Information
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  alternatePhone: {
    type: String,
    trim: true
  },
  
  // Address
  address: {
    street: String,
    city: String,
    district: String,
    state: String,
    pincode: String
  },
  
  // Occupation
  occupation: String,
  
  // Children/Students connections (only matching criteria)
  students: [StudentConnectionSchema],
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Metadata
  registeredAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: Date,
  
  // Profile completion
  profileCompleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for getting current connected students
ParentSchema.virtual('connectedStudents', {
  ref: 'Student',
  localField: 'students.studentCode',
  foreignField: 'studentCode',
  justOne: false
});

// Method to get current student details
ParentSchema.methods.getCurrentStudentDetails = async function(academicYearId = null) {
  const Student = mongoose.model('Student');  // ← Also add this line to get the model inside the method
  
  const studentCodes = this.students.map(s => s.studentCode);
  
  const query = { studentCode: { $in: studentCodes } };
  if (academicYearId) {
    query.academicYearId = academicYearId;
  }
  
  const students = await Student.find(query)
    .select('studentCode fullName className division classId')
    .populate('classId', 'name section')
    .sort({ academicYearId: -1 }); // Most recent first
  
  // Map to unique student codes (latest academic year)
  const studentMap = new Map();
  students.forEach(s => {
    if (!studentMap.has(s.studentCode)) {
      const connection = this.students.find(c => c.studentCode === s.studentCode);
      studentMap.set(s.studentCode, {
        _id: s._id,
        studentCode: s.studentCode,
        fullName: s.fullName,
        className: `${s.className || ''} ${s.division || ''}`.trim(),
        classId: s.classId,
        relation: connection?.relation || 'guardian',
        connectedSince: connection?.connectedSince
      });
    }
  });
  
  return Array.from(studentMap.values());
};

// Method to check if parent has connection to a student
ParentSchema.methods.hasConnection = function(studentCode) {
  return this.students.some(s => s.studentCode === studentCode);
};

// Method to add student connection
ParentSchema.methods.addStudentConnection = async function(studentCode, dateOfBirth, relation) {
  if (this.hasConnection(studentCode)) {
    throw new Error('Student already connected');
  }
  
  this.students.push({
    studentCode,
    dateOfBirth: new Date(dateOfBirth),
    relation: relation || 'father',
    connectedSince: new Date()
  });
  
  await this.save();
  return this;
};

// Method to remove student connection
ParentSchema.methods.removeStudentConnection = function(studentCode) {
  this.students = this.students.filter(s => s.studentCode !== studentCode);
  return this.save();
};

// Static method to find parent by student code
ParentSchema.statics.findByStudentCode = function(studentCode) {
  return this.find({ 'students.studentCode': studentCode });
};

// Static method to update cached student details after import
ParentSchema.statics.updateCachedStudentDetails = async function(academicYearId = null) {
  const Student = mongoose.model('Student');  // ← Also add this line
  
  const parents = await this.find({ 'students.0': { $exists: true } });
  
  let updatedCount = 0;
  
  for (const parent of parents) {
    const currentStudents = await parent.getCurrentStudentDetails(academicYearId);
    
    let needsUpdate = false;
    for (const student of currentStudents) {
      const connection = parent.students.find(s => s.studentCode === student.studentCode);
      if (connection) {
        if (connection.studentFullName !== student.fullName || 
            connection.className !== student.className) {
          connection.studentFullName = student.fullName;
          connection.className = student.className;
          needsUpdate = true;
        }
      }
    }
    
    if (needsUpdate) {
      await parent.save();
      updatedCount++;
    }
  }
  
  return updatedCount;
};

// Indexes
ParentSchema.index({ userId: 1 });
ParentSchema.index({ 'students.studentCode': 1 });
ParentSchema.index({ phone: 1 });
ParentSchema.index({ email: 1 });

// Check if model already exists before creating
module.exports = mongoose.models.Parent || mongoose.model('Parent', ParentSchema);