// controllers/certificateController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const { generateCertificatePDF } = require('../../services/pdf/certificatePdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

/**
 * Generate PDF for Certificate
 * GET /api/certificate/view/:studentId?
 */
exports.generateCertificatePDF = async (req, res) => {
  try {
    let { studentId } = req.params;
    let { date, place } = req.query;

    studentId = studentId?.trim();

    console.log(`Generating certificate for student: ${studentId}`);

    let student = null;
    let useDummyData = false;

    if (studentId && studentId.match(/^[0-9a-fA-F]{24}$/)) {
      student = await Student.findById(studentId);
    }

    if (!student) {
      console.log('Student not found, using dummy data');
      useDummyData = true;
      student = {
        fullName: 'ISHA MINNA. M',
        gender: 'F',
        fatherFullName: 'MUHAMMED IQBAL',
        houseName: 'MADATHIL',
        streetName: 'MADATHIL HOUSE',
        postOffice: 'KONDOTTY',
        admissionNo: '41317',
        className: '8',
        dateOfBirth: new Date('2011-08-29')
      };
    }

    const academicYear = await AcademicYear.findOne({ isCurrent: true });
    const academicYearString = academicYear?.year || '2025-26';

    // Format date of birth
    let dobFormatted = '29/08/2011';
    if (student.dateOfBirth) {
      const dob = new Date(student.dateOfBirth);
      dobFormatted = `${dob.getDate().toString().padStart(2, '0')}/${(dob.getMonth() + 1).toString().padStart(2, '0')}/${dob.getFullYear()}`;
    }

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      certificateDate: date || new Date().toLocaleDateString('en-IN'),
      place: place || 'Kottukkara',
      student: {
        name: student.fullName || 'ISHA MINNA. M',
        gender: student.gender || 'F',
        parentName: student.fatherFullName || 'MUHAMMED IQBAL',
        houseName: student.houseName || 'MADATHIL',
        houseAddress: student.streetName || student.houseName || 'MADATHIL HOUSE',
        postOffice: student.postOffice || 'KONDOTTY',
        admissionNo: student.admissionNo || '41317',
        className: student.className || '8',
        dob: dobFormatted
      }
    };

    const pdfBuffer = await generateCertificatePDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Certificate_${student.fullName?.replace(/\s+/g, '_')}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Certificate PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Certificate
 * GET /api/certificate/download/:studentId?
 */
exports.downloadCertificatePDF = async (req, res) => {
  try {
    let { studentId } = req.params;
    let { date, place } = req.query;

    studentId = studentId?.trim();

    let student = null;

    if (studentId && studentId.match(/^[0-9a-fA-F]{24}$/)) {
      student = await Student.findById(studentId);
    }

    if (!student) {
      console.log('Student not found, using dummy data');
      student = {
        fullName: 'ISHA MINNA. M',
        gender: 'F',
        fatherFullName: 'MUHAMMED IQBAL',
        houseName: 'MADATHIL',
        streetName: 'MADATHIL HOUSE',
        postOffice: 'KONDOTTY',
        admissionNo: '41317',
        className: '8',
        dateOfBirth: new Date('2011-08-29')
      };
    }

    const academicYear = await AcademicYear.findOne({ isCurrent: true });
    const academicYearString = academicYear?.year || '2025-26';

    let dobFormatted = '29/08/2011';
    if (student.dateOfBirth) {
      const dob = new Date(student.dateOfBirth);
      dobFormatted = `${dob.getDate().toString().padStart(2, '0')}/${(dob.getMonth() + 1).toString().padStart(2, '0')}/${dob.getFullYear()}`;
    }

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      certificateDate: date || new Date().toLocaleDateString('en-IN'),
      place: place || 'Kottukkara',
      student: {
        name: student.fullName || 'ISHA MINNA. M',
        gender: student.gender || 'F',
        parentName: student.fatherFullName || 'MUHAMMED IQBAL',
        houseName: student.houseName || 'MADATHIL',
        houseAddress: student.streetName || student.houseName || 'MADATHIL HOUSE',
        postOffice: student.postOffice || 'KONDOTTY',
        admissionNo: student.admissionNo || '41317',
        className: student.className || '8',
        dob: dobFormatted
      }
    };

    const pdfBuffer = await generateCertificatePDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Certificate_${student.fullName?.replace(/\s+/g, '_')}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Certificate PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};