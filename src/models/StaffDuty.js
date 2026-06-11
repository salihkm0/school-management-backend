const mongoose = require('mongoose');

const DutyRecordSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  shift: {
    type: String,
    enum: ['morning', 'afternoon', 'full', 'custom'],
    default: 'full'
  },
  startTime: String,
  endTime: String,
  duration: {
    type: Number,
    default: 8
  },
  room: String
}, { _id: false });

const StaffDutySchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true
  },
  staffName: {
    type: String,
    required: true
  },
  dutyType: {
    type: String,
    enum: ['exam', 'invigilation', 'supervision', 'hall_monitor', 'security', 'sports', 'arts', 'workshop', 'event', 'meeting', 'training', 'other'],
    required: true
  },
  duties: [DutyRecordSchema],
  totalDuties: {
    type: Number,
    default: 0
  },
  totalHours: {
    type: Number,
    default: 0
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['assigned', 'confirmed', 'completed', 'cancelled'],
    default: 'assigned'
  },
  location: String,
  remarks: String,
  department: String
}, {
  timestamps: true
});

// Pre-save middleware to calculate totals
StaffDutySchema.pre('save', function(next) {
  this.totalDuties = this.duties.length;
  this.totalHours = this.duties.reduce((sum, duty) => sum + (duty.duration || 0), 0);
  next();
});

// Indexes
StaffDutySchema.index({ staffId: 1, dutyType: 1 });
StaffDutySchema.index({ 'duties.date': 1 });
StaffDutySchema.index({ assignedAt: -1 });

module.exports = mongoose.model('StaffDuty', StaffDutySchema);