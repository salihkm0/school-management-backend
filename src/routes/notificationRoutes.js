const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  sendToUser,
  sendToClass,
  sendToRole,
  sendBulk,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = require('../controllers/notificationController');

router.use(protect);

// User's own notifications
router.get('/', getUserNotifications);
router.put('/mark-all-read', markAllAsRead);
router.put('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

// Admin only routes
router.use(authorize('admin'));
router.post('/user/:userId', sendToUser);
router.post('/class/:classId', sendToClass);
router.post('/role/:role', sendToRole);
router.post('/bulk', sendBulk);

module.exports = router;