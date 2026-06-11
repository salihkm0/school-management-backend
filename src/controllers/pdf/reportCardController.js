// controllers/reportCardController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { Exam } = require('../../models/Exam');
const Mark = require('../../models/Mark');
const Staff = require('../../models/Staff');
const { Attendance } = require('../../models/Attendance');
const { generateReportCardPDF, generateMultiReportCardPDF } = require('../../services/pdf/reportCardService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// Helper function to calculate grade
const getGrade = (percentage) => {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C+';
  if (percentage >= 40) return 'C';
  if (percentage >= 30) return 'D+';
  if (percentage >= 20) return 'D';
  return 'E';
};

// Helper function to prepare student report data for a specific exam
const prepareStudentReportData = async (student, examId, academicYear) => {
  // Get marksheet for specific exam
  let marksheet = null;
  let examName = '';
  
  if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
    marksheet = await Mark.findOne({ 
      studentId: student._id, 
      examId: examId 
    });
    const exam = await Exam.findById(examId);
    examName = exam?.displayName || exam?.name || 'Exam';
  } else {
    // Get latest marksheet if no exam specified
    marksheet = await Mark.findOne({ studentId: student._id })
      .sort({ createdAt: -1 });
    if (marksheet) {
      const exam = await Exam.findById(marksheet.examId);
      examName = exam?.displayName || exam?.name || 'Latest Exam';
    }
  }
  
  let subjects = [];
  let totalCEMax = 0;
  let totalTEMax = 0;
  let totalCE = 0;
  let totalTE = 0;
  
  if (marksheet && marksheet.subjects && marksheet.subjects.length > 0) {
    // Define standard subject order
    const subjectOrder = [
      'Malayalam', 'English', 'Hindi', 'Arabic', 'Urdu',
      'Mathematics', 'Maths', 'Physics', 'Chemistry', 'Biology',
      'Science', 'Social Science', 'Social', 'History', 'Geography',
      'Computer Science', 'IT', 'Information Technology'
    ];
    
    // Sort subjects by predefined order
    const sortedSubjects = [];
    subjectOrder.forEach(orderName => {
      const subject = marksheet.subjects.find(s => 
        s.subjectName?.toLowerCase().includes(orderName.toLowerCase())
      );
      if (subject && !sortedSubjects.includes(subject)) {
        sortedSubjects.push(subject);
      }
    });
    
    // Add remaining subjects
    marksheet.subjects.forEach(subject => {
      if (!sortedSubjects.includes(subject)) {
        sortedSubjects.push(subject);
      }
    });
    
    subjects = sortedSubjects.map(subject => {
      const ceMax = subject.maxMarks ? Math.round(subject.maxMarks * 0.2) : 20;
      const teMax = subject.maxMarks ? Math.round(subject.maxMarks * 0.8) : 80;
      const ce = subject.theoryScore || 0;
      const te = subject.practicalScore || subject.totalScore || 0;
      
      totalCEMax += ceMax;
      totalTEMax += teMax;
      totalCE += ce;
      totalTE += te;
      
      return {
        name: subject.subjectName,
        ceMax: ceMax,
        teMax: teMax,
        ceMarks: ce,
        teMarks: te,
        total: ce + te,
        grade: subject.grade || 'F'
      };
    });
  }
  
  // Get attendance data
  let attendanceRecords = [];
  try {
    attendanceRecords = await Attendance.find({
      studentId: student._id,
      academicYearId: academicYear?._id
    });
  } catch (err) {
    console.error('Error fetching attendance:', err);
    attendanceRecords = [];
  }
  
  const totalDays = attendanceRecords.length > 0 ? attendanceRecords.length : 200;
  const presentDays = attendanceRecords.filter(a => a.status === 'present').length > 0 
    ? attendanceRecords.filter(a => a.status === 'present').length 
    : 190;
  const attendancePercentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 95;
  
  // Calculate overall percentage
  const grandTotal = totalCE + totalTE;
  const grandMax = totalCEMax + totalTEMax;
  const overallPercentage = grandMax > 0 ? Math.round((grandTotal / grandMax) * 100) : 0;
  
  return {
    student: {
      id: student._id,
      name: student.fullName,
      class: student.classId?.displayName || `${student.className || ''} ${student.division || ''}`.trim(),
      rollNumber: student.rollNumber || '-',
      admissionNo: student.admissionNo
    },
    examName: examName,
    subjects: subjects,
    totalCEMax,
    totalTEMax,
    totalCE,
    totalTE,
    grandTotal,
    grandMax,
    overallPercentage,
    overallGrade: getGrade(overallPercentage),
    attendance: {
      totalDays: totalDays,
      presentDays: presentDays,
      percentage: attendancePercentage
    }
  };
};

/**
 * Generate Report Card PDF for a single student
 * GET /api/pdf/report-card/view/:studentId/:examId?/:academicYearId?
 */
exports.generateReportCardPDF = async (req, res) => {
  try {
    let { studentId, examId, academicYearId } = req.params;

    studentId = studentId?.trim();
    examId = examId?.trim();
    academicYearId = academicYearId?.trim();

    console.log(`Generating report card for student: ${studentId}, exam: ${examId || 'latest'}`);

    if (!studentId || !studentId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid student ID format" });
    }

    const student = await Student.findById(studentId).populate('classId', 'name section displayName');
    
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Get academic year
    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }
    
    const academicYearString = academicYear?.year || academicYear?.name || new Date().getFullYear().toString();

    const reportData = await prepareStudentReportData(student, examId, academicYear);
    
    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      examName: reportData.examName,
      ...reportData
    };
    
    const pdfBuffer = await generateReportCardPDF(templateData);
    
    const filename = `ReportCard_${student.fullName?.replace(/\s+/g, '_')}_${reportData.examName.replace(/\s+/g, '_')}_${academicYearString}.pdf`;
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${filename}"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);
    
  } catch (error) {
    console.error("Report card PDF generation error:", error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Download Report Card PDF for a single student
 * GET /api/pdf/report-card/download/:studentId/:examId?/:academicYearId?
 */
exports.downloadReportCardPDF = async (req, res) => {
  try {
    let { studentId, examId, academicYearId } = req.params;

    studentId = studentId?.trim();
    examId = examId?.trim();
    academicYearId = academicYearId?.trim();

    console.log(`Downloading report card for student: ${studentId}, exam: ${examId || 'latest'}`);

    if (!studentId || !studentId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid student ID format" });
    }

    const student = await Student.findById(studentId).populate('classId', 'name section displayName');
    
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }
    
    const academicYearString = academicYear?.year || academicYear?.name || new Date().getFullYear().toString();

    const reportData = await prepareStudentReportData(student, examId, academicYear);
    
    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      examName: reportData.examName,
      ...reportData
    };
    
    const pdfBuffer = await generateReportCardPDF(templateData);
    
    const filename = `ReportCard_${student.fullName?.replace(/\s+/g, '_')}_${reportData.examName.replace(/\s+/g, '_')}_${academicYearString}.pdf`;
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);
    
  } catch (error) {
    console.error("Report card PDF download error:", error);
    res.status(500).json({ message: error.message });
  }
};

/**
 * Generate Report Cards for entire class (PDF with multiple pages)
 * GET /api/pdf/report-card/class/view/:classId/:examId?/:academicYearId?
 */
exports.generateClassReportCardsPDF = async (req, res) => {
  try {
    let { classId, examId, academicYearId } = req.params;

    classId = classId?.trim();
    examId = examId?.trim();
    academicYearId = academicYearId?.trim();

    console.log(`Generating report cards for class: ${classId}, exam: ${examId || 'latest'}`);

    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid class ID format" });
    }

    const classDetails = await Class.findById(classId);
    if (!classDetails) {
      return res.status(404).json({ message: "Class not found" });
    }

    // ── Authorization: only class teacher or admin ──
    const userId = req.user._id || req.user.id;
    const staff = await Staff.findOne({ userId });
    const userRole = req.user.role;
    const isSystemAdmin = userRole === 'admin';
    const isStaffAdmin = staff && ['principal', 'administrator', 'manager', 'admin'].includes(staff.role);
    const isClassTeacherOfThis = staff && classDetails.classTeacherId &&
      classDetails.classTeacherId.toString() === staff._id.toString();

    if (!isSystemAdmin && !isStaffAdmin && !isClassTeacherOfThis) {
      return res.status(403).json({
        message: "Only the class teacher or an administrator can download class report cards."
      });
    }

    // Get exam name if provided
    let examName = 'Latest Exam';
    if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
      const exam = await Exam.findById(examId);
      examName = exam?.displayName || exam?.name || 'Exam';
    }

    // Get academic year
    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }
    
    const academicYearString = academicYear?.year || academicYear?.name || new Date().getFullYear().toString();

    // Get all active students in the class
    const students = await Student.find({ 
      classId: classId,
      status: 'active'
    }).populate('classId', 'name section displayName').sort({ rollNumber: 1, fullName: 1 });

    if (students.length === 0) {
      return res.status(404).json({ message: "No students found in this class" });
    }

    // ── Completion check: all student marks must be entered ──
    if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
      const marksheets = await Mark.find({ classId, examId });
      const marksheetMap = new Map(marksheets.map(m => [m.studentId.toString(), m]));

      const incomplete = [];
      for (const student of students) {
        const ms = marksheetMap.get(student._id.toString());
        if (!ms) {
          incomplete.push(student.fullName);
          continue;
        }
        const hasUnEntered = ms.subjects.some(s => !s.isEntered);
        if (hasUnEntered) incomplete.push(student.fullName);
      }

      if (incomplete.length > 0) {
        return res.status(400).json({
          message: `Marks are not fully entered for all students. Please complete marks for: ${incomplete.slice(0, 5).join(', ')}${incomplete.length > 5 ? ` and ${incomplete.length - 5} more` : ''}.`,
          pendingStudents: incomplete
        });
      }
    }

    console.log(`Found ${students.length} students in class ${classDetails.name}`);

    // Prepare report data for all students
    const allReportsData = [];
    for (const student of students) {
      const reportData = await prepareStudentReportData(student, examId, academicYear);
      allReportsData.push(reportData);
    }

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      examName: examName,
      students: allReportsData,
      totalStudents: students.length
    };
    
    const pdfBuffer = await generateMultiReportCardPDF(templateData);
    
    const filename = `Class_ReportCards_${classDetails.name}_${examName.replace(/\s+/g, '_')}_${academicYearString}.pdf`;
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);
    
  } catch (error) {
    console.error("Class report cards PDF generation error:", error);
    res.status(500).json({ message: error.message });
  }
};


/**
 * Download Report Cards for entire class (PDF with multiple pages)
 * GET /api/pdf/report-card/class/download/:classId/:examId?/:academicYearId?
 */
exports.downloadClassReportCardsPDF = async (req, res) => {
  try {
    let { classId, examId, academicYearId } = req.params;

    classId = classId?.trim();
    examId = examId?.trim();
    academicYearId = academicYearId?.trim();

    console.log(`Downloading report cards for class: ${classId}, exam: ${examId || 'latest'}`);

    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid class ID format" });
    }

    const classDetails = await Class.findById(classId);
    if (!classDetails) {
      return res.status(404).json({ message: "Class not found" });
    }

    // ── Authorization: only class teacher or admin ──
    const userId = req.user._id || req.user.id;
    const staff = await Staff.findOne({ userId });
    const userRole = req.user.role;
    const isSystemAdmin = userRole === 'admin';
    const isStaffAdmin = staff && ['principal', 'administrator', 'manager', 'admin'].includes(staff.role);
    const isClassTeacherOfThis = staff && classDetails.classTeacherId &&
      classDetails.classTeacherId.toString() === staff._id.toString();

    if (!isSystemAdmin && !isStaffAdmin && !isClassTeacherOfThis) {
      return res.status(403).json({
        message: "Only the class teacher or an administrator can download class report cards."
      });
    }

    // Get exam name if provided
    let examName = 'Latest Exam';
    if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
      const exam = await Exam.findById(examId);
      examName = exam?.displayName || exam?.name || 'Exam';
    }

    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }
    
    const academicYearString = academicYear?.year || academicYear?.name || new Date().getFullYear().toString();

    const students = await Student.find({ 
      classId: classId,
      status: 'active'
    }).populate('classId', 'name section displayName').sort({ rollNumber: 1, fullName: 1 });

    if (students.length === 0) {
      return res.status(404).json({ message: "No students found in this class" });
    }

    // ── Completion check: all student marks must be entered ──
    if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
      const marksheets = await Mark.find({ classId, examId });
      const marksheetMap = new Map(marksheets.map(m => [m.studentId.toString(), m]));

      const incomplete = [];
      for (const student of students) {
        const ms = marksheetMap.get(student._id.toString());
        if (!ms) {
          incomplete.push(student.fullName);
          continue;
        }
        const hasUnEntered = ms.subjects.some(s => !s.isEntered);
        if (hasUnEntered) incomplete.push(student.fullName);
      }

      if (incomplete.length > 0) {
        return res.status(400).json({
          message: `Marks are not fully entered for all students. Please complete marks for: ${incomplete.slice(0, 5).join(', ')}${incomplete.length > 5 ? ` and ${incomplete.length - 5} more` : ''}.`,
          pendingStudents: incomplete
        });
      }
    }

    // Prepare report data for all students
    const allReportsData = [];
    for (const student of students) {
      const reportData = await prepareStudentReportData(student, examId, academicYear);
      allReportsData.push(reportData);
    }

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      examName: examName,
      students: allReportsData,
      totalStudents: students.length
    };
    
    const pdfBuffer = await generateMultiReportCardPDF(templateData);
    
    const filename = `Class_ReportCards_${classDetails.name}_${examName.replace(/\s+/g, '_')}_${academicYearString}.pdf`;
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);
    
  } catch (error) {
    console.error("Class report cards PDF download error:", error);
    res.status(500).json({ message: error.message });
  }
};