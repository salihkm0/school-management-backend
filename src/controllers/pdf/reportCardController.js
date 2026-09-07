// controllers/reportCardController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { Exam } = require('../../models/Exam');
const Mark = require('../../models/Mark');
const Staff = require('../../models/Staff');
const { Attendance, AttendanceTemplate } = require('../../models/Attendance');
const { generateReportCardPDF, generateMultiReportCardPDF, generateClassMarksTablePDF, generateClassReportCardsPDF } = require('../../services/pdf/reportCardService');
const { sortStudents } = require('../../utils/studentSorter');
const markController = require('../markController');
const ExcelJS = require('exceljs');

const fs = require('fs');
const path = require('path');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

let cachedLogoBase64 = null;
function getSchoolLogoDataUri() {
  if (cachedLogoBase64) return cachedLogoBase64;
  try {
    const localLogoPath = path.join(__dirname, '../../../public/school-logo.jpg');
    if (fs.existsSync(localLogoPath)) {
      const buf = fs.readFileSync(localLogoPath);
      cachedLogoBase64 = `data:image/jpeg;base64,${buf.toString('base64')}`;
      return cachedLogoBase64;
    }
  } catch (e) {
    console.error('Error loading local logo:', e);
  }
  return SCHOOL_LOGO_URL;
}

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
const prepareStudentReportData = async (student, examId, academicYear, options = {}) => {
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

      // Determine CE Max and TE Max from Exam config (respecting ceEnabled)
      let ceMax = 0;
      let teMax = maxMarks;

      if (examSubConfig) {
        if (examSubConfig.ceEnabled && Number(examSubConfig.ceMaxMarks || 0) > 0) {
          ceMax = Number(examSubConfig.ceMaxMarks);
          teMax = examSubConfig.theoryMarks ? Number(examSubConfig.theoryMarks) : (maxMarks - ceMax);
        } else {
          ceMax = 0;
          teMax = maxMarks;
        }
      } else if (subject.ceMaxMarks && Number(subject.ceMaxMarks) > 0) {
        ceMax = Number(subject.ceMaxMarks);
        teMax = subject.theoryMarks ? Number(subject.theoryMarks) : (maxMarks - ceMax);
      } else {
        ceMax = 0;
        teMax = maxMarks;
      }

      // Obtained scores
      const ce = subject.ceScore !== undefined && subject.ceScore !== null 
        ? Number(subject.ceScore) 
        : (subject.ceMarks !== undefined && subject.ceMarks !== null ? Number(subject.ceMarks) : 0);

      let te = subject.theoryScore !== undefined && subject.theoryScore !== null 
        ? Number(subject.theoryScore) 
        : (subject.theoryMarks !== undefined && subject.theoryMarks !== null 
            ? Number(subject.theoryMarks) 
            : (subject.totalScore !== undefined && subject.totalScore !== null ? Number(subject.totalScore) - ce : 0));

      const totalObtained = ce + te;

      totalCEMax += ceMax;
      totalTEMax += teMax;
      totalCE += ce;
      totalTE += te;

      // TE Grade excluding CE marks & Warning check (< 30%)
      const tePercentage = teMax > 0 ? (te / teMax) * 100 : 0;
      const teGrade = getGrade(tePercentage);
      const isTeWarning = teMax > 0 && tePercentage < 30;

      // Total Grade (CE + TE)
      const subjectTotalMax = ceMax + teMax;
      const totalPercentage = subjectTotalMax > 0 ? (totalObtained / subjectTotalMax) * 100 : 0;
      const totalGrade = getGrade(totalPercentage);

      return {
        name: subject.subjectName,
        ceMax: ceMax,
        teMax: teMax,
        ceMarks: ce,
        teMarks: te,
        total: totalObtained,
        teGrade: teGrade,
        totalGrade: totalGrade,
        grade: totalGrade,
        isTeWarning: isTeWarning
      };
    });
  }
  
  // Combine Physics, Chemistry, Biology into BASIC SCIENCE for 8th Standard
  const studentClassName = (student.classId?.displayName || student.classId?.name || student.className || student.class || '').toString().toLowerCase();
  const isClass8 = studentClassName.includes('8') || studentClassName.includes('viii');

  if (isClass8 && subjects && subjects.length > 0) {
    const scienceKeywords = ['physics', 'chemistry', 'biology', 'phy', 'che', 'bio'];
    
    // Identify physics, chemistry, biology sub-subjects
    const scienceItems = subjects.filter(s => {
      const sName = (s.name || '').toLowerCase().trim();
      return scienceKeywords.some(kw => sName === kw || sName.includes('physics') || sName.includes('chemistry') || sName.includes('biology'));
    });

    if (scienceItems.length > 0) {
      let combinedCeMax = 0;
      let combinedTeMax = 0;
      let combinedCe = 0;
      let combinedTe = 0;
      let combinedTotal = 0;

      scienceItems.forEach(item => {
        combinedCeMax += item.ceMax || 0;
        combinedTeMax += item.teMax || 0;
        combinedCe += item.ceMarks || 0;
        combinedTe += item.teMarks || 0;
        combinedTotal += item.total || 0;
      });

      const combinedTePercentage = combinedTeMax > 0 ? (combinedTe / combinedTeMax) * 100 : 0;
      const combinedTeGrade = getGrade(combinedTePercentage);
      const combinedIsTeWarning = combinedTeMax > 0 && combinedTePercentage < 30;

      const combinedTotalMax = combinedCeMax + combinedTeMax;
      const combinedTotalPercentage = combinedTotalMax > 0 ? (combinedTotal / combinedTotalMax) * 100 : 0;
      const combinedTotalGrade = getGrade(combinedTotalPercentage);

      const basicScienceSubject = {
        name: 'BASIC SCIENCE',
        ceMax: combinedCeMax,
        teMax: combinedTeMax,
        ceMarks: combinedCe,
        teMarks: combinedTe,
        total: combinedTotal,
        teGrade: combinedTeGrade,
        totalGrade: combinedTotalGrade,
        grade: combinedTotalGrade,
        isTeWarning: combinedIsTeWarning
      };

      // Replace science items with single BASIC SCIENCE subject at first occurrence
      const firstSciIndex = subjects.findIndex(s => scienceItems.includes(s));
      const filteredSubjects = subjects.filter(s => !scienceItems.includes(s));
      filteredSubjects.splice(firstSciIndex >= 0 ? firstSciIndex : 0, 0, basicScienceSubject);
      subjects = filteredSubjects;
    }
  }
  
  // Calculate overall percentage & overall TE and Total grades
  const grandTotal = totalCE + totalTE;
  const grandMax = totalCEMax + totalTEMax;
  const overallPercentage = grandMax > 0 ? Math.round((grandTotal / grandMax) * 100) : 0;
  const overallTePercentage = totalTEMax > 0 ? Math.round((totalTE / totalTEMax) * 100) : 0;
  const overallTeGrade = getGrade(overallTePercentage);
  const overallTotalGrade = getGrade(overallPercentage);
  const overallGrade = overallTotalGrade;

  // ── Calculate Real Attendance for Exam Months ────────────────
  let attendanceInfo = {
    totalDays: 0,
    presentDays: 0,
    absentDays: 0,
    percentage: 0,
    monthsLabel: ''
  };

  try {
    let monthYearList = [];

    const customStart = options?.attendanceStartDate;
    const customEnd = options?.attendanceEndDate;

    if (customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd);

      let curr = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);

      while (curr <= last) {
        monthYearList.push({
          month: curr.getMonth() + 1,
          year: curr.getFullYear()
        });
        curr.setMonth(curr.getMonth() + 1);
      }
    } else if (examObj && examObj.startDate && examObj.endDate) {
      const start = new Date(examObj.startDate);
      const end = new Date(examObj.endDate);

      let curr = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);

      while (curr <= last) {
        monthYearList.push({
          month: curr.getMonth() + 1,
          year: curr.getFullYear()
        });
        curr.setMonth(curr.getMonth() + 1);
      }
    }

    if (monthYearList.length === 0) {
      const currentYearNum = new Date().getFullYear();
      const currentMonthNum = new Date().getMonth() + 1;

      if (currentMonthNum >= 6) {
        for (let m = 6; m <= currentMonthNum; m++) {
          monthYearList.push({ month: m, year: currentYearNum });
        }
      } else {
        for (let m = 6; m <= 12; m++) {
          monthYearList.push({ month: m, year: currentYearNum - 1 });
        }
        for (let m = 1; m <= currentMonthNum; m++) {
          monthYearList.push({ month: m, year: currentYearNum });
        }
      }
    }

    let totalWorkingDaysOverall = 0;
    let totalPresentDaysOverall = 0;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const activeMonths = [];

    const studentClassId = student.classId?._id || student.classId;

    for (const item of monthYearList) {
      const { month, year } = item;

      // 1. Get working days from AttendanceTemplate for this month
      const template = await AttendanceTemplate.findOne({
        academicYearId: academicYear._id,
        year: year,
        month: month,
        $or: [{ classId: studentClassId }, { classId: null }],
        isActive: true
      }).sort({ classId: -1 });

      let mWorkingDays = template?.totalWorkingDays;

      // Fallback: Check if any attendance record has working days for this class/month
      if (!mWorkingDays) {
        const sampleAtt = await Attendance.findOne({
          classId: studentClassId,
          year: year,
          month: month
        });
        mWorkingDays = sampleAtt?.totalWorkingDays || 25;
      }

      // 2. Get student's present days for this month
      const attRecord = await Attendance.findOne({
        studentId: student._id,
        year: year,
        month: month
      });

      let mPresentDays = 0;
      if (attRecord) {
        mPresentDays = attRecord.presentDays ?? (mWorkingDays - (attRecord.absentDays || 0));
      } else {
        mPresentDays = 0;
      }

      totalWorkingDaysOverall += mWorkingDays;
      totalPresentDaysOverall += mPresentDays;
      activeMonths.push(`${monthNames[month - 1]} ${year}`);
    }

    const attendancePct = totalWorkingDaysOverall > 0 
      ? Math.round((totalPresentDaysOverall / totalWorkingDaysOverall) * 1000) / 10 
      : 0;

    const monthsLabel = activeMonths.length > 1 
      ? `${activeMonths[0]} - ${activeMonths[activeMonths.length - 1]}`
      : activeMonths[0] || '';

    attendanceInfo = {
      totalDays: totalWorkingDaysOverall,
      presentDays: totalPresentDaysOverall,
      absentDays: Math.max(0, totalWorkingDaysOverall - totalPresentDaysOverall),
      percentage: attendancePct,
      monthsLabel: monthsLabel
    };
  } catch (attErr) {
    console.error('Error calculating student exam attendance:', attErr);
  }
  
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
    overallTeGrade,
    overallTotalGrade,
    overallGrade: overallGrade,
    attendance: attendanceInfo
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

    const options = {
      attendanceStartDate: req.query.attendanceStartDate,
      attendanceEndDate: req.query.attendanceEndDate
    };

    const reportData = await prepareStudentReportData(student, examId, academicYear, options);
    
    const templateData = {
      schoolLogo: getSchoolLogoDataUri(),
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

    const options = {
      attendanceStartDate: req.query.attendanceStartDate,
      attendanceEndDate: req.query.attendanceEndDate
    };

    const reportData = await prepareStudentReportData(student, examId, academicYear, options);
    
    const templateData = {
      schoolLogo: getSchoolLogoDataUri(),
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
    const options = {
      attendanceStartDate: req.query.attendanceStartDate,
      attendanceEndDate: req.query.attendanceEndDate
    };

    for (const student of students) {
      const reportData = await prepareStudentReportData(student, examId, academicYear, options);
      allReportsData.push(reportData);
    }

    const templateData = {
      schoolLogo: getSchoolLogoDataUri(),
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
    const options = {
      attendanceStartDate: req.query.attendanceStartDate,
      attendanceEndDate: req.query.attendanceEndDate
    };

    for (const student of students) {
      const reportData = await prepareStudentReportData(student, examId, academicYear, options);
      allReportsData.push(reportData);
    }

    const templateData = {
      schoolLogo: getSchoolLogoDataUri(),
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
      params: { examId, classId }, 
      user: req.user,
      query: req.query || {}
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

    const mode = (req.query.mode || req.query.view || 'total').toLowerCase();

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

    finalSubjects = finalSubjects.map(s => {
      let teMax = s.termMaxMarks || s.theoryMaxMarks;
      if (!teMax || teMax <= 0) {
        if (s.ceMaxMarks && s.maxMarks && s.maxMarks > s.ceMaxMarks) {
          teMax = s.maxMarks - s.ceMaxMarks;
        } else {
          teMax = s.maxMarks || 100;
        }
      }
      const ceMax = s.ceMaxMarks || 0;
      const totalMax = s.maxMarks || (teMax + ceMax);
      return {
        ...s,
        teMax,
        ceMax,
        totalMax
      };
    });

    const finalClassName = classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`.trim();
    
    let formattedStudents = (students || []).map(student => {
      let teTotalObtained = 0;
      let teTotalMax = 0;
      let grandTotal = 0;
      let grandTotalMax = 0;

      const studentSubjects = (student.subjects || student.subjectMarks || []).map(sm => {
        const subjConfig = finalSubjects.find(s => 
          (sm.examSubjectId && s.examSubjectId && sm.examSubjectId.toString() === s.examSubjectId.toString()) ||
          (sm.subjectId && s.subjectId && sm.subjectId.toString() === s.subjectId.toString())
        );

        const teMax = sm.termMaxMarks || sm.theoryMaxMarks || subjConfig?.teMax || 80;
        const totalMax = sm.maxMarks || subjConfig?.totalMax || 100;
        const isAbsent = Boolean(sm.isAbsent);
        const teMarks = isAbsent ? 0 : (sm.theoryScore !== undefined ? sm.theoryScore : 0);
        const ceMarks = sm.ceMarks !== undefined ? sm.ceMarks : (sm.ceScore || 0);
        const totalMarks = (sm.totalScore !== undefined && sm.totalScore > 0) ? sm.totalScore : (teMarks + ceMarks);

        const tePercentage = teMax > 0 ? (teMarks / teMax) * 100 : 0;
        const totalPercentage = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0;

        const teGrade = isAbsent ? 'AB' : getGrade(tePercentage);
        const totalGrade = (isAbsent && totalMarks === 0) ? 'AB' : getGrade(totalPercentage);

        const isEntered = Boolean(
          isAbsent ||
          sm.isEnteredExplicitly ||
          (sm.isEntered && (
            (sm.theoryScore != null && Number(sm.theoryScore) > 0) ||
            (sm.ceScore != null && Number(sm.ceScore) > 0) ||
            (sm.ceMarks != null && Number(sm.ceMarks) > 0) ||
            isAbsent ||
            sm.isEnteredExplicitly
          )) ||
          (sm.theoryScore != null && Number(sm.theoryScore) > 0) ||
          (sm.ceScore != null && Number(sm.ceScore) > 0) ||
          (sm.ceMarks != null && Number(sm.ceMarks) > 0)
        );

        if (isEntered || (isAbsent && ceMarks > 0)) {
          teTotalObtained += teMarks;
          teTotalMax += teMax;
          grandTotal += totalMarks;
          grandTotalMax += totalMax;
        }

        return {
          ...sm,
          teMarks,
          teMax,
          ceMarks,
          totalMarks,
          totalMax,
          teGrade,
          totalGrade,
          isEntered
        };
      });

      const percentage = grandTotalMax > 0 ? (grandTotal / grandTotalMax) * 100 : (student.percentage || 0);
      const tePercentage = teTotalMax > 0 ? (teTotalObtained / teTotalMax) * 100 : 0;
      const overallGrade = getGrade(percentage);
      const teGrade = getGrade(tePercentage);

      return {
        ...student,
        subjects: studentSubjects,
        totalObtained: grandTotal,
        totalMax: grandTotalMax,
        percentage,
        grade: overallGrade,
        teTotalObtained,
        teTotalMax,
        tePercentage,
        teGrade
      };
    });

    const sortBy = (req.query.sortBy || req.query.sort || 'rollNo').toLowerCase();

    const rankedStudents = [...formattedStudents]
      .sort((a, b) => {
        if (mode === 'te') {
          return b.tePercentage - a.tePercentage;
        }
        return b.percentage - a.percentage;
      })
      .map((s, idx) => ({ ...s, rank: idx + 1 }));

    let finalSortedStudents;
    if (sortBy === 'rank') {
      finalSortedStudents = [...rankedStudents].sort((a, b) => (a.rank || 0) - (b.rank || 0));
    } else if (sortBy === 'percentage') {
      finalSortedStudents = [...rankedStudents].sort((a, b) => {
        if (mode === 'te') return (b.tePercentage || 0) - (a.tePercentage || 0);
        return (b.percentage || 0) - (a.percentage || 0);
      });
    } else if (sortBy === 'name') {
      finalSortedStudents = [...rankedStudents].sort((a, b) => {
        const nameA = a.name || a.studentName || a.fullName || '';
        const nameB = b.name || b.studentName || b.fullName || '';
        return nameA.localeCompare(nameB);
      });
    } else {
      finalSortedStudents = sortStudents(rankedStudents);
    }

    const cleanExamName = (examName || 'Exam')
      .replace(/\s*[-–]\s*\d{4}[-/]\d{2,4}\s*$/i, '')
      .replace(/\s*\(\s*\d{4}[-/]\d{2,4}\s*\)\s*$/i, '')
      .trim();

    const templateData = {
      schoolLogo: getSchoolLogoDataUri(),
      academicYear: academicYearString,
      className: finalClassName,
      examName: cleanExamName || examName || 'Exam',
      mode: mode,
      sortBy: sortBy,
      subjects: finalSubjects,
      students: finalSortedStudents,
      totalStudents: finalSortedStudents.length
    };
    
    const pdfBuffer = await generateClassMarksTablePDF(templateData);
    
    const modePrefix = mode === 'te' ? 'TE_' : (mode === 'both' ? 'Both_' : 'Total_');
    const filename = `Class_Marks_${modePrefix}${finalClassName.replace(/\s+/g, '_')}_${(examName || 'Exam').replace(/\s+/g, '_')}_${academicYearString}.pdf`;
    
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

exports.downloadClassMarksTableExcel = async (req, res) => {
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

    const mockReq = { 
      params: { examId, classId }, 
      user: req.user,
      query: req.query || {}
    };
    let marksData = null;
    let authError = null;

    const mockRes = {
      status: (code) => ({
        json: (data) => {
          if (code >= 400) authError = { code, ...data };
          else marksData = data;
        }
      }),
      json: (data) => { marksData = data; }
    };

    await markController.getMarksheetsByClass(mockReq, mockRes);

    if (authError) {
      return res.status(authError.code).json({ message: authError.message || "Failed to fetch marks data" });
    }
    if (!marksData || !marksData.success) {
      return res.status(500).json({ message: "Failed to fetch marks data from controller" });
    }

    const mode = (req.query.mode || req.query.view || 'total').toLowerCase();
    const { subjects, students, examName } = marksData.data;
    let academicYear = await AcademicYear.findOne({ isCurrent: true });
    const academicYearString = academicYear?.year || academicYear?.name || new Date().getFullYear().toString();
    const finalClassName = classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`.trim();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Class Marks');

    // Calculate total columns
    const totalCols = (subjects || []).length + 7;

    // Convert column number (1-based) to letter (A, B, C... Z, AA, AB...)
    const getColLetter = (colIdx) => {
      let temp, letter = '';
      while (colIdx > 0) {
        temp = (colIdx - 1) % 26;
        letter = String.fromCharCode(65 + temp) + letter;
        colIdx = Math.floor((colIdx - temp - 1) / 26);
      }
      return letter;
    };

    const lastColLetter = getColLetter(totalCols);

    // Title Row 1: School Name
    worksheet.mergeCells(`A1:${lastColLetter}1`);
    const r1Cell = worksheet.getCell('A1');
    r1Cell.value = 'PPM HIGHER SECONDARY SCHOOL';
    r1Cell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    r1Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    r1Cell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 30;

    // Title Row 2: Address
    worksheet.mergeCells(`A2:${lastColLetter}2`);
    const r2Cell = worksheet.getCell('A2');
    r2Cell.value = 'KOTTUKKARA, KONDOTTY, MALAPPURAM, KERALA 673638';
    r2Cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    r2Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    r2Cell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(2).height = 20;

    // Title Row 3: Report Title
    worksheet.mergeCells(`A3:${lastColLetter}3`);
    const r3Cell = worksheet.getCell('A3');
    const titleSuffix = mode === 'te' ? ' (TE MARKS & GRADE)' : (mode === 'both' ? ' (TE & TE+CE MARKS & GRADE)' : ' (TE+CE TOTAL MARKS & GRADE)');
    r3Cell.value = `CLASS MARKS OVERVIEW${titleSuffix}`;
    r3Cell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    r3Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    r3Cell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(3).height = 24;

    // Title Row 4: Meta Information
    worksheet.mergeCells(`A4:${lastColLetter}4`);
    const r4Cell = worksheet.getCell('A4');
    r4Cell.value = `Class: ${finalClassName}   |   Exam: ${examName || 'Exam'}   |   Academic Year: ${academicYearString}   |   Total Students: ${(students || []).length}   |   Mode: ${mode.toUpperCase()}`;
    r4Cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
    r4Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    r4Cell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(4).height = 22;

    // Spacer
    worksheet.addRow([]);
    worksheet.getRow(5).height = 8;

    // Table Headers
    const headers = ['Roll No', 'Admn No', 'Student Name'];
    (subjects || []).forEach(subj => {
      const subjTitle = subj.displayName || subj.subjectName || 'Subject';
      const teMax = subj.termMaxMarks || subj.theoryMaxMarks || (subj.ceMaxMarks && subj.maxMarks ? subj.maxMarks - subj.ceMaxMarks : (subj.maxMarks || 100));
      const totalMax = subj.maxMarks || (teMax + (subj.ceMaxMarks || 0));
      if (mode === 'te') {
        headers.push(`${subjTitle} (TE /${teMax})`);
      } else if (mode === 'both') {
        headers.push(`${subjTitle} (TE:${teMax}/Tot:${totalMax})`);
      } else {
        headers.push(`${subjTitle} (/${totalMax})`);
      }
    });
    headers.push(
      mode === 'te' ? 'TE Total' : (mode === 'both' ? 'Total (TE/Tot)' : 'Total Score'),
      mode === 'te' ? 'TE %' : 'Percentage',
      mode === 'te' ? 'TE Grade' : 'Grade',
      'Rank'
    );

    const headerRow = worksheet.addRow(headers);
    worksheet.getRow(6).height = 26;
    headerRow.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF0F172A' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FF0F172A' } }
      };
    });

    // Format & rank students
    let formattedStudents = (students || []).map(student => {
      let teTotalObtained = 0;
      let teTotalMax = 0;
      let grandTotal = 0;
      let grandTotalMax = 0;

      (subjects || []).forEach(subj => {
        const key = subj.examSubjectId?.toString() || subj._id?.toString() || subj.subjectId?.toString();
        const sm = (student.subjectMarks || student.subjects || []).find(m => 
          (m.examSubjectId && m.examSubjectId.toString() === key) ||
          (m.subjectId && m.subjectId.toString() === key)
        ) || {};

        const teMax = sm.termMaxMarks || sm.theoryMaxMarks || subj.termMaxMarks || subj.theoryMaxMarks || 80;
        const totalMax = sm.maxMarks || subj.maxMarks || 100;
        const isAbsent = Boolean(sm.isAbsent);
        const teMarks = isAbsent ? 0 : (sm.theoryScore !== undefined ? sm.theoryScore : 0);
        const ceMarks = sm.ceMarks !== undefined ? sm.ceMarks : (sm.ceScore || 0);
        const totalMarks = (sm.totalScore !== undefined && sm.totalScore > 0) ? sm.totalScore : (teMarks + ceMarks);

        const isEntered = Boolean(
          isAbsent ||
          sm.isEnteredExplicitly ||
          (sm.isEntered && (
            (sm.theoryScore != null && Number(sm.theoryScore) > 0) ||
            (sm.ceScore != null && Number(sm.ceScore) > 0) ||
            (sm.ceMarks != null && Number(sm.ceMarks) > 0) ||
            isAbsent ||
            sm.isEnteredExplicitly
          )) ||
          (sm.theoryScore != null && Number(sm.theoryScore) > 0) ||
          (sm.ceScore != null && Number(sm.ceScore) > 0) ||
          (sm.ceMarks != null && Number(sm.ceMarks) > 0)
        );

        if (isEntered || (isAbsent && ceMarks > 0)) {
          teTotalObtained += teMarks;
          teTotalMax += teMax;
          grandTotal += totalMarks;
          grandTotalMax += totalMax;
        }
      });

      const percentage = grandTotalMax > 0 ? (grandTotal / grandTotalMax) * 100 : (student.percentage || 0);
      const tePercentage = teTotalMax > 0 ? (teTotalObtained / teTotalMax) * 100 : 0;
      const overallGrade = getGrade(percentage);
      const teGrade = getGrade(tePercentage);

      return {
        ...student,
        totalObtained: grandTotal,
        totalMax: grandTotalMax,
        percentage,
        grade: overallGrade,
        teTotalObtained,
        teTotalMax,
        tePercentage,
        teGrade
      };
    });

    const sortBy = (req.query.sortBy || req.query.sort || 'rollNo').toLowerCase();

    const rankedStudents = [...formattedStudents]
      .sort((a, b) => {
        if (mode === 'te') return b.tePercentage - a.tePercentage;
        return b.percentage - a.percentage;
      })
      .map((s, idx) => ({ ...s, rank: idx + 1 }));

    let finalSortedStudents;
    if (sortBy === 'rank') {
      finalSortedStudents = [...rankedStudents].sort((a, b) => (a.rank || 0) - (b.rank || 0));
    } else if (sortBy === 'percentage') {
      finalSortedStudents = [...rankedStudents].sort((a, b) => {
        if (mode === 'te') return (b.tePercentage || 0) - (a.tePercentage || 0);
        return (b.percentage || 0) - (a.percentage || 0);
      });
    } else if (sortBy === 'name') {
      finalSortedStudents = [...rankedStudents].sort((a, b) => {
        const nameA = a.name || a.studentName || a.fullName || '';
        const nameB = b.name || b.studentName || b.fullName || '';
        return nameA.localeCompare(nameB);
      });
    } else {
      finalSortedStudents = sortStudents(rankedStudents);
    }

    finalSortedStudents.forEach((st, idx) => {
      const rowData = [
        st.rollNo || st.rollNumber || (idx + 1),
        st.admissionNo || st.studentCode || '-',
        st.studentName || st.name || '-'
      ];

      (subjects || []).forEach(subj => {
        const key = subj.examSubjectId?.toString() || subj._id?.toString() || subj.subjectId?.toString();
        const sm = (st.subjectMarks || st.subjects || []).find(m => 
          (m.examSubjectId && m.examSubjectId.toString() === key) ||
          (m.subjectId && m.subjectId.toString() === key)
        ) || {};

        const teMax = sm.termMaxMarks || sm.theoryMaxMarks || subj.termMaxMarks || subj.theoryMaxMarks || 80;
        const totalMax = sm.maxMarks || subj.maxMarks || 100;
        const isAbsent = Boolean(sm.isAbsent);
        const teMarks = isAbsent ? 0 : (sm.theoryScore !== undefined ? sm.theoryScore : 0);
        const ceMarks = sm.ceMarks !== undefined ? sm.ceMarks : (sm.ceScore || 0);
        const totalMarks = (sm.totalScore !== undefined && sm.totalScore > 0) ? sm.totalScore : (teMarks + ceMarks);
        const teGrade = isAbsent ? 'AB' : getGrade(teMax > 0 ? (teMarks / teMax) * 100 : 0);
        const totalGrade = (isAbsent && totalMarks === 0) ? 'AB' : getGrade(totalMax > 0 ? (totalMarks / totalMax) * 100 : 0);

        if (isAbsent) {
          if (mode === 'te') {
            rowData.push('AB');
          } else if (mode === 'both') {
            if (totalMarks > 0) {
              rowData.push(`TE: AB | Tot: ${totalMarks} (${totalGrade})`);
            } else {
              rowData.push('AB');
            }
          } else {
            if (totalMarks > 0) {
              rowData.push(`${totalMarks} (${totalGrade})`);
            } else {
              rowData.push('AB');
            }
          }
        } else if (sm.isEntered || sm.totalScore !== undefined || sm.total !== undefined) {
          if (mode === 'te') {
            rowData.push(`${teMarks} (${teGrade})`);
          } else if (mode === 'both') {
            rowData.push(`TE: ${teMarks} (${teGrade}) | Tot: ${totalMarks} (${totalGrade})`);
          } else {
            rowData.push(`${totalMarks} (${totalGrade})`);
          }
        } else {
          rowData.push('—');
        }
      });

      if (mode === 'te') {
        rowData.push(
          `${st.teTotalObtained} / ${st.teTotalMax}`,
          `${st.tePercentage.toFixed(1)}%`,
          st.teGrade || '-',
          st.rank || '-'
        );
      } else if (mode === 'both') {
        rowData.push(
          `TE: ${st.teTotalObtained}/${st.teTotalMax} | Tot: ${st.totalObtained}/${st.totalMax}`,
          `${st.percentage.toFixed(1)}% (TE: ${st.tePercentage.toFixed(1)}%)`,
          `TE: ${st.teGrade} | Tot: ${st.grade}`,
          st.rank || '-'
        );
      } else {
        rowData.push(
          `${st.totalObtained} / ${st.totalMax}`,
          `${st.percentage.toFixed(1)}%`,
          st.grade || '-',
          st.rank || '-'
        );
      }

      const row = worksheet.addRow(rowData);
      row.height = 20;

      const isEven = idx % 2 === 0;
      const bgArgb = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      row.eachCell((cell, colNum) => {
        cell.font = { name: 'Arial', size: 9.5 };
        cell.alignment = { vertical: 'middle', horizontal: colNum === 3 ? 'left' : 'center' };
        
        // Background
        if (colNum > (subjects || []).length + 3) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
          cell.font = { name: 'Arial', size: 9.5, bold: true };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
        }

        // Absent styling
        if (cell.value === 'AB') {
          cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFDC2626' } };
        }

        // Cell border
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
      });
    });

    // Auto-fit column widths
    worksheet.columns.forEach((col, i) => {
      let maxLen = 0;
      col.eachCell({ includeEmpty: true }, (cell, rowNum) => {
        if (rowNum >= 6) {
          const len = cell.value ? cell.value.toString().length : 0;
          if (len > maxLen) maxLen = len;
        }
      });
      if (i === 2) {
        col.width = Math.max(maxLen + 4, 24);
      } else if (i === 1) {
        col.width = Math.max(maxLen + 2, 12);
      } else {
        col.width = Math.max(maxLen + 3, 11);
      }
    });

    const modePrefix = mode === 'te' ? 'TE_' : (mode === 'both' ? 'Both_' : 'Total_');
    const filename = `Class_Marks_${modePrefix}${finalClassName.replace(/\s+/g, '_')}_${(examName || 'Exam').replace(/\s+/g, '_')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  } catch (error) {
    console.error("Class Marks Excel download error:", error);
    res.status(500).json({ message: error.message });
  }
};