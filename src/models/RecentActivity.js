// models/RecentActivity.js
const mongoose = require('mongoose');

// Activity types
const ACTIVITY_TYPES = {
  // Student related
  STUDENT_ADDED: 'student_added',
  STUDENT_UPDATED: 'student_updated',
  STUDENT_DELETED: 'student_deleted',
  STUDENT_PROMOTED: 'student_promoted',
  STUDENT_TRANSFERRED: 'student_transferred',
  STUDENT_GRADUATED: 'student_graduated',
  
  // Staff related
  STAFF_ADDED: 'staff_added',
  STAFF_UPDATED: 'staff_updated',
  STAFF_DELETED: 'staff_deleted',
  STAFF_ROLE_CHANGED: 'staff_role_changed',
  
  // Exam related
  EXAM_CREATED: 'exam_created',
  EXAM_UPDATED: 'exam_updated',
  EXAM_DELETED: 'exam_deleted',
  EXAM_PUBLISHED: 'exam_published',
  EXAM_RESULTS_PUBLISHED: 'exam_results_published',
  
  // Marks related
  MARKS_ENTERED: 'marks_entered',
  MARKS_UPDATED: 'marks_updated',
  MARKS_FINALIZED: 'marks_finalized',
  MARKS_REVIEWED: 'marks_reviewed',
  
  // Attendance related
  ATTENDANCE_MARKED: 'attendance_marked',
  ATTENDANCE_UPDATED: 'attendance_updated',
  ATTENDANCE_WARNING_SENT: 'attendance_warning_sent',
  
  // Duty related
  DUTY_ASSIGNED: 'duty_assigned',
  DUTY_UPDATED: 'duty_updated',
  DUTY_AUTO_ASSIGNED: 'duty_auto_assigned',
  
  // Class related
  CLASS_CREATED: 'class_created',
  CLASS_UPDATED: 'class_updated',
  CLASS_DELETED: 'class_deleted',
  CLASS_TEACHER_ASSIGNED: 'class_teacher_assigned',
  TIMETABLE_UPDATED: 'timetable_updated',
  TEMPLATE_APPLIED: 'template_applied',
  SUBJECT_SYNCED: 'subject_synced',
  
  // Subject related
  SUBJECT_CREATED: 'subject_created',
  SUBJECT_UPDATED: 'subject_updated',
  SUBJECT_DELETED: 'subject_deleted',
  SUBJECT_ASSIGNED: 'subject_assigned',
  SUBJECT_REMOVED: 'subject_removed',
  SUBJECT_TEACHER_ASSIGNED: 'subject_teacher_assigned',
  BULK_SUBJECT_TEACHER_ASSIGNED: 'bulk_subject_teacher_assigned',
  SUBJECT_TEACHER_REMOVED: 'subject_teacher_removed',
  LANGUAGE_SUBJECTS_SYNCED: 'language_subjects_synced',
  BULK_LANGUAGE_SUBJECTS_SYNCED: 'bulk_language_subjects_synced',
  
  // Academic Year related
  ACADEMIC_YEAR_CREATED: 'academic_year_created',
  ACADEMIC_YEAR_UPDATED: 'academic_year_updated',
  ACADEMIC_YEAR_DELETED: 'academic_year_deleted',
  ACADEMIC_YEAR_SET_CURRENT: 'academic_year_set_current',
  
  // User related
  USER_REGISTERED: 'user_registered',
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  
  // Notification related
  NOTIFICATION_SENT: 'notification_sent',
  NOTIFICATION_BULK_SENT: 'notification_bulk_sent',
  
  // Authentication related
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  PASSWORD_CHANGED: 'password_changed',
  
  // System related
  SYSTEM_BACKUP: 'system_backup',
  SYSTEM_RESTORE: 'system_restore',
  DATA_IMPORTED: 'data_imported',
  DATA_EXPORTED: 'data_exported'
};

// Severity levels
const SEVERITY = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error'
};

// Entity types for quick filtering
const ENTITY_TYPES = {
  STUDENT: 'student',
  STAFF: 'staff',
  EXAM: 'exam',
  MARK: 'mark',
  ATTENDANCE: 'attendance',
  DUTY: 'duty',
  CLASS: 'class',
  SUBJECT: 'subject',
  NOTIFICATION: 'notification',
  USER: 'user',
  SYSTEM: 'system',
  ACADEMIC_YEAR: 'academic_year'
};

const RecentActivitySchema = new mongoose.Schema({
  // Basic info
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  activityType: {
    type: String,
    enum: Object.values(ACTIVITY_TYPES),
    required: true
  },
  entityType: {
    type: String,
    enum: Object.values(ENTITY_TYPES),
    required: true
  },
  severity: {
    type: String,
    enum: Object.values(SEVERITY),
    default: SEVERITY.INFO
  },
  
  // Related entities
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'entityModel'
  },
  entityModel: {
    type: String,
    enum: ['Student', 'Staff', 'Exam', 'Mark', 'Attendance', 'StaffDuty', 'Class', 'Subject', 'User', 'Notification', 'AcademicYear']
  },
  relatedIds: [{
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel'
  }],
  relatedModel: String,
  
  // User who performed the action
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  performedByName: {
    type: String,
    required: true
  },
  performedByRole: {
    type: String,
    required: true
  },
  
  // Details
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Changes (for update operations)
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    fields: [String]
  },
  
  // IP and device info
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // For grouping related activities
  sessionId: {
    type: String
  },
  batchId: {
    type: String
  },
  
  // Status
  isRead: {
    type: Boolean,
    default: false
  },
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
RecentActivitySchema.index({ createdAt: -1 });
RecentActivitySchema.index({ performedBy: 1, createdAt: -1 });
RecentActivitySchema.index({ entityType: 1, entityId: 1 });
RecentActivitySchema.index({ activityType: 1, createdAt: -1 });
RecentActivitySchema.index({ severity: 1, createdAt: -1 });
RecentActivitySchema.index({ isRead: 1 });
RecentActivitySchema.index({ batchId: 1 });
RecentActivitySchema.index({ 'details.classId': 1 });
RecentActivitySchema.index({ 'details.examId': 1 });
RecentActivitySchema.index({ performedByRole: 1, createdAt: -1 });

// Compound indexes for common queries
RecentActivitySchema.index({ createdAt: -1, performedByRole: 1 });
RecentActivitySchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
RecentActivitySchema.index({ activityType: 1, severity: 1, createdAt: -1 });

// Virtual for time ago
RecentActivitySchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) > 1 ? 's' : ''} ago`;
});

// Method to get icon based on activity type
RecentActivitySchema.methods.getIcon = function() {
  const icons = {
    // Student
    student_added: '👨‍🎓', student_updated: '📝', student_deleted: '🗑️', student_promoted: '🎓', student_transferred: '🚚', student_graduated: '🎉',
    // Staff
    staff_added: '👨‍🏫', staff_updated: '📝', staff_deleted: '🗑️', staff_role_changed: '🔄',
    // Exam
    exam_created: '📚', exam_updated: '📝', exam_deleted: '🗑️', exam_published: '📊', exam_results_published: '📈',
    // Marks
    marks_entered: '✏️', marks_updated: '📝', marks_finalized: '✅', marks_reviewed: '👁️',
    // Attendance
    attendance_marked: '📅', attendance_updated: '📝', attendance_warning_sent: '⚠️',
    // Duty
    duty_assigned: '📋', duty_updated: '📝', duty_auto_assigned: '🤖',
    // Class
    class_created: '🏫', class_updated: '📝', class_deleted: '🗑️', class_teacher_assigned: '👨‍🏫', timetable_updated: '📅',
    // Subject
    subject_created: '📖', subject_updated: '📝', subject_deleted: '🗑️', subject_assigned: '📌', subject_removed: '❌',
    subject_teacher_assigned: '👨‍🏫', subject_teacher_removed: '🚫',
    // Academic Year
    academic_year_created: '📅', academic_year_updated: '📝', academic_year_deleted: '🗑️', academic_year_set_current: '⭐',
    // User
    user_registered: '👤', user_login: '🔑', user_logout: '🚪', password_changed: '🔒', password_reset_requested: '📧',
    // Notification
    notification_sent: '🔔', notification_bulk_sent: '📢',
    // System
    data_imported: '📥', data_exported: '📤', system_backup: '💾', system_restore: '🔄'
  };
  return icons[this.activityType] || '📌';
};

// Method to get color based on severity
RecentActivitySchema.methods.getColor = function() {
  const colors = {
    info: '#2196F3',   // Blue
    success: '#4CAF50', // Green
    warning: '#FF9800', // Orange
    error: '#F44336'    // Red
  };
  return colors[this.severity] || '#2196F3';
};

// Method to get CSS class based on severity
RecentActivitySchema.methods.getCssClass = function() {
  const classes = {
    info: 'bg-blue-100 text-blue-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800'
  };
  return classes[this.severity] || 'bg-gray-100 text-gray-800';
};

// Static method to get recent activities for dashboard
RecentActivitySchema.statics.getDashboardActivities = async function(limit = 10, userRole = null) {
  const query = { isArchived: false };
  
  // Filter by user role if needed
  if (userRole === 'parent') {
    // Parents see only child-related activities
    query['details.hasParentView'] = true;
  } else if (userRole === 'staff') {
    // Staff see class-related activities
    query.$or = [
      { performedByRole: 'staff' },
      { 'details.staffAccessible': true }
    ];
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('performedBy', 'name email role');
};

// Static method to get activities by entity
RecentActivitySchema.statics.getByEntity = async function(entityType, entityId, limit = 50) {
  return this.find({ entityType, entityId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('performedBy', 'name email role');
};

// Static method to get activities by user
RecentActivitySchema.statics.getByUser = async function(userId, limit = 50) {
  return this.find({ performedBy: userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to archive old activities
RecentActivitySchema.statics.archiveOldActivities = async function(daysToKeep = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  return this.updateMany(
    { createdAt: { $lt: cutoffDate }, isArchived: false },
    { isArchived: true }
  );
};

// Pre-save middleware
RecentActivitySchema.pre('save', function(next) {
  // Ensure title is set if not provided
  if (!this.title && this.activityType) {
    const activityLabels = {
      student_added: 'Student Added',
      student_updated: 'Student Updated',
      student_deleted: 'Student Deleted',
      staff_added: 'Staff Added',
      exam_created: 'Exam Created',
      exam_published: 'Exam Published',
      attendance_marked: 'Attendance Marked',
      duty_assigned: 'Duty Assigned',
      class_created: 'Class Created',
      user_login: 'User Login',
      user_logout: 'User Logout',
      password_changed: 'Password Changed'
    };
    this.title = activityLabels[this.activityType] || 'Activity';
  }
  
  next();
});

// Create the model
const RecentActivity = mongoose.models.RecentActivity || mongoose.model('RecentActivity', RecentActivitySchema);

// Export all constants and the model
module.exports = {
  RecentActivity,
  ACTIVITY_TYPES,
  SEVERITY,
  ENTITY_TYPES
};