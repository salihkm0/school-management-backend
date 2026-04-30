// controllers/staffListController.js
const Staff = require('../../models/Staff');
const { generateStaffListPDF } = require('../../services/pdf/staffListPdfService');

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

// Dummy data for testing
const DUMMY_STAFF = [
    { staffCode: '1', name: 'A.K. ABDU SALAM.', designation: 'H.S. A (H)', shortName: 'AKA', contact: '', isActive: true },
    { staffCode: '2', name: 'ABDUL ALI.VM', designation: 'H.S.A(Eng)', shortName: 'AVM', contact: '', isActive: true },
    { staffCode: '3', name: 'ABDUL AZEEZ. N.P.', designation: 'H.S.A(Mal)', shortName: 'ANP', contact: '', isActive: true },
    { staffCode: '4', name: 'ABDUL HAMEED NECHIYIL', designation: 'H.S.A(SS)', shortName: 'ANK', contact: '', isActive: true },
    { staffCode: '5', name: 'ABDUL KAREEM. N. K', designation: 'H.S.A(SS)', shortName: 'NKA', contact: '', isActive: true },
    { staffCode: '6', name: 'ABDUL MAJEED.N', designation: 'H.S.A(Ara)', shortName: 'NAM', contact: '', isActive: true },
    { staffCode: '7', name: 'ABDUL NASIR.K.K.', designation: 'H.S.A(Ar)', shortName: 'AN', contact: '', isActive: true },
    { staffCode: '8', name: 'ABDUL NAZER C', designation: 'H.S.A (NS)', shortName: 'ANC', contact: '', isActive: true },
    { staffCode: '9', name: 'ABDUL RAZAKH PP', designation: 'H.S.A(Hindi)', shortName: 'APP', contact: '', isActive: true },
    { staffCode: '10', name: 'ABDUL SHAREEF.M', designation: 'H.S.A(NS)', shortName: 'ASM', contact: '', isActive: true }
];

// Role to designation mapping
const roleDesignationMap = {
    'teacher': 'Teacher',
    'principal': 'Principal',
    'vice_principal': 'Vice Principal',
    'librarian': 'Librarian',
    'administrator': 'Administrator',
    'office_staff': 'Office Staff',
    'support_staff': 'Support Staff'
};

/**
 * Generate PDF for Staff List
 * GET /api/staff-list/view/:status?
 */
exports.generateStaffListPDF = async (req, res) => {
  try {
    let { status } = req.params;
    status = status?.trim() || 'all';

    console.log(`Generating staff list with status: ${status}`);

    let staffList = [];
    let useDummyData = false;

    // Build query
    const query = {};
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    staffList = await Staff.find(query).sort({ name: 1 });

    if (staffList.length === 0) {
      console.log('No staff found, using dummy data');
      useDummyData = true;
      staffList = DUMMY_STAFF;
      if (status === 'inactive') {
        staffList = staffList.map(s => ({ ...s, isActive: false }));
      }
    }

    const formattedStaffList = staffList.map(staff => ({
      staffCode: staff.staffCode || staff.staffId || '-',
      name: staff.name || '-',
      designation: staff.role ? roleDesignationMap[staff.role] || staff.role : (staff.designation || '-'),
      shortName: staff.shortName || staff.staffCode || '-',
      phone: staff.contact || staff.phone || '-',
      isActive: staff.isActive !== undefined ? staff.isActive : true
    }));

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      staffList: formattedStaffList
    };

    const pdfBuffer = await generateStaffListPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="Staff_List_${status}_${new Date().toISOString().split('T')[0]}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Staff list PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Download PDF for Staff List
 * GET /api/staff-list/download/:status?
 */
exports.downloadStaffListPDF = async (req, res) => {
  try {
    let { status } = req.params;
    status = status?.trim() || 'all';

    let staffList = [];

    const query = {};
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    staffList = await Staff.find(query).sort({ name: 1 });

    if (staffList.length === 0) {
      console.log('No staff found, using dummy data');
      staffList = DUMMY_STAFF;
      if (status === 'inactive') {
        staffList = staffList.map(s => ({ ...s, isActive: false }));
      }
    }

    const formattedStaffList = staffList.map(staff => ({
      staffCode: staff.staffCode || staff.staffId || '-',
      name: staff.name || '-',
      designation: staff.role ? roleDesignationMap[staff.role] || staff.role : (staff.designation || '-'),
      shortName: staff.shortName || staff.staffCode || '-',
      phone: staff.contact || staff.phone || '-',
      isActive: staff.isActive !== undefined ? staff.isActive : true
    }));

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      staffList: formattedStaffList
    };

    const pdfBuffer = await generateStaffListPDF(templateData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Staff_List_${status}_${new Date().toISOString().split('T')[0]}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Staff list PDF download error:", error);
    res.status(500).json({
      message: "Failed to download PDF",
      error: error.message,
    });
  }
};

/**
 * Get Staff List as JSON
 * GET /api/staff-list/data/:status?
 */
exports.getStaffListData = async (req, res) => {
  try {
    let { status } = req.params;
    status = status?.trim() || 'all';

    const query = {};
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    let staffList = await Staff.find(query).sort({ name: 1 });

    if (staffList.length === 0) {
      staffList = DUMMY_STAFF;
    }

    const formattedStaffList = staffList.map((staff, index) => ({
      slNo: index + 1,
      staffCode: staff.staffCode || staff.staffId || '-',
      name: staff.name || '-',
      designation: staff.role ? roleDesignationMap[staff.role] || staff.role : (staff.designation || '-'),
      shortName: staff.shortName || staff.staffCode || '-',
      phone: staff.contact || staff.phone || '-',
      isActive: staff.isActive !== undefined ? staff.isActive : true
    }));

    res.json({
      success: true,
      totalStaff: formattedStaffList.length,
      staff: formattedStaffList
    });

  } catch (error) {
    console.error("Error fetching staff list:", error);
    res.status(500).json({
      message: "Failed to fetch staff list",
      error: error.message,
    });
  }
};