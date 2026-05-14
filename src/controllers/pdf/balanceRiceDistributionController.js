// controllers/balanceRiceDistributionController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateBalanceRiceDistributionPDF } = require('../../services/pdf/balanceRiceDistributionPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

/**
 * Generate PDF for Balance Rice Distribution
 * GET /api/balance-rice-distribution/view/:classId/:month?/:year?
 */
exports.generateBalanceRiceDistributionPDF = async (req, res) => {
  try {
    let { classId, month, year } = req.params;

    classId = classId?.trim();

    console.log(`Generating balance rice distribution for class: ${classId}`);

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

    console.log(`Found ${students.length} students`);

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    let monthYear = '';
    
    if (month && year) {
      const monthIndex = parseInt(month) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        monthYear = `${monthNames[monthIndex]} ${year}`;
      } else {
        monthYear = `${month} ${year}`;
      }
    } else {
      const now = new Date();
      monthYear = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    }

    const studentList = students.map(student => ({
      admissionNo: student.admissionNo || '-',
      name: student.fullName || '-',
      uid: student.eid || '-',
      parentName: student.fatherFullName || student.guardian || '-'
    }));

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      month: monthYear,
      schoolName: 'P.P.M.H.S.S. KOTTUKKARA',
      students: studentList
    };

    const pdfBuffer = await generateBalanceRiceDistributionPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Balance_Rice_Distribution_${classDetails.name}_${monthYear.replace(/\s+/g, "_")}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Balance rice distribution PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Balance Rice Distribution
 * GET /api/balance-rice-distribution/download/:classId/:month?/:year?
 */
exports.downloadBalanceRiceDistributionPDF = async (req, res) => {
  try {
    let { classId, month, year } = req.params;

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

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    let monthYear = '';
    
    if (month && year) {
      const monthIndex = parseInt(month) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        monthYear = `${monthNames[monthIndex]} ${year}`;
      } else {
        monthYear = `${month} ${year}`;
      }
    } else {
      const now = new Date();
      monthYear = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    }

    const studentList = students.map(student => ({
      admissionNo: student.admissionNo || '-',
      name: student.fullName || '-',
      uid: student.eid || '-',
      parentName: student.fatherFullName || student.guardian || '-'
    }));

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      month: monthYear,
      schoolName: 'P.P.M.H.S.S. KOTTUKKARA',
      students: studentList
    };

    const pdfBuffer = await generateBalanceRiceDistributionPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Balance_Rice_Distribution_${classDetails.name}_${monthYear.replace(/\s+/g, "_")}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Balance rice distribution PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};

/**
 * Get Balance Rice Distribution List as JSON
 * GET /api/balance-rice-distribution/list/:classId
 */
exports.getBalanceRiceDistributionList = async (req, res) => {
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
    console.error("Error fetching balance rice distribution list:", error);
    res.status(500).json({
      message: "Failed to fetch distribution list",
      error: error.message,
    });
  }
};