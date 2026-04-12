const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  sendToUser,
  sendToClass,
  sendToRole,
  sendBulk,
  sendExamNotification,
  sendMarksNotification,
  sendAttendanceNotification,
  sendDutyNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification
} = require('../controllers/notificationController');

// All routes require authentication
router.use(protect);

// User's own notifications
router.get('/', getUserNotifications);
router.put('/mark-all-read', markAllAsRead);
router.put('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

// Staff can send marks and attendance notifications
router.post('/marks', authorize('staff', 'admin'), sendMarksNotification);
router.post('/attendance', authorize('staff', 'admin'), sendAttendanceNotification);

// Admin only routes
router.use(authorize('admin'));
router.post('/user/:userId', sendToUser);
router.post('/class/:classId', sendToClass);
router.post('/role/:role', sendToRole);
router.post('/bulk', sendBulk);
router.post('/exam', sendExamNotification);
router.post('/duty', sendDutyNotification);

module.exports = router;