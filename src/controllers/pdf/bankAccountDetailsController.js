// controllers/bankAccountDetailsController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateBankAccountDetailsPDF } = require('../../services/pdf/bankAccountDetailsPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// Dummy data for testing
const DUMMY_STUDENTS = [
  { admissionNo: '41381', name: 'DEVANANDHA C', parentName: 'SREEJESH CHERALA', class: '8 H', gender: 'F', category: 'SC', caste: 'kanakkan', rationCard: 'NONE', accountNo: '-', ifsc: '-', bankName: '-', branch: '-' },
  { admissionNo: '41812', name: 'RISHIKA A', parentName: 'DILESH ATTUPURATH', class: '8 H', gender: 'F', category: 'SC', caste: 'MANNAN', rationCard: '44030033782', accountNo: 'SBIN0070311', ifsc: 'SBIN0070311', bankName: 'STATE BANK OF INDIA', branch: 'KONDOTTY' },
  { admissionNo: '42060', name: 'SNIKTHA O', parentName: 'VIJESHKUMAR O', class: '8 H', gender: 'F', category: 'SC', caste: 'PERUMANNAN', rationCard: '001501060000204', accountNo: 'CICOOOMCUBLN', ifsc: 'CICOOOMCUBLN', bankName: 'CANARA BANK', branch: 'PALLIKKAL BAZAR' },
  { admissionNo: '41522', name: 'SREENANDHA P', parentName: 'SHAIJU P', class: '8 H', gender: 'F', category: 'SC', caste: 'KANAKKAN', rationCard: 'NONE', accountNo: '-', ifsc: '-', bankName: '-', branch: '-' },
  { admissionNo: '41443', name: 'HARSHIN A P', parentName: 'SANJEEVA P', class: '8 H', gender: 'M', category: 'SC', caste: 'kanakkan', rationCard: 'NONE', accountNo: '-', ifsc: '-', bankName: '-', branch: '-' },
  { admissionNo: '41853', name: 'AMEYA T P', parentName: 'SUDHEEP T', class: '8 I', gender: 'F', category: 'SC', caste: 'mannan', rationCard: 'NONE', accountNo: '-', ifsc: '-', bankName: '-', branch: '-' },
  { admissionNo: '42104', name: 'ANAGHA MANU P', parentName: 'MANOJ KUMAR P', class: '8 I', gender: 'F', category: 'SC', caste: 'kanakkan', rationCard: '1697120000693', accountNo: 'CNRB0001697', ifsc: 'CNRB0001697', bankName: 'CANARA BANK', branch: 'PARAMBIL PEEDIKA' },
  { admissionNo: '42123', name: 'ANAMIKA K M', parentName: 'SUBRAHMANIAN K M', class: '8 I', gender: 'F', category: 'SC', caste: 'Kanakkan', rationCard: 'NONE', accountNo: '-', ifsc: '-', bankName: '-', branch: '-' },
  { admissionNo: '44138', name: 'DEVANANDHA C', parentName: 'SREEJESH CHERALA', class: '8 H', gender: 'F', category: 'SC', caste: 'kanakkan', rationCard: 'NONE', accountNo: '-', ifsc: '-', bankName: '-', branch: '-' },
  { admissionNo: '45181', name: 'RISHIKA A', parentName: 'DILESH ATTUPURATH', class: '8 H', gender: 'F', category: 'SC', caste: 'MANNAN', rationCard: '44030033782', accountNo: 'SBIN0070311', ifsc: 'SBIN0070311', bankName: 'STATE BANK OF INDIA', branch: 'KONDOTTY' },
  { admissionNo: '46206', name: 'SNIKTHA O', parentName: 'VIJESHKUMAR O', class: '8 H', gender: 'F', category: 'SC', caste: 'PERUMANNAN', rationCard: '001501060000204', accountNo: 'CICOOOMCUBLN', ifsc: 'CICOOOMCUBLN', bankName: 'CANARA BANK', branch: 'PALLIKKAL BAZAR' }
];

/**
 * Generate PDF for Bank Account Details
 * GET /api/bank-account-details/view/:classId?/:category?
 * Query params: ?category=SC&classId=xxx
 */
exports.generateBankAccountDetailsPDF = async (req, res) => {
  try {
    let { classId } = req.params;
    let { category } = req.query;

    classId = classId?.trim();
    category = category?.trim().toUpperCase() || 'ALL';

    console.log(`Generating bank account details for class: ${classId}, category: ${category}`);

    let classDetails = null;
    let className = 'All Classes';
    
    if (classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
      classDetails = await Class.findById(classId);
      if (classDetails) {
        className = classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`;
      }
    }

    const academicYear = await AcademicYear.findOne({ isCurrent: true });
    const academicYearString = academicYear?.year || "2025-2026";

    let students = [];
    let useDummyData = false;

    // Build query
    const query = { isActive: true };
    
    if (classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
      query.classId = classId;
    }
    
    if (category && category !== 'ALL') {
      query.category = category;
    }

    students = await Student.find(query).sort({ classId: 1, rollNumber: 1, fullName: 1 });

    if (students.length === 0) {
      console.log('No students found, using dummy data');
      useDummyData = true;
      // Filter dummy data by category if specified
      if (category && category !== 'ALL') {
        students = DUMMY_STUDENTS.filter(s => s.category === category);
      } else {
        students = DUMMY_STUDENTS;
      }
    }

    // Get category display name
    let categoryName = 'ALL';
    if (category === 'SC') categoryName = 'SC';
    else if (category === 'ST') categoryName = 'ST';
    else if (category === 'OBC') categoryName = 'OBC';
    else if (category === 'GENERAL') categoryName = 'GENERAL';
    else categoryName = 'ALL';

    console.log("students : ",students)

    const studentList = students.map(student => ({
      admissionNo: student.admissionNo || '-',
      name: student.fullName || student.name || '-',
      parentName: student.fatherFullName || student.parentName || student.guardian || '-',
      class: student.className || classDetails?.name?.charAt(0) || student.class || '-',
      gender: student.gender || '-',
      category: student.category || category,
      caste: student.casteName || student.caste || '-',
      rationCard: student.rationCard || 'NONE',
      accountNo: student.accountNumber || student.accountNo || '-',
      ifsc: student.ifscCode || student.ifsc || '-',
      bankName: student.bankName || '-',
      branch: student.branchName || student.branch || '-'
    }));

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: className,
      categoryName: categoryName,
      students: studentList
    };

    const pdfBuffer = await generateBankAccountDetailsPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Bank_Account_Details_${categoryName}_${academicYearString}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Bank account details PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Bank Account Details
 * GET /api/bank-account-details/download/:classId?/:category?
 * Query params: ?category=SC&classId=xxx
 */
exports.downloadBankAccountDetailsPDF = async (req, res) => {
  try {
    let { classId } = req.params;
    let { category } = req.query;

    classId = classId?.trim();
    category = category?.trim().toUpperCase() || 'ALL';

    let classDetails = null;
    let className = 'All Classes';
    
    if (classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
      classDetails = await Class.findById(classId);
      if (classDetails) {
        className = classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`;
      }
    }

    const academicYear = await AcademicYear.findOne({ isCurrent: true });
    const academicYearString = academicYear?.year || "2025-2026";

    let students = [];

    // Build query
    const query = { isActive: true };
    
    if (classId && classId.match(/^[0-9a-fA-F]{24}$/)) {
      query.classId = classId;
    }
    
    if (category && category !== 'ALL') {
      query.category = category;
    }

    students = await Student.find(query).sort({ classId: 1, rollNumber: 1, fullName: 1 });

    if (students.length === 0) {
      console.log('No students found, using dummy data');
      if (category && category !== 'ALL') {
        students = DUMMY_STUDENTS.filter(s => s.category === category);
      } else {
        students = DUMMY_STUDENTS;
      }
    }

    // Get category display name
    let categoryName = 'ALL';
    if (category === 'SC') categoryName = 'SC';
    else if (category === 'ST') categoryName = 'ST';
    else if (category === 'OBC') categoryName = 'OBC';
    else if (category === 'GENERAL') categoryName = 'GENERAL';
    else categoryName = 'ALL';

    console.log("students : ",students)

    const studentList = students.map(student => ({
      admissionNo: student.admissionNo || '-',
      name: student.fullName || student.name || '-',
      parentName: student.fatherFullName || student.parentName || student.guardian || '-',
      class: student.className || classDetails?.name?.charAt(0) || student.class || '-',
      gender: student.gender || '-',
      category: student.category || category,
      caste: student.casteName || student.caste || '-',
      rationCard: student.rationCard || 'NONE',
      accountNo: student.accountNumber || student.accountNo || '-',
      ifsc: student.ifscCode || student.ifsc || '-',
      bankName: student.bankName || '-',
      branch: student.branchName || student.branch || '-'
    }));

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      className: className,
      categoryName: categoryName,
      students: studentList
    };

    const pdfBuffer = await generateBankAccountDetailsPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Bank_Account_Details_${categoryName}_${academicYearString}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Bank account details PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};