// controllers/promotionListController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { Exam } = require('../../models/Exam');
const ExamResult = require('../../models/ExamResult');
const { generatePromotionListPDF } = require('../../services/pdf/promotionListPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// Dummy data for testing
const DUMMY_STUDENTS = [
    { admissionNo: '39331', name: 'ABHISHA K', marks: { 'Mal': 36, 'Eng': 29, 'Hin': 37, 'Math': 16, 'Sci': 35, 'Soc': 30, 'ICT': 23 }, total: 239, percentage: 56, grade: 'C+', rank: 1, result: 'PASS', promoted: 'YES' },
    { admissionNo: '38662', name: 'ABISHA C M', marks: { 'Mal': 42, 'Eng': 35, 'Hin': 40, 'Math': 28, 'Sci': 38, 'Soc': 35, 'ICT': 30 }, total: 248, percentage: 58, grade: 'C+', rank: 2, result: 'PASS', promoted: 'YES' },
    { admissionNo: '39311', name: 'AMEYA V', marks: { 'Mal': 38, 'Eng': 32, 'Hin': 35, 'Math': 20, 'Sci': 32, 'Soc': 28, 'ICT': 25 }, total: 210, percentage: 49, grade: 'C', rank: 3, result: 'PASS', promoted: 'YES' },
    { admissionNo: '38630', name: 'ANAGHA KRISHNAN A', marks: { 'Mal': 45, 'Eng': 40, 'Hin': 42, 'Math': 35, 'Sci': 40, 'Soc': 38, 'ICT': 32 }, total: 272, percentage: 64, grade: 'B', rank: 4, result: 'PASS', promoted: 'YES' },
    { admissionNo: '38816', name: 'ANAGHA V', marks: { 'Mal': 30, 'Eng': 25, 'Hin': 28, 'Math': 12, 'Sci': 28, 'Soc': 25, 'ICT': 18 }, total: 166, percentage: 39, grade: 'D+', rank: 5, result: 'FAIL', promoted: 'NO' }
];

/**
 * Generate PDF for Promotion List
 * GET /api/promotion-list/view/:classId?/:examId?
 */
exports.generatePromotionListPDF = async (req, res) => {
  try {
    let { classId, examId } = req.params;

    classId = classId?.trim();
    examId = examId?.trim();

    console.log(`Generating promotion list for class: ${classId}, exam: ${examId}`);

    let classDetails = null;
    let className = '';
    
    if (classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
      classDetails = await Class.findById(classId);
      if (classDetails) {
        className = classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`;
      }
    }

    const academicYear = await AcademicYear.findOne({ isCurrent: true });
    const academicYearString = academicYear?.year || "2025-2026";

    let exam = null;
    if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
      exam = await Exam.findById(examId);
    }
    
    if (!exam) {
      exam = await Exam.findOne({
        classIds: classId,
        resultsPublished: true
      }).sort({ createdAt: -1 });
    }

    const examName = exam?.name || exam?.displayName || 'Annual Examination';

    let students = [];
    let useDummyData = false;

    if (classId && exam) {
      const results = await ExamResult.find({
        classId: classId,
        examId: exam._id,
        isPublished: true
      }).sort({ rank: 1 });

      students = results.map(result => {
        const marks = {};
        (result.subjectResults || []).forEach(sr => {
          const subjectCode = sr.subjectCode || sr.subjectName?.substring(0, 3) || 'Sub';
          marks[subjectCode] = sr.obtainedMarks || 0;
        });

        const isPass = (result.percentage || 0) >= 33;
        const isPromoted = isPass;

        return {
          admissionNo: result.rollNumber || '-',
          name: result.studentName || '-',
          marks: marks,
          total: result.totalMarks || 0,
          percentage: result.percentage?.toFixed(0) || 0,
          grade: result.grade || '-',
          rank: result.rank || '-',
          result: isPass ? 'PASS' : 'FAIL',
          promoted: isPromoted ? 'YES' : 'NO'
        };
      });
    }

    if (students.length === 0) {
      console.log('No students found, using dummy data');
      useDummyData = true;
      students = DUMMY_STUDENTS;
    }

    // Get subject names from first student
    const subjectNames = students.length > 0 ? Object.keys(students[0].marks) : ['Mal', 'Eng', 'Hin', 'Math', 'Sci', 'Soc', 'ICT'];

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      examName: examName,
      className: className,
      subjects: subjectNames,
      students: students
    };

    const pdfBuffer = await generatePromotionListPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Promotion_List_${className}_${academicYearString}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Promotion list PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Promotion List
 * GET /api/promotion-list/download/:classId?/:examId?
 */
exports.downloadPromotionListPDF = async (req, res) => {
  try {
    let { classId, examId } = req.params;

    classId = classId?.trim();
    examId = examId?.trim();

    let classDetails = null;
    let className = '';
    
    if (classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
      classDetails = await Class.findById(classId);
      if (classDetails) {
        className = classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`;
      }
    }

    const academicYear = await AcademicYear.findOne({ isCurrent: true });
    const academicYearString = academicYear?.year || "2025-2026";

    let exam = null;
    if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
      exam = await Exam.findById(examId);
    }
    
    if (!exam) {
      exam = await Exam.findOne({
        classIds: classId,
        resultsPublished: true
      }).sort({ createdAt: -1 });
    }

    const examName = exam?.name || exam?.displayName || 'Annual Examination';

    let students = [];

    if (classId && exam) {
      const results = await ExamResult.find({
        classId: classId,
        examId: exam._id,
        isPublished: true
      }).sort({ rank: 1 });

      students = results.map(result => {
        const marks = {};
        (result.subjectResults || []).forEach(sr => {
          const subjectCode = sr.subjectCode || sr.subjectName?.substring(0, 3) || 'Sub';
          marks[subjectCode] = sr.obtainedMarks || 0;
        });

        const isPass = (result.percentage || 0) >= 33;
        const isPromoted = isPass;

        return {
          admissionNo: result.rollNumber || '-',
          name: result.studentName || '-',
          marks: marks,
          total: result.totalMarks || 0,
          percentage: result.percentage?.toFixed(0) || 0,
          grade: result.grade || '-',
          rank: result.rank || '-',
          result: isPass ? 'PASS' : 'FAIL',
          promoted: isPromoted ? 'YES' : 'NO'
        };
      });
    }

    if (students.length === 0) {
      students = DUMMY_STUDENTS;
    }

    const subjectNames = students.length > 0 ? Object.keys(students[0].marks) : ['Mal', 'Eng', 'Hin', 'Math', 'Sci', 'Soc', 'ICT'];

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      examName: examName,
      className: className,
      subjects: subjectNames,
      students: students
    };

    const pdfBuffer = await generatePromotionListPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Promotion_List_${className}_${academicYearString}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Promotion list PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};