const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { getAllUsers, getUsersByRole, getParentsByClass } = require('../controllers/userController');

router.use(protect);

// Get all users (admin & staff)
router.get('/', authorize('admin', 'staff'), getAllUsers);

// Get users by role (admin & staff)
router.get('/role/:role', authorize('admin', 'staff'), getUsersByRole);

// Get parents by class (class teacher & admin)
router.get('/parents/class/:classId', getParentsByClass);

module.exports = router;