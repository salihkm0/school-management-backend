// routes/recentActivityRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getActivities,
  getActivityStats,
  getActivitiesByEntity,
  getActivitiesByUser,
  getDashboardActivities,
  markAsRead,
  markAllAsRead,
  getActivityTypes,
  archiveActivities,
  deleteArchivedActivities
} = require('../controllers/recentActivityController');

router.use(protect);

// Public routes (all authenticated users)
router.get('/dashboard', getDashboardActivities);
router.get('/types', getActivityTypes);
router.get('/stats', getActivityStats);

// Main activities routes
router.get('/', getActivities);
router.post('/mark-read', markAsRead);
router.post('/mark-all-read', markAllAsRead);

// Entity specific routes
router.get('/entity/:entityType/:entityId', getActivitiesByEntity);
router.get('/user/:userId', getActivitiesByUser);

// Admin only routes
router.post('/archive', authorize('admin'), archiveActivities);
router.delete('/cleanup', authorize('admin'), deleteArchivedActivities);

module.exports = router;