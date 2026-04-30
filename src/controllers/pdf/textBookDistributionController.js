// controllers/textBookDistributionController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateTextBookDistributionPDF } = require('../../services/pdf/textBookDistributionPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// Dummy data for testing
const DUMMY_STUDENTS = [
    { admissionNo: '41733', name: 'ABHIYA K', parentName: 'SHAJI K' },
    { admissionNo: '41607', name: 'AMALYA', parentName: 'BIJU MELOT' },
    { admissionNo: '41622', name: 'AMEYA K', parentName: 'BAIJU K' },
    { admissionNo: '42640', name: 'ANANNYA O', parentName: 'BABU O' },
    { admissionNo: '42642', name: 'ANANTHIKA K', parentName: 'SANTHOSH.K' },
    { admissionNo: '41611', name: 'ANANYA K', parentName: 'SURESH BABU K' },
    { admissionNo: '41591', name: 'ASHIMA K C', parentName: 'SHANMUKHAN.KC' },
    { admissionNo: '41719', name: 'ATHARSHA E P', parentName: 'EDEPARAMBAN SHAJI' },
    { admissionNo: '42578', name: 'AVANTHIKA M', parentName: 'RATHEESH M' },
    { admissionNo: '42516', name: 'AYANA M', parentName: 'PRAJEESH M' }
];

/**
 * Generate PDF for Text Book Distribution Register
 * GET /api/text-book-distribution/view/:classId?/:academicYearId?
 */
exports.generateTextBookDistributionPDF = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();
    academicYearId = academicYearId?.trim();

    console.log(`Generating text book distribution for class: ${classId}`);

    let classDetails = null;
    let className = '8 A';
    
    if (classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
      classDetails = await Class.findById(classId);
      if (classDetails) {
        className = classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`;
      }
    }

    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const academicYearString = academicYear?.year || "2025-2026";

    let students = [];
    let useDummyData = false;

    if (classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
      students = await Student.find({ 
        classId: classId,
        isActive: true 
      }).sort({ rollNumber: 1, fullName: 1 });
    }

    if (students.length === 0) {
      console.log('No students found, using dummy data');
      useDummyData = true;
      students = DUMMY_STUDENTS;
    }

    const studentList = students.map(student => ({
      admissionNo: student.admissionNo || '-',
      name: student.fullName || student.name || '-',
      parentName: student.fatherFullName || student.parentName || student.guardian || '-'
    }));

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: className,
      students: studentList
    };

    const pdfBuffer = await generateTextBookDistributionPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Text_Book_Distribution_${className}_${academicYearString}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Text book distribution PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Text Book Distribution Register
 * GET /api/text-book-distribution/download/:classId?/:academicYearId?
 */
exports.downloadTextBookDistributionPDF = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();
    academicYearId = academicYearId?.trim();

    let classDetails = null;
    let className = '8 A';
    
    if (classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
      classDetails = await Class.findById(classId);
      if (classDetails) {
        className = classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`;
      }
    }

    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const academicYearString = academicYear?.year || "2025-2026";

    let students = [];

    if (classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
      students = await Student.find({ 
        classId: classId,
        isActive: true 
      }).sort({ rollNumber: 1, fullName: 1 });
    }

    if (students.length === 0) {
      console.log('No students found, using dummy data');
      students = DUMMY_STUDENTS;
    }

    const studentList = students.map(student => ({
      admissionNo: student.admissionNo || '-',
      name: student.fullName || student.name || '-',
      parentName: student.fatherFullName || student.parentName || student.guardian || '-'
    }));

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: className,
      students: studentList
    };

    const pdfBuffer = await generateTextBookDistributionPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Text_Book_Distribution_${className}_${academicYearString}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Text book distribution PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};