const Notification = require('../models/Notification');
const { broadcastToUser, broadcastToClass, broadcastToRole } = require('../config/socket');

exports.sendToUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { title, message, type, data } = req.body;
    
    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      data
    });
    
    broadcastToUser(userId, 'notification', {
      id: notification._id,
      title,
      message,
      type,
      data,
      timestamp: notification.createdAt,
      read: false
    });
    
    res.json({ success: true, message: 'Notification sent', notification });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.sendToClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { title, message, type, data } = req.body;
    
    const students = await Student.find({ classId }).select('parentIds');
    const parentIds = [...new Set(students.flatMap(s => s.parentIds))];
    
    const notifications = [];
    for (const userId of parentIds) {
      const notification = await Notification.create({
        userId,
        title,
        message,
        type,
        data
      });
      notifications.push(notification);
      
      broadcastToUser(userId, 'notification', {
        id: notification._id,
        title,
        message,
        type,
        data,
        timestamp: notification.createdAt,
        read: false
      });
    }
    
    broadcastToClass(classId, 'notification', {
      title,
      message,
      type,
      data,
      timestamp: new Date()
    });
    
    res.json({ 
      success: true, 
      message: `Notification sent to class ${classId}`,
      count: notifications.length 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
        type,
        data
      });
      notifications.push(notification);
      
      broadcastToUser(user._id, 'notification', {
        id: notification._id,
        title,
        message,
        type,
        data,
        timestamp: notification.createdAt,
        read: false
      });
    }
    
    broadcastToRole(role, 'notification', {
      title,
      message,
      type,
      data,
      timestamp: new Date()
    });
    
    res.json({ 
      success: true, 
      message: `Notification sent to all ${role}s`,
      count: notifications.length 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.sendBulk = async (req, res) => {
  try {
    const { userIds, title, message, type, data } = req.body;
    
    const notifications = [];
    for (const userId of userIds) {
      const notification = await Notification.create({
        userId,
        title,
        message,
        type,
        data
      });
      notifications.push(notification);
      
      broadcastToUser(userId, 'notification', {
        id: notification._id,
        title,
        message,
        type,
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

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findByIdAndUpdate(
      id,
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