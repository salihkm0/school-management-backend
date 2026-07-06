// controllers/authController.js - Updated for phone login
const User = require('../models/User');
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Parent = require('../models/Parent');
const { RecentActivity, ACTIVITY_TYPES, ENTITY_TYPES, SEVERITY } = require('../models/RecentActivity');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../services/emailService');
const crypto = require('crypto');
const { broadcastToUser, broadcastToRole } = require('../config/socket');

// Helper function to create recent activity
async function createRecentActivity({
  title,
  description,
  activityType,
  entityType,
  entityId = null,
  entityModel = null,
  performedBy,
  performedByName,
  performedByRole,
  details = {},
  changes = {},
  ipAddress = null,
  userAgent = null,
  severity = SEVERITY.INFO,
  batchId = null
}) {
  try {
    const activity = await RecentActivity.create({
      title,
      description,
      activityType,
      entityType,
      entityId,
      entityModel,
      performedBy,
      performedByName,
      performedByRole,
      details,
      changes,
      ipAddress,
      userAgent,
      severity,
      batchId
    });
    
    broadcastToRole('admin', 'recent_activity:created', { activity });
    
    return activity;
  } catch (error) {
    console.error('Error creating recent activity:', error);
    return null;
  }
}

exports.register = async (req, res) => {
  try {
    const { email, password, name, role, phone } = req.body;

    // Check if user exists by phone or email
    const existingUser = await User.findOne({ 
      $or: [{ phone }, { email }] 
    });
    
    if (existingUser) {
      if (existingUser.phone === phone) {
        return res.status(400).json({ message: 'Phone number already registered' });
      }
      if (email && existingUser.email === email) {
        return res.status(400).json({ message: 'Email already registered' });
      }
    }

    const userData = {
      password,
      name,
      role,
      phone
    };
    
    if (email) {
      userData.email = email;
    }

    const user = await User.create(userData);

    if (role === 'staff') {
      await Staff.create({
        userId: user._id,
        name,
        role: 'teacher',
        qualification: req.body.qualification || '',
        contact: phone || '',
        dateOfJoining: new Date()
      });
    }

    if (role === 'parent') {
      await Parent.create({
        userId: user._id,
        fullName: name,
        email: email || null,
        phone: phone,
        students: [],
        profileCompleted: true
      });
    }

    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    user.refreshTokenExpire = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await user.save();

    await createRecentActivity({
      title: `New User Registered: ${name}`,
      description: `User ${name} (${phone}) registered with role: ${role}`,
      activityType: ACTIVITY_TYPES.USER_REGISTERED,
      entityType: ENTITY_TYPES.USER,
      entityId: user._id,
      entityModel: 'User',
      performedBy: user._id,
      performedByName: user.name,
      performedByRole: user.role,
      details: {
        phone: user.phone,
        email: user.email,
        name: user.name,
        role: user.role
      },
      severity: SEVERITY.SUCCESS
    });

    res.status(201).json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        photoUrl: user.photoUrl
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, phone, password, rememberMe } = req.body;

    console.log("body :" , req.body)

    console.log('Login attempt:', { email, phone });

    // Handle Open Dashboard static login
    if (email === 'open@gmail.com' && password === 'ppmhss@001') {
      const token = jwt.sign(
        { id: 'open-dashboard-user', role: 'open', email: 'open@gmail.com' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
      return res.json({
        success: true,
        token,
        user: { 
          id: 'open-dashboard-user', 
          email: 'open@gmail.com', 
          name: 'Open Dashboard', 
          role: 'open', 
          photoUrl: null 
        }
      });
    }

    let query = {};
    if (email) {
      query.email = email;
    } else if (phone) {
      query.phone = phone;
    } else {
      return res.status(400).json({ message: 'Email or phone number is required' });
    }

    console.log('Login query:', query);

    const user = await User.findOne(query).select('+password');
    console.log('User found:', user ? { id: user._id, phone: user.phone, email: user.email, role: user.role } : 'No user found');

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account disabled' });
    }

    console.log('DEBUG AUTH - Provided Password:', password);
    console.log('DEBUG AUTH - DB Hashed Password:', user.password);
    
    const isMatch = await user.comparePassword(password);
    console.log('Password match:', isMatch);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    user.lastLogin = new Date();
    await user.save();

    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();

    if (rememberMe) {
      user.refreshToken = refreshToken;
      user.refreshTokenExpire = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await user.save();
    }

    let additionalData = {};
    if (user.role === 'staff') {
      const staff = await Staff.findOne({ userId: user._id });
      if (staff) {
        additionalData.staff = staff;
      }
    } else if (user.role === 'parent') {
      const parent = await Parent.findOne({ userId: user._id });
      if (parent) {
        additionalData.parent = parent;
      }
      const children = await Student.find({ parentIds: user._id }).populate('classId', 'name section');
      additionalData.children = children;
    }

    res.json({
      success: true,
      token,
      refreshToken: rememberMe ? refreshToken : undefined,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        photoUrl: user.photoUrl
      },
      ...additionalData
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    if (user.refreshTokenExpire && new Date() > user.refreshTokenExpire) {
      return res.status(401).json({ message: 'Refresh token expired' });
    }

    const newToken = user.generateAuthToken();
    const newRefreshToken = user.generateRefreshToken();

    user.refreshToken = newRefreshToken;
    user.refreshTokenExpire = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await user.save();

    res.json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      await createRecentActivity({
        title: `User Logout: ${user.name}`,
        description: `User ${user.name} (${user.phone}) logged out`,
        activityType: ACTIVITY_TYPES.USER_LOGOUT,
        entityType: ENTITY_TYPES.USER,
        entityId: user._id,
        entityModel: 'User',
        performedBy: user._id,
        performedByName: user.name,
        performedByRole: user.role,
        details: {
          phone: user.phone,
          role: user.role
        },
        severity: SEVERITY.INFO
      });
      
      user.refreshToken = null;
      user.refreshTokenExpire = null;
      await user.save();
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await user.save();

    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
    const message = `You requested a password reset. Click the link to reset your password: ${resetUrl}`;

    await sendEmail({
      email: user.email,
      subject: 'Password Reset Request',
      message
    });

    await createRecentActivity({
      title: `Password Reset Requested: ${user.name}`,
      description: `Password reset was requested for user ${user.name}`,
      activityType: ACTIVITY_TYPES.PASSWORD_RESET_REQUESTED,
      entityType: ENTITY_TYPES.USER,
      entityId: user._id,
      entityModel: 'User',
      performedBy: user._id,
      performedByName: user.name,
      performedByRole: user.role,
      details: {
        phone: user.phone,
        resetTokenExpires: user.resetPasswordExpire
      },
      severity: SEVERITY.WARNING
    });

    res.json({ success: true, message: 'Email sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    await createRecentActivity({
      title: `Password Reset Completed: ${user.name}`,
      description: `User ${user.name} reset their password successfully`,
      activityType: ACTIVITY_TYPES.PASSWORD_CHANGED,
      entityType: ENTITY_TYPES.USER,
      entityId: user._id,
      entityModel: 'User',
      performedBy: user._id,
      performedByName: user.name,
      performedByRole: user.role,
      details: {
        phone: user.phone,
        resetMethod: 'forgot_password'
      },
      severity: SEVERITY.SUCCESS
    });

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    await createRecentActivity({
      title: `Password Changed: ${user.name}`,
      description: `User ${user.name} changed their password`,
      activityType: ACTIVITY_TYPES.PASSWORD_CHANGED,
      entityType: ENTITY_TYPES.USER,
      entityId: user._id,
      entityModel: 'User',
      performedBy: user._id,
      performedByName: user.name,
      performedByRole: user.role,
      details: {
        phone: user.phone,
        resetMethod: 'manual_change'
      },
      severity: SEVERITY.INFO
    });

    if (user._id) {
      broadcastToUser(user._id.toString(), 'password:changed', {
        message: 'Your password has been changed successfully',
        timestamp: new Date()
      });
    }

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    // Handle Open Dashboard virtual user
    if (req.user && req.user.role === 'open') {
      return res.json({
        success: true,
        user: {
          id: req.user.id,
          email: req.user.email,
          name: 'Open Dashboard',
          role: 'open',
          photoUrl: null
        }
      });
    }

    const user = await User.findById(req.user.id).select('-password');
    
    let additionalData = {};
    if (user.role === 'staff') {
      const staff = await Staff.findOne({ userId: user._id });
      additionalData.staff = staff;
    } else if (user.role === 'parent') {
      const parent = await Parent.findOne({ userId: user._id });
      additionalData.parent = parent;
      const children = await Student.find({ parentIds: user._id }).populate('classId', 'name section');
      additionalData.children = children;
    }

    res.json({
      user,
      ...additionalData
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if new email/phone is already taken
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }
    
    if (phone && phone !== user.phone) {
      const phoneExists = await User.findOne({ phone });
      if (phoneExists) {
        return res.status(400).json({ message: 'Phone number already in use' });
      }
    }

    // Update User model
    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (email) user.email = email;
    await user.save();

    // Sync with corresponding role collections
    if (user.role === 'staff') {
      await Staff.findOneAndUpdate(
        { userId: user._id },
        { name: user.name, contact: user.phone },
        { new: true }
      );
    } else if (user.role === 'parent') {
      await Parent.findOneAndUpdate(
        { userId: user._id },
        { fullName: user.name, phone: user.phone, email: user.email },
        { new: true }
      );
    }

    await createRecentActivity({
      title: `Profile Updated: ${user.name}`,
      description: `User ${user.name} updated their profile information`,
      activityType: ACTIVITY_TYPES.USER_UPDATED || 'user_updated',
      entityType: ENTITY_TYPES.USER || 'user',
      entityId: user._id,
      entityModel: 'User',
      performedBy: user._id,
      performedByName: user.name,
      performedByRole: user.role,
      severity: SEVERITY.INFO || 'info'
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        photoUrl: user.photoUrl
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};