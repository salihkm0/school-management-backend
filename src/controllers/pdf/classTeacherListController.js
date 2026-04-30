// controllers/classTeacherListController.js
const Class = require('../../models/Class');
const Staff = require('../../models/Staff');
const StaffAssignment = require('../../models/StaffAssignment');
const AcademicYear = require('../../models/AcademicYear');
const { generateClassTeacherListPDF } = require('../../services/pdf/classTeacherListPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// Dummy data for testing
const DUMMY_CLASS_LIST = [
    { className: '10 A', teacherShortName: 'RK' },
    { className: '10 B', teacherShortName: 'AA' },
    { className: '10 C', teacherShortName: 'MK' },
    { className: '10 D', teacherShortName: 'PA' },
    { className: '10 E', teacherShortName: 'MC' },
    { className: '10 F', teacherShortName: 'JP' },
    { className: '10 G', teacherShortName: 'CT' },
    { className: '10 H', teacherShortName: 'AN' },
    { className: '10 I', teacherShortName: 'PS' },
    { className: '10 J', teacherShortName: 'AS' },
    { className: '9 A', teacherShortName: 'SBC' },
    { className: '9 B', teacherShortName: 'JE' },
    { className: '9 C', teacherShortName: 'ACK' },
    { className: '9 D', teacherShortName: 'SB' },
    { className: '9 E', teacherShortName: 'MSD' },
    { className: '9 F', teacherShortName: 'MPK' },
    { className: '9 G', teacherShortName: 'PKS' },
    { className: '9 H', teacherShortName: 'BS' },
    { className: '9 I', teacherShortName: 'JCT' },
    { className: '9 J', teacherShortName: 'MJN' },
    { className: '8 A', teacherShortName: 'FK' },
    { className: '8 B', teacherShortName: 'KSG' },
    { className: '8 C', teacherShortName: 'HST' },
    { className: '8 D', teacherShortName: 'ANC' },
    { className: '8 E', teacherShortName: 'NKV' },
    { className: '8 F', teacherShortName: 'SM' },
    { className: '8 G', teacherShortName: 'JCK' },
    { className: '8 H', teacherShortName: 'RE' },
    { className: '8 I', teacherShortName: 'PSN' }
];

// Generate short name from full name
function generateShortName(fullName) {
    if (!fullName) return '-';
    
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 3).toUpperCase();
    
    if (parts.length === 2) {
        return (parts[0].charAt(0) + parts[1].substring(0, 2)).toUpperCase();
    }
    
    // For 3+ parts, take first letter of each
    return parts.map(p => p.charAt(0)).join('').toUpperCase();
}

/**
 * Generate PDF for Class Teacher List
 * GET /api/class-teacher-list/view/:academicYearId?
 */
exports.generateClassTeacherListPDF = async (req, res) => {
  try {
    let { academicYearId } = req.params;
    academicYearId = academicYearId?.trim();

    console.log(`Generating class teacher list for academic year: ${academicYearId}`);

    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const academicYearString = academicYear?.year || "2024-25";
    const academicYearObjectId = academicYear?._id || null;

    let classList = [];
    let useDummyData = false;

    if (academicYearObjectId) {
      // Get all active classes for the academic year
      const classes = await Class.find({ 
        academicYearId: academicYearObjectId, 
        isActive: true 
      }).sort({ name: 1, section: 1 });

      // Get class teacher assignments from StaffAssignment
      const assignments = await StaffAssignment.find({
        academicYearId: academicYearObjectId,
        classTeacherOf: { $ne: null }
      }).populate('classTeacherOf', 'name section');

      // Build class list with teacher info
      for (const cls of classes) {
        const assignment = assignments.find(a => 
          a.classTeacherOf && a.classTeacherOf._id.toString() === cls._id.toString()
        );
        
        let teacherName = '-';
        let teacherShortName = '-';
        
        if (assignment) {
          const staff = await Staff.findById(assignment.staffId);
          if (staff) {
            teacherName = staff.name;
            teacherShortName = generateShortName(staff.name);
          }
        } else if (cls.classTeacherId) {
          const staff = await Staff.findById(cls.classTeacherId);
          if (staff) {
            teacherName = staff.name;
            teacherShortName = generateShortName(staff.name);
          }
        }

        classList.push({
          className: cls.section ? `${cls.name} ${cls.section}` : cls.name,
          teacherName: teacherName,
          teacherShortName: teacherShortName
        });
      }
    }

    if (classList.length === 0) {
      console.log('No classes found, using dummy data');
      useDummyData = true;
      classList = DUMMY_CLASS_LIST;
    }

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      classList: classList
    };

    const pdfBuffer = await generateClassTeacherListPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Class_Teacher_List_${academicYearString.replace(/\s+/g, '_')}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Class teacher list PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Class Teacher List
 * GET /api/class-teacher-list/download/:academicYearId?
 */
exports.downloadClassTeacherListPDF = async (req, res) => {
  try {
    let { academicYearId } = req.params;
    academicYearId = academicYearId?.trim();

    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const academicYearString = academicYear?.year || "2024-25";
    const academicYearObjectId = academicYear?._id || null;

    let classList = [];

    if (academicYearObjectId) {
      const classes = await Class.find({ 
        academicYearId: academicYearObjectId, 
        isActive: true 
      }).sort({ name: 1, section: 1 });

      const assignments = await StaffAssignment.find({
        academicYearId: academicYearObjectId,
        classTeacherOf: { $ne: null }
      }).populate('classTeacherOf', 'name section');

      for (const cls of classes) {
        const assignment = assignments.find(a => 
          a.classTeacherOf && a.classTeacherOf._id.toString() === cls._id.toString()
        );
        
        let teacherName = '-';
        let teacherShortName = '-';
        
        if (assignment) {
          const staff = await Staff.findById(assignment.staffId);
          if (staff) {
            teacherName = staff.name;
            teacherShortName = generateShortName(staff.name);
          }
        } else if (cls.classTeacherId) {
          const staff = await Staff.findById(cls.classTeacherId);
          if (staff) {
            teacherName = staff.name;
            teacherShortName = generateShortName(staff.name);
          }
        }

        classList.push({
          className: cls.section ? `${cls.name} ${cls.section}` : cls.name,
          teacherName: teacherName,
          teacherShortName: teacherShortName
        });
      }
    }

    if (classList.length === 0) {
      console.log('No classes found, using dummy data');
      classList = DUMMY_CLASS_LIST;
    }

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      academicYear: academicYearString,
      classList: classList
    };

    const pdfBuffer = await generateClassTeacherListPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Class_Teacher_List_${academicYearString.replace(/\s+/g, '_')}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Class teacher list PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};

/**
 * Get Class Teacher List as JSON
 * GET /api/class-teacher-list/data/:academicYearId?
 */
exports.getClassTeacherListData = async (req, res) => {
  try {
    let { academicYearId } = req.params;
    academicYearId = academicYearId?.trim();

    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const academicYearString = academicYear?.year || "2024-25";
    const academicYearObjectId = academicYear?._id || null;

    let classList = [];

    if (academicYearObjectId) {
      const classes = await Class.find({ 
        academicYearId: academicYearObjectId, 
        isActive: true 
      }).sort({ name: 1, section: 1 });

      const assignments = await StaffAssignment.find({
        academicYearId: academicYearObjectId,
        classTeacherOf: { $ne: null }
      }).populate('classTeacherOf', 'name section');

      for (const cls of classes) {
        const assignment = assignments.find(a => 
          a.classTeacherOf && a.classTeacherOf._id.toString() === cls._id.toString()
        );
        
        let teacherName = '-';
        let teacherShortName = '-';
        let teacherId = null;
        
        if (assignment) {
          const staff = await Staff.findById(assignment.staffId);
          if (staff) {
            teacherId = staff._id;
            teacherName = staff.name;
            teacherShortName = generateShortName(staff.name);
          }
        } else if (cls.classTeacherId) {
          const staff = await Staff.findById(cls.classTeacherId);
          if (staff) {
            teacherId = staff._id;
            teacherName = staff.name;
            teacherShortName = generateShortName(staff.name);
          }
        }

        classList.push({
          classId: cls._id,
          className: cls.section ? `${cls.name} ${cls.section}` : cls.name,
          teacherId: teacherId,
          teacherName: teacherName,
          teacherShortName: teacherShortName
        });
      }
    }

    if (classList.length === 0) {
      classList = DUMMY_CLASS_LIST.map((item, index) => ({
        ...item,
        classId: `dummy_${index}`,
        teacherId: null
      }));
    }

    res.json({
      success: true,
      academicYear: academicYearString,
      totalClasses: classList.length,
      classes: classList
    });

  } catch (error) {
    console.error("Error fetching class teacher list:", error);
    res.status(500).json({
      message: "Failed to fetch class teacher list",
      error: error.message,
    });
  }
};