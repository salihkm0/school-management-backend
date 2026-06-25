const os = require('os');
const mongoose = require('mongoose');
const SystemLog = require('../models/SystemLog');
const User = require('../models/User');
const { RecentActivity } = require('../models/RecentActivity');
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Parent = require('../models/Parent');
const { Exam } = require('../models/Exam');
const AppConfig = require('../models/AppConfig');
const cache = require('../config/cache');
const { getConnectedUsers } = require('../config/socket');
const admin = require('firebase-admin');

exports.getSystemHealth = async (req, res) => {
  try {
    const health = {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuLoad: os.loadavg(),
      dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      timestamp: Date.now()
    };
    
    // Add redis status if available
    const redisClient = req.app.get('redisClient');
    if (redisClient) {
      health.redisStatus = redisClient.isReady ? 'connected' : 'disconnected';
    }

    res.json(health);
  } catch (error) {
    console.error('System Health Error:', error);
    res.status(500).json({ message: 'Error retrieving system health' });
  }
};

exports.getSystemLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const skip = (page - 1) * limit;
    const level = req.query.level;

    const query = {};
    if (level) {
      query.level = level;
    }

    const logs = await SystemLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const total = await SystemLog.countDocuments(query);

    res.json({
      success: true,
      count: logs.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: logs
    });
  } catch (error) {
    console.error('System Logs Error:', error);
    res.status(500).json({ message: 'Error retrieving system logs' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments();

    res.json({
      success: true,
      count: users.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: users
    });
  } catch (error) {
    console.error('Get All Users Error:', error);
    res.status(500).json({ message: 'Error retrieving users' });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { name, email, role, phone, isActive } = req.body;
    
    // Prevent self-demotion from administration role
    if (req.user.id === req.params.id && role !== 'administration') {
      return res.status(400).json({ message: 'Cannot demote your own administration account' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, role, phone, isActive },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Update User Error:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ message: 'Cannot delete your own administration account' });
    }

    const user = await User.findByIdAndDelete(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      data: {}
    });
  } catch (error) {
    console.error('Delete User Error:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
};

// --- Advanced Features --- //

exports.getActiveUsers = async (req, res) => {
  try {
    const activeUsersList = getConnectedUsers();
    // activeUsersList is an array of objects
    const users = activeUsersList.map(u => ({
      userId: u.userId,
      email: u.email,
      role: u.role,
      connectedAt: u.connectedAt,
      lastActivity: u.lastActivity
    }));
    
    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    console.error('Active Users Error:', error);
    res.status(500).json({ message: 'Error getting active users' });
  }
};

exports.testFcmNotification = async (req, res) => {
  try {
    const { title, body, targetRole } = req.body;
    
    if (!title || !body) {
      return res.status(400).json({ message: 'Title and body are required' });
    }

    const query = targetRole && targetRole !== 'all' ? { role: targetRole } : {};
    const users = await User.find(query).select('fcmTokens');
    
    let tokens = [];
    users.forEach(u => {
      if (u.fcmTokens && u.fcmTokens.length > 0) {
        tokens = tokens.concat(u.fcmTokens.map(t => t.token));
      }
    });

    if (tokens.length === 0) {
      return res.status(404).json({ message: 'No active FCM tokens found for target users' });
    }

    // Try sending via Firebase Admin if initialized
    if (admin.apps.length > 0) {
      const message = {
        notification: { title, body },
        tokens: tokens.slice(0, 500) // max 500 per batch
      };
      
      const response = await admin.messaging().sendEachForMulticast(message);
      return res.json({ 
        success: true, 
        message: `Sent to ${response.successCount} devices, ${response.failureCount} failed.` 
      });
    } else {
      return res.status(500).json({ message: 'Firebase Admin not initialized on this server.' });
    }
  } catch (error) {
    console.error('FCM Test Error:', error);
    res.status(500).json({ message: 'Error sending push notification', error: error.message });
  }
};

exports.clearCache = async (req, res) => {
  try {
    // Clear node-cache
    cache.flushAll();
    
    // Clear Redis if available
    const redisClient = req.app.get('redisClient');
    if (redisClient && redisClient.isReady) {
      await redisClient.flushdb();
    }
    
    res.json({ success: true, message: 'All system caches have been successfully cleared.' });
  } catch (error) {
    console.error('Clear Cache Error:', error);
    res.status(500).json({ message: 'Error clearing cache' });
  }
};

exports.getDbStats = async (req, res) => {
  try {
    const cachedStats = cache.get('admin_db_stats');
    if (cachedStats) return res.json({ success: true, data: cachedStats });

    // Parallel counts
    const [students, staff, parents, exams, users, logs] = await Promise.all([
      Student.estimatedDocumentCount(),
      Staff.estimatedDocumentCount(),
      Parent.estimatedDocumentCount(),
      Exam.estimatedDocumentCount(),
      User.estimatedDocumentCount(),
      SystemLog.estimatedDocumentCount()
    ]);
    
    let storageStats = {};
    if (mongoose.connection.readyState === 1) {
      const stats = await mongoose.connection.db.stats();
      storageStats = {
        collections: stats.collections,
        objects: stats.objects,
        avgObjSize: stats.avgObjSize,
        dataSize: stats.dataSize,
        storageSize: stats.storageSize
      };
    }

    const finalStats = {
      counts: { students, staff, parents, exams, users, logs },
      storage: storageStats
    };

    cache.set('admin_db_stats', finalStats, 30); // cache for 30 seconds

    res.json({ success: true, data: finalStats });
  } catch (error) {
    console.error('DB Stats Error:', error);
    res.status(500).json({ message: 'Error getting DB statistics' });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const logs = await RecentActivity.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await RecentActivity.countDocuments();

    res.json({
      success: true,
      count: logs.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: logs
    });
  } catch (error) {
    console.error('Audit Logs Error:', error);
    res.status(500).json({ message: 'Error retrieving audit logs' });
  }
};

exports.toggleMaintenanceMode = async (req, res) => {
  try {
    const { enabled } = req.body;
    
    let config = await AppConfig.findOne({ key: 'maintenance_mode' });
    if (!config) {
      config = new AppConfig({ key: 'maintenance_mode', value: enabled });
    } else {
      config.value = enabled;
    }
    
    await config.save();
    
    // Clear node cache so the middleware picks it up immediately
    cache.del('maintenance_mode');

    // Emit socket event to force logout everyone except administration
    const { ioInstance } = require('../config/socket');
    if (ioInstance) {
      ioInstance.emit('maintenance_mode_changed', { enabled });
    }

    res.json({ success: true, message: `Maintenance mode is now ${enabled ? 'ON' : 'OFF'}` });
  } catch (error) {
    console.error('Maintenance Mode Error:', error);
    res.status(500).json({ message: 'Error toggling maintenance mode' });
  }
};
