// controllers/riceDistributionController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateRiceDistributionPDF } = require('../../services/pdf/riceDistributionPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

/**
 * Generate PDF for Rice/Food Kit Distribution
 * GET /api/rice-distribution/pdf/:classId/:academicYearId?/:distributionType?
 */
exports.generateRiceDistributionPDF = async (req, res) => {
  try {
    let { classId, academicYearId, distributionType } = req.params;

    classId = classId?.trim();
    academicYearId = academicYearId?.trim();
    distributionType = distributionType || 'Food Kit/Rice';

    console.log(`Generating rice distribution list for class: ${classId}`);

    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid class ID format" });
    }

    const classDetails = await Class.findById(classId);
    if (!classDetails) {
      return res.status(404).json({ message: "Class not found" });
    }

    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const academicYearString = academicYear?.year || "2025-2026";

    const students = await Student.find({ 
      classId: classId,
      isActive: true 
    }).sort({ rollNumber: 1, fullName: 1 });

    console.log(`Found ${students.length} students`);

    const studentList = students.map(student => ({
      admissionNo: student.admissionNo || '-',
      name: student.fullName || '-',
      parentName: student.fatherFullName || student.guardian || '-'
    }));

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      academicYear: academicYearString,
      distributionType: decodeURIComponent(distributionType),
      schoolName: 'P.P.M.H.S.S. KOTTUKKARA',
      schoolAddress: 'Kottukkara, Kondotty, Malappuram, Kerala - 673638',
      students: studentList
    };

    const pdfBuffer = await generateRiceDistributionPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Rice_Distribution_${classDetails.name}_${academicYearString.replace(/\s+/g, "_")}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.length,
      "Content-Disposition": `inline; filename="Rice_Distribution_${classDetails.name}.pdf"`,
    });

    console.log('PDF buffer size:', pdfBuffer?.length);

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Rice distribution PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Get Rice Distribution List as JSON
 * GET /api/rice-distribution/list/:classId/:academicYearId?
 */
exports.getRiceDistributionList = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();

    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid class ID format" });
    }

    const classDetails = await Class.findById(classId);
    if (!classDetails) {
      return res.status(404).json({ message: "Class not found" });
    }

    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const academicYearString = academicYear?.year || "2025-2026";

    const students = await Student.find({ 
      classId: classId,
      isActive: true 
    }).sort({ rollNumber: 1, fullName: 1 });

    const studentList = students.map((student, index) => ({
      slNo: index + 1,
      admissionNo: student.admissionNo || '-',
      name: student.fullName || '-',
      parentName: student.fatherFullName || student.guardian || '-'
    }));

    res.json({
      success: true,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      academicYear: academicYearString,
      totalStudents: studentList.length,
      students: studentList
    });

  } catch (error) {
    console.error("Error fetching rice distribution list:", error);
    res.status(500).json({
      message: "Failed to fetch distribution list",
      error: error.message,
    });
  }
};

/**
 * Get all classes for dropdown
 * GET /api/rice-distribution/classes
 */
exports.getClassesForDistribution = async (req, res) => {
  try {
    const classes = await Class.find({ isActive: true })
      .sort({ name: 1, section: 1 });
    
    const classList = classes.map(cls => ({
      id: cls._id,
      name: cls.displayName || `${cls.name} ${cls.section || ''}`,
      className: cls.name,
      section: cls.section
    }));
    
    res.json({
      success: true,
      classes: classList
    });
    
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ 
      message: 'Failed to fetch classes', 
      error: error.message 
    });
  }
};