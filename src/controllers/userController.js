const User = require('../models/User');
const Staff = require('../models/Staff');
const Student = require('../models/Student');
const Class = require('../models/Class');
const { getParentUsersByClass } = require('../utils/parentResolver');

// Get all users with pagination and search (Admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', role = '' } = req.query;
    
    let query = {};
    
    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by role
    if (role) {
      query.role = role;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(query)
      .select('_id name email role phone photoUrl isActive')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ name: 1 });
    
    const total = await User.countDocuments(query);
    
    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error in getAllUsers:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get users by specific role (Admin only)
exports.getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const { search = '', page = 1, limit = 50 } = req.query;
    
    const validRoles = ['admin', 'staff', 'parent'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    
    let query = { role };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(query)
      .select('_id name email role phone photoUrl')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ name: 1 });
    
    // For staff, fetch additional staff info
    let enhancedUsers = [...users];
    if (role === 'staff') {
      enhancedUsers = await Promise.all(users.map(async (user) => {
        const staff = await Staff.findOne({ userId: user._id });
        return {
          ...user.toObject(),
          staffCode: staff?.staffCode,
          designation: staff?.designation || staff?.role
        };
      }));
    }
    
    const total = await User.countDocuments(query);
    
    res.json({
      success: true,
      data: enhancedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error in getUsersByRole:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get parents by class (For class teachers and admin)
exports.getParentsByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { search = '' } = req.query;
    
    // Check authorization: Admin or staff
    if (req.user.role !== 'admin' && req.user.role !== 'staff') {
      return res.status(403).json({ message: 'Access denied.' });
    }
    
    // Get class with students
    const classData = await Class.findById(classId);
    if (!classData) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    // Resolve all parents connected to students in this class
    const { parentsList } = await getParentUsersByClass(classId);
    let parents = parentsList;
    
    // Apply search filter
    if (search) {
      const q = search.toLowerCase();
      parents = parents.filter(parent => 
        parent.name?.toLowerCase().includes(q) ||
        parent.email?.toLowerCase().includes(q) ||
        parent.phone?.toLowerCase().includes(q) ||
        (parent.studentNames || []).some(s => s.toLowerCase().includes(q)) ||
        (parent.studentAdmissionNos || []).some(adm => adm.toLowerCase().includes(q))
      );
    }
    
    res.json({
      success: true,
      data: parents,
      classInfo: {
        _id: classData._id,
        name: classData.name,
        section: classData.section,
        displayName: classData.displayName || `${classData.name}${classData.section ? `-${classData.section}` : ''}`
      },
      total: parents.length
    });
  } catch (error) {
    console.error('Error in getParentsByClass:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get user by ID (minimal info for notifications)
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id).select('_id name email role phone');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error in getUserById:', error);
    res.status(500).json({ message: error.message });
  }
};