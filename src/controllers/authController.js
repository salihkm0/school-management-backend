const User = require('../models/User');
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../services/emailService');
const crypto = require('crypto');

exports.register = async (req, res) => {
  try {
    const { email, password, name, role, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      email,
      password,
      name,
      role,
      phone
    });

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

    if (role === 'parent' && req.body.studentId) {
      await Student.findByIdAndUpdate(
        req.body.studentId,
        { $addToSet: { parentIds: user._id } }
      );
    }

    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    user.refreshTokenExpire = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await user.save();

    res.status(201).json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        photoUrl: user.photoUrl
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account disabled' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

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
        name: user.name,
        role: user.role,
        phone: user.phone,
        photoUrl: user.photoUrl
      },
      ...additionalData
    });
  } catch (error) {
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

    res.json({ success: true, message: 'Email sent' });
  } catch (error) {
    User.resetPasswordToken = undefined;
    User.resetPasswordExpire = undefined;
    await User.save();

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

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    let additionalData = {};
    if (user.role === 'staff') {
      const staff = await Staff.findOne({ userId: user._id });
      additionalData.staff = staff;
    } else if (user.role === 'parent') {
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