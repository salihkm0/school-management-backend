// controllers/bhakshyaBadrathaController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateBhakshyaBadrathaPDF } = require('../../services/pdf/bhakshyaBadrathaPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

/**
 * Generate PDF for Bhakshya Badratha (Food Security Allowance)
 * GET /api/bhakshya-badratha/view/:classId/:academicYearId?
 */
exports.generateBhakshyaBadrathaPDF = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();

    console.log(`Generating Bhakshya Badratha for class: ${classId}`);

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
    const academicYearShort = academicYearString.replace(/\s+/g, '').slice(2);

    const students = await Student.find({ 
      classId: classId,
      isActive: true 
    }).sort({ rollNumber: 1, fullName: 1 });

    console.log(`Found ${students.length} students`);

    const studentList = students.map(student => ({
      admissionNo: student.admissionNo || '-',
      name: student.fullName || '-',
      uid: student.eid || '-',
      parentName: student.fatherFullName || student.guardian || '-'
    }));

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearShort,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      schoolName: 'P.P.M.H.S.S. KOTTUKKARA',
      students: studentList
    };

    const pdfBuffer = await generateBhakshyaBadrathaPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Bhakshya_Badratha_${classDetails.name}_${academicYearShort}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Bhakshya Badratha PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Bhakshya Badratha
 * GET /api/bhakshya-badratha/download/:classId/:academicYearId?
 */
exports.downloadBhakshyaBadrathaPDF = async (req, res) => {
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
    const academicYearShort = academicYearString.replace(/\s+/g, '').slice(2);

    const students = await Student.find({ 
      classId: classId,
      isActive: true 
    }).sort({ rollNumber: 1, fullName: 1 });

    const studentList = students.map(student => ({
      admissionNo: student.admissionNo || '-',
      name: student.fullName || '-',
      uid: student.eid || '-',
      parentName: student.fatherFullName || student.guardian || '-'
    }));

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearShort,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      schoolName: 'P.P.M.H.S.S. KOTTUKKARA',
      students: studentList
    };

    const pdfBuffer = await generateBhakshyaBadrathaPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Bhakshya_Badratha_${classDetails.name}_${academicYearShort}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Bhakshya Badratha PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};

/**
 * Get Bhakshya Badratha List as JSON
 * GET /api/bhakshya-badratha/list/:classId
 */
exports.getBhakshyaBadrathaList = async (req, res) => {
  try {
    let { classId } = req.params;

    classId = classId?.trim();

    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid class ID format" });
    }

    const classDetails = await Class.findById(classId);
    if (!classDetails) {
      return res.status(404).json({ message: "Class not found" });
    }

    const academicYear = await AcademicYear.findOne({ isCurrent: true });
    const academicYearString = academicYear?.year || "2025-2026";

    const students = await Student.find({ 
      classId: classId,
      isActive: true 
    }).sort({ rollNumber: 1, fullName: 1 });

    const studentList = students.map((student, index) => ({
      slNo: index + 1,
      admissionNo: student.admissionNo || '-',
      name: student.fullName || '-',
      uid: student.eid || '-',
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
    console.error("Error fetching Bhakshya Badratha list:", error);
    res.status(500).json({
      message: "Failed to fetch list",
      error: error.message,
    });
  }
};