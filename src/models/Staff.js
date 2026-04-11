// const mongoose = require('mongoose');

// const SubjectAssignmentSchema = new mongoose.Schema({
//   subjectId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Subject',
//     required: true
//   },
//   subjectName: {
//     type: String,
//     required: true
//   },
//   classId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Class',
//     required: true
//   },
//   className: {
//     type: String,
//     required: true
//   }
// }, { _id: false });

// const StaffSchema = new mongoose.Schema({
//   userId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true,
//     unique: true
//   },
//   name: {
//     type: String,
//     required: true
//   },
//   photoUrl: {
//     type: String,
//     default: null
//   },
//   role: {
//     type: String,
//     required: true,
//     enum: ['teacher', 'principal', 'vice_principal', 'librarian', 'administrator']
//   },
//   qualification: {
//     type: String,
//     required: true
//   },
//   contact: {
//     type: String,
//     required: true
//   },
//   subjectExpertise: [{
//     type: String
//   }],
//   dateOfJoining: {
//     type: Date,
//     required: true
//   },
//   assignedSubjects: [SubjectAssignmentSchema],
//   assignedClassId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Class'
//   },
//   isActive: {
//     type: Boolean,
//     default: true
//   },
//   salary: {
//     type: Number,
//     default: 0
//   },
//   emergencyContact: {
//     name: String,
//     phone: String,
//     relation: String
//   },
//   bankDetails: {
//     accountNumber: String,
//     bankName: String,
//     ifscCode: String
//   }
// }, {
//   timestamps: true
// });

// StaffSchema.index({ name: 'text' });
// StaffSchema.index({ role: 1 });

// module.exports = mongoose.model('Staff', StaffSchema);


const mongoose = require('mongoose');

const SubjectAssignmentSchema = new mongoose.Schema({
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  subjectName: {
    type: String,
    required: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: false  // Make optional
  },
  className: {
    type: String,
    required: false  // Make optional
  }
}, { _id: false });

const StaffSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  photoUrl: {
    type: String,
    default: null
  },
  role: {
    type: String,
    required: true,
    enum: ['teacher', 'principal', 'vice_principal', 'librarian', 'administrator']
  },
  qualification: {
    type: String,
    required: true
  },
  contact: {
    type: String,
    required: true
  },
  subjectExpertise: [{
    type: String
  }],
  dateOfJoining: {
    type: Date,
    required: true
  },
  assignedSubjects: [SubjectAssignmentSchema],
  assignedClassId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  salary: {
    type: Number,
    default: 0
  },
  emergencyContact: {
    name: String,
    phone: String,
    relation: String
  },
  bankDetails: {
    accountNumber: String,
    bankName: String,
    ifscCode: String
  }
}, {
  timestamps: true
});

StaffSchema.index({ name: 'text' });
StaffSchema.index({ role: 1 });

module.exports = mongoose.model('Staff', StaffSchema);