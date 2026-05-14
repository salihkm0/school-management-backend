// controllers/idCardController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateIdCardListPDF } = require('../../services/pdf/idCardListPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

/**
 * Generate PDF for ID card list
 * GET /api/id-card/pdf/:classId/:academicYearId?
 */
exports.generateIdCardListPDF = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();
    academicYearId = academicYearId?.trim();

    console.log(`Generating ID card list for class: ${classId}`);

    // Validate ObjectId
    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid class ID format" });
    }

    // Get class details
    const classDetails = await Class.findById(classId);
    if (!classDetails) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Get academic year
    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const academicYearString = academicYear?.year || "2025-2026";

    // Get students
    const students = await Student.find({ 
      classId: classId,
      isActive: true 
    }).sort({ rollNumber: 1, fullName: 1 });

    console.log(`Found ${students.length} students`);

    // Format data for template
    const studentList = students.map(student => ({
      admissionNo: student.admissionNo || '-',
      name: student.fullName || '-',
      parentName: student.fatherFullName || student.guardianName || '-',
      phone1: student.phoneNumber || student.fatherPhone || '-',
      phone2: student.motherPhone || student.alternatePhone || '-',
      street: student.houseName || student.streetName || student.permanentAddress || student.presentAddress || '-'
    }));

    // Prepare template data
    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      academicYear: academicYearString,
      schoolName: 'P.P.M.H.S.S. KOTTUKKARA',
      students: studentList
    };

    // Generate PDF
    const pdfBuffer = await generateIdCardListPDF(templateData);

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="ID_Card_List_${classDetails.name}_${academicYearString.replace(/\s+/g, "_")}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    // Send PDF
    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.length,
      "Content-Disposition": `inline; filename="ID_Card_List_${classDetails.name}.pdf"`,
    });

    console.log('PDF buffer size:', pdfBuffer?.length);

    res.end(pdfBuffer);

  } catch (error) {
    console.error("ID card list PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Get student list for ID card by class (JSON)
 * GET /api/id-card/list/:classId/:academicYearId?
 */
exports.getIdCardListByClass = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();

    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid class ID format" });
    }

    // Get class details
    const classDetails = await Class.findById(classId);
    if (!classDetails) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Get academic year
    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const academicYearString = academicYear?.year || "2025-2026";

    // Get students
    const students = await Student.find({ 
      classId: classId,
      isActive: true 
    }).sort({ rollNumber: 1, fullName: 1 });

    // Format student data
    const studentList = students.map(student => ({
      admissionNo: student.admissionNo || '-',
      name: student.fullName || '-',
      parentName: student.fatherFullName || student.guardianName || '-',
      phone1: student.phoneNumber || student.fatherPhone || '-',
      phone2: student.motherPhone || student.alternatePhone || '-',
      street: student.houseName || student.streetName || student.permanentAddress || student.presentAddress || '-'
    }));

    // Return JSON response
    res.json({
      success: true,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      academicYear: academicYearString,
      totalStudents: studentList.length,
      students: studentList
    });

  } catch (error) {
    console.error("Error fetching ID card list:", error);
    res.status(500).json({
      message: "Failed to fetch ID card list",
      error: error.message,
    });
  }
};

/**
 * Get all classes for dropdown
 * GET /api/id-card/classes
 */
exports.getClassesForIdCard = async (req, res) => {
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