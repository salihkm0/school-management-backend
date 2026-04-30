const mongoose = require('mongoose');

const AcademicYearSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  year: {
    type: String,
    required: true,
    unique: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isCurrent: {
    type: Boolean,
    default: false
  },
  terms: [{
    name: {
      type: String,
      required: true
    },
    startDate: Date,
    endDate: Date,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  settings: {
    maxStudentsPerClass: {
      type: Number,
      default: 50
    },
    workingDays: {
      type: [String],
      default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    },
    gradingSystem: {
      type: String,
      enum: ['GRADE', 'PERCENTAGE', 'CGPA'],
      default: 'GRADE'
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Ensure only one current academic year
AcademicYearSchema.pre('save', async function(next) {
  if (this.isCurrent) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id } },
      { isCurrent: false }
    );
  }
  next();
});

AcademicYearSchema.index({ isActive: 1 });
AcademicYearSchema.index({ isCurrent: 1 });

// Check if model already exists before creating
module.exports = mongoose.models.AcademicYear || mongoose.model('AcademicYear', AcademicYearSchema);