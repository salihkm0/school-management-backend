// // controllers/marklistController.js
// const Student = require('../../models/Student');
// const AcademicYear = require('../../models/AcademicYear');
// const {Exam} = require('../../models/Exam');
// const ExamResult = require('../../models/ExamResult');
// const Mark = require('../../models/Mark');
// const { generateMarklistPDF } = require('../../services/pdf/marklistPdfService');

// // School logo URL
// const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// /**
//  * Generate PDF for Marklist of Annual Evaluation
//  * GET /api/marklist/view/:studentId/:examId?
//  */
// exports.generateMarklistPDF = async (req, res) => {
//   try {
//     let { studentId, examId } = req.params;

//     studentId = studentId?.trim();
//     examId = examId?.trim();

//     console.log(`Generating marklist for student: ${studentId}, exam: ${examId}`);

//     if (!studentId || !studentId.match(/^[0-9a-fA-F]{24}$/)) {
//       return res.status(400).json({ message: "Invalid student ID format" });
//     }

//     const student = await Student.findById(studentId).populate('classId', 'name section displayName');
    
//     if (!student) {
//       return res.status(404).json({ message: "Student not found" });
//     }

//     // Get current academic year
//     const academicYear = await AcademicYear.findOne({ isCurrent: true });
//     const academicYearString = academicYear?.year || "2025-26";

//     // Get exam (annual evaluation)
//     let exam = null;
//     if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
//       exam = await Exam.findById(examId);
//     }
    
//     if (!exam) {
//       // Find annual exam
//       exam = await Exam.findOne({
//         classIds: student.classId,
//         examType: 'annual',
//         resultsPublished: true
//       });
//     }

//     if (!exam) {
//       // Fallback to any published exam
//       exam = await Exam.findOne({
//         classIds: student.classId,
//         resultsPublished: true
//       });
//     }

//     if (!exam) {
//       return res.status(404).json({ message: "No published exam found for this student" });
//     }

//     // Get exam result
//     const result = await ExamResult.findOne({
//       studentId: studentId,
//       examId: exam._id
//     });

//     if (!result) {
//       return res.status(404).json({ message: "Exam result not found" });
//     }

//     // Get subject marks
//     const subjects = [];
    
//     for (const subjectResult of result.subjectResults || []) {
//       const markRecord = await Mark.findOne({
//         studentId: studentId,
//         examId: exam._id,
//         subjectId: subjectResult.subjectId
//       }).populate('subjectId', 'name');

//       const subjectName = markRecord?.subjectId?.name || subjectResult.subjectName || 'Subject';
//       const obtained = markRecord?.totalScore || subjectResult.obtainedMarks || 0;
//       const max = markRecord?.totalMaxMarks || subjectResult.maxMarks || 50;
//       const grade = subjectResult.grade || '-';

//       subjects.push({
//         name: subjectName,
//         obtained: obtained,
//         max: max,
//         grade: grade
//       });
//     }

//     // Sort subjects in standard order
//     const subjectOrder = [
//       'First language Part I', 'Malayalam II', 'English', 'Hindi',
//       'Social Science', 'Basic science', 'Maths', 'ICT'
//     ];

//     subjects.sort((a, b) => {
//       const aIndex = subjectOrder.findIndex(s => a.name.includes(s) || s.includes(a.name));
//       const bIndex = subjectOrder.findIndex(s => b.name.includes(s) || s.includes(b.name));
//       if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
//       if (aIndex !== -1) return -1;
//       if (bIndex !== -1) return 1;
//       return a.name.localeCompare(b.name);
//     });

//     const templateData = {
//       schoolLogo: SCHOOL_LOGO_URL,
//       academicYear: academicYearString,
//       student: {
//         name: student.fullName || 'ISHA MINNA. M',
//         class: student.classId?.displayName || `${student.className || '8'} ${student.division || 'M'} ${academicYearString}`,
//         admissionNo: student.admissionNo || '41317'
//       },
//       subjects: subjects
//     };

//     const pdfBuffer = await generateMarklistPDF(templateData);

//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader("Content-Length", pdfBuffer.length);
//     res.setHeader(
//       "Content-Disposition",
//       `inline; filename="Marklist_${student.fullName?.replace(/\s+/g, '_')}_${academicYearString}.pdf"`
//     );
//     res.setHeader("Cache-Control", "no-cache");

//     res.end(pdfBuffer);

//   } catch (error) {
//     console.error("Marklist PDF generation error:", error);
//     res.status(500).json({
//       message: "Failed to generate PDF",
//       error: error.message,
//     });
//   }
// };

// /**
//  * Download PDF for Marklist
//  * GET /api/marklist/download/:studentId/:examId?
//  */
// exports.downloadMarklistPDF = async (req, res) => {
//   try {
//     let { studentId, examId } = req.params;

//     studentId = studentId?.trim();
//     examId = examId?.trim();

//     console.log(`Downloading marklist for student: ${studentId}, exam: ${examId}`);

//     if (!studentId || !studentId.match(/^[0-9a-fA-F]{24}$/)) {
//       return res.status(400).json({ message: "Invalid student ID format" });
//     }

//     const student = await Student.findById(studentId).populate('classId', 'name section displayName');
    
//     if (!student) {
//       return res.status(404).json({ message: "Student not found" });
//     }

//     const academicYear = await AcademicYear.findOne({ isCurrent: true });
//     const academicYearString = academicYear?.year || "2025-26";

//     let exam = null;
//     if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
//       exam = await Exam.findById(examId);
//       console.log('Found exam by ID:', exam?.name);
//     }
    
//     if (!exam) {
//       // Find annual exam
//       exam = await Exam.findOne({
//         classIds: student.classId,
//         examType: 'annual',
//         resultsPublished: true
//       });
//       console.log('Found annual exam:', exam?.name);
//     }

//     if (!exam) {
//       // Fallback to any published exam
//       exam = await Exam.findOne({
//         classIds: student.classId,
//         resultsPublished: true
//       });
//       console.log('Found fallback exam:', exam?.name);
//     }

//     if (!exam) {
//       return res.status(404).json({ message: "No published exam found for this student" });
//     }

//     const result = await ExamResult.findOne({
//       studentId: studentId,
//       examId: exam._id
//     });

//     if (!result) {
//       return res.status(404).json({ message: "Exam result not found" });
//     }

//     const subjects = [];
    
//     for (const subjectResult of result.subjectResults || []) {
//       const markRecord = await Mark.findOne({
//         studentId: studentId,
//         examId: exam._id,
//         subjectId: subjectResult.subjectId
//       }).populate('subjectId', 'name');

//       const subjectName = markRecord?.subjectId?.name || subjectResult.subjectName || 'Subject';
//       const obtained = markRecord?.totalScore || subjectResult.obtainedMarks || 0;
//       const max = markRecord?.totalMaxMarks || subjectResult.maxMarks || 50;
//       const grade = subjectResult.grade || '-';

//       subjects.push({
//         name: subjectName,
//         obtained: obtained,
//         max: max,
//         grade: grade
//       });
//     }

//     const templateData = {
//       schoolLogo: SCHOOL_LOGO_URL,
//       academicYear: academicYearString,
//       student: {
//         name: student.fullName || 'ISHA MINNA. M',
//         class: student.classId?.displayName || `${student.className || '8'} ${student.division || 'M'} ${academicYearString}`,
//         admissionNo: student.admissionNo || '41317'
//       },
//       subjects: subjects
//     };

//     const pdfBuffer = await generateMarklistPDF(templateData);

//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader("Content-Length", pdfBuffer.length);
//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename="Marklist_${student.fullName?.replace(/\s+/g, '_')}_${academicYearString}.pdf"`
//     );
//     res.setHeader("Cache-Control", "no-cache");

//     res.end(pdfBuffer);

//   } catch (error) {
//     console.error("Marklist PDF download error:", error);
//     res.status(500).json({
//       message: "Failed to download PDF",
//       error: error.message,
//     });
//   }
// };



// controllers/marklistController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const { Exam } = require('../../models/Exam');
const Mark = require('../../models/Mark');
const { generateMarklistPDF } = require('../../services/pdf/marklistPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

/**
 * Generate PDF for Marklist of Annual Evaluation
 * GET /api/marklist/view/:studentId/:examId?
 */
exports.generateMarklistPDF = async (req, res) => {
  try {
    let { studentId, examId } = req.params;

    studentId = studentId?.trim();
    examId = examId?.trim();

    console.log(`Generating marklist for student: ${studentId}, exam: ${examId}`);

    if (!studentId || !studentId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid student ID format" });
    }

    const student = await Student.findById(studentId).populate('classId', 'name section displayName');
    
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Get current academic year
    const academicYear = await AcademicYear.findOne({ isCurrent: true });
    const academicYearString = academicYear?.year || "2025-26";

    // Get exam
    let exam = null;
    let marksheet = null;

    if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
      exam = await Exam.findById(examId);
      marksheet = await Mark.findOne({ studentId, examId });
      console.log('Found exam by ID:', exam?.name);
    }

    // If no exam found or no marksheet, try to find any marksheet for this student
    if (!marksheet) {
      marksheet = await Mark.findOne({ studentId }).sort({ createdAt: -1 });
      if (marksheet) {
        exam = await Exam.findById(marksheet.examId);
        console.log('Found latest marksheet for exam:', exam?.name);
      }
    }

    // If still no marksheet, return error
    if (!marksheet) {
      return res.status(404).json({ message: "No marks found for this student" });
    }

    // Get subjects from marksheet
    let subjects = [];
    
    if (marksheet.subjects && marksheet.subjects.length > 0) {
      subjects = marksheet.subjects.map(subject => ({
        name: subject.subjectName,
        obtained: subject.totalScore || 0,
        max: subject.maxMarks || 100,
        grade: subject.grade || 'F'
      }));
    }

    if (subjects.length === 0) {
      return res.status(404).json({ message: "No subject marks found for this student" });
    }

    const EXACT_SUBJECT_ORDER = [
      'Language I',
      'Malayalam II',
      'English',
      'Social Science',
      'Hindi',
      'Basic Science',
      'Physics',
      'Chemistry',
      'Biology',
      'Maths',
      'Information Technology'
    ];

    function normalizeSubjectName(rawName) {
      if (!rawName) return 'Unknown';
      const lower = rawName.toLowerCase();
      if (lower.includes('first language') || lower === 'lan' || lower === 'language' || lower.includes('language i')) return 'Language I';
      if (lower.includes('malayalam ii') || lower.includes('mal 2') || lower.includes('malayalam 2') || lower === 'mal ii') return 'Malayalam II';
      if (lower.includes('english') || lower === 'eng') return 'English';
      if (lower.includes('social') || lower.includes('soc') || lower === 'ss') return 'Social Science';
      if (lower.includes('hindi') || lower === 'hin') return 'Hindi';
      if (lower.includes('physics') || lower === 'phy') return 'Physics';
      if (lower.includes('chemistry') || lower === 'che') return 'Chemistry';
      if (lower.includes('biology') || lower === 'bio') return 'Biology';
      if (lower.includes('math') || lower === 'mathematics') return 'Maths';
      if (lower.includes('information technology') || lower.includes('ict') || lower === 'it') return 'Information Technology';
      return rawName;
    }

    // Normalize all names
    subjects.forEach(s => {
      s.name = normalizeSubjectName(s.name);
    });

    const isClass8 = student.classId?.displayName?.startsWith('8') || String(student.className || '').startsWith('8');

    if (isClass8) {
      const phy = subjects.find(s => s.name === 'Physics');
      const che = subjects.find(s => s.name === 'Chemistry');
      const bio = subjects.find(s => s.name === 'Biology');

      if (phy && che && bio) {
        const combinedMax = (phy.max || 0) + (che.max || 0) + (bio.max || 0);
        const combinedObtained = (phy.obtained || 0) + (che.obtained || 0) + (bio.obtained || 0);
        
        // Simple grade calculation
        const pct = combinedMax > 0 ? (combinedObtained / combinedMax) * 100 : 0;
        let grade = 'E';
        if (pct >= 90) grade = 'A+';
        else if (pct >= 80) grade = 'A';
        else if (pct >= 70) grade = 'B+';
        else if (pct >= 60) grade = 'B';
        else if (pct >= 50) grade = 'C+';
        else if (pct >= 40) grade = 'C';
        else if (pct >= 30) grade = 'D+';
        else if (pct >= 20) grade = 'D';

        const basicSci = {
          name: 'Basic Science',
          obtained: combinedObtained,
          max: combinedMax,
          grade: grade
        };

        // Remove individual subjects
        subjects = subjects.filter(s => s.name !== 'Physics' && s.name !== 'Chemistry' && s.name !== 'Biology');
        // Add Basic Science
        subjects.push(basicSci);
      }
    }

    // Sort subjects in standard order
    subjects.sort((a, b) => {
      const aIndex = EXACT_SUBJECT_ORDER.indexOf(a.name);
      const bIndex = EXACT_SUBJECT_ORDER.indexOf(b.name);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      student: {
        name: student.fullName,
        class: student.classId?.displayName || `${student.className || ''} ${student.division || ''}`.trim(),
        admissionNo: student.admissionNo
      },
      subjects: subjects
    };

    const pdfBuffer = await generateMarklistPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Marklist_${student.fullName?.replace(/\s+/g, '_')}_${academicYearString}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Marklist PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Marklist
 * GET /api/marklist/download/:studentId/:examId?
 */
exports.downloadMarklistPDF = async (req, res) => {
  try {
    let { studentId, examId } = req.params;

    studentId = studentId?.trim();
    examId = examId?.trim();

    console.log(`Downloading marklist for student: ${studentId}, exam: ${examId}`);

    if (!studentId || !studentId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid student ID format" });
    }

    const student = await Student.findById(studentId).populate('classId', 'name section displayName');
    
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const academicYear = await AcademicYear.findOne({ isCurrent: true });
    const academicYearString = academicYear?.year || "2025-26";

    let exam = null;
    let marksheet = null;

    if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
      exam = await Exam.findById(examId);
      marksheet = await Mark.findOne({ studentId, examId });
      console.log('Found exam by ID:', exam?.name);
    }

    if (!marksheet) {
      marksheet = await Mark.findOne({ studentId }).sort({ createdAt: -1 });
      if (marksheet) {
        exam = await Exam.findById(marksheet.examId);
        console.log('Found latest marksheet for exam:', exam?.name);
      }
    }

    if (!marksheet) {
      return res.status(404).json({ message: "No marks found for this student" });
    }

    let subjects = [];
    
    if (marksheet.subjects && marksheet.subjects.length > 0) {
      subjects = marksheet.subjects.map(subject => ({
        name: subject.subjectName,
        obtained: subject.totalScore || 0,
        max: subject.maxMarks || 100,
        grade: subject.grade || 'F'
      }));
    }

    if (subjects.length === 0) {
      return res.status(404).json({ message: "No subject marks found for this student" });
    }

    const EXACT_SUBJECT_ORDER = [
      'Language I',
      'Malayalam II',
      'English',
      'Social Science',
      'Hindi',
      'Basic Science',
      'Physics',
      'Chemistry',
      'Biology',
      'Maths',
      'Information Technology'
    ];

    function normalizeSubjectName(rawName) {
      if (!rawName) return 'Unknown';
      const lower = rawName.toLowerCase();
      if (lower.includes('first language') || lower === 'lan' || lower === 'language' || lower.includes('language i')) return 'Language I';
      if (lower.includes('malayalam ii') || lower.includes('mal 2') || lower.includes('malayalam 2') || lower === 'mal ii') return 'Malayalam II';
      if (lower.includes('english') || lower === 'eng') return 'English';
      if (lower.includes('social') || lower.includes('soc') || lower === 'ss') return 'Social Science';
      if (lower.includes('hindi') || lower === 'hin') return 'Hindi';
      if (lower.includes('physics') || lower === 'phy') return 'Physics';
      if (lower.includes('chemistry') || lower === 'che') return 'Chemistry';
      if (lower.includes('biology') || lower === 'bio') return 'Biology';
      if (lower.includes('math') || lower === 'mathematics') return 'Maths';
      if (lower.includes('information technology') || lower.includes('ict') || lower === 'it') return 'Information Technology';
      return rawName;
    }

    // Normalize all names
    subjects.forEach(s => {
      s.name = normalizeSubjectName(s.name);
    });

    // Sort subjects in standard order
    subjects.sort((a, b) => {
      const aIndex = EXACT_SUBJECT_ORDER.indexOf(a.name);
      const bIndex = EXACT_SUBJECT_ORDER.indexOf(b.name);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      student: {
        name: student.fullName,
        class: student.classId?.displayName || `${student.className || ''} ${student.division || ''}`.trim(),
        admissionNo: student.admissionNo
      },
      subjects: subjects
    };

    const pdfBuffer = await generateMarklistPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Marklist_${student.fullName?.replace(/\s+/g, '_')}_${academicYearString}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Marklist PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};