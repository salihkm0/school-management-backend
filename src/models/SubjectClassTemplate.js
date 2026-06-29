// models/SubjectClassTemplate.js
const mongoose = require('mongoose');

const SubjectClassTemplateSchema = new mongoose.Schema({
  className: {
    type: String,
    required: true,
    trim: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true
  },
  subjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  }],
  // Optional: Different subject sets for different sections
  sectionSpecific: {
    type: Boolean,
    default: false
  },
  sectionSubjects: {
    type: Map,
    of: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject'
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Unique index for className + academicYearId
SubjectClassTemplateSchema.index({ className: 1, academicYearId: 1 }, { unique: true });

// Check if model already exists
module.exports = mongoose.models.SubjectClassTemplate || mongoose.model('SubjectClassTemplate', SubjectClassTemplateSchema);