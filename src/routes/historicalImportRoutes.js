// src/routes/historicalImportRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/historicalImportController');

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

// All routes — admin only
router.use(protect, authorize('admin'));

// Get preset subject configurations (class 8/9, class 10 SSLC)
router.get('/presets', ctrl.getPresetConfigs);

// Individual student PDF (must be before /:id to avoid conflict)
router.get('/student/:studentId/pdf', ctrl.generateStudentPDF);

// Upload XLS file (all sheets imported in one batch)
router.post('/upload', upload.single('file'), ctrl.uploadXLS);

// List all import batches
router.get('/', ctrl.getImports);

// Poll upload processing status
router.get('/:id/status', ctrl.getImportStatus);

// Get import detail + available grade/division groups
router.get('/:id', ctrl.getImportById);

// Query students within a batch (paginated + filterable)
router.get('/:id/students', ctrl.getStudents);

// Generate & download PDF marklist
router.get('/:id/pdf', ctrl.generateMarklistPDF);

// Delete a batch and all its students
router.delete('/:id', ctrl.deleteImport);

module.exports = router;
