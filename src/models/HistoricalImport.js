// src/models/HistoricalImport.js
// Standalone model — completely isolated from the main student/marks system
const mongoose = require('mongoose');

// ── Subject score sub-schema ──────────────────────────────────────────
const SubjectScoreSchema = new mongoose.Schema(
  {
    subjectCode: { type: String, required: true }, // e.g. 'LAN', 'ENG', 'MATHS'
    subjectLabel: { type: String, required: true }, // display label
    obtained: { type: Number, default: 0 },
    maxMarks: { type: Number, default: 50 },
  },
  { _id: false }
);

// ── Single student record ─────────────────────────────────────────────
const HistoricalStudentSchema = new mongoose.Schema(
  {
    importId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HistoricalImport',
      required: true,
      index: true,
    },

    // Raw XLS cell values
    slNo: { type: Number },
    classCode: { type: String },       // e.g. '8 K 2025-2026'
    admissionNo: { type: String },
    aadhaarNo: { type: String },

    // Student info
    name: { type: String, required: true },
    gender: { type: String, enum: ['F', 'M', ''] },
    language: { type: String },        // Arabic / Malayalam / Urdu etc.
    category: { type: String },        // OBC / SC / ST / General

    // Class metadata (parsed from section header row in XLS)
    grade: { type: String },           // e.g. '8', '9', '10'
    division: { type: String },        // e.g. 'M', 'N', 'K', 'Z', 'AA'
    medium: { type: String },          // ENG MEDIUM / ARABIC etc.
    languageGroup: { type: String },   // ARABIC GIRLS & BOYS etc.
    sheetName: { type: String },       // Original XLS tab name

    // Marks
    subjects: [SubjectScoreSchema],
    total: { type: Number, default: 0 },
    maxTotal: { type: Number, default: 0 },
    divisionResult: { type: String },  // A / B / M / N / Z etc. (DIVISION column)
  },
  { timestamps: true }
);

HistoricalStudentSchema.index({ importId: 1, grade: 1, division: 1 });
HistoricalStudentSchema.index({ importId: 1, sheetName: 1 });

// ── Batch (one per uploaded XLS file) ────────────────────────────────
const HistoricalImportSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    academicYear: { type: String, required: true },   // e.g. '2025-2026'
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    uploadedByName: { type: String },

    // Summary stats written after import
    totalStudents: { type: Number, default: 0 },
    sheets: [{ name: String, studentCount: Number }],

    // Subject column config (set by admin on upload)
    subjectConfig: [
      {
        code: { type: String },         // e.g. 'LAN'
        label: { type: String },        // e.g. 'Language'
        maxMarks: { type: Number, default: 50 },
      },
    ],

    status: {
      type: String,
      enum: ['processing', 'done', 'error'],
      default: 'processing',
    },
    errorMessage: { type: String },

    notes: { type: String },
  },
  { timestamps: true }
);

const HistoricalImport = mongoose.model('HistoricalImport', HistoricalImportSchema);
const HistoricalStudent = mongoose.model('HistoricalStudent', HistoricalStudentSchema);

module.exports = { HistoricalImport, HistoricalStudent };
