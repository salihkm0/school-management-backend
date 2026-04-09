const mongoose = require('mongoose');

const ClassSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  section: {
    type: String,
    default: null
  },
  classTeacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff'
  },
  classTeacherName: {
    type: String
  },
  subjects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  }],
  capacity: {
    type: Number,
    default: 50
  },
  studentCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  academicYear: {
    type: String,
    required: true,
    default: () => new Date().getFullYear().toString()
  },
  timetable: [{
    day: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    },
    periods: [{
      subjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subject'
      },
      teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff'
      },
      startTime: String,
      endTime: String,
      room: String
    }]
  }]
}, {
  timestamps: true
});

ClassSchema.index({ name: 1, section: 1, academicYear: 1 }, { unique: true });

module.exports = mongoose.model('Class', ClassSchema);