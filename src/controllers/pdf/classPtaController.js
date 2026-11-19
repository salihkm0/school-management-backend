// controllers/classPtaController.js
const fs = require('fs');
const path = require('path');
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateClassPtaPDF } = require('../../services/pdf/classPtaPdfService');
const { sortStudents } = require('../../utils/studentSorter');

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

// Dummy data for testing
const DUMMY_STUDENTS = [
    { admissionNo: '39331', name: 'ABHISHA K', gender: 'F' },
    { admissionNo: '38662', name: 'ABISHA C M', gender: 'F' },
    { admissionNo: '39311', name: 'AMEYA V', gender: 'F' },
    { admissionNo: '38630', name: 'ANAGHA KRISHNAN A', gender: 'F' },
    { admissionNo: '38816', name: 'ANAGHA V', gender: 'F' },
    { admissionNo: '38481', name: 'ANAMIKA A', gender: 'F' },
    { admissionNo: '39271', name: 'ANANYA P', gender: 'F' },
    { admissionNo: '38539', name: 'ANIKA K P', gender: 'F' },
    { admissionNo: '38475', name: 'ANUPAMA P', gender: 'F' },
    { admissionNo: '39266', name: 'AYISHA HIBA K P', gender: 'F' }
];

/**
 * Fetch and prepare Class PTA data for single or all classes
 */
async function fetchClassPtaData(req) {
  let classId = (req.params.classId || req.query.classId || '').trim();
  let academicYearId = (req.params.academicYearId || req.query.academicYearId || '').trim();

  let isAllClasses = !classId || classId.toLowerCase() === 'all';

  // If only one param was passed (assigned to classId) and academicYearId is missing,
  // check if that ID is actually an AcademicYear ID.
  if (!isAllClasses && !academicYearId && classId.match(/^[0-9a-fA-F]{24}$/)) {
    const maybeClass = await Class.findById(classId);
    if (!maybeClass) {
      const maybeYear = await AcademicYear.findById(classId);
      if (maybeYear) {
        academicYearId = classId;
        classId = '';
        isAllClasses = true;
      }
    }
  }

  // Resolve Academic Year
  let academicYear = null;
  if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
    academicYear = await AcademicYear.findById(academicYearId);
  }
  if (!academicYear) {
    academicYear = await AcademicYear.findOne({ isCurrent: true });
  }

  const academicYearString = academicYear?.year || "2025-2026";
  const academicYearObjectId = academicYear?._id;

  const formatStudents = (rawStudents) => {
    const sorted = sortStudents(rawStudents);
    return sorted.map((student, idx) => ({
      rollNumber: student.rollNumber || student.rollNo || student.slNo || (idx + 1),
      rollNo: student.rollNumber || student.rollNo || student.slNo || (idx + 1),
      slNo: student.rollNumber || student.rollNo || student.slNo || (idx + 1),
      admissionNo: student.admissionNo || '-',
      name: student.fullName || student.name || '-',
      gender: student.gender || '-',
      parentName: student.fatherFullName || student.guardian || student.motherFullName || student.guardianName || student.parentName || ''
    }));
  };

  let classesList = [];
  let isSingleClass = false;
  let singleClassName = '10 A';

  if (!isAllClasses && classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
    // Single class requested
    isSingleClass = true;
    const classDetails = await Class.findById(classId);
    if (classDetails) {
      singleClassName = classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`.trim();
    }

    const studentQuery = {
      classId: classId,
      isActive: { $ne: false },
      status: 'active'
    };

    const rawStudents = await Student.find(studentQuery);
    let studentList = formatStudents(rawStudents);

    if (studentList.length === 0) {
      console.log('No students found for class, using dummy data');
      studentList = DUMMY_STUDENTS.map((student, idx) => ({
        rollNumber: idx + 1,
        rollNo: idx + 1,
        slNo: idx + 1,
        admissionNo: student.admissionNo || '-',
        name: student.name || '-',
        gender: student.gender || '-',
        parentName: student.parentName || ''
      }));
    }

    classesList.push({
      className: singleClassName,
      students: studentList
    });
  } else {
    // All classes requested
    let classQuery = { isActive: true };
    if (academicYearObjectId) {
      const countWithYear = await Class.countDocuments({
        academicYearId: academicYearObjectId,
        isActive: true
      });
      if (countWithYear > 0) {
        classQuery.academicYearId = academicYearObjectId;
      }
    }

    const classes = await Class.find(classQuery);

    // Natural sort: numeric standard first, then section (e.g. 5 A, 5 B, ... 10 A, 10 B)
    const sortedClasses = [...classes].sort((a, b) => {
      const numA = parseInt(a.name, 10);
      const numB = parseInt(b.name, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) return numA - numB;
      } else {
        const comp = (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
        if (comp !== 0) return comp;
      }
      return (a.section || '').localeCompare(b.section || '');
    });

    for (const cls of sortedClasses) {
      const studentQuery = {
        classId: cls._id,
        isActive: { $ne: false },
        status: 'active'
      };

      const rawStudents = await Student.find(studentQuery);
      const studentList = formatStudents(rawStudents);

      classesList.push({
        className: cls.displayName || `${cls.name} ${cls.section || ''}`.trim(),
        students: studentList
      });
    }

    // Filter to classes with active students
    const activeClassesList = classesList.filter(c => c.students.length > 0);
    if (activeClassesList.length > 0) {
      classesList = activeClassesList;
    } else if (classesList.length === 0) {
      classesList.push({
        className: '10 A',
        students: DUMMY_STUDENTS.map((student, idx) => ({
          rollNumber: idx + 1,
          rollNo: idx + 1,
          slNo: idx + 1,
          admissionNo: student.admissionNo || '-',
          name: student.name || '-',
          gender: student.gender || '-',
          parentName: student.parentName || ''
        }))
      });
    }
  }

  const templateData = {
    schoolLogoUrl: getSchoolLogoDataUri(),
    academicYear: academicYearString,
    className: classesList[0]?.className || '10 A',
    students: classesList[0]?.students || [],
    classesList: classesList
  };

  const filename = isSingleClass
    ? `Class_PTA_${singleClassName.replace(/\s+/g, '_')}_${academicYearString}.pdf`
    : `Class_PTA_All_Classes_${academicYearString}.pdf`;

  return { templateData, filename };
}

/**
 * Generate PDF for Class PTA (inline viewing)
 * GET /api/pdf/class-pta/view/:classId?/:academicYearId?
 */
exports.generateClassPtaPDF = async (req, res) => {
  try {
    const { templateData, filename } = await fetchClassPtaData(req);
    const pdfBuffer = await generateClassPtaPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${filename}"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);
  } catch (error) {
    console.error("Class PTA PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Class PTA (attachment download)
 * GET /api/pdf/class-pta/download/:classId?/:academicYearId?
 */
exports.downloadClassPtaPDF = async (req, res) => {
  try {
    const { templateData, filename } = await fetchClassPtaData(req);
    const pdfBuffer = await generateClassPtaPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);
  } catch (error) {
    console.error("Class PTA PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};
