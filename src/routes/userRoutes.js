const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { getAllUsers, getUsersByRole, getParentsByClass } = require('../controllers/userController');

router.use(protect);

// Get all users (admin only)
router.get('/', authorize('admin'), getAllUsers);

// Get users by role (admin only)
router.get('/role/:role', authorize('admin'), getUsersByRole);

// Get parents by class (class teacher & admin)
router.get('/parents/class/:classId', getParentsByClass);

module.exports = router;