const { Worker } = require('bullmq');
const { connection } = require('../jobQueue');
const fs = require('fs');
const path = require('path');
const { HistoricalImport, HistoricalStudent } = require('../../../models/HistoricalImport');
const { generateHistoricalMarklistPdf } = require('../../pdf/historicalMarklistPdfService');

const DOWNLOAD_DIR = path.join(__dirname, '../../../../uploads/downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

const pdfWorker = new Worker('pdf-generation', async job => {
  console.log(`[pdfWorker] Started processing job ${job.id}`);
  try {
    const { type, payload } = job.data;
    
    // Process different types of PDF generation
    if (type === 'historical-marklist-batch') {
      const { importId, grade, division, sheetName } = payload;
      
      const filter = { importId };
      if (grade) filter.grade = grade;
      if (division) filter.division = division;
      if (sheetName) filter.sheetName = sheetName;

      // Update progress
      await job.updateProgress(10);

      const [batch, students] = await Promise.all([
        HistoricalImport.findById(importId),
        HistoricalStudent.find(filter).sort({
          sheetName: 1, grade: 1, division: 1, slNo: 1,
        }),
      ]);

      if (!batch || students.length === 0) {
        throw new Error('Batch or students not found');
      }

      await job.updateProgress(30);

      // This is the heavy operation
      const pdfBuffer = await generateHistoricalMarklistPdf(students, batch);
      
      await job.updateProgress(80);

      // Save to disk
      const parts = [batch.academicYear || 'Historical'];
      if (grade) parts.push(`Grade${grade}`);
      if (division) parts.push(division);
      if (sheetName) parts.push(sheetName.replace(/\s+/g, '_'));
      const filename = `HistoricalMarklist_${parts.join('_')}_${job.id}.pdf`;
      
      const filePath = path.join(DOWNLOAD_DIR, filename);
      fs.writeFileSync(filePath, pdfBuffer);

      await job.updateProgress(100);
      
      console.log(`[pdfWorker] Completed job ${job.id}`);
      return { filename, path: filePath, originalFilename: filename.replace(`_${job.id}`, '') };
    }
    
    if (type === 'historical-marklist-student') {
      const { studentId } = payload;
      const student = await HistoricalStudent.findById(studentId);
      if (!student) throw new Error('Student not found');
      const batch = await HistoricalImport.findById(student.importId);
      if (!batch) throw new Error('Batch not found');
      
      await job.updateProgress(30);
      
      const pdfBuffer = await generateHistoricalMarklistPdf([student], batch);
      
      await job.updateProgress(80);
      
      const safeName = (student.name || 'Student').replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
      const filename = `MarkSheet_${safeName}_${job.id}.pdf`;
      const filePath = path.join(DOWNLOAD_DIR, filename);
      
      fs.writeFileSync(filePath, pdfBuffer);
      await job.updateProgress(100);
      return { filename, path: filePath, originalFilename: `MarkSheet_${safeName}.pdf` };
    }

    throw new Error(`Unknown job type: ${type}`);
  } catch (error) {
    console.error(`[pdfWorker] Job ${job.id} failed:`, error);
    throw error;
  }
}, { connection });

pdfWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed with error ${err.message}`);
});

pdfWorker.on('error', (err) => {
  console.error(`[pdfWorker] connection error:`, err);
});

module.exports = pdfWorker;
