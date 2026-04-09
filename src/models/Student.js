const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  admissionNumber: {
    type: String,
    required: [true, 'Admission number is required'],
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Student name is required'],
    trim: true
  },
  photoUrl: {
    type: String,
    default: null
  },
  fatherName: {
    type: String,
    trim: true
  },
  motherName: {
    type: String,
    trim: true
  },
  guardianPhone: {
    type: String,
    trim: true
  },
  guardianEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date,
    required: true
  },
  dateOfAdmission: {
    type: Date,
    default: Date.now
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  section: {
    type: String,
    trim: true
  },
  rollNumber: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'passed', 'failed', 'discontinued', 'transferred', 'completed'],
    default: 'active'
  },
  parentIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  additionalInfo: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

StudentSchema.index({ classId: 1, status: 1 });
StudentSchema.index({ admissionNumber: 1 });
StudentSchema.index({ name: 'text' });

module.exports = mongoose.model('Student', StudentSchema);