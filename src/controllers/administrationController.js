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
const SystemMetric = require('../models/SystemMetric');
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
      const status = redisClient.status; // 'ready' | 'connecting' | 'close' | 'end'
      health.redisStatus = status === 'ready' ? 'connected' : status;
      try {
        const info = await redisClient.info('all');
        const extract = (key) => {
          const match = info.match(new RegExp(`${key}:(\\S+)`));
          return match ? match[1] : null;
        };
        health.redisInfo = {
          version:         extract('redis_version'),
          uptimeSeconds:   extract('uptime_in_seconds'),
          usedMemory:      extract('used_memory_human'),
          maxMemory:       extract('maxmemory_human'),
          connectedClients:extract('connected_clients'),
          totalKeys:       extract('db0') || '0',
          mode:            extract('redis_mode'),
        };
      } catch (_) {
        // INFO failed — still show connection status
      }
    } else {
      health.redisStatus = 'not configured';
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

exports.updateUser = async (req, res) => {
  try {
    const { name, email, role, phone, isActive, password } = req.body;
    
    // Prevent self-demotion from administration role
    if (req.user.id === req.params.id && role && role !== 'administration') {
      return res.status(400).json({ message: 'Cannot demote your own administration account' });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (role) user.role = role;
    if (phone) user.phone = phone;
    if (isActive !== undefined) user.isActive = isActive;
    
    // Only update password if provided
    if (password && password.trim() !== '') {
      user.password = password;
    }

    await user.save();

    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Update User Error:', error);
    res.status(400).json({ message: error.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, email, role, phone, password, isActive } = req.body;
    
    const user = new User({
      name,
      email,
      role,
      phone,
      password,
      isActive: isActive !== undefined ? isActive : true
    });

    await user.save();

    res.status(201).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Create User Error:', error);
    // Handle duplicate key errors gracefully
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ message: `A user with this ${field} already exists.` });
    }
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
    res.status(500).json({ message: 'Error retrieving active users' });
  }
};

// ==========================================
// ADVANCED CHARTS & METRICS
// ==========================================

exports.getSystemMetrics = async (req, res) => {
  try {
    const range = req.query.range || '24h';
    let since = new Date();
    let groupBy = null;

    if (range === '24h') {
      since.setHours(since.getHours() - 24);
      // For 24h, we can return raw data or group by hour/15min. Since it's max 96 points, raw is fine.
    } else if (range === '7d') {
      since.setDate(since.getDate() - 7);
      // Group by Hour
      groupBy = {
        year: { $year: "$timestamp" },
        month: { $month: "$timestamp" },
        day: { $dayOfMonth: "$timestamp" },
        hour: { $hour: "$timestamp" }
      };
    } else if (range === '30d') {
      since.setDate(since.getDate() - 30);
      // Group by Day
      groupBy = {
        year: { $year: "$timestamp" },
        month: { $month: "$timestamp" },
        day: { $dayOfMonth: "$timestamp" }
      };
    }

    let metrics;

    if (groupBy) {
      const agg = await SystemMetric.aggregate([
        { $match: { timestamp: { $gte: since } } },
        {
          $group: {
            _id: groupBy,
            cpuLoad: { $avg: "$cpuLoad" },
            memoryUsed: { $avg: "$memoryUsed" },
            totalMemory: { $avg: "$totalMemory" },
            timestamp: { $first: "$timestamp" } // Use the first timestamp in the group for ordering/display
          }
        },
        { $sort: { timestamp: 1 } }
      ]);
      metrics = agg.map(m => ({
        timestamp: m.timestamp,
        cpuLoad: m.cpuLoad,
        memoryUsed: m.memoryUsed,
        totalMemory: m.totalMemory
      }));
    } else {
      metrics = await SystemMetric.find({ timestamp: { $gte: since } })
        .select('timestamp cpuLoad memoryUsed totalMemory')
        .sort({ timestamp: 1 })
        .lean();
    }
      
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('System Metrics Error:', error);
    res.status(500).json({ message: 'Error retrieving system metrics' });
  }
};

exports.getDailyActiveUsers = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    // We group by year, month, day to get unique logins per day
    const dauStats = await RecentActivity.aggregate([
      {
        $match: {
          activityType: 'user_login',
          createdAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
            user: "$performedBy" // group by user first to get unique users per day
          }
        }
      },
      {
        $group: {
          _id: {
            year: "$_id.year",
            month: "$_id.month",
            day: "$_id.day"
          },
          activeUsers: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
      }
    ]);
    
    // Format the response to be chart-friendly
    const formattedData = dauStats.map(stat => {
      // Create a date string (e.g. "2026-07-24")
      const dateStr = `${stat._id.year}-${String(stat._id.month).padStart(2, '0')}-${String(stat._id.day).padStart(2, '0')}`;
      return {
        date: dateStr,
        activeUsers: stat.activeUsers
      };
    });

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('DAU Error:', error);
    res.status(500).json({ message: 'Error retrieving daily active users' });
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
