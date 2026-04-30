// controllers/noonMealController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateNoonMealPDF } = require('../../services/pdf/noonMealPdfService');

/**
 * Generate PDF for Noon Meal Programme Consolidation List
 * GET /api/noon-meal/pdf/:month?/:year?/:workingDays?
 */
exports.generateNoonMealPDF = async (req, res) => {
  try {
    let { month, year, workingDays } = req.params;

    console.log(`Generating noon meal consolidation list`);

    // Get current academic year
    const academicYear = await AcademicYear.findOne({ isCurrent: true });
    const academicYearString = academicYear?.year || "2025-2026";

    // Format month and year
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

    // Divisions A to X
    const divisions = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X'];

    const templateData = {
      academicYear: academicYearString,
      monthYear: monthYear,
      workingDays: parseInt(workingDays) || 25,
      divisions: divisions
    };

    const pdfBuffer = await generateNoonMealPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Noon_Meal_Consolidation_${monthYear.replace(/\s+/g, "_")}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.length,
      "Content-Disposition": `inline; filename="Noon_Meal_Consolidation.pdf"`,
    });

    console.log('PDF buffer size:', pdfBuffer?.length);

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Noon meal PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Get Noon Meal List as JSON
 * GET /api/noon-meal/list/:classId
 */
exports.getNoonMealList = async (req, res) => {
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
      name: student.fullName || '-'
    }));

    res.json({
      success: true,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      academicYear: academicYearString,
      totalStudents: studentList.length,
      students: studentList
    });

  } catch (error) {
    console.error("Error fetching noon meal list:", error);
    res.status(500).json({
      message: "Failed to fetch noon meal list",
      error: error.message,
    });
  }
};

/**
 * Get all classes for dropdown
 * GET /api/noon-meal/classes
 */
exports.getClassesForNoonMeal = async (req, res) => {
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