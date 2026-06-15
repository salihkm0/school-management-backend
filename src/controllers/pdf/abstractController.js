// controllers/abstractController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const { generateAbstractPDF } = require('../../services/pdf/abstractPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

/**
 * Generate PDF for Abstract of Admission Register
 * GET /api/abstract/view/:studentId?
 */
exports.generateAbstractPDF = async (req, res) => {
  try {
    let { studentId } = req.params;
    let { date, station } = req.query;

    studentId = studentId?.trim();

    console.log(`Generating abstract for student: ${studentId}`);

    let student = null;

    if (studentId && studentId.match(/^[0-9a-fA-F]{24}$/)) {
      student = await Student.findById(studentId);
    }

    if (!student) {
      console.log('Student not found, using dummy data');
      student = {
        fullName: 'ISHA MINNA. M',
        admissionNo: '41317',
        fatherFullName: 'MUHAMMED IQBAL MADATHIL',
        guardian: '',
        houseName: 'MADATHIL HOUSE',
        postOffice: 'KONDOTTY',
        admissionDate: new Date('2025-05-08'),
        dateOfBirth: new Date('2011-08-29'),
        religion: 'Islam',
        casteName: 'Mappila',
        category: 'OBC',
        className: '8',
        gender: 'F',
        identificationMark1: 'A BLACK MOLE ON THE OUTER PALM'
      };
    }

    // Format dates
    let admissionDateFormatted = '08/05/2025';
    if (student.admissionDate) {
      const date = new Date(student.admissionDate);
      admissionDateFormatted = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    }

    let dobFormatted = '29/08/2011';
    if (student.dateOfBirth) {
      const dob = new Date(student.dateOfBirth);
      dobFormatted = `${dob.getDate().toString().padStart(2, '0')}/${(dob.getMonth() + 1).toString().padStart(2, '0')}/${dob.getFullYear()}`;
    }

    // Determine parent name
    const parentName = student.fatherFullName || student.guardian || 'MUHAMMED IQBAL MADATHIL';
    const parentRelation = student.fatherFullName ? 'Father' : 'Guardian';

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      schoolName: 'PPMHSS KOTTUKKARA',
      abstractDate: date || new Date().toLocaleDateString('en-IN'),
      station: station || 'KOTTUKKARA',
      student: {
        name: student.fullName || '',
        admissionNo: student.admissionNo || '',
        parentName: parentName,
        parentRelation: parentRelation,
        address: student.houseName || '',
        postOffice: student.postOffice || '',
        previousSchool: student.previousSchool || '',
        previousClass: student.previousClass || '',
        admissionDate: admissionDateFormatted,
        dob: dobFormatted,
        religion: student.religion || '',
        caste: student.casteName || '',
        category: student.category || '',
        admissionClass: student.className || '',
        leavingClass: '',
        tcNo: student.tcNo || '',
        tcDate: student.tcDate || '',
        tcGrantedNo: 'NA',
        tcGrantedDate: 'NA',
        leavingReason: 'NA',
        vaccinationDate: student.vaccinationDate || '',
        identificationMarks: student.identificationMark1 || '',
        remarks: '',
        gender: student.gender || ''
      }
    };

    const pdfBuffer = await generateAbstractPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Abstract_${student.fullName?.replace(/\s+/g, '_') || 'Student'}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Abstract PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Abstract of Admission Register
 * GET /api/abstract/download/:studentId?
 */
exports.downloadAbstractPDF = async (req, res) => {
  try {
    let { studentId } = req.params;
    let { date, station } = req.query;

    studentId = studentId?.trim();

    let student = null;

    if (studentId && studentId.match(/^[0-9a-fA-F]{24}$/)) {
      student = await Student.findById(studentId);
    }

    if (!student) {
      console.log('Student not found, using dummy data');
      student = {
        fullName: 'ISHA MINNA. M',
        admissionNo: '41317',
        fatherFullName: 'MUHAMMED IQBAL MADATHIL',
        guardian: '',
        houseName: 'MADATHIL HOUSE',
        postOffice: 'KONDOTTY',
        admissionDate: new Date('2025-05-08'),
        dateOfBirth: new Date('2011-08-29'),
        religion: 'Islam',
        casteName: 'Mappila',
        category: 'OBC',
        className: '8',
        gender: 'F',
        identificationMark1: 'A BLACK MOLE ON THE OUTER PALM'
      };
    }

    let admissionDateFormatted = '08/05/2025';
    if (student.admissionDate) {
      const date = new Date(student.admissionDate);
      admissionDateFormatted = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    }

    let dobFormatted = '29/08/2011';
    if (student.dateOfBirth) {
      const dob = new Date(student.dateOfBirth);
      dobFormatted = `${dob.getDate().toString().padStart(2, '0')}/${(dob.getMonth() + 1).toString().padStart(2, '0')}/${dob.getFullYear()}`;
    }

    const parentName = student.fatherFullName || student.guardian || 'MUHAMMED IQBAL MADATHIL';
    const parentRelation = student.fatherFullName ? 'Father' : 'Guardian';

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      schoolName: 'PPMHSS KOTTUKKARA',
      abstractDate: date || new Date().toLocaleDateString('en-IN'),
      station: station || 'KOTTUKKARA',
      student: {
        name: student.fullName || 'ISHA MINNA. M',
        admissionNo: student.admissionNo || '41317',
        parentName: parentName,
        parentRelation: parentRelation,
        address: student.houseName || 'MADATHIL HOUSE',
        postOffice: student.postOffice || 'KONDOTTY',
        previousSchool: student.previousSchool || '-',
        previousClass: student.previousClass || '-',
        admissionDate: admissionDateFormatted,
        dob: dobFormatted,
        religion: student.religion || 'Islam',
        caste: student.casteName || 'Mappila',
        category: student.category || 'OBC',
        admissionClass: student.className || '8',
        leavingClass: 'Still on the Roll',
        tcNo: student.tcNo || '-',
        tcDate: student.tcDate || '-',
        tcGrantedNo: 'NA',
        tcGrantedDate: 'NA',
        leavingReason: 'NA',
        vaccinationDate: student.vaccinationDate || '',
        identificationMarks: student.identificationMark1 || 'A BLACK MOLE ON THE OUTER PALM',
        remarks: '',
        gender: student.gender || 'F'
      }
    };

    const pdfBuffer = await generateAbstractPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Abstract_${student.fullName?.replace(/\s+/g, '_') || 'Student'}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Abstract PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};