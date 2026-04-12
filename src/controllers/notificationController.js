const Notification = require('../models/Notification');
const User = require('../models/User');
const Student = require('../models/Student');
const Class = require('../models/Class');
const { broadcastToUser, broadcastToClass, broadcastToRole } = require('../config/socket');

// @desc    Send notification to specific user
// @route   POST /api/notifications/user/:userId
// @access  Private/Admin
exports.sendToUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, message, type, data } = req.body;
    
    console.log(`📨 Sending notification to user: ${userId}`);
    console.log(`Notification data:`, { title, message, type, data });
    
    const notification = await Notification.create({
      userId,
      title,
      message,
      type: type || 'info',
      data
    });
    
    // Populate notification with additional data
    const populatedNotification = await Notification.findById(notification._id)
      .populate('userId', 'name email role');
    
    // Prepare the notification payload
    const notificationPayload = {
      id: notification._id,
      _id: notification._id,
      userId: userId,
      title: title,
      message: message,
      type: type || 'info',
      data: data,
      timestamp: notification.createdAt,
      createdAt: notification.createdAt,
      read: false,
      isRead: false,
      user: populatedNotification.userId ? {
        id: populatedNotification.userId._id,
        name: populatedNotification.userId.name,
        email: populatedNotification.userId.email,
        role: populatedNotification.userId.role
      } : null
    };
    
    console.log(`📡 Broadcasting to user room: user:${userId}`);
    console.log(`Notification payload:`, JSON.stringify(notificationPayload, null, 2));
    
    // Send real-time notification via Socket.IO to the user's room
    broadcastToUser(userId, 'notification', notificationPayload);
    
    // Also emit to the user's specific notification room
    if (ioInstance) {
      ioInstance.to(`user:${userId}:notifications`).emit('notification', notificationPayload);
      console.log(`Also emitted to user:${userId}:notifications room`);
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Notification sent successfully',
      notification 
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send notification to entire class
// @route   POST /api/notifications/class/:classId
// @access  Private/Admin
exports.sendToClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { title, message, type, data } = req.body;
    
    // Get all students in the class
    const students = await Student.find({ classId }).select('parentIds');
    const parentIds = [...new Set(students.flatMap(s => s.parentIds))];
    
    // Also get the class teacher
    const classItem = await Class.findById(classId).select('classTeacherId');
    if (classItem && classItem.classTeacherId) {
      const teacher = await User.findById(classItem.classTeacherId);
      if (teacher) {
        parentIds.push(teacher._id);
      }
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
      
      // Send real-time notification via Socket.IO
      broadcastToUser(userId, 'notification', {
        id: notification._id,
        title,
        message,
        type: type || 'info',
        data: { ...data, classId },
        timestamp: notification.createdAt,
        read: false
      });
    }
    
    // Also broadcast to the class room for real-time updates
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
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send notification to all users with a specific role
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
      
      // Send real-time notification via Socket.IO
      broadcastToUser(user._id, 'notification', {
        id: notification._id,
        title,
        message,
        type: type || 'info',
        data,
        timestamp: notification.createdAt,
        read: false
      });
    }
    
    // Broadcast to role room
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
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send bulk notifications to multiple users
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
      
      // Send real-time notification via Socket.IO
      broadcastToUser(userId, 'notification', {
        id: notification._id,
        title,
        message,
        type: type || 'info',
        data,
        timestamp: notification.createdAt,
        read: false
      });
    }
    
    res.json({ 
      success: true, 
      message: `Notifications sent to ${notifications.length} users`,
      notifications 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send exam-related notification
// @route   POST /api/notifications/exam
// @access  Private/Admin
exports.sendExamNotification = async (req, res) => {
  try {
    const { examId, examName, classIds, message, type } = req.body;
    
    // Get all students in these classes
    const students = await Student.find({ classId: { $in: classIds } }).select('parentIds');
    const parentIds = [...new Set(students.flatMap(s => s.parentIds))];
    
    // Get class teachers
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
        title: `Exam Update: ${examName}`,
        message,
        type: type || 'info',
        data: { examId, examName, classIds },
        timestamp: notification.createdAt,
        read: false
      });
    }
    
    res.json({
      success: true,
      message: `Exam notification sent to ${notifications.length} recipients`,
      count: notifications.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send marks-related notification
// @route   POST /api/notifications/marks
// @access  Private/Staff
exports.sendMarksNotification = async (req, res) => {
  try {
    const { studentId, studentName, examId, examName, subjectName, marksObtained, maxMarks } = req.body;
    
    const student = await Student.findById(studentId).select('parentIds');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    const percentage = (marksObtained / maxMarks) * 100;
    const grade = getGrade(percentage);
    
    const notifications = [];
    for (const parentId of student.parentIds) {
      const notification = await Notification.create({
        userId: parentId,
        title: `Marks Updated: ${subjectName}`,
        message: `${studentName} scored ${marksObtained}/${maxMarks} (${percentage.toFixed(1)}%) in ${examName} - ${subjectName}. Grade: ${grade}`,
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
        title: `Marks Updated: ${subjectName}`,
        message: `${studentName} scored ${marksObtained}/${maxMarks} (${percentage.toFixed(1)}%) in ${examName}`,
        type: percentage >= 40 ? 'success' : 'warning',
        timestamp: notification.createdAt,
        read: false
      });
    }
    
    res.json({
      success: true,
      message: `Marks notification sent to ${notifications.length} parents`
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send attendance notification
// @route   POST /api/notifications/attendance
// @access  Private/Staff
exports.sendAttendanceNotification = async (req, res) => {
  try {
    const { studentId, studentName, month, year, attendancePercentage, classId } = req.body;
    
    const student = await Student.findById(studentId).select('parentIds');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    const status = attendancePercentage >= 75 ? 'Good' : (attendancePercentage >= 60 ? 'Average' : 'Needs Improvement');
    
    const notifications = [];
    for (const parentId of student.parentIds) {
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
        title: `Attendance Report - ${monthName} ${year}`,
        message: `${studentName} has ${attendancePercentage.toFixed(1)}% attendance`,
        type: attendancePercentage >= 75 ? 'success' : (attendancePercentage >= 60 ? 'warning' : 'error'),
        timestamp: notification.createdAt,
        read: false
      });
    }
    
    res.json({
      success: true,
      message: `Attendance notification sent to ${notifications.length} parents`
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Send duty notification to staff
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
      title: `Duty Assignment: ${dutyTypeNames[dutyType] || 'Duty'}`,
      message: `You have been assigned ${dutyTypeNames[dutyType] || 'duty'} for ${className} on ${formattedDate}.`,
      type: 'info',
      timestamp: notification.createdAt,
      read: false
    });
    
    res.json({
      success: true,
      message: 'Duty notification sent successfully',
      notification
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
    res.status(500).json({ message: error.message });
  }
};

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