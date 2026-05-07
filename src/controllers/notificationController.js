const Notification = require('../models/Notification');
const User = require('../models/User');
const Student = require('../models/Student');
const Class = require('../models/Class');
const { broadcastToUser, broadcastToClass, broadcastToRole } = require('../config/socket');
const fcmService = require('../services/fcmService');

// Helper function
function getGrade(percentage) {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C+';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
}

// ==================== FCM TOKEN ROUTES ====================

// @desc    Register FCM token
// @route   POST /api/notifications/register-token
// @access  Private
exports.registerFcmToken = async (req, res) => {
  try {
    const { token, deviceInfo } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: 'FCM token is required' });
    }
    
    const result = await fcmService.registerToken(req.user.id, token, deviceInfo);
    
    if (result.success) {
      res.json({ success: true, message: 'FCM token registered successfully' });
    } else {
      res.status(500).json({ message: result.error });
    }
  } catch (error) {
    console.error('Error registering FCM token:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Unregister FCM token
// @route   DELETE /api/notifications/register-token
// @access  Private
exports.unregisterFcmToken = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ message: 'FCM token is required' });
    }
    
    const result = await fcmService.unregisterToken(req.user.id, token);
    
    if (result.success) {
      res.json({ success: true, message: 'FCM token unregistered successfully' });
    } else {
      res.status(500).json({ message: result.error });
    }
  } catch (error) {
    console.error('Error unregistering FCM token:', error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== NOTIFICATION CRUD ROUTES ====================

// @desc    Get user's notifications
// @route   GET /api/notifications
// @access  Private
exports.getUserNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    
    const query = { userId: req.user.id };
    if (unreadOnly === 'true') query.isRead = false;
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ 
      userId: req.user.id, 
      isRead: false 
    });
    
    res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting user notifications:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    res.json(notification);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/mark-all-read
// @access  Private
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all as read:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findOneAndDelete({
      _id: id,
      userId: req.user.id
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== SEND NOTIFICATION ROUTES ====================

// @desc    Send notification to specific user
// @route   POST /api/notifications/user/:userId
// @access  Private/Admin
exports.sendToUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, message, type, data } = req.body;
    
    const notification = await Notification.create({
      userId,
      title,
      message,
      type: type || 'info',
      data
    });
    
    const notificationPayload = {
      id: notification._id,
      _id: notification._id,
      userId: userId,
      title,
      message,
      type: type || 'info',
      data,
      timestamp: notification.createdAt,
      createdAt: notification.createdAt,
      read: false,
      isRead: false,
    };
    
    broadcastToUser(userId, 'notification', notificationPayload);
    await fcmService.sendToUser(userId, title, message, {
      notificationId: notification._id.toString(),
      type: type || 'info',
      ...data
    });
    
    res.status(201).json({ 
      success: true, 
      message: 'Notification sent successfully',
      notification 
    });
  } catch (error) {
    console.error('Error sending to user:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send notification to class
// @route   POST /api/notifications/class/:classId
// @access  Private/Admin
exports.sendToClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { title, message, type, data } = req.body;
    
    const students = await Student.find({ classId }).select('parentIds');
    const parentIds = [...new Set(students.flatMap(s => s.parentIds))];
    
    const classItem = await Class.findById(classId).select('classTeacherId');
    if (classItem && classItem.classTeacherId) {
      parentIds.push(classItem.classTeacherId);
    }
    
    const notifications = [];
    for (const userId of parentIds) {
      const notification = await Notification.create({
        userId,
        title,
        message,
        type: type || 'info',
        data: { ...data, classId }
      });
      notifications.push(notification);
      
      broadcastToUser(userId, 'notification', {
        id: notification._id,
        _id: notification._id,
        userId: userId,
        title,
        message,
        type: type || 'info',
        data: { ...data, classId },
        timestamp: notification.createdAt,
        createdAt: notification.createdAt,
        read: false,
        isRead: false
      });
      
      await fcmService.sendToUser(userId, title, message, {
        notificationId: notification._id.toString(),
        classId,
        type: type || 'info'
      });
    }
    
    broadcastToClass(classId, 'class:notification', {
      title,
      message,
      type: type || 'info',
      data,
      timestamp: new Date()
    });
    
    res.json({ 
      success: true, 
      message: `Notification sent to class (${notifications.length} recipients)`,
      count: notifications.length 
    });
  } catch (error) {
    console.error('Error sending to class:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send notification to role
// @route   POST /api/notifications/role/:role
// @access  Private/Admin
exports.sendToRole = async (req, res) => {
  try {
    const { role } = req.params;
    const { title, message, type, data } = req.body;
    
    const users = await User.find({ role, isActive: true });
    
    const notifications = [];
    for (const user of users) {
      const notification = await Notification.create({
        userId: user._id,
        title,
        message,
        type: type || 'info',
        data
      });
      notifications.push(notification);
      
      broadcastToUser(user._id, 'notification', {
        id: notification._id,
        _id: notification._id,
        userId: user._id,
        title,
        message,
        type: type || 'info',
        data,
        timestamp: notification.createdAt,
        createdAt: notification.createdAt,
        read: false,
        isRead: false
      });
      
      await fcmService.sendToUser(user._id, title, message, {
        notificationId: notification._id.toString(),
        role,
        type: type || 'info'
      });
    }
    
    broadcastToRole(role, 'role:notification', {
      title,
      message,
      type: type || 'info',
      data,
      timestamp: new Date()
    });
    
    res.json({ 
      success: true, 
      message: `Notification sent to all ${role}s (${notifications.length} recipients)`,
      count: notifications.length 
    });
  } catch (error) {
    console.error('Error sending to role:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send bulk notifications
// @route   POST /api/notifications/bulk
// @access  Private/Admin
exports.sendBulk = async (req, res) => {
  try {
    const { userIds, title, message, type, data } = req.body;
    
    const notifications = [];
    for (const userId of userIds) {
      const notification = await Notification.create({
        userId,
        title,
        message,
        type: type || 'info',
        data
      });
      notifications.push(notification);
      
      broadcastToUser(userId, 'notification', {
        id: notification._id,
        _id: notification._id,
        userId: userId,
        title,
        message,
        type: type || 'info',
        data,
        timestamp: notification.createdAt,
        createdAt: notification.createdAt,
        read: false,
        isRead: false
      });
      
      await fcmService.sendToUser(userId, title, message, {
        notificationId: notification._id.toString(),
        type: type || 'info'
      });
    }
    
    res.json({ 
      success: true, 
      message: `Notifications sent to ${notifications.length} users`,
      notifications 
    });
  } catch (error) {
    console.error('Error sending bulk notification:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send exam notification
// @route   POST /api/notifications/exam
// @access  Private/Admin
exports.sendExamNotification = async (req, res) => {
  try {
    const { examId, examName, classIds, message, type } = req.body;
    
    const students = await Student.find({ classId: { $in: classIds } }).select('parentIds');
    const parentIds = [...new Set(students.flatMap(s => s.parentIds))];
    
    const classes = await Class.find({ _id: { $in: classIds } }).select('classTeacherId');
    const teacherIds = [...new Set(classes.map(c => c.classTeacherId).filter(Boolean))];
    
    const allUserIds = [...new Set([...parentIds, ...teacherIds])];
    
    const notifications = [];
    for (const userId of allUserIds) {
      const notification = await Notification.create({
        userId,
        title: `Exam Update: ${examName}`,
        message,
        type: type || 'info',
        data: { examId, examName, classIds }
      });
      notifications.push(notification);
      
      broadcastToUser(userId, 'notification', {
        id: notification._id,
        _id: notification._id,
        userId: userId,
        title: `Exam Update: ${examName}`,
        message,
        type: type || 'info',
        data: { examId, examName, classIds },
        timestamp: notification.createdAt,
        createdAt: notification.createdAt,
        read: false,
        isRead: false
      });
      
      await fcmService.sendToUser(userId, `Exam Update: ${examName}`, message, {
        notificationId: notification._id.toString(),
        examId,
        examName,
        type: type || 'info'
      });
    }
    
    res.json({
      success: true,
      message: `Exam notification sent to ${notifications.length} recipients`,
      count: notifications.length
    });
  } catch (error) {
    console.error('Error sending exam notification:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send marks notification
// @route   POST /api/notifications/marks
// @access  Private/Staff
exports.sendMarksNotification = async (req, res) => {
  try {
    const { studentId, studentName, examId, examName, subjectName, marksObtained, maxMarks, parentIds } = req.body;
    
    const percentage = (marksObtained / maxMarks) * 100;
    const grade = getGrade(percentage);
    
    const notifications = [];
    for (const parentId of parentIds) {
      const notification = await Notification.create({
        userId: parentId,
        title: `Marks Updated: ${subjectName}`,
        message: `${studentName} scored ${marksObtained}/${maxMarks} (${percentage.toFixed(1)}%) in ${examName}`,
        type: percentage >= 40 ? 'success' : 'warning',
        data: { studentId, studentName, examId, examName, subjectName, marksObtained, maxMarks, percentage, grade }
      });
      notifications.push(notification);
      
      broadcastToUser(parentId, 'marks:updated', {
        studentId,
        studentName,
        examId,
        examName,
        subjectName,
        marksObtained,
        maxMarks,
        percentage,
        grade,
        notificationId: notification._id
      });
      
      broadcastToUser(parentId, 'notification', {
        id: notification._id,
        _id: notification._id,
        userId: parentId,
        title: `Marks Updated: ${subjectName}`,
        message: `${studentName} scored ${marksObtained}/${maxMarks} in ${examName}`,
        type: percentage >= 40 ? 'success' : 'warning',
        timestamp: notification.createdAt,
        createdAt: notification.createdAt,
        read: false,
        isRead: false
      });
      
      await fcmService.sendToUser(parentId, `Marks Updated: ${subjectName}`, 
        `${studentName} scored ${marksObtained}/${maxMarks} in ${examName}`, {
        notificationId: notification._id.toString(),
        type: 'marks',
        studentId,
        examId
      });
    }
    
    res.json({
      success: true,
      message: `Marks notification sent to ${notifications.length} parents`
    });
  } catch (error) {
    console.error('Error sending marks notification:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send attendance notification
// @route   POST /api/notifications/attendance
// @access  Private/Staff
exports.sendAttendanceNotification = async (req, res) => {
  try {
    const { studentId, studentName, month, year, attendancePercentage, classId, parentIds } = req.body;
    
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    const status = attendancePercentage >= 75 ? 'Good' : (attendancePercentage >= 60 ? 'Average' : 'Needs Improvement');
    
    const notifications = [];
    for (const parentId of parentIds) {
      const notification = await Notification.create({
        userId: parentId,
        title: `Attendance Report - ${monthName} ${year}`,
        message: `${studentName} has ${attendancePercentage.toFixed(1)}% attendance in ${monthName}. Status: ${status}`,
        type: attendancePercentage >= 75 ? 'success' : (attendancePercentage >= 60 ? 'warning' : 'error'),
        data: { studentId, studentName, month, year, attendancePercentage, classId, status }
      });
      notifications.push(notification);
      
      broadcastToUser(parentId, 'attendance:updated', {
        studentId,
        studentName,
        month,
        year,
        attendancePercentage,
        status,
        notificationId: notification._id
      });
      
      broadcastToUser(parentId, 'notification', {
        id: notification._id,
        _id: notification._id,
        userId: parentId,
        title: `Attendance Report - ${monthName} ${year}`,
        message: `${studentName} has ${attendancePercentage.toFixed(1)}% attendance`,
        type: attendancePercentage >= 75 ? 'success' : (attendancePercentage >= 60 ? 'warning' : 'error'),
        timestamp: notification.createdAt,
        createdAt: notification.createdAt,
        read: false,
        isRead: false
      });
      
      await fcmService.sendToUser(parentId, `Attendance Report - ${monthName} ${year}`, 
        `${studentName} has ${attendancePercentage.toFixed(1)}% attendance`, {
        notificationId: notification._id.toString(),
        type: 'attendance',
        studentId,
        classId
      });
    }
    
    res.json({
      success: true,
      message: `Attendance notification sent to ${notifications.length} parents`
    });
  } catch (error) {
    console.error('Error sending attendance notification:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send duty notification
// @route   POST /api/notifications/duty
// @access  Private/Admin
exports.sendDutyNotification = async (req, res) => {
  try {
    const { staffId, staffName, className, dutyDate, dutyType, dutyId } = req.body;
    
    const staff = await User.findById(staffId);
    if (!staff) {
      return res.status(404).json({ message: 'Staff not found' });
    }
    
    const formattedDate = new Date(dutyDate).toLocaleDateString();
    const dutyTypeNames = {
      exam: 'Exam Duty',
      invigilation: 'Invigilation Duty',
      supervision: 'Supervision Duty',
      hall_monitor: 'Hall Monitor Duty',
      security: 'Security Duty'
    };
    
    const notification = await Notification.create({
      userId: staffId,
      title: `Duty Assignment: ${dutyTypeNames[dutyType] || 'Duty'}`,
      message: `You have been assigned ${dutyTypeNames[dutyType] || 'duty'} for ${className} on ${formattedDate}.`,
      type: 'info',
      data: { staffId, staffName, className, dutyDate, dutyType, dutyId }
    });
    
    broadcastToUser(staffId, 'duty:assigned', {
      dutyId,
      className,
      dutyDate,
      dutyType,
      notificationId: notification._id
    });
    
    broadcastToUser(staffId, 'notification', {
      id: notification._id,
      _id: notification._id,
      userId: staffId,
      title: `Duty Assignment: ${dutyTypeNames[dutyType] || 'Duty'}`,
      message: `You have been assigned ${dutyTypeNames[dutyType] || 'duty'} for ${className} on ${formattedDate}.`,
      type: 'info',
      timestamp: notification.createdAt,
      createdAt: notification.createdAt,
      read: false,
      isRead: false
    });
    
    await fcmService.sendToUser(staffId, `Duty Assignment: ${dutyTypeNames[dutyType] || 'Duty'}`, 
      `You have been assigned duty for ${className} on ${formattedDate}`, {
      notificationId: notification._id.toString(),
      type: 'duty',
      dutyId,
      dutyType
    });
    
    res.json({
      success: true,
      message: 'Duty notification sent successfully',
      notification
    });
  } catch (error) {
    console.error('Error sending duty notification:', error);
    res.status(500).json({ message: error.message });
  }
};