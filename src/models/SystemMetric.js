const mongoose = require('mongoose');

const systemMetricSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    expires: '90d' // Automatically delete metrics older than 90 days
  },
  cpuLoad: {
    type: Number,
    required: true,
    description: '1-minute CPU load average'
  },
  memoryUsed: {
    type: Number,
    required: true,
    description: 'Node.js heap used in bytes'
  },
  totalMemory: {
    type: Number,
    required: true,
    description: 'Node.js heap total in bytes'
  },
  activeConnections: {
    type: Number,
    default: 0,
    description: 'Number of active Socket.IO connections (if available)'
  }
});

// Index to optimize querying by time range
systemMetricSchema.index({ timestamp: -1 });

module.exports = mongoose.model('SystemMetric', systemMetricSchema);
