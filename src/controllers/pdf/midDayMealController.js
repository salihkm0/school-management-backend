// controllers/midDayMealController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateMidDayMealPDF } = require('../../services/pdf/midDayMealPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

/**
 * Generate PDF for Mid Day Meal Scheme Beneficiary List
 * GET /api/mid-day-meal/pdf/:classId/:academicYearId?
 */
exports.generateMidDayMealPDF = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();
    academicYearId = academicYearId?.trim();

    console.log(`Generating mid day meal beneficiary list for class: ${classId}`);

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
      gender: student.gender || 'F',
      category: student.category || 'General'
    }));

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearShort,
      schoolCode: '19057',
      schoolName: 'P.P.M.H.S.S. KOTTUKKARA',
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      students: studentList
    };

    const pdfBuffer = await generateMidDayMealPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Mid_Day_Meal_${classDetails.name}_${academicYearShort}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.length,
      "Content-Disposition": `inline; filename="Mid_Day_Meal_${classDetails.name}.pdf"`,
    });

    console.log('PDF buffer size:', pdfBuffer?.length);

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Mid day meal PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Get Mid Day Meal List as JSON
 * GET /api/mid-day-meal/list/:classId/:academicYearId?
 */
exports.getMidDayMealList = async (req, res) => {
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
      uid: student.eid || '-',
      gender: student.gender || 'F',
      category: student.category || 'General'
    }));

    const categoryCounts = {
      SC: { B: 0, G: 0 },
      ST: { B: 0, G: 0 },
      OBC: { B: 0, G: 0 },
      General: { B: 0, G: 0 }
    };

    students.forEach(student => {
      const category = student.category || 'General';
      const gender = student.gender || 'F';
      
      if (categoryCounts[category]) {
        if (gender === 'M') {
          categoryCounts[category].B++;
        } else {
          categoryCounts[category].G++;
        }
      }
    });

    res.json({
      success: true,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      academicYear: academicYearString,
      totalStudents: studentList.length,
      categoryCounts: categoryCounts,
      students: studentList
    });

  } catch (error) {
    console.error("Error fetching mid day meal list:", error);
    res.status(500).json({
      message: "Failed to fetch mid day meal list",
      error: error.message,
    });
  }
};