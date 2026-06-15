const express = require('express');
const router = express.Router();
const { protect, authorize, verifyRefreshToken } = require('../middleware/auth');
const { validate, registerValidation, loginValidation } = require('../middleware/validation');
const {
  register,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile,
  getMe
} = require('../controllers/authController');

// Public routes
router.post('/register', validate(registerValidation), register);
router.post('/login', validate(loginValidation), login);
router.post('/refresh-token', refreshToken);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);

// Protected routes
router.use(protect);
router.post('/logout', logout);
router.put('/change-password', changePassword);
router.put('/profile', updateProfile);
router.get('/me', getMe);

module.exports = router;