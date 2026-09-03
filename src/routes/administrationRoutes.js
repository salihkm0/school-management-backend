const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getSystemHealth,
  getSystemLogs,
  getAllUsers,
  deleteUser,
  getActiveUsers,
  testFcmNotification,
  clearCache,
  getDbStats,
  getAuditLogs,
  toggleMaintenanceMode,
  getMaintenanceMode,
  createUser,
  updateUser,
  getSystemMetrics,
  getDailyActiveUsers
} = require('../controllers/administrationController');

// All administration routes are protected and restricted to 'administration' role
router.use(protect);
router.use(authorize('administration'));

// System Monitoring
router.get('/system/health', getSystemHealth);
router.get('/system/logs', getSystemLogs);

// User management routes
router.get('/users', protect, authorize('administration'), getAllUsers);
router.post('/users', protect, authorize('administration'), createUser);
router.put('/users/:id', protect, authorize('administration'), updateUser);
router.delete('/users/:id', protect, authorize('administration'), deleteUser);

// Advanced features
router.get('/system/active-users', protect, authorize('administration'), getActiveUsers);
router.post('/system/clear-cache', protect, authorize('administration'), clearCache);
router.get('/system/maintenance', protect, authorize('administration'), getMaintenanceMode);
router.post('/system/maintenance', protect, authorize('administration'), toggleMaintenanceMode);
router.get('/system/db-stats', protect, authorize('administration'), getDbStats);
router.get('/system/metrics', protect, authorize('administration'), getSystemMetrics);
router.get('/system/daily-users', protect, authorize('administration'), getDailyActiveUsers);
router.get('/audit-logs', protect, authorize('administration'), getAuditLogs);
router.post('/fcm/test', protect, authorize('administration'), testFcmNotification);

module.exports = router;
