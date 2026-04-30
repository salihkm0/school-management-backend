// controllers/studentListController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateStudentListPDF } = require('../../services/pdf/studentListPdfService');

/**
 * Generate PDF for Student List
 * GET /api/student-list/pdf/:classId/:academicYearId?
 */
exports.generateStudentListPDF = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();
    academicYearId = academicYearId?.trim();

    console.log(`Generating student list for class: ${classId}`);

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
      name: student.fullName || '-'
    }));

    const templateData = {
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      academicYear: academicYearString,
      students: studentList
    };

    const pdfBuffer = await generateStudentListPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Student_List_${classDetails.name}_${academicYearString.replace(/\s+/g, "_")}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.length,
      "Content-Disposition": `inline; filename="Student_List_${classDetails.name}.pdf"`,
    });

    console.log('PDF buffer size:', pdfBuffer?.length);

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Student list PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Get Student List as JSON
 * GET /api/student-list/:classId/:academicYearId?
 */
exports.getStudentList = async (req, res) => {
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
    console.error("Error fetching student list:", error);
    res.status(500).json({
      message: "Failed to fetch student list",
      error: error.message,
    });
  }
};