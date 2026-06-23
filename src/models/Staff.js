const mongoose = require('mongoose');

const StaffSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  staffCode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  shortName: {
    type: String,
    trim: true,
    maxlength: 10,
    default: null
  },
  name: {
    type: String,
    required: true
  },
  photoUrl: {
    type: String,
    default: null
  },
  gender: {
    type: String,
    enum: ['M', 'F', 'Other']
  },
  dateOfBirth: {
    type: Date
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', '']
  },
  role: {
    type: String,
    required: true,
    enum: ['teacher', 'principal', 'vice_principal', 'headmaster', 'dep.headmaster', 'librarian', 'administrator', 'office_staff', 'support_staff']
  },
  employeeType: {
    type: String,
    enum: ['Permanent', 'Contract', 'Temporary', 'Part-time', 'Guest'],
    default: 'Permanent'
  },
  qualification: {
    type: String,
    required: true
  },
  specialization: [{
    type: String
  }],
  subjectExpertise: [{
    type: String
  }],
  contact: {
    type: String,
    required: true
  },
  email: {
    type: String,
    sparse: true
  },
  address: {
    street: String,
    city: String,
    district: String,
    state: String,
    pincode: String
  },
  dateOfJoining: {
    type: Date,
    required: true
  },
  emergencyContact: {
    name: String,
    phone: String,
    relation: String
  },
  bankDetails: {
    accountNumber: String,
    accountHolderName: String,
    bankName: String,
    branchName: String,
    ifscCode: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  documents: [{
    name: String,
    url: String,
    uploadedAt: Date
  }],
  previousExperience: {
    years: { type: Number, default: 0 },
    details: String
  },
  remarks: {
    type: String
  }
}, {
  timestamps: true
});

// Auto-generate staff code only (not shortName)
StaffSchema.pre('save', async function(next) {
  if (!this.staffCode) {
    const year = new Date().getFullYear().toString().slice(-2);
    const count = await this.constructor.countDocuments();
    this.staffCode = `STF${year}${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Indexes
StaffSchema.index({ name: 'text' });
StaffSchema.index({ role: 1 });
StaffSchema.index({ staffCode: 1 }, { unique: true, sparse: true });
StaffSchema.index({ shortName: 1 });
StaffSchema.index({ isActive: 1 });
StaffSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.models.Staff || mongoose.model('Staff', StaffSchema);