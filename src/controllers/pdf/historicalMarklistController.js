// src/controllers/pdf/historicalMarklistController.js
// Separate PDF controller for historical import mark lists.
// Handles both batch (class/division) and individual student PDFs.

const {
  HistoricalImport,
  HistoricalStudent,
} = require('../../models/HistoricalImport');
const {
  generateHistoricalMarklistPdf,
} = require('../../services/pdf/historicalMarklistPdfService');
const { pdfQueue } = require('../../services/queue/jobQueue');

// ─────────────────────────────────────────────────────────────────────────────
// BATCH PDF — GET /api/historical-imports/:id/pdf
// Optional query params: grade, division, sheetName
// Returns a valid multi-page PDF (one page per student)
// ─────────────────────────────────────────────────────────────────────────────
exports.generateMarklistPDF = async (req, res) => {
  try {
    const { grade, division, sheetName } = req.query;

    const filter = { importId: req.params.id };
    if (grade)     filter.grade     = grade;
    if (division)  filter.division  = division;
    if (sheetName) filter.sheetName = sheetName;

    const [batch, students] = await Promise.all([
      HistoricalImport.findById(req.params.id),
      HistoricalStudent.find(filter).sort({
        sheetName: 1,
        grade: 1,
        division: 1,
        slNo: 1,
      }),
    ]);

    if (!batch) {
      return res.status(404).json({ message: 'Import batch not found' });
    }
    if (students.length === 0) {
      return res
        .status(404)
        .json({ message: 'No students found for the given filters' });
    }

    const job = await pdfQueue.add('historical-marklist-batch', {
      type: 'historical-marklist-batch',
      payload: {
        importId: req.params.id,
        grade,
        division,
        sheetName
      }
    });

    return res.status(202).json({ 
      message: 'PDF generation started in background', 
      jobId: job.id 
    });
  } catch (err) {
    console.error('[historicalMarklistController] generateMarklistPDF error:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL STUDENT PDF — GET /api/historical-imports/student/:studentId/pdf
// ─────────────────────────────────────────────────────────────────────────────
exports.generateStudentPDF = async (req, res) => {
  try {
    const student = await HistoricalStudent.findById(req.params.studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const batch = await HistoricalImport.findById(student.importId);
    if (!batch) {
      return res.status(404).json({ message: 'Import batch not found' });
    }

    const job = await pdfQueue.add('historical-marklist-student', {
      type: 'historical-marklist-student',
      payload: {
        studentId: req.params.studentId
      }
    });

    return res.status(202).json({ 
      message: 'PDF generation started in background', 
      jobId: job.id 
    });
  } catch (err) {
    console.error('[historicalMarklistController] generateStudentPDF error:', err);
    return res.status(500).json({ message: err.message });
  }
};
