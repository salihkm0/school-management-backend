const mongoose = require('mongoose');

const SystemLogSchema = new mongoose.Schema({
  level: {
    type: String,
    required: true,
    enum: ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']
  },
  message: {
    type: String,
    required: true
  },
  meta: {
    type: mongoose.Schema.Types.Mixed
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Index by timestamp for efficient descending sorts and TTL if needed
SystemLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('SystemLog', SystemLogSchema);
