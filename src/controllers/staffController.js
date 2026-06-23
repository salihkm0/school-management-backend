// controllers/staffController.js
const Staff = require("../models/Staff");
const StaffAssignment = require("../models/StaffAssignment");
const User = require("../models/User");
const Class = require("../models/Class");
const Subject = require("../models/Subject");
const AcademicYear = require("../models/AcademicYear");
const Notification = require("../models/Notification");
const { sendEmail } = require("../services/emailService");
const { broadcastToRole, broadcastToUser } = require("../config/socket");

// Helper to send staff notification
async function sendStaffNotification(staffId, title, message, type, data) {
  const staff = await Staff.findById(staffId).populate('userId');
  if (!staff || !staff.userId) return;
  
  const notification = await Notification.create({
    userId: staff.userId._id,
    title,
    message,
    type,
    data: { ...data, staffId, staffName: staff.name }
  });
  
  broadcastToUser(staff.userId._id.toString(), 'notification', {
    id: notification._id,
    title,
    message,
    type,
    data: notification.data,
    timestamp: notification.createdAt,
    read: false
  });
}

// ==================== STAFF (Permanent) CRUD ====================

exports.getStaff = async (req, res) => {
  try {
    const { role, isActive, page = 1, limit = 20, search } = req.query;

    const query = {};
    if (role) query.role = role;
    if (isActive !== undefined) {
      query.isActive = isActive === "true" ? { $ne: false } : false;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { staffCode: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const staff = await Staff.find(query)
      .populate("userId", "email name phone")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ name: 1 });

    const total = await Staff.countDocuments(query);

    res.json({
      success: true,
      data: staff,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getStaffMember = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id)
      .populate("userId", "email name phone photoUrl");

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    // Get current year assignment
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    let currentAssignment = null;
    if (currentYear) {
      currentAssignment = await StaffAssignment.findOne({
        staffId: staff._id,
        academicYearId: currentYear._id
      })
        .populate('classTeacherOf', 'name section displayName')
        .populate('subjectsTaught.subjectId', 'name code')
        .populate('subjectsTaught.classId', 'name section');
    }

    // Get assignment history
    const assignmentHistory = await StaffAssignment.find({ staffId: staff._id })
      .populate('academicYearId', 'year name')
      .populate('classTeacherOf', 'name section')
      .sort({ 'academicYearId.year': -1 });

    res.json({
      ...staff.toObject(),
      currentAssignment,
      assignmentHistory
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createStaff = async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      shortName,  // Add this
      phone,
      role,
      employeeType,
      qualification,
      contact,
      dateOfJoining,
      subjectExpertise,
      gender,
      dateOfBirth,
      address,
      emergencyContact,
      bankDetails
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Create user account
    const user = await User.create({
      email,
      password,
      name,
      role: "staff",
      phone: contact,
    });

    // Create staff profile with shortName
    const staff = await Staff.create({
      userId: user._id,
      name,
      shortName: shortName || null,  // Add shortName from form
      role,
      employeeType: employeeType || 'Permanent',
      qualification,
      contact,
      dateOfJoining: new Date(dateOfJoining),
      subjectExpertise: subjectExpertise || [],
      gender,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      address,
      emergencyContact,
      bankDetails,
      email
    });

    // Send welcome email
    await sendEmail({
      email: user.email,
      subject: "Welcome to School Management System",
      template: "staff_welcome",
      data: { name, email, password, staffCode: staff.staffCode },
    }).catch(err => console.error('Email error:', err));

    broadcastToRole('admin', 'staff:added', {
      staffId: staff._id,
      staffName: staff.name,
      staffCode: staff.staffCode,
      role: staff.role,
      timestamp: new Date()
    });

    res.status(201).json({
      success: true,
      data: staff,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Create staff error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      if (error.keyPattern?.email) {
        return res.status(400).json({ message: 'Email already exists' });
      }
      if (error.keyPattern?.staffCode) {
        return res.status(400).json({ message: 'Staff code generation failed. Please try again.' });
      }
    }
    
    res.status(500).json({ message: error.message });
  }
};

exports.updateStaff = async (req, res) => {
  try {
    const { shortName, ...otherFields } = req.body;
    
    const staff = await Staff.findByIdAndUpdate(
      req.params.id, 
      {
        ...otherFields,
        shortName: shortName || null  // Allow updating shortName
      }, 
      {
        new: true,
        runValidators: true,
      }
    );

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    if (req.body.name || req.body.contact || req.body.email) {
      await User.findByIdAndUpdate(staff.userId, {
        name: req.body.name || staff.name,
        phone: req.body.contact || staff.contact,
        email: req.body.email || staff.email
      });
    }

    broadcastToRole('admin', 'staff:updated', {
      staffId: staff._id,
      staffName: staff.name,
      changes: Object.keys(req.body),
      timestamp: new Date()
    });

    res.json(staff);
  } catch (error) {
    console.error('Update staff error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    staff.isActive = false;
    await staff.save();

    await User.findByIdAndUpdate(staff.userId, { isActive: false });

    await sendStaffNotification(
      staff._id,
      "Account Deactivated",
      "Your staff account has been deactivated. Please contact admin.",
      "error",
      { deactivated: true }
    );

    broadcastToRole('admin', 'staff:deactivated', {
      staffId: staff._id,
      staffName: staff.name,
      timestamp: new Date()
    });

    res.json({ message: "Staff deactivated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== STAFF ASSIGNMENT (Yearly) CRUD ====================

// Get or create staff assignment for an academic year
exports.getOrCreateStaffAssignment = async (req, res) => {
  try {
    const { staffId, academicYearId } = req.params;
    
    let assignment = await StaffAssignment.findOne({ staffId, academicYearId })
      .populate('classTeacherOf', 'name section displayName')
      .populate('subjectsTaught.subjectId', 'name code')
      .populate('subjectsTaught.classId', 'name section')
      .populate('academicYearId', 'year name');
    
    if (!assignment) {
      const staff = await Staff.findById(staffId);
      const academicYear = await AcademicYear.findById(academicYearId);
      
      if (!staff || !academicYear) {
        return res.status(404).json({ message: 'Staff or Academic Year not found' });
      }
      
      assignment = await StaffAssignment.create({
        staffId,
        academicYearId,
        subjectsTaught: [],
        isActive: true
      });
    }
    
    res.json(assignment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all staff assignments for an academic year
exports.getStaffAssignmentsByYear = async (req, res) => {
  try {
    const { academicYearId } = req.params;
    const { role, page = 1, limit = 20 } = req.query;
    
    const query = { academicYearId };
    
    const assignments = await StaffAssignment.find(query)
      .populate({
        path: 'staffId',
        match: role ? { role } : {},
        select: 'name staffCode role qualification contact subjectExpertise',
        populate: { path: 'userId', select: 'email' }
      })
      .populate('classTeacherOf', 'name section displayName')
      .populate('subjectsTaught.subjectId', 'name code')
      .populate('subjectsTaught.classId', 'name section')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ 'staffId.name': 1 });
    
    // Filter out null staff (due to role filter)
    const filteredAssignments = assignments.filter(a => a.staffId !== null);
    
    const total = await StaffAssignment.countDocuments(query);
    
    res.json({
      success: true,
      data: filteredAssignments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get staff assignment history
exports.getStaffAssignmentHistory = async (req, res) => {
  try {
    const { staffId } = req.params;
    
    const assignments = await StaffAssignment.find({ staffId })
      .populate('academicYearId', 'year name')
      .populate('classTeacherOf', 'name section displayName')
      .populate('subjectsTaught.subjectId', 'name code')
      .sort({ 'academicYearId.year': -1 });
    
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Assign class teacher
exports.assignClassTeacher = async (req, res) => {
  try {
    const { staffId, academicYearId } = req.params;
    const { classId } = req.body;
    
    // Check if another staff is already class teacher for this class
    const existingAssignment = await StaffAssignment.findOne({
      classTeacherOf: classId,
      academicYearId
    });
    
    if (existingAssignment && existingAssignment.staffId.toString() !== staffId) {
      // Remove from previous staff
      existingAssignment.classTeacherOf = null;
      existingAssignment.classTeacherOfName = null;
      await existingAssignment.save();
    }
    
    // Get or create assignment
    let assignment = await StaffAssignment.findOne({ staffId, academicYearId });
    
    if (!assignment) {
      assignment = await StaffAssignment.create({
        staffId,
        academicYearId,
        subjectsTaught: []
      });
    }
    
    const classInfo = await Class.findById(classId);
    
    assignment.classTeacherOf = classId;
    assignment.classTeacherOfName = classInfo ? (classInfo.section ? `${classInfo.name}-${classInfo.section}` : classInfo.name) : null;
    await assignment.save();
    
    // Update Class model with teacher
    const staff = await Staff.findById(staffId);
    await Class.findByIdAndUpdate(classId, {
      classTeacherId: staffId,
      classTeacherName: staff.name
    });
    
    await sendStaffNotification(
      staffId,
      'Class Teacher Assigned',
      `You have been assigned as class teacher for ${assignment.classTeacherOfName}`,
      'success',
      { classId, className: assignment.classTeacherOfName, academicYearId }
    );
    
    res.json({
      success: true,
      message: 'Class teacher assigned successfully',
      assignment
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Assign subjects to staff
exports.assignSubjects = async (req, res) => {
  try {
    const { staffId, academicYearId } = req.params;
    const { subjects } = req.body;
    // subjects: [{ subjectId, classId, periodsPerWeek }]
    
    let assignment = await StaffAssignment.findOne({ staffId, academicYearId });
    
    if (!assignment) {
      assignment = await StaffAssignment.create({
        staffId,
        academicYearId,
        subjectsTaught: []
      });
    }
    
    // Process each subject assignment
    for (const subj of subjects) {
      const subject = await Subject.findById(subj.subjectId);
      const classInfo = await Class.findById(subj.classId);
      
      if (!subject || !classInfo) continue;
      
      // Check if already assigned
      const existingIndex = assignment.subjectsTaught.findIndex(
        s => s.subjectId.toString() === subj.subjectId && s.classId.toString() === subj.classId
      );
      
      const subjectData = {
        subjectId: subj.subjectId,
        subjectName: subject.name,
        subjectCode: subject.code,
        classId: subj.classId,
        className: classInfo.name,
        section: classInfo.section,
        periodsPerWeek: subj.periodsPerWeek || 1
      };
      
      if (existingIndex >= 0) {
        assignment.subjectsTaught[existingIndex] = subjectData;
      } else {
        assignment.subjectsTaught.push(subjectData);
      }
    }
    
    await assignment.save();
    
    await sendStaffNotification(
      staffId,
      'Subjects Assigned',
      `You have been assigned ${subjects.length} subject(s) for the academic year`,
      'info',
      { subjectCount: subjects.length, academicYearId }
    );
    
    res.json({
      success: true,
      message: 'Subjects assigned successfully',
      subjectsTaught: assignment.subjectsTaught
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Remove subject from staff
exports.removeSubject = async (req, res) => {
  try {
    const { staffId, academicYearId, subjectId, classId } = req.params;
    
    const assignment = await StaffAssignment.findOne({ staffId, academicYearId });
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    
    assignment.subjectsTaught = assignment.subjectsTaught.filter(
      s => !(s.subjectId.toString() === subjectId && s.classId.toString() === classId)
    );
    
    await assignment.save();
    
    res.json({
      success: true,
      message: 'Subject removed successfully',
      subjectsTaught: assignment.subjectsTaught
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update staff attendance
exports.updateAttendance = async (req, res) => {
  try {
    const { staffId, academicYearId } = req.params;
    const { totalWorkingDays, presentDays, leaveDays } = req.body;
    
    let assignment = await StaffAssignment.findOne({ staffId, academicYearId });
    
    if (!assignment) {
      assignment = await StaffAssignment.create({
        staffId,
        academicYearId,
        subjectsTaught: []
      });
    }
    
    assignment.attendance = {
      totalWorkingDays: totalWorkingDays || assignment.attendance.totalWorkingDays,
      presentDays: presentDays || assignment.attendance.presentDays,
      leaveDays: leaveDays || assignment.attendance.leaveDays
    };
    
    await assignment.save();
    
    res.json({
      success: true,
      attendance: assignment.attendance
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update staff performance
exports.updatePerformance = async (req, res) => {
  try {
    const { staffId, academicYearId } = req.params;
    const { rating, remarks } = req.body;
    
    let assignment = await StaffAssignment.findOne({ staffId, academicYearId });
    
    if (!assignment) {
      assignment = await StaffAssignment.create({
        staffId,
        academicYearId,
        subjectsTaught: []
      });
    }
    
    assignment.performance = {
      rating,
      remarks,
      evaluatedBy: req.user._id,
      evaluatedAt: new Date()
    };
    
    await assignment.save();
    
    res.json({
      success: true,
      performance: assignment.performance
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update staff salary for academic year
exports.updateSalary = async (req, res) => {
  try {
    const { staffId, academicYearId } = req.params;
    const { basic, da, hra, conveyance, otherAllowances } = req.body;
    
    let assignment = await StaffAssignment.findOne({ staffId, academicYearId });
    
    if (!assignment) {
      assignment = await StaffAssignment.create({
        staffId,
        academicYearId,
        subjectsTaught: []
      });
    }
    
    assignment.salary = {
      basic: basic || assignment.salary.basic,
      da: da || assignment.salary.da,
      hra: hra || assignment.salary.hra,
      conveyance: conveyance || assignment.salary.conveyance,
      otherAllowances: otherAllowances || assignment.salary.otherAllowances
    };
    
    await assignment.save();
    
    res.json({
      success: true,
      salary: assignment.salary
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update staff timetable
exports.updateTimetable = async (req, res) => {
  try {
    const { staffId, academicYearId } = req.params;
    const { timetable } = req.body;
    
    let assignment = await StaffAssignment.findOne({ staffId, academicYearId });
    
    if (!assignment) {
      assignment = await StaffAssignment.create({
        staffId,
        academicYearId,
        subjectsTaught: []
      });
    }
    
    assignment.timetable = timetable;
    await assignment.save();
    
    res.json({
      success: true,
      timetable: assignment.timetable
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get staff timetable
exports.getStaffTimetable = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { academicYearId } = req.query;
    
    const query = { staffId };
    if (academicYearId) {
      query.academicYearId = academicYearId;
    } else {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      if (currentYear) {
        query.academicYearId = currentYear._id;
      }
    }
    
    const assignment = await StaffAssignment.findOne(query)
      .populate('timetable.periods.classId', 'name section')
      .populate('timetable.periods.subjectId', 'name code');
    
    res.json(assignment?.timetable || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get staff by class (for current year)
exports.getStaffByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { academicYearId } = req.query;
    
    let yearId = academicYearId;
    if (!yearId) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      yearId = currentYear?._id;
    }
    
    // Get class teacher
    const classTeacherAssignment = await StaffAssignment.findOne({
      classTeacherOf: classId,
      academicYearId: yearId
    }).populate('staffId', 'name staffCode contact email');
    
    // Get subject teachers
    const subjectAssignments = await StaffAssignment.find({
      'subjectsTaught.classId': classId,
      academicYearId: yearId
    }).populate('staffId', 'name staffCode contact email');
    
    res.json({
      classTeacher: classTeacherAssignment?.staffId || null,
      subjectTeachers: subjectAssignments.map(a => ({
        staff: a.staffId,
        subjects: a.subjectsTaught.filter(s => s.classId.toString() === classId)
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Promote staff to next academic year (copy assignments)
exports.promoteStaffToNextYear = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { fromAcademicYearId, toAcademicYearId, copySubjects = true } = req.body;
    
    const fromAssignment = await StaffAssignment.findOne({
      staffId,
      academicYearId: fromAcademicYearId
    });
    
    if (!fromAssignment) {
      return res.status(404).json({ message: 'Source assignment not found' });
    }
    
    // Check if target already exists
    let toAssignment = await StaffAssignment.findOne({
      staffId,
      academicYearId: toAcademicYearId
    });
    
    if (!toAssignment) {
      toAssignment = await StaffAssignment.create({
        staffId,
        academicYearId: toAcademicYearId,
        subjectsTaught: [],
        isActive: true
      });
    }
    
    if (copySubjects) {
      // Copy subjects but update class references if needed
      toAssignment.subjectsTaught = fromAssignment.subjectsTaught;
      toAssignment.responsibilities = fromAssignment.responsibilities;
    }
    
    // Copy salary with increment (optional)
    toAssignment.salary = {
      ...fromAssignment.salary,
      basic: (fromAssignment.salary.basic || 0) * 1.05 // 5% increment
    };
    
    await toAssignment.save();
    
    res.json({
      success: true,
      message: 'Staff promoted to next academic year',
      assignment: toAssignment
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get staff dashboard stats
exports.getStaffDashboardStats = async (req, res) => {
  try {
    const totalStaff = await Staff.countDocuments({ isActive: { $ne: false } });
    const teachers = await Staff.countDocuments({ role: 'teacher', isActive: { $ne: false } });
    const nonTeachingStaff = await Staff.countDocuments({ 
      role: { $ne: 'teacher' }, 
      isActive: { $ne: false } 
    });
    
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    let currentYearStats = null;
    
    if (currentYear) {
      const assignments = await StaffAssignment.find({ academicYearId: currentYear._id });
      const classTeachers = assignments.filter(a => a.classTeacherOf).length;
      const totalSubjectsAssigned = assignments.reduce((sum, a) => sum + a.subjectsTaught.length, 0);
      
      currentYearStats = {
        year: currentYear.year,
        totalAssignments: assignments.length,
        classTeachers,
        totalSubjectsAssigned
      };
    }
    
    // Role distribution
    const roleDistribution = await Staff.aggregate([
      { $match: { isActive: { $ne: false } } },
      { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);
    
    res.json({
      totalStaff,
      teachers,
      nonTeachingStaff,
      roleDistribution,
      currentYearStats
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.getStaffRoles = async (req, res) => {
  try {
    const roles = [
      'teacher',
      'principal', 
      'vice_principal',
      'headmaster',
      'dep.headmaster',
      'librarian',
      'administrator',
      'office_staff',
      'support_staff'
    ];
    
    res.json({
      success: true,
      data: roles
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};