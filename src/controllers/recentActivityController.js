// controllers/recentActivityController.js
const ActivityService = require('../services/activityService');
const { ACTIVITY_TYPES, SEVERITY, ENTITY_TYPES } = require('../models/RecentActivity');
const RecentActivity = require('../models/RecentActivity');

// Get recent activities with filters
exports.getActivities = async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      activityType,
      entityType,
      severity,
      performedBy,
      startDate,
      endDate,
      search,
      isRead
    } = req.query;
    
    const result = await ActivityService.getActivities({
      limit: parseInt(limit),
      offset: parseInt(offset),
      activityType,
      entityType,
      severity,
      performedBy,
      startDate,
      endDate,
      search,
      isRead: isRead === 'true'
    });
    
    res.json({
      success: true,
      data: result.activities,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.limit < result.total
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get activity statistics
exports.getActivityStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const stats = await ActivityService.getActivityStats({ startDate, endDate });
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get activities by entity
exports.getActivitiesByEntity = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { limit = 20 } = req.query;
    
    const activities = await RecentActivity.find({
      entityType,
      entityId
    })
      .populate('performedBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get activities by user
exports.getActivitiesByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await ActivityService.getActivities({
      performedBy: userId,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    res.json({
      success: true,
      data: result.activities,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get dashboard recent activities (for home page)
exports.getDashboardActivities = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const activities = await RecentActivity.find({ isArchived: false })
      .populate('performedBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    // Group activities for better display
    const grouped = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: []
    };
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    
    activities.forEach(activity => {
      const activityDate = new Date(activity.createdAt);
      activityDate.setHours(0, 0, 0, 0);
      
      if (activityDate.getTime() === today.getTime()) {
        grouped.today.push(activity);
      } else if (activityDate.getTime() === yesterday.getTime()) {
        grouped.yesterday.push(activity);
      } else if (activityDate >= thisWeek) {
        grouped.thisWeek.push(activity);
      } else {
        grouped.older.push(activity);
      }
    });
    
    res.json({
      success: true,
      data: grouped,
      total: activities.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark activities as read
exports.markAsRead = async (req, res) => {
  try {
    const { activityIds } = req.body;
    
    const result = await ActivityService.markAsRead(activityIds, req.user.id);
    
    res.json({
      success: true,
      message: `${result.modifiedCount} activities marked as read`
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark all as read
exports.markAllAsRead = async (req, res) => {
  try {
    await RecentActivity.updateMany(
      { performedBy: req.user.id, isRead: false },
      { isRead: true }
    );
    
    res.json({
      success: true,
      message: 'All activities marked as read'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get activity types list
exports.getActivityTypes = async (req, res) => {
  res.json({
    success: true,
    data: {
      types: Object.values(ACTIVITY_TYPES),
      severity: Object.values(SEVERITY),
      entityTypes: Object.values(ENTITY_TYPES)
    }
  });
};

// Archive activities
exports.archiveActivities = async (req, res) => {
  try {
    const { daysOld = 30 } = req.body;
    
    const result = await ActivityService.archiveOldActivities(daysOld);
    
    res.json({
      success: true,
      message: `${result.modifiedCount} activities archived`,
      count: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete archived activities
exports.deleteArchivedActivities = async (req, res) => {
  try {
    const { daysOld = 90 } = req.body;
    
    const result = await ActivityService.deleteOldActivities(daysOld);
    
    res.json({
      success: true,
      message: `${result.deletedCount} archived activities deleted`,
      count: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};