// const express = require('express');
// const router = express.Router();
// const { protect, authorize } = require('../middleware/auth');
// const {
//   sendToUser,
//   sendToClass,
//   sendToRole,
//   sendBulk,
//   sendExamNotification,
//   sendMarksNotification,
//   sendAttendanceNotification,
//   sendDutyNotification,
//   getUserNotifications,
//   markAsRead,
//   markAllAsRead,
//   deleteNotification
// } = require('../controllers/notificationController');

// // All routes require authentication
// router.use(protect);

// // User's own notifications
// router.get('/', getUserNotifications);
// router.put('/mark-all-read', markAllAsRead);
// router.put('/:id/read', markAsRead);
// router.delete('/:id', deleteNotification);

// // Staff can send marks and attendance notifications
// router.post('/marks', authorize('staff', 'admin'), sendMarksNotification);
// router.post('/attendance', authorize('staff', 'admin'), sendAttendanceNotification);

// // Admin only routes
// router.use(authorize('admin'));
// router.post('/user/:userId', sendToUser);
// router.post('/class/:classId', sendToClass);
// router.post('/role/:role', sendToRole);
// router.post('/bulk', sendBulk);
// router.post('/exam', sendExamNotification);
// router.post('/duty', sendDutyNotification);

// module.exports = router;


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
  deleteNotification,
  registerFcmToken,
  unregisterFcmToken
} = require('../controllers/notificationController');

// FCM Token routes
router.post('/register-token', protect, registerFcmToken);
router.delete('/register-token', protect, unregisterFcmToken);

// User's own notifications
router.get('/', protect, getUserNotifications);
router.put('/mark-all-read', protect, markAllAsRead);
router.put('/:id/read', protect, markAsRead);
router.delete('/:id', protect, deleteNotification);

// Staff can send marks notifications
router.post('/marks', protect, authorize('staff', 'admin'), sendMarksNotification);

// Admin only routes
router.post('/user/:userId', protect, authorize('admin'), sendToUser);
router.post('/class/:classId', protect, authorize('admin'), sendToClass);
router.post('/role/:role', protect, authorize('admin'), sendToRole);
router.post('/bulk', protect, authorize('admin'), sendBulk);
router.post('/exam', protect, authorize('admin'), sendExamNotification);
router.post('/attendance', protect, authorize('admin'), sendAttendanceNotification);
router.post('/duty', protect, authorize('admin'), sendDutyNotification);

module.exports = router;