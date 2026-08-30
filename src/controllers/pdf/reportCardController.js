// controllers/reportCardController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { Exam } = require('../../models/Exam');
const Mark = require('../../models/Mark');
const Staff = require('../../models/Staff');
const { Attendance } = require('../../models/Attendance');
const { generateReportCardPDF, generateMultiReportCardPDF, generateClassMarksTablePDF, generateClassReportCardsPDF } = require('../../services/pdf/reportCardService');
const { sortStudents } = require('../../utils/studentSorter');
const markController = require('../markController');

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
  let examObj = null;

  const validExamId = examId && examId.match(/^[0-9a-fA-F]{24}$/) ? examId : null;

  if (validExamId) {
    marksheet = await Mark.findOne({ 
      studentId: student._id, 
      examId: validExamId 
    });
    examObj = await Exam.findById(validExamId);
    examName = examObj?.displayName || examObj?.name || 'Exam';
  } else {
    // Get latest marksheet if no exam specified
    marksheet = await Mark.findOne({ studentId: student._id })
      .sort({ createdAt: -1 });
    if (marksheet) {
      examObj = await Exam.findById(marksheet.examId);
      examName = examObj?.displayName || examObj?.name || 'Latest Exam';
    }
  }

  // Create a map of exam subject configurations (for ceMaxMarks and theoryMarks)
  const examSubjectConfigMap = new Map();
  if (examObj) {
    const examSubList = examObj.subjects || examObj.subjectSchedules || [];
    examSubList.forEach(es => {
      const nameKey = (es.subjectName || '').toLowerCase().trim();
      const codeKey = (es.subjectCode || '').toLowerCase().trim();
      if (nameKey) examSubjectConfigMap.set(nameKey, es);
      if (codeKey) examSubjectConfigMap.set(codeKey, es);
    });
  }
  
  let subjects = [];
  let totalCEMax = 0;
  let totalTEMax = 0;
  let totalCE = 0;
  let totalTE = 0;
  
  if (marksheet && marksheet.subjects && marksheet.subjects.length > 0) {
    // Define standard subject order for Kerala syllabus
    const subjectOrder = [
      'first language', 'language i', 'language 1',
      'second language', 'language ii', 'language 2', 'malayalam ii', 'malayalam 2', 'arabic', 'urdu', 'sanskrit',
      'english',
      'hindi',
      'social science', 'ss', 'social', 'history', 'geography',
      'physics',
      'chemistry',
      'biology',
      'science', // generic science if not split
      'mathematics', 'maths',
      'information technology', 'it', 'computer science'
    ];
    
    // Sort subjects by predefined order
    const sortedSubjects = [];
    subjectOrder.forEach(orderName => {
      const matchingSubjects = marksheet.subjects.filter(s => {
        const name = (s.subjectName || '').toLowerCase();
        return name.includes(orderName) && !sortedSubjects.includes(s);
      });
      matchingSubjects.forEach(subject => {
        sortedSubjects.push(subject);
      });
    });
    
    // Add remaining subjects
    marksheet.subjects.forEach(subject => {
      if (!sortedSubjects.includes(subject)) {
        sortedSubjects.push(subject);
      }
    });
    
    subjects = sortedSubjects.map(subject => {
      const nameKey = (subject.subjectName || '').toLowerCase().trim();
      const codeKey = (subject.subjectCode || '').toLowerCase().trim();
      const examSubConfig = examSubjectConfigMap.get(nameKey) || examSubjectConfigMap.get(codeKey);

      const maxMarks = subject.maxMarks || examSubConfig?.maxMarks || 20;

      // Determine CE Max and TE Max from Exam config or standard weightage (20% / 80%)
      let ceMax = examSubConfig?.ceMaxMarks || subject.ceMaxMarks || subject.ceMax;
      let teMax = examSubConfig?.theoryMarks || subject.theoryMarks || subject.teMax;

      if (!ceMax || !teMax) {
        if (maxMarks === 100) { ceMax = 20; teMax = 80; }
        else if (maxMarks === 50) { ceMax = 10; teMax = 40; }
        else if (maxMarks === 40) { ceMax = 8; teMax = 32; }
        else if (maxMarks === 20) { ceMax = 4; teMax = 16; }
        else { ceMax = Math.round(maxMarks * 0.2); teMax = maxMarks - ceMax; }
      }

      // Obtained scores
      const ce = subject.ceScore !== undefined && subject.ceScore !== null 
        ? Number(subject.ceScore) 
        : (subject.ceMarks !== undefined && subject.ceMarks !== null ? Number(subject.ceMarks) : 0);

      let te = subject.theoryScore !== undefined && subject.theoryScore !== null 
        ? Number(subject.theoryScore) 
        : (subject.totalScore !== undefined && subject.totalScore !== null ? Math.max(0, Number(subject.totalScore) - ce) : 0);

      if (te > teMax) {
        te = teMax;
      }

      const totalObtained = ce + te;

      totalCEMax += ceMax;
      totalTEMax += teMax;
      totalCE += ce;
      totalTE += te;

      // TE Grade excluding CE
      const tePercentage = teMax > 0 ? (te / teMax) * 100 : 0;
      const teGrade = getGrade(tePercentage);

      return {
        name: subject.subjectName,
        ceMax: ceMax,
        teMax: teMax,
        ceMarks: ce,
        teMarks: te,
        total: totalObtained,
        grade: teGrade
      };
    });
  }
  
  // Calculate overall percentage & overall TE grade
  const grandTotal = totalCE + totalTE;
  const grandMax = totalCEMax + totalTEMax;
  const overallPercentage = grandMax > 0 ? Math.round((grandTotal / grandMax) * 100) : 0;
  const overallTePercentage = totalTEMax > 0 ? Math.round((totalTE / totalTEMax) * 100) : 0;
  const overallGrade = getGrade(overallTePercentage);
  
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
    overallGrade: overallGrade,
    attendance: {
      totalDays: 0,
      presentDays: 0,
      percentage: 0
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
    const rawStudents = await Student.find({ 
      classId: classId,
      status: 'active'
    }).populate('classId', 'name section displayName');
    const students = sortStudents(rawStudents);

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

    const rawStudents = await Student.find({ 
      classId: classId,
      status: 'active'
    }).populate('classId', 'name section displayName');
    const students = sortStudents(rawStudents);

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

/**
 * Download Class Marks Table PDF
 * GET /api/pdf/report-card/class-marks/download/:classId/:examId?
 */
exports.downloadClassMarksTablePDF = async (req, res) => {
  try {
    let { classId, examId } = req.params;

    classId = classId?.trim();
    examId = examId?.trim();

    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid class ID format" });
    }

    const classDetails = await Class.findById(classId);
    if (!classDetails) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Reuse markController logic to get marks data
    // We mock req and res to capture the JSON response
    const mockReq = { 
      params: { classId, examId }, 
      user: req.user 
    };
    
    let marksData = null;
    let authError = null;
    
    const mockRes = {
      status: (code) => {
        return {
          json: (data) => {
            if (code >= 400) authError = { code, ...data };
            else marksData = data;
          }
        };
      },
      json: (data) => {
        marksData = data;
      }
    };

    await markController.getMarksheetsByClass(mockReq, mockRes);

    if (authError) {
      return res.status(authError.code).json({ message: authError.message || "Failed to fetch marks data" });
    }
    if (!marksData || !marksData.success) {
      return res.status(500).json({ message: "Failed to fetch marks data from controller" });
    }

    const { subjects, students, examName, className } = marksData.data;

    let academicYear = await AcademicYear.findOne({ isCurrent: true });
    const academicYearString = academicYear?.year || academicYear?.name || new Date().getFullYear().toString();

    let finalSubjects = subjects || [];
    if (finalSubjects.length > 0) {
      // Define standard subject order for Kerala syllabus
      const subjectOrder = [
        'first language', 'language i', 'language 1',
        'second language', 'language ii', 'language 2', 'malayalam', 'arabic', 'urdu', 'sanskrit',
        'english',
        'hindi',
        'social science', 'ss', 'social', 'history', 'geography',
        'physics',
        'chemistry',
        'biology',
        'science', // generic science if not split
        'mathematics', 'maths',
        'information technology', 'it', 'computer science'
      ];
      
      const sortedSubjects = [];
      
      // Iterate through our preferred order
      subjectOrder.forEach(orderName => {
        // Find ALL subjects that match this keyword and haven't been added yet
        const matchingSubjects = finalSubjects.filter(s => {
          const name = (s.displayName || s.subjectName || '').toLowerCase();
          // exact match or starts with or ends with to prevent 'social' matching 'social science' twice, 
          // but includes() is okay if we only add if not already in sortedSubjects.
          return name.includes(orderName) && !sortedSubjects.includes(s);
        });
        
        matchingSubjects.forEach(subject => {
          sortedSubjects.push(subject);
        });
      });
      
      // Add any remaining subjects
      finalSubjects.forEach(subject => {
        if (!sortedSubjects.includes(subject)) {
          sortedSubjects.push(subject);
        }
      });
      
      finalSubjects = sortedSubjects;
    }

    const finalClassName = classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`.trim();
    
    let formattedStudents = (students || []).map(student => {
      const totalObtained = student.totalMarks !== undefined ? student.totalMarks : (student.totalObtained || 0);
      const totalMax = student.totalMaxMarks !== undefined ? student.totalMaxMarks : (student.totalMax || 0);
      const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
      return {
        ...student,
        totalObtained,
        totalMax,
        percentage
      };
    });

    const rankedStudents = [...formattedStudents]
      .sort((a, b) => b.percentage - a.percentage)
      .map((s, idx) => ({ ...s, rank: idx + 1 }));

    const finalSortedStudents = sortStudents(rankedStudents);

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: finalClassName,
      examName: examName || 'Exam',
      subjects: finalSubjects,
      students: finalSortedStudents,
      totalStudents: finalSortedStudents.length
    };
    
    const pdfBuffer = await generateClassMarksTablePDF(templateData);
    
    const filename = `Class_Marks_${finalClassName.replace(/\s+/g, '_')}_${(examName || 'Exam').replace(/\s+/g, '_')}_${academicYearString}.pdf`;
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);
    
  } catch (error) {
    console.error("Class Marks Table PDF download error:", error);
    res.status(500).json({ message: error.message });
  }
};