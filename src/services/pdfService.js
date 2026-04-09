const PDFDocument = require('pdfkit');
const fs = require('fs');

const generateReportCard = async (student, marks, exam, rankings) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      
      // Header
      doc.fontSize(20).text('School Management System', { align: 'center' });
      doc.fontSize(16).text('Student Report Card', { align: 'center' });
      doc.moveDown();
      
      // Student Info
      doc.fontSize(12);
      doc.text(`Student Name: ${student.name}`);
      doc.text(`Admission Number: ${student.admissionNumber}`);
      doc.text(`Class: ${student.classId.name || student.classId}`);
      doc.text(`Exam: ${exam.name}`);
      doc.moveDown();
      
      // Marks Table
      const tableTop = doc.y;
      const tableHeaders = ['Subject', 'Marks Obtained', 'Max Marks', 'Percentage', 'Grade'];
      const columnWidths = [150, 100, 100, 100, 80];
      
      let x = 50;
      doc.font('Helvetica-Bold');
      tableHeaders.forEach((header, i) => {
        doc.text(header, x, tableTop, { width: columnWidths[i], align: 'center' });
        x += columnWidths[i];
      });
      
      doc.font('Helvetica');
      let y = tableTop + 20;
      marks.forEach(mark => {
        x = 50;
        const row = [
          mark.subjectName,
          `${mark.totalMarks}`,
          `${mark.maxMarks}`,
          `${mark.percentage.toFixed(1)}%`,
          mark.grade
        ];
        row.forEach((cell, i) => {
          doc.text(cell, x, y, { width: columnWidths[i], align: 'center' });
          x += columnWidths[i];
        });
        y += 20;
      });
      
      // Summary
      y += 20;
      const totalMarks = marks.reduce((sum, m) => sum + m.totalMarks, 0);
      const totalMaxMarks = marks.reduce((sum, m) => sum + m.maxMarks, 0);
      const overallPercentage = (totalMarks / totalMaxMarks) * 100;
      const rank = rankings.find(r => r.studentId.toString() === student._id.toString());
      
      doc.font('Helvetica-Bold');
      doc.text(`Total: ${totalMarks}/${totalMaxMarks}`, 50, y);
      doc.text(`Percentage: ${overallPercentage.toFixed(1)}%`, 50, y + 20);
      doc.text(`Rank: ${rank?.rank || 'N/A'} / ${rankings.length}`, 50, y + 40);
      doc.text(`Grade: ${getGrade(overallPercentage)}`, 50, y + 60);
      
      // Remarks
      y += 100;
      doc.font('Helvetica-Bold').text('Remarks:', 50, y);
      doc.font('Helvetica').text(getRemarks(overallPercentage), 50, y + 20);
      
      // Footer
      const date = new Date().toLocaleDateString();
      doc.fontSize(10).text(`Generated on: ${date}`, 50, doc.page.height - 50, { align: 'center' });
      
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const getGrade = (percentage) => {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C+';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
};

const getRemarks = (percentage) => {
  if (percentage >= 85) return 'Excellent performance! Keep up the great work.';
  if (percentage >= 70) return 'Very good performance. You\'re doing well!';
  if (percentage >= 50) return 'Good effort. Keep working hard to improve further.';
  if (percentage >= 40) return 'Satisfactory. Need to focus more on studies.';
  return 'Needs improvement. Please work harder next time.';
};

module.exports = { generateReportCard };