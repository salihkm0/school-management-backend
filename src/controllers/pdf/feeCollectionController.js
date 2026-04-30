// controllers/feeCollectionController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateFeeCollectionPDF } = require('../../services/pdf/feeCollectionPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// Dummy data for testing
const DUMMY_STUDENTS = [
    { admissionNo: '39331', name: 'ABHISHA K', parentName: 'BABU K' },
    { admissionNo: '38662', name: 'ABISHA C M', parentName: 'KRISHNANKUTTY CM' },
    { admissionNo: '39311', name: 'AMEYA V', parentName: 'SURENDRAN. V' },
    { admissionNo: '38630', name: 'ANAGHA KRISHNAN A', parentName: 'KRISHNANKUTTY. A' },
    { admissionNo: '38816', name: 'ANAGHA V', parentName: 'GOPALAKRISHNAN. V' },
    { admissionNo: '38481', name: 'ANAMIKA A', parentName: 'CHINNAPPU' },
    { admissionNo: '39271', name: 'ANANYA P', parentName: 'SUBRAHMANYAN P' },
    { admissionNo: '38539', name: 'ANIKA K P', parentName: 'SUDHEESH K P' },
    { admissionNo: '38475', name: 'ANUPAMA P', parentName: 'RAJAN. P' },
    { admissionNo: '39266', name: 'AYISHA HIBA K P', parentName: 'ABDUL MAJEED K P' }
];

/**
 * Generate PDF for Fee Collection List
 * GET /api/fee-collection/view/:classId?/:academicYearId?
 */
exports.generateFeeCollectionPDF = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();
    academicYearId = academicYearId?.trim();

    console.log(`Generating fee collection list for class: ${classId}`);

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
      parentName: student.fatherFullName || student.parentName || student.guardian || '-'
    }));

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: className,
      students: studentList
    };

    const pdfBuffer = await generateFeeCollectionPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Fee_Collection_${className}_${academicYearString}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Fee collection PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Fee Collection List
 * GET /api/fee-collection/download/:classId?/:academicYearId?
 */
exports.downloadFeeCollectionPDF = async (req, res) => {
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
      parentName: student.fatherFullName || student.parentName || student.guardian || '-'
    }));

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: className,
      students: studentList
    };

    const pdfBuffer = await generateFeeCollectionPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Fee_Collection_${className}_${academicYearString}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Fee collection PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};

/**
 * Get Fee Collection List as JSON
 * GET /api/fee-collection/list/:classId?/:academicYearId?
 */
exports.getFeeCollectionList = async (req, res) => {
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
      students = DUMMY_STUDENTS;
    }

    const studentList = students.map((student, index) => ({
      slNo: index + 1,
      admissionNo: student.admissionNo || '-',
      name: student.fullName || student.name || '-',
      parentName: student.fatherFullName || student.parentName || student.guardian || '-'
    }));

    res.json({
      success: true,
      className: className,
      academicYear: academicYearString,
      totalStudents: studentList.length,
      students: studentList
    });

  } catch (error) {
    console.error("Error fetching fee collection list:", error);
    res.status(500).json({
      message: "Failed to fetch fee collection list",
      error: error.message,
    });
  }
};