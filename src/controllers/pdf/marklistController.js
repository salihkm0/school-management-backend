// controllers/pdf/marklistController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const { Exam } = require('../../models/Exam');
const Mark = require('../../models/Mark');
const { generateMarklistPDF } = require('../../services/pdf/marklistPdfService');
const { calculateGrade, calculateGradeFromPercentage } = require('../../services/gradingService');

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

/**
 * Common data builder for student marklist
 */
async function buildMarklistTemplateData(studentId, examId, mode = 'total') {
  studentId = studentId?.trim();
  examId = examId?.trim();

  if (!studentId || !studentId.match(/^[0-9a-fA-F]{24}$/)) {
    throw new Error('Invalid student ID format');
  }

  const student = await Student.findById(studentId).populate('classId', 'name section displayName');
  if (!student) {
    const err = new Error('Student not found');
    err.statusCode = 404;
    throw err;
  }

  const academicYear = await AcademicYear.findOne({ isCurrent: true });
  const academicYearString = academicYear?.year || '2025-26';

  let exam = null;
  let marksheet = null;

  if (examId && examId.match(/^[0-9a-fA-F]{24}$/)) {
    exam = await Exam.findById(examId);
    marksheet = await Mark.findOne({ studentId, examId });
  }

  if (!marksheet) {
    marksheet = await Mark.findOne({ studentId }).sort({ createdAt: -1 });
    if (marksheet && !exam) {
      exam = await Exam.findById(marksheet.examId);
    }
  }

  if (!marksheet) {
    const err = new Error('No marks found for this student');
    err.statusCode = 404;
    throw err;
  }

  if (!exam && marksheet.examId) {
    exam = await Exam.findById(marksheet.examId);
  }

  let subjects = [];

  if (marksheet.subjects && marksheet.subjects.length > 0) {
    subjects = marksheet.subjects.map(subject => {
      const examSubj = exam?.subjects?.find(es =>
        (es.subjectId && subject.subjectId && es.subjectId.toString() === subject.subjectId.toString()) ||
        (es.subjectName && subject.subjectName && es.subjectName.toLowerCase() === subject.subjectName.toLowerCase())
      );

      const totalMax = subject.maxMarks || examSubj?.maxMarks || 100;
      let teMax = examSubj?.theoryMarks || examSubj?.termMaxMarks;
      if (!teMax) {
        if (examSubj?.ceMaxMarks && totalMax) {
          teMax = totalMax - examSubj.ceMaxMarks;
        } else if (totalMax === 50) {
          teMax = 40;
        } else if (totalMax === 100) {
          teMax = 80;
        } else {
          teMax = Math.round(totalMax * 0.8);
        }
      }

      const isAbsent = Boolean(subject.isAbsent);
      const teObtained = isAbsent ? 0 : (subject.theoryScore !== undefined ? subject.theoryScore : 0);
      const ceObtained = subject.ceScore !== undefined ? subject.ceScore : (subject.ceMarks || 0);
      const totalObtained = (subject.totalScore !== undefined && subject.totalScore > 0)
        ? subject.totalScore
        : (teObtained + ceObtained);

      const teGrade = isAbsent ? 'AB' : calculateGrade(teObtained, teMax);
      const totalGrade = (isAbsent && totalObtained === 0) ? 'AB' : (subject.grade || calculateGrade(totalObtained, totalMax));

      return {
        name: normalizeSubjectName(subject.subjectName),
        isAbsent,
        teObtained,
        teMax,
        teGrade,
        ceObtained,
        obtained: totalObtained,
        max: totalMax,
        grade: totalGrade
      };
    });
  }

  if (subjects.length === 0) {
    const err = new Error('No subject marks found for this student');
    err.statusCode = 404;
    throw err;
  }

  // Class 8 Basic Science combination
  const isClass8 = student.classId?.displayName?.startsWith('8') || String(student.className || '').startsWith('8');

  if (isClass8) {
    const phy = subjects.find(s => s.name === 'Physics');
    const che = subjects.find(s => s.name === 'Chemistry');
    const bio = subjects.find(s => s.name === 'Biology');

    if (phy && che && bio) {
      const combinedTeMax = (phy.teMax || 0) + (che.teMax || 0) + (bio.teMax || 0);
      const combinedTeObtained = (phy.teObtained || 0) + (che.teObtained || 0) + (bio.teObtained || 0);
      const combinedMax = (phy.max || 0) + (che.max || 0) + (bio.max || 0);
      const combinedObtained = (phy.obtained || 0) + (che.obtained || 0) + (bio.obtained || 0);
      const combinedIsAbsent = phy.isAbsent && che.isAbsent && bio.isAbsent;

      const basicSci = {
        name: 'Basic Science',
        teObtained: combinedTeObtained,
        teMax: combinedTeMax,
        teGrade: combinedIsAbsent ? 'AB' : calculateGrade(combinedTeObtained, combinedTeMax),
        ceObtained: (phy.ceObtained || 0) + (che.ceObtained || 0) + (bio.ceObtained || 0),
        obtained: combinedObtained,
        max: combinedMax,
        grade: (combinedIsAbsent && combinedObtained === 0) ? 'AB' : calculateGrade(combinedObtained, combinedMax),
        isAbsent: combinedIsAbsent
      };

      subjects = subjects.filter(s => s.name !== 'Physics' && s.name !== 'Chemistry' && s.name !== 'Biology');
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

  // Calculate totals
  let grandTotalObtained = 0;
  let grandTotalMax = 0;
  let grandTeObtained = 0;
  let grandTeMax = 0;

  subjects.forEach(s => {
    grandTotalMax += s.max;
    grandTeMax += s.teMax;
    grandTotalObtained += (s.obtained || 0);
    if (!s.isAbsent) {
      grandTeObtained += s.teObtained;
    }
  });

  const percentage = grandTotalMax > 0 ? ((grandTotalObtained / grandTotalMax) * 100).toFixed(1) : '0.0';
  const tePercentage = grandTeMax > 0 ? ((grandTeObtained / grandTeMax) * 100).toFixed(1) : '0.0';

  const overallGrade = calculateGradeFromPercentage(Number(percentage));
  const overallTeGrade = calculateGradeFromPercentage(Number(tePercentage));

  const rawExamName = exam?.displayName || exam?.name || 'ANNUAL EVALUATION';
  
  // Clean duplicate year in examName if already present (e.g., "First term Examination (Std 10) - 2026-2027")
  const cleanExamName = rawExamName
    .replace(/\s*[-–]\s*\d{4}[-/]\d{2,4}\s*$/i, '')
    .replace(/\s*\(\s*\d{4}[-/]\d{2,4}\s*\)\s*$/i, '')
    .trim();

  const templateData = {
    schoolLogo: getSchoolLogoDataUri(),
    academicYear: academicYearString,
    cleanExamName,
    examName: rawExamName,
    mode, // 'total' | 'te' | 'both'
    student: {
      name: student.fullName,
      class: student.classId?.displayName || `${student.className || ''} ${student.division || ''}`.trim(),
      admissionNo: student.admissionNo
    },
    subjects,
    totals: {
      totalObtained: grandTotalObtained,
      totalMax: grandTotalMax,
      percentage,
      overallGrade,
      teTotalObtained: grandTeObtained,
      teTotalMax: grandTeMax,
      tePercentage,
      overallTeGrade
    }
  };

  const modeSuffix = mode === 'te' ? '_TE' : mode === 'both' ? '_Both' : '';
  const filename = `Marklist_${student.fullName?.replace(/\s+/g, '_')}_${academicYearString}${modeSuffix}.pdf`;

  return { templateData, filename };
}

/**
 * Generate PDF for Marklist of Annual Evaluation (View/Inline)
 * GET /api/marklist/view/:studentId/:examId?
 */
exports.generateMarklistPDF = async (req, res) => {
  try {
    const { studentId, examId } = req.params;
    const mode = req.query.mode || 'total';

    const { templateData, filename } = await buildMarklistTemplateData(studentId, examId, mode);
    const pdfBuffer = await generateMarklistPDF(templateData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    res.end(pdfBuffer);
  } catch (error) {
    console.error('Marklist PDF generation error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to generate PDF',
      error: error.message
    });
  }
};

/**
 * Download PDF for Marklist (Attachment)
 * GET /api/marklist/download/:studentId/:examId?
 */
exports.downloadMarklistPDF = async (req, res) => {
  try {
    const { studentId, examId } = req.params;
    const mode = req.query.mode || 'total';

    const { templateData, filename } = await buildMarklistTemplateData(studentId, examId, mode);
    const pdfBuffer = await generateMarklistPDF(templateData);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    res.end(pdfBuffer);
  } catch (error) {
    console.error('Marklist PDF download error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to download PDF',
      error: error.message
    });
  }
};