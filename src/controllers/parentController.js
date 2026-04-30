// controllers/parentController.js
const Parent = require('../models/Parent');
const User = require('../models/User');
const Student = require('../models/Student');  // ← ADD THIS LINE - it's missing!
const AcademicYear = require('../models/AcademicYear');
const Notification = require('../models/Notification');
const { broadcastToUser } = require('../config/socket');
const { sendEmail } = require('../services/emailService');

// Helper: Send notification to parent
async function sendParentNotification(userId, title, message, type, data) {
  const notification = await Notification.create({
    userId,
    title,
    message,
    type,
    data
  });
  
  broadcastToUser(userId.toString(), 'notification', {
    id: notification._id,
    title,
    message,
    type,
    data: notification.data,
    timestamp: notification.createdAt,
    read: false
  });
}

// Register Parent
exports.registerParent = async (req, res) => {
  try {
    const { email, password, fullName, phone, alternatePhone, address, occupation } = req.body;
    
    if (!phone) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }
    
    // Check if user already exists with this phone
    const existingUserByPhone = await User.findOne({ phone });
    if (existingUserByPhone) {
      return res.status(400).json({ message: 'Mobile number already registered' });
    }
    
    // Check if email exists (only if provided)
    if (email) {
      const existingUserByEmail = await User.findOne({ email });
      if (existingUserByEmail) {
        return res.status(400).json({ message: 'Email already registered' });
      }
    }
    
    // Create User for login
    const userData = {
      password,
      name: fullName,
      role: 'parent',
      phone
    };
    
    if (email) {
      userData.email = email;
    }
    
    const user = await User.create(userData);
    
    // Create Parent profile
    const parent = await Parent.create({
      userId: user._id,
      fullName,
      email: email || null,
      phone,
      alternatePhone: alternatePhone || '',
      address: typeof address === 'string' ? { street: address } : address,
      occupation: occupation || '',
      students: [],
      profileCompleted: true
    });
    
    // Generate tokens for auto-login after registration (optional)
    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();
    
    user.refreshToken = refreshToken;
    user.refreshTokenExpire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    
    // Send welcome email only if email provided
    if (email) {
      try {
        await sendEmail({
          email: user.email,
          subject: 'Welcome to School Management System',
          template: 'parent_welcome',
          data: { name: fullName, email, phone }
        });
      } catch (error) {
        console.error('Email error:', error);
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Parent registered successfully. You can now login with your mobile number.',
      data: {
        parent: {
          _id: parent._id,
          fullName: parent.fullName,
          email: parent.email,
          phone: parent.phone
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    // Clean up if parent creation fails
    if (req.body.phone) {
      await User.deleteOne({ phone: req.body.phone });
    }
    console.error('Register parent error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Connect Student to Parent (using studentCode and dateOfBirth)
exports.connectStudent = async (req, res) => {
  try {
    const parentId = req.params.id;
    const { studentCode, dateOfBirth, relation } = req.body;
    
    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    // Check if already connected
    if (parent.hasConnection && parent.hasConnection(studentCode)) {
      return res.status(400).json({ message: 'Student already connected' });
    }
    
    const parsedDOB = new Date(dateOfBirth);
    
    // Find student by studentCode and dateOfBirth (across all years)
    const student = await Student.findOne({
      studentCode: studentCode,
      dateOfBirth: {
        $gte: new Date(parsedDOB.setHours(0, 0, 0, 0)),
        $lt: new Date(parsedDOB.setHours(23, 59, 59, 999))
      }
    }).sort({ academicYearId: -1 });
    
    if (!student) {
      // Store the connection request for future matching
      if (parent.addStudentConnection) {
        await parent.addStudentConnection(studentCode, parsedDOB, relation);
      }
      
      return res.status(202).json({ 
        success: true,
        message: 'Connection request saved. Student will be connected when data is imported.',
        pending: true,
        studentCode,
        relation
      });
    }
    
    // Student found - add connection
    if (parent.addStudentConnection) {
      await parent.addStudentConnection(studentCode, parsedDOB, relation);
    }
    
    // Update cached details immediately
    const connection = parent.students.find(s => s.studentCode === studentCode);
    if (connection) {
      connection.studentFullName = student.fullName;
      connection.className = `${student.className || ''} ${student.division || ''}`.trim();
      await parent.save();
    }
    
    // Send notification
    await sendParentNotification(
      parent.userId,
      'Student Connected Successfully',
      `Your child ${student.fullName} (${studentCode}) has been connected to your account.`,
      'success',
      { studentCode, studentName: student.fullName }
    );
    
    res.json({
      success: true,
      message: 'Student connected successfully',
      data: {
        studentCode: student.studentCode,
        studentName: student.fullName,
        className: `${student.className || ''} ${student.division || ''}`.trim(),
        relation: relation || 'father'
      }
    });
  } catch (error) {
    console.error('Error in connectStudent:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get parent by logged-in user ID
exports.getMyParentProfile = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user.id })
      .populate('userId', 'email phone photoUrl name');
    
    if (!parent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Parent profile not found' 
      });
    }
    
    res.json({
      success: true,
      data: parent
    });
  } catch (error) {
    console.error('Error in getMyParentProfile:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get parent profile with current student details
exports.getParentProfile = async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id)
      .populate('userId', 'email phone photoUrl');
    
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    // Get current academic year
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    // Get current student details
    let currentStudents = [];
    if (parent.getCurrentStudentDetails) {
      currentStudents = await parent.getCurrentStudentDetails(currentYear?._id);
    }
    
    // Check which connections have current data
    const connections = (parent.students || []).map(conn => {
      const current = currentStudents.find(s => s.studentCode === conn.studentCode);
      return {
        studentCode: conn.studentCode,
        relation: conn.relation,
        connectedSince: conn.connectedSince,
        currentDetails: current || null,
        hasCurrentData: !!current
      };
    });
    
    res.json({
      success: true,
      data: {
        ...parent.toObject(),
        connections,
        currentStudents,
        summary: {
          totalConnections: (parent.students || []).length,
          activeStudents: currentStudents.length,
          pendingStudents: (parent.students || []).length - currentStudents.length
        }
      }
    });
  } catch (error) {
    console.error('Error in getParentProfile:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get parent's current children (for logged-in parent)
exports.getMyChildren = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user.id });
    
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }
    
    // Get current academic year
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    // Get current student details
    let children = [];
    if (parent.getCurrentStudentDetails) {
      children = await parent.getCurrentStudentDetails(currentYear?._id);
    }
    
    // Get full student details with marks, attendance, etc.
    const studentCodes = children.map(c => c.studentCode);
    const fullStudents = await Student.find({
      studentCode: { $in: studentCodes },
      academicYearId: currentYear?._id
    })
      .populate('classId', 'name section classTeacherName')
      .select('-__v');
    
    // Merge with relation info
    const enrichedChildren = fullStudents.map(student => {
      const child = children.find(c => c.studentCode === student.studentCode);
      return {
        ...student.toObject(),
        relation: child?.relation || 'guardian',
        connectedSince: child?.connectedSince
      };
    });
    
    res.json({
      success: true,
      data: {
        children: enrichedChildren,
        count: enrichedChildren.length,
        academicYear: currentYear?.year || 'Current'
      }
    });
  } catch (error) {
    console.error('Error in getMyChildren:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all parents (Admin only)
exports.getParents = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    
    const query = { isActive: true };
    if (search && search.trim()) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { 'students.studentCode': { $regex: search, $options: 'i' } }
      ];
    }
    
    const parents = await Parent.find(query)
      .populate('userId', 'email isActive lastLogin')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    
    const total = await Parent.countDocuments(query);
    
    // Get current year for student counts
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    // Add current student count for each parent
    const enrichedParents = await Promise.all(parents.map(async (parent) => {
      let currentStudents = [];
      if (parent.getCurrentStudentDetails) {
        currentStudents = await parent.getCurrentStudentDetails(currentYear?._id);
      }
      return {
        ...parent.toObject(),
        currentStudentCount: currentStudents.length,
        totalConnections: (parent.students || []).length
      };
    }));
    
    res.json({
      success: true,
      data: enrichedParents || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total || 0,
        pages: Math.ceil((total || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Error in getParents:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 }
    });
  }
};

// Remove student connection
exports.removeStudentConnection = async (req, res) => {
  try {
    const { parentId, studentCode } = req.params;
    
    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    if (parent.removeStudentConnection) {
      await parent.removeStudentConnection(studentCode);
    }
    
    res.json({
      success: true,
      message: 'Student connection removed successfully'
    });
  } catch (error) {
    console.error('Error in removeStudentConnection:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get students for a specific parent (Admin view)
exports.getParentStudents = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { academicYearId } = req.query;
    
    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    let yearId = academicYearId;
    if (!yearId) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      yearId = currentYear?._id;
    }
    
    let students = [];
    if (parent.getCurrentStudentDetails) {
      students = await parent.getCurrentStudentDetails(yearId);
    }
    
    // Get full student details
    const studentCodes = students.map(s => s.studentCode);
    const fullStudents = await Student.find({
      studentCode: { $in: studentCodes },
      academicYearId: yearId
    })
      .populate('classId', 'name section displayName')
      .select('studentCode fullName className division gender dateOfBirth status');
    
    // Merge with relation info
    const enrichedStudents = fullStudents.map(student => {
      const connection = (parent.students || []).find(c => c.studentCode === student.studentCode);
      return {
        ...student.toObject(),
        relation: connection?.relation || 'guardian',
        connectedSince: connection?.connectedSince
      };
    });
    
    // Also include connections without current student data
    const missingStudentCodes = (parent.students || [])
      .filter(c => !fullStudents.find(s => s.studentCode === c.studentCode))
      .map(c => ({
        studentCode: c.studentCode,
        relation: c.relation,
        connectedSince: c.connectedSince,
        status: 'not_enrolled',
        message: 'Student not enrolled in this academic year'
      }));
    
    res.json({
      success: true,
      data: {
        parent: {
          _id: parent._id,
          fullName: parent.fullName,
          phone: parent.phone
        },
        currentStudents: enrichedStudents,
        inactiveConnections: missingStudentCodes,
        total: enrichedStudents.length + missingStudentCodes.length
      }
    });
  } catch (error) {
    console.error('Error in getParentStudents:', error);
    res.status(500).json({ message: error.message });
  }
};



exports.getParentByUserId = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user.id })
      .populate('userId', 'email phone photoUrl');
    
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }
    
    res.json({
      success: true,
      data: parent
    });
  } catch (error) {
    console.error('Error in getParentByUserId:', error);
    res.status(500).json({ message: error.message });
  }
};