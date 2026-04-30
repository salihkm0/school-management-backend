const mongoose = require('mongoose');

const StaffDutyStatsSchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true,
    unique: true
  },
  staffName: {
    type: String,
    required: true
  },
  monthlyStats: {
    type: Map,
    of: {
      totalDuties: { type: Number, default: 0 },
      totalHours: { type: Number, default: 0 },
      byType: {
        type: Map,
        of: Number
      }
    },
    default: {}
  },
  yearlyStats: {
    type: Map,
    of: {
      totalDuties: { type: Number, default: 0 },
      totalHours: { type: Number, default: 0 },
      byType: {
        type: Map,
        of: Number
      }
    },
    default: {}
  },
  overallStats: {
    totalDuties: { type: Number, default: 0 },
    totalHours: { type: Number, default: 0 },
    byType: {
      type: Map,
      of: Number
    },
    lastUpdated: { type: Date, default: Date.now }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('StaffDutyStats', StaffDutyStatsSchema);