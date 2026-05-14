// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getAdminDashboard,
  getStaffDashboard,
  getParentDashboard
} = require('../controllers/dashboardController');

// Admin dashboard - accessible only by admin
router.get('/admin', protect, authorize('admin'), getAdminDashboard);

// Staff dashboard - accessible only by staff
router.get('/staff', protect, authorize('staff'), getStaffDashboard);

// Parent dashboard - accessible only by parents
router.get('/parent', protect, authorize('parent'), getParentDashboard);

module.exports = router;