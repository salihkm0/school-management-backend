// services/activityService.js
const { RecentActivity, ACTIVITY_TYPES, SEVERITY, ENTITY_TYPES } = require('../models/RecentActivity');
const { broadcastToRole } = require('../config/socket');

class ActivityService {
  
  // Create a single activity
  static async logActivity({
    title,
    description,
    activityType,
    entityType,
    entityId = null,
    entityModel = null,
    relatedIds = [],
    relatedModel = null,
    performedBy,
    performedByName,
    performedByRole,
    details = {},
    changes = null,
    ipAddress = null,
    userAgent = null,
    metadata = {},
    sessionId = null,
    batchId = null,
    severity = SEVERITY.INFO
  }) {
    try {
      const activity = await RecentActivity.create({
        title,
        description,
        activityType,
        entityType,
        entityId,
        entityModel,
        relatedIds,
        relatedModel,
        performedBy,
        performedByName,
        performedByRole,
        details,
        changes,
        ipAddress,
        userAgent,
        metadata,
        sessionId,
        batchId,
        severity
      });
      
      // Broadcast real-time to admins and relevant roles
      broadcastToRole('admin', 'activity:created', {
        id: activity._id,
        title: activity.title,
        description: activity.description,
        activityType: activity.activityType,
        severity: activity.severity,
        performedByName: activity.performedByName,
        createdAt: activity.createdAt,
        icon: activity.getIcon(),
        color: activity.getColor()
      });
      
      // Also broadcast to specific roles based on activity type
      if (activityType.includes('student')) {
        broadcastToRole('staff', 'activity:student', activity);
      } else if (activityType.includes('exam')) {
        broadcastToRole('staff', 'activity:exam', activity);
      } else if (activityType.includes('mark')) {
        broadcastToRole('staff', 'activity:mark', activity);
      }
      
      return activity;
    } catch (error) {
      console.error('Error logging activity:', error);
      return null;
    }
  }
  
  // Log student related activities
  static async logStudentActivity(action, student, performedBy, req, additionalData = {}) {
    const activityMap = {
      create: { type: ACTIVITY_TYPES.STUDENT_ADDED, severity: SEVERITY.SUCCESS, title: 'Student Added' },
      update: { type: ACTIVITY_TYPES.STUDENT_UPDATED, severity: SEVERITY.INFO, title: 'Student Updated' },
      delete: { type: ACTIVITY_TYPES.STUDENT_DELETED, severity: SEVERITY.WARNING, title: 'Student Deleted' },
      promote: { type: ACTIVITY_TYPES.STUDENT_PROMOTED, severity: SEVERITY.SUCCESS, title: 'Student Promoted' }
    };
    
    const config = activityMap[action];
    if (!config) return null;
    
    return await this.logActivity({
      title: config.title,
      description: additionalData.description || `${student.name} has been ${action}d`,
      activityType: config.type,
      entityType: ENTITY_TYPES.STUDENT,
      entityId: student._id,
      entityModel: 'Student',
      performedBy: performedBy._id,
      performedByName: performedBy.name,
      performedByRole: performedBy.role,
      details: { student: student.toObject(), ...additionalData },
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      severity: config.severity
    });
  }
  
  // Log exam related activities
  static async logExamActivity(action, exam, performedBy, req, additionalData = {}) {
    const activityMap = {
      create: { type: ACTIVITY_TYPES.EXAM_CREATED, severity: SEVERITY.SUCCESS, title: 'Exam Created' },
      update: { type: ACTIVITY_TYPES.EXAM_UPDATED, severity: SEVERITY.INFO, title: 'Exam Updated' },
      delete: { type: ACTIVITY_TYPES.EXAM_DELETED, severity: SEVERITY.WARNING, title: 'Exam Deleted' },
      publish: { type: ACTIVITY_TYPES.EXAM_PUBLISHED, severity: SEVERITY.SUCCESS, title: 'Exam Published' },
      publishResults: { type: ACTIVITY_TYPES.EXAM_RESULTS_PUBLISHED, severity: SEVERITY.SUCCESS, title: 'Results Published' }
    };
    
    const config = activityMap[action];
    if (!config) return null;
    
    return await this.logActivity({
      title: config.title,
      description: additionalData.description || `${exam.displayName || exam.name} has been ${action}d`,
      activityType: config.type,
      entityType: ENTITY_TYPES.EXAM,
      entityId: exam._id,
      entityModel: 'Exam',
      performedBy: performedBy._id,
      performedByName: performedBy.name,
      performedByRole: performedBy.role,
      details: { exam: { name: exam.name, examType: exam.examType, classCount: exam.classIds?.length }, ...additionalData },
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      severity: config.severity
    });
  }
  
  // Log marks related activities
  static async logMarksActivity(action, data, performedBy, req, additionalData = {}) {
    const activityMap = {
      enter: { type: ACTIVITY_TYPES.MARKS_ENTERED, severity: SEVERITY.INFO, title: 'Marks Entered' },
      update: { type: ACTIVITY_TYPES.MARKS_UPDATED, severity: SEVERITY.INFO, title: 'Marks Updated' },
      finalize: { type: ACTIVITY_TYPES.MARKS_FINALIZED, severity: SEVERITY.SUCCESS, title: 'Marks Finalized' },
      review: { type: ACTIVITY_TYPES.MARKS_REVIEWED, severity: SEVERITY.INFO, title: 'Marks Reviewed' }
    };
    
    const config = activityMap[action];
    if (!config) return null;
    
    return await this.logActivity({
      title: config.title,
      description: additionalData.description || `${data.count || 'Marks'} have been ${action}d for ${data.examName}`,
      activityType: config.type,
      entityType: ENTITY_TYPES.MARK,
      performedBy: performedBy._id,
      performedByName: performedBy.name,
      performedByRole: performedBy.role,
      details: { marks: data, ...additionalData },
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      severity: config.severity
    });
  }
  
  // Log bulk activities with same batch ID
  static async logBulkActivity(activities, performedBy, req) {
    const batchId = new mongoose.Types.ObjectId().toString();
    const loggedActivities = [];
    
    for (const activity of activities) {
      const logged = await this.logActivity({
        ...activity,
        performedBy: performedBy._id,
        performedByName: performedBy.name,
        performedByRole: performedBy.role,
        batchId,
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent']
      });
      if (logged) loggedActivities.push(logged);
    }
    
    return { batchId, count: loggedActivities.length, activities: loggedActivities };
  }
  
  // Get recent activities with filters
  static async getActivities({
    limit = 50,
    offset = 0,
    activityType = null,
    entityType = null,
    severity = null,
    performedBy = null,
    startDate = null,
    endDate = null,
    search = null,
    isRead = null,
    isArchived = false
  }) {
    const query = { isArchived };
    
    if (activityType) query.activityType = activityType;
    if (entityType) query.entityType = entityType;
    if (severity) query.severity = severity;
    if (performedBy) query.performedBy = performedBy;
    if (isRead !== null) query.isRead = isRead;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { performedByName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const [activities, total] = await Promise.all([
      RecentActivity.find(query)
        .populate('performedBy', 'name email role')
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit),
      RecentActivity.countDocuments(query)
    ]);
    
    return { activities, total, limit, offset };
  }
  
  // Get activity statistics
  static async getActivityStats({ startDate, endDate }) {
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    const query = dateFilter.createdAt ? { createdAt: dateFilter } : {};
    
    const [total, byType, bySeverity, recent] = await Promise.all([
      RecentActivity.countDocuments(query),
      RecentActivity.aggregate([
        { $match: query },
        { $group: { _id: '$activityType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      RecentActivity.aggregate([
        { $match: query },
        { $group: { _id: '$severity', count: { $sum: 1 } } }
      ]),
      RecentActivity.find(query)
        .sort({ createdAt: -1 })
        .limit(10)
    ]);
    
    return { total, byType, bySeverity, recent };
  }
  
  // Mark activities as read
  static async markAsRead(activityIds, userId) {
    return await RecentActivity.updateMany(
      { _id: { $in: activityIds }, isRead: false },
      { isRead: true }
    );
  }
  
  // Archive old activities
  static async archiveOldActivities(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    return await RecentActivity.updateMany(
      { createdAt: { $lt: cutoffDate }, isArchived: false },
      { isArchived: true }
    );
  }
  
  // Delete activities older than specified days
  static async deleteOldActivities(daysOld = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    return await RecentActivity.deleteMany({
      createdAt: { $lt: cutoffDate },
      isArchived: true
    });
  }
}

module.exports = ActivityService;