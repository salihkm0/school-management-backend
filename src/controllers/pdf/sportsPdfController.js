// src/controllers/pdf/sportsPdfController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateSportsPDF } = require('../../services/pdf/sportsPdfService');
const { sortStudents } = require('../../utils/studentSorter');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

const determineCategory = (classObj, userCategory) => {
  if (userCategory && ['junior', 'senior'].includes(userCategory.toLowerCase())) {
    return userCategory.toLowerCase();
  }

  if (!classObj) return 'senior';

  const className = (classObj.name || '').toString().trim();
  const displayName = (classObj.displayName || '').toString().trim();
  const text = `${className} ${displayName}`;

  if (/\b8\b|VIII/i.test(text)) {
    return 'junior';
  }
  return 'senior';
};

const buildSportsData = async (req) => {
  let { classId, academicYearId } = req.params;
  const { category: queryCategory, gender: queryGender, house, date } = req.query;

  classId = classId?.trim();
  academicYearId = academicYearId?.trim();

  let classDetails = null;
  let className = 'All Classes';

  if (classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
    classDetails = await Class.findById(classId);
    if (classDetails) {
      className = classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`.trim();
    }
  }

  let academicYear = null;
  if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
    academicYear = await AcademicYear.findById(academicYearId);
  }
  if (!academicYear) {
    academicYear = await AcademicYear.findOne({ isCurrent: true });
  }

  const academicYearString = academicYear?.year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;

  // Find students
  const query = { isActive: true, status: 'active' };
  if (classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
    query.classId = classId;
  }
  if (academicYear?._id) {
    query.academicYearId = academicYear._id;
  }

  const rawStudents = await Student.find(query);
  const sortedStudents = sortStudents(rawStudents);

  const categoryType = determineCategory(classDetails, queryCategory);
  const categoryTitle = categoryType === 'junior' ? 'Junior (Class 8)' : 'Senior (Class 9 & 10)';

  const boys = sortedStudents
    .filter(s => s.gender === 'M')
    .map(s => ({
      admissionNo: s.admissionNo || '-',
      name: s.fullName || s.name || '-'
    }));

  const girls = sortedStudents
    .filter(s => s.gender === 'F')
    .map(s => ({
      admissionNo: s.admissionNo || '-',
      name: s.fullName || s.name || '-'
    }));

  const sections = [];

  const genderFilter = (queryGender || 'all').toLowerCase();

  if (genderFilter === 'all' || genderFilter === 'boys' || genderFilter === 'm') {
    sections.push({
      gender: 'M',
      genderTitle: 'Boys',
      category: categoryType,
      categoryTitle: categoryTitle,
      students: boys
    });
  }

  if (genderFilter === 'all' || genderFilter === 'girls' || genderFilter === 'f') {
    sections.push({
      gender: 'F',
      genderTitle: 'Girls',
      category: categoryType,
      categoryTitle: categoryTitle,
      students: girls
    });
  }

  // Fallback if no students
  if (sections.length === 0 || (boys.length === 0 && girls.length === 0)) {
    if (genderFilter !== 'girls' && genderFilter !== 'f') {
      sections.push({
        gender: 'M',
        genderTitle: 'Boys',
        category: categoryType,
        categoryTitle: categoryTitle,
        students: []
      });
    }
    if (genderFilter !== 'boys' && genderFilter !== 'm') {
      sections.push({
        gender: 'F',
        genderTitle: 'Girls',
        category: categoryType,
        categoryTitle: categoryTitle,
        students: []
      });
    }
  }

  return {
    schoolLogo: SCHOOL_LOGO_URL,
    schoolName: 'P.P.M.H.S.S. KOTTUKKARA',
    arabicText: 'مدرسة بي بي إم الثانوية كوتوكارا',
    academicYear: academicYearString,
    className: className,
    houseName: house || '',
    generatedDate: date || new Date().toLocaleDateString('en-IN'),
    sections: sections,
    categoryType: categoryType,
    fileNameClass: (className || 'All').replace(/[^a-zA-Z0-9_-]/g, '_')
  };
};

/**
 * Generate PDF for School Sports Meet Entry Form (inline preview)
 * GET /api/pdf/sports/view/:classId?/:academicYearId?
 */
exports.generateSportsPDF = async (req, res) => {
  try {
    const data = await buildSportsData(req);
    const pdfBuffer = await generateSportsPDF(data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Sports_Entry_Form_${data.fileNameClass}_${data.categoryType}.pdf"`
    );
    res.setHeader('Cache-Control', 'no-cache');

    res.end(pdfBuffer);
  } catch (error) {
    console.error('Sports Entry Form PDF generation error:', error);
    res.status(500).json({
      message: 'Failed to generate Sports Meet PDF',
      error: error.message
    });
  }
};

/**
 * Download PDF for School Sports Meet Entry Form
 * GET /api/pdf/sports/download/:classId?/:academicYearId?
 */
exports.downloadSportsPDF = async (req, res) => {
  try {
    const data = await buildSportsData(req);
    const pdfBuffer = await generateSportsPDF(data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Sports_Entry_Form_${data.fileNameClass}_${data.categoryType}.pdf"`
    );
    res.setHeader('Cache-Control', 'no-cache');

    res.end(pdfBuffer);
  } catch (error) {
    console.error('Sports Entry Form PDF download error:', error);
    res.status(500).json({
      message: 'Failed to download Sports Meet PDF',
      error: error.message
    });
  }
};
