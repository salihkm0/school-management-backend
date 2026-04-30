const mongoose = require('mongoose');

const ImportBatchSchema = new mongoose.Schema({
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileHash: {
    type: String,
    unique: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL'],
    default: 'PENDING'
  },
  statistics: {
    totalRows: { type: Number, default: 0 },
    processedRows: { type: Number, default: 0 },
    successfulInserts: { type: Number, default: 0 },
    updatedRecords: { type: Number, default: 0 },
    failedRecords: { type: Number, default: 0 },
    skippedRecords: { type: Number, default: 0 },
    classesCreated: { type: Number, default: 0 },
    academicYearsCreated: { type: Number, default: 0 }
  },
  errors: [{
    row: Number,
    studentCode: String,
    error: String,
    severity: {
      type: String,
      enum: ['ERROR', 'WARNING']
    }
  }],
  warnings: [{
    row: Number,
    studentCode: String,
    message: String
  }],
  importedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  completedAt: Date
}, {
  timestamps: true
});

ImportBatchSchema.index({ academicYearId: 1, createdAt: -1 });
ImportBatchSchema.index({ status: 1 });

// Check if model already exists before creating
module.exports = mongoose.models.ImportBatch || mongoose.model('ImportBatch', ImportBatchSchema);