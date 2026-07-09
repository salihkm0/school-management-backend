// controllers/classPtaController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateClassPtaPDF } = require('../../services/pdf/classPtaPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// Dummy data for testing
const DUMMY_STUDENTS = [
    { admissionNo: '39331', name: 'ABHISHA K', gender: 'F' },
    { admissionNo: '38662', name: 'ABISHA C M', gender: 'F' },
    { admissionNo: '39311', name: 'AMEYA V', gender: 'F' },
    { admissionNo: '38630', name: 'ANAGHA KRISHNAN A', gender: 'F' },
    { admissionNo: '38816', name: 'ANAGHA V', gender: 'F' },
    { admissionNo: '38481', name: 'ANAMIKA A', gender: 'F' },
    { admissionNo: '39271', name: 'ANANYA P', gender: 'F' },
    { admissionNo: '38539', name: 'ANIKA K P', gender: 'F' },
    { admissionNo: '38475', name: 'ANUPAMA P', gender: 'F' },
    { admissionNo: '39266', name: 'AYISHA HIBA K P', gender: 'F' }
];

/**
 * Generate PDF for Class PTA
 * GET /api/class-pta/view/:classId?/:academicYearId?
 */
exports.generateClassPtaPDF = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();
    academicYearId = academicYearId?.trim();

    console.log(`Generating Class PTA for class: ${classId}`);

    let classDetails = null;
    let className = '10 A';
    
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
      gender: student.gender || '-',
      parentName: student.fatherFullName || student.guardian || ''
    }));

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: className,
      students: studentList
    };

    const pdfBuffer = await generateClassPtaPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Class_PTA_${className}_${academicYearString}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Class PTA PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Class PTA
 * GET /api/class-pta/download/:classId?/:academicYearId?
 */
exports.downloadClassPtaPDF = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();
    academicYearId = academicYearId?.trim();

    let classDetails = null;
    let className = '10 A';
    
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
      parentName: student.fatherFullName || student.guardian || ''
    }));

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: className,
      students: studentList
    };

    const pdfBuffer = await generateClassPtaPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Class_PTA_${className}_${academicYearString}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Class PTA PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};