// controllers/statisticalDataController.js
const Student = require('../../models/Student');
const AcademicYear = require('../../models/AcademicYear');
const Class = require('../../models/Class');
const { generateStatisticalDataPDF } = require('../../services/pdf/statisticalDataPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

/**
 * Generate PDF for Statistical Data
 * GET /api/statistical-data/pdf/:classId/:academicYearId?
 */
exports.generateStatisticalDataPDF = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();
    academicYearId = academicYearId?.trim();

    console.log(`Generating statistical data for class: ${classId}`);

    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid class ID format" });
    }

    const classDetails = await Class.findById(classId);
    if (!classDetails) {
      return res.status(404).json({ message: "Class not found" });
    }

    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const academicYearString = academicYear?.year || "2025-2026";

    const students = await Student.find({ 
      classId: classId,
      isActive: true 
    }).sort({ rollNumber: 1, fullName: 1 });

    console.log(`Found ${students.length} students`);

    const studentList = students.map(student => {
      // Format date of birth
      let dobFormatted = '-';
      if (student.dateOfBirth) {
        const dob = new Date(student.dateOfBirth);
        dobFormatted = `${dob.getDate().toString().padStart(2, '0')}/${(dob.getMonth() + 1).toString().padStart(2, '0')}/${dob.getFullYear()}`;
      }

      // Build address string
      const addressParts = [];
      if (student.houseName) addressParts.push(student.houseName);
      if (student.streetName) addressParts.push(student.streetName);
      if (student.postOffice) addressParts.push(student.postOffice);
      const address = addressParts.length > 0 ? addressParts.join(', ') : '';

      // Determine APL/BPL
      const aplBpl = student.apl ? 'APL' : 'BPL';

      // Get UID (eid)
      const uid = student.eid || '';

      // Parent name (father preferred, fallback to guardian)
      const parentName = student.fatherFullName || student.guardian || '';

      return {
        admissionNo: student.admissionNo || '-',
        name: student.fullName || '-',
        uid: uid,
        gender: student.gender === 'M' ? 'M' : (student.gender === 'F' ? 'F' : 'O'),
        dob: dobFormatted,
        parentName: parentName,
        address: address,
        religion: student.religion || '-',
        caste: student.casteName || '-',
        category: student.category || '-',
        aplBpl: aplBpl,
        motherName: student.motherFullName || '-',
        phone: student.phoneNumber || '-'
      };
    });

    const templateData = {
      schoolLogo: SCHOOL_LOGO_URL,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      academicYear: academicYearString,
      schoolName: 'P.P.M.H.S.S. KOTTUKKARA',
      schoolAddress: 'Kottukkara, Kondotty, Malappuram, Kerala - 673638',
      students: studentList
    };

    const pdfBuffer = await generateStatisticalDataPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Statistical_Data_${classDetails.name}_${academicYearString.replace(/\s+/g, "_")}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.length,
      "Content-Disposition": `inline; filename="Statistical_Data_${classDetails.name}.pdf"`,
    });

    console.log('PDF buffer size:', pdfBuffer?.length);

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Statistical data PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Get Statistical Data as JSON
 * GET /api/statistical-data/list/:classId/:academicYearId?
 */
exports.getStatisticalData = async (req, res) => {
  try {
    let { classId, academicYearId } = req.params;

    classId = classId?.trim();

    if (!classId || !classId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid class ID format" });
    }

    const classDetails = await Class.findById(classId);
    if (!classDetails) {
      return res.status(404).json({ message: "Class not found" });
    }

    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const academicYearString = academicYear?.year || "2025-2026";

    const students = await Student.find({ 
      classId: classId,
      isActive: true 
    }).sort({ rollNumber: 1, fullName: 1 });

    const studentList = students.map(student => {
      let dobFormatted = '-';
      if (student.dateOfBirth) {
        const dob = new Date(student.dateOfBirth);
        dobFormatted = `${dob.getDate().toString().padStart(2, '0')}/${(dob.getMonth() + 1).toString().padStart(2, '0')}/${dob.getFullYear()}`;
      }

      const addressParts = [];
      if (student.houseName) addressParts.push(student.houseName);
      if (student.streetName) addressParts.push(student.streetName);
      if (student.postOffice) addressParts.push(student.postOffice);
      const address = addressParts.length > 0 ? addressParts.join(', ') : '';

      return {
        admissionNo: student.admissionNo,
        name: student.fullName,
        uid: student.eid || '',
        gender: student.gender,
        dob: dobFormatted,
        parentName: student.fatherFullName || student.guardian || '',
        address: address,
        religion: student.religion,
        caste: student.casteName,
        category: student.category,
        aplBpl: student.apl ? 'APL' : 'BPL',
        motherName: student.motherFullName,
        phone: student.phoneNumber
      };
    });

    // Calculate summary statistics
    const summary = {
      total: studentList.length,
      male: studentList.filter(s => s.gender === 'M').length,
      female: studentList.filter(s => s.gender === 'F').length,
      general: studentList.filter(s => s.category === 'General').length,
      obc: studentList.filter(s => s.category === 'OBC').length,
      sc: studentList.filter(s => s.category === 'SC').length,
      st: studentList.filter(s => s.category === 'ST').length,
      apl: studentList.filter(s => s.aplBpl === 'APL').length,
      bpl: studentList.filter(s => s.aplBpl === 'BPL').length
    };

    res.json({
      success: true,
      className: classDetails.displayName || `${classDetails.name} ${classDetails.section || ''}`,
      academicYear: academicYearString,
      summary: summary,
      totalStudents: studentList.length,
      students: studentList
    });

  } catch (error) {
    console.error("Error fetching statistical data:", error);
    res.status(500).json({
      message: "Failed to fetch statistical data",
      error: error.message,
    });
  }
};