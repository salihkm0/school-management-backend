// src/routes/historicalImportRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/historicalImportController');
const pdfCtrl = require('../controllers/pdf/historicalMarklistController');

// Store file in memory (no disk write needed — we parse immediately)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ];
    const ext = file.originalname.toLowerCase();
    if (allowed.includes(file.mimetype) || ext.endsWith('.xls') || ext.endsWith('.xlsx')) {
      cb(null, true);
    } else {
      cb(new Error('Only .xls and .xlsx files are allowed'));
    }
  },
});

// Protect all routes
router.use(protect);

// Get preset subject configurations (class 8/9, class 10 SSLC)
router.get('/presets', authorize('admin', 'open'), ctrl.getPresetConfigs);

// ── PDF Routes (served by the isolated PDF controller) ──────────────────────

// Individual student PDF (must be before /:id to avoid conflict)
router.get('/student/:studentId/pdf', authorize('admin', 'open'), pdfCtrl.generateStudentPDF);

// ── Data Routes ──────────────────────────────────────────────────────────────

// Hierarchical API
router.get('/hierarchical/years', authorize('admin', 'open'), ctrl.getHierarchicalYears);
router.get('/hierarchical/standards', authorize('admin', 'open'), ctrl.getHierarchicalStandards);
router.get('/hierarchical/mediums', authorize('admin', 'open'), ctrl.getHierarchicalMediums);
router.get('/hierarchical/classes', authorize('admin', 'open'), ctrl.getHierarchicalClasses);
router.get('/hierarchical/students', authorize('admin', 'open'), ctrl.getHierarchicalStudents);

// Generate from DB
router.post('/generate-from-db', authorize('admin'), ctrl.generateFromDB);
// Upload XLS file (all sheets imported in one batch)
router.post('/upload', authorize('admin'), upload.single('file'), ctrl.uploadXLS);

// List all import batches
router.get('/', authorize('admin', 'open'), ctrl.getImports);

// Poll upload processing status
router.get('/:id/status', authorize('admin', 'open'), ctrl.getImportStatus);

// Get import detail + available grade/division groups
router.get('/:id', authorize('admin', 'open'), ctrl.getImportById);

// Query students within a batch (paginated + filterable)
router.get('/:id/students', authorize('admin', 'open'), ctrl.getStudents);

// Generate & download PDF marklist (batch) — isolated PDF controller
router.get('/:id/pdf', authorize('admin', 'open'), pdfCtrl.generateMarklistPDF);

// Delete a batch and all its students
router.delete('/:id', authorize('admin'), ctrl.deleteImport);

module.exports = router;
