const mongoose = require('mongoose');

const appUpdateHistorySchema = new mongoose.Schema({
  platform: { type: String, required: true, enum: ['android', 'ios'] },
  version: { type: String, required: true },
  updateType: { type: String, required: true, enum: ['force', 'soft'] },
  storeUrl: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AppUpdateHistory', appUpdateHistorySchema);
