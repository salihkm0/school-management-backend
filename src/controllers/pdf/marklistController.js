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
const ExamResult = require('../../models/ExamResult');
const Mark = require('../../models/Mark');
const { generateMarklistPDF } = require('../../services/pdf/marklistPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// Dummy data for testing
const DUMMY_SUBJECTS = [
  { name: 'First language Part I', obtained: 36, max: 50, grade: 'B+' },
  { name: 'Malayalam II', obtained: 23, max: 50, grade: 'C' },
  { name: 'English', obtained: 29, max: 50, grade: 'C+' },
  { name: 'Hindi', obtained: 37, max: 50, grade: 'B+' },
  { name: 'Social Science', obtained: 30, max: 50, grade: 'B' },
  { name: 'Basic science', obtained: 35, max: 75, grade: 'C' },
  { name: 'Maths', obtained: 16, max: 50, grade: 'D+' },
  { name: 'ICT', obtained: 23, max: 50, grade: 'C' }
];

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

    // Get exam (annual evaluation)
    let exam = null;
    if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
      exam = await Exam.findById(examId);
      console.log('Found exam by ID:', exam?.name);
    }
    
    if (!exam) {
      // Find annual exam
      exam = await Exam.findOne({
        classIds: student.classId,
        examType: 'annual',
        resultsPublished: true
      });
      console.log('Found annual exam:', exam?.name);
    }

    if (!exam) {
      // Fallback to any published exam
      exam = await Exam.findOne({
        classIds: student.classId,
        resultsPublished: true
      });
      console.log('Found fallback exam:', exam?.name);
    }

    // Get subjects array
    let subjects = [];
    let useDummyData = false;

    if (exam) {
      // Get exam result
      const result = await ExamResult.findOne({
        studentId: studentId,
        examId: exam._id
      });

      if (result) {
        // Get subject marks from database
        for (const subjectResult of result.subjectResults || []) {
          const markRecord = await Mark.findOne({
            studentId: studentId,
            examId: exam._id,
            subjectId: subjectResult.subjectId
          }).populate('subjectId', 'name');

          const subjectName = markRecord?.subjectId?.name || subjectResult.subjectName || 'Subject';
          const obtained = markRecord?.totalScore || subjectResult.obtainedMarks || 0;
          const max = markRecord?.totalMaxMarks || subjectResult.maxMarks || 50;
          const grade = subjectResult.grade || '-';

          subjects.push({
            name: subjectName,
            obtained: obtained,
            max: max,
            grade: grade
          });
        }
      } else {
        console.log('No exam result found, using dummy data');
        useDummyData = true;
      }
    } else {
      console.log('No exam found, using dummy data');
      useDummyData = true;
    }

    // Use dummy data if no real data found
    if (useDummyData || subjects.length === 0) {
      subjects = [...DUMMY_SUBJECTS];
    }

    // Sort subjects in standard order
    const subjectOrder = [
      'First language Part I', 'Malayalam II', 'English', 'Hindi',
      'Social Science', 'Basic science', 'Maths', 'ICT'
    ];

    subjects.sort((a, b) => {
      const aIndex = subjectOrder.findIndex(s => a.name.includes(s) || s.includes(a.name));
      const bIndex = subjectOrder.findIndex(s => b.name.includes(s) || s.includes(b.name));
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      student: {
        name: student.fullName || 'ISHA MINNA. M',
        class: student.classId?.displayName || `${student.className || '8'} ${student.division || 'M'} ${academicYearString}`,
        admissionNo: student.admissionNo || '41317'
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
    if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
      exam = await Exam.findById(examId);
      console.log('Found exam by ID:', exam?.name);
    }
    
    if (!exam) {
      // Find annual exam
      exam = await Exam.findOne({
        classIds: student.classId,
        examType: 'annual',
        resultsPublished: true
      });
      console.log('Found annual exam:', exam?.name);
    }

    if (!exam) {
      // Fallback to any published exam
      exam = await Exam.findOne({
        classIds: student.classId,
        resultsPublished: true
      });
      console.log('Found fallback exam:', exam?.name);
    }

    // Get subjects array
    let subjects = [];
    let useDummyData = false;

    if (exam) {
      // Get exam result
      const result = await ExamResult.findOne({
        studentId: studentId,
        examId: exam._id
      });

      if (result) {
        // Get subject marks from database
        for (const subjectResult of result.subjectResults || []) {
          const markRecord = await Mark.findOne({
            studentId: studentId,
            examId: exam._id,
            subjectId: subjectResult.subjectId
          }).populate('subjectId', 'name');

          const subjectName = markRecord?.subjectId?.name || subjectResult.subjectName || 'Subject';
          const obtained = markRecord?.totalScore || subjectResult.obtainedMarks || 0;
          const max = markRecord?.totalMaxMarks || subjectResult.maxMarks || 50;
          const grade = subjectResult.grade || '-';

          subjects.push({
            name: subjectName,
            obtained: obtained,
            max: max,
            grade: grade
          });
        }
      } else {
        console.log('No exam result found, using dummy data');
        useDummyData = true;
      }
    } else {
      console.log('No exam found, using dummy data');
      useDummyData = true;
    }

    // Use dummy data if no real data found
    if (useDummyData || subjects.length === 0) {
      subjects = [...DUMMY_SUBJECTS];
    }

    // Sort subjects in standard order
    const subjectOrder = [
      'First language Part I', 'Malayalam II', 'English', 'Hindi',
      'Social Science', 'Basic science', 'Maths', 'ICT'
    ];

    subjects.sort((a, b) => {
      const aIndex = subjectOrder.findIndex(s => a.name.includes(s) || s.includes(a.name));
      const bIndex = subjectOrder.findIndex(s => b.name.includes(s) || s.includes(b.name));
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.name.localeCompare(b.name);
    });

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      student: {
        name: student.fullName || 'ISHA MINNA. M',
        class: student.classId?.displayName || `${student.className || '8'} ${student.division || 'M'} ${academicYearString}`,
        admissionNo: student.admissionNo || '41317'
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