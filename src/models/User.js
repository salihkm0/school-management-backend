const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  role: {
    type: String,
    enum: ['admin', 'staff', 'parent', 'administration'],
    required: true
  },
  phone: {
    type: String,
    trim: true,
    required: [true, 'Phone number is required'],
    unique: true,
  },
  photoUrl: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  refreshToken: String,
  refreshTokenExpire: Date,
  // FCM Tokens for push notifications
  fcmTokens: [{
    token: {
      type: String,
      required: true
    },
    deviceInfo: {
      platform: String,
      model: String,
      appVersion: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    lastUsed: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Add indexes
UserSchema.index({ phone: 1 });
UserSchema.index({ email: 1 }, { sparse: true });
UserSchema.index({ 'fcmTokens.token': 1 });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

UserSchema.methods.comparePassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

UserSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role, email: this.email, phone: this.phone },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

UserSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE }
  );
};

// Add FCM token management methods
UserSchema.methods.addFcmToken = async function(token, deviceInfo = {}) {
  const existingToken = this.fcmTokens.find(t => t.token === token);
  if (existingToken) {
    existingToken.lastUsed = new Date();
    existingToken.deviceInfo = deviceInfo;
  } else {
    this.fcmTokens.push({
      token,
      deviceInfo,
      createdAt: new Date(),
      lastUsed: new Date()
    });
  }
  
  if (this.fcmTokens.length > 5) {
    this.fcmTokens = this.fcmTokens.slice(-5);
  }
  
  await this.save();
  return this.fcmTokens;
};

UserSchema.methods.removeFcmToken = async function(token) {
  this.fcmTokens = this.fcmTokens.filter(t => t.token !== token);
  await this.save();
  return this.fcmTokens;
};

UserSchema.methods.getActiveFcmTokens = function() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  return this.fcmTokens
    .filter(t => t.lastUsed > thirtyDaysAgo)
    .map(t => t.token);
};

module.exports = mongoose.model('User', UserSchema);