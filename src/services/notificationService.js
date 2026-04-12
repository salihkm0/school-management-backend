// src/services/notificationService.js
const Notification = require('../models/Notification');
const { broadcastToUser, broadcastToClass, broadcastToRole } = require('../config/socket');

class NotificationService {
  // Send notification to a single user
  static async sendToUser(userId, title, message, type = 'info', data = {}) {
    try {
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
      
      return notification;
    } catch (error) {
      console.error('Error sending notification:', error);
      return null;
    }
  }
  
  // Send notification to multiple users
  static async sendToMultipleUsers(userIds, title, message, type = 'info', data = {}) {
    const notifications = [];
    for (const userId of userIds) {
      const notification = await this.sendToUser(userId, title, message, type, data);
      if (notification) notifications.push(notification);
    }
    return notifications;
  }
  
  // Send notification to all parents of a student
  static async sendToStudentParents(studentId, title, message, type = 'info', data = {}) {
    const Student = require('../models/Student');
    const student = await Student.findById(studentId).select('parentIds');
    if (!student) return [];
    
    return await this.sendToMultipleUsers(student.parentIds, title, message, type, {
      ...data,
      studentId
    });
  }
  
  // Send notification to entire class
  static async sendToClass(classId, title, message, type = 'info', data = {}) {
    const Student = require('../models/Student');
    const Class = require('../models/Class');
    
    const students = await Student.find({ classId }).select('parentIds');
    const parentIds = [...new Set(students.flatMap(s => s.parentIds))];
    
    const classItem = await Class.findById(classId).select('classTeacherId');
    if (classItem?.classTeacherId) {
      parentIds.push(classItem.classTeacherId);
    }
    
    const notifications = await this.sendToMultipleUsers(parentIds, title, message, type, {
      ...data,
      classId
    });
    
    broadcastToClass(classId, 'class:notification', {
      title,
      message,
      type,
      data,
      timestamp: new Date()
    });
    
    return notifications;
  }
  
  // Send notification to all users with a specific role
  static async sendToRole(role, title, message, type = 'info', data = {}) {
    const User = require('../models/User');
    const users = await User.find({ role, isActive: true }).select('_id');
    const userIds = users.map(u => u._id);
    
    const notifications = await this.sendToMultipleUsers(userIds, title, message, type, data);
    
    broadcastToRole(role, 'role:notification', {
      title,
      message,
      type,
      data,
      timestamp: new Date()
    });
    
    return notifications;
  }
  
  // Send marks update notification
  static async notifyMarksUpdate(studentId, studentName, examName, subjectName, marksObtained, maxMarks) {
    const percentage = (marksObtained / maxMarks) * 100;
    const grade = this.getGrade(percentage);
    const title = `Marks Updated: ${subjectName}`;
    const message = `${studentName} scored ${marksObtained}/${maxMarks} (${percentage.toFixed(1)}%) in ${examName} - ${subjectName}. Grade: ${grade}`;
    const type = percentage >= 40 ? 'success' : 'warning';
    
    return await this.sendToStudentParents(studentId, title, message, type, {
      examName,
      subjectName,
      marksObtained,
      maxMarks,
      percentage,
      grade
    });
  }
  
  // Send attendance update notification
  static async notifyAttendanceUpdate(studentId, studentName, month, year, attendancePercentage) {
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    const status = attendancePercentage >= 75 ? 'Good' : (attendancePercentage >= 60 ? 'Average' : 'Needs Improvement');
    const title = `Attendance Report - ${monthName} ${year}`;
    const message = `${studentName} has ${attendancePercentage.toFixed(1)}% attendance in ${monthName}. Status: ${status}`;
    const type = attendancePercentage >= 75 ? 'success' : (attendancePercentage >= 60 ? 'warning' : 'error');
    
    return await this.sendToStudentParents(studentId, title, message, type, {
      month,
      year,
      attendancePercentage,
      status
    });
  }
  
  // Send exam notification
  static async notifyExamCreated(examName, classIds, startDate, endDate) {
    const title = `New Exam: ${examName}`;
    const message = `${examName} is scheduled from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`;
    
    const notifications = [];
    for (const classId of classIds) {
      const classNotifications = await this.sendToClass(classId, title, message, 'info', {
        examName,
        startDate,
        endDate
      });
      notifications.push(...classNotifications);
    }
    
    return notifications;
  }
  
  // Send duty notification
  static async notifyDutyAssigned(staffId, staffName, className, dutyDate, dutyType) {
    const dutyTypeNames = {
      exam: 'Exam Duty',
      invigilation: 'Invigilation Duty',
      supervision: 'Supervision Duty',
      hall_monitor: 'Hall Monitor Duty',
      security: 'Security Duty'
    };
    
    const formattedDate = new Date(dutyDate).toLocaleDateString();
    const title = `Duty Assignment: ${dutyTypeNames[dutyType] || 'Duty'}`;
    const message = `You have been assigned ${dutyTypeNames[dutyType] || 'duty'} for ${className} on ${formattedDate}.`;
    
    return await this.sendToUser(staffId, title, message, 'info', {
      className,
      dutyDate,
      dutyType
    });
  }
  
  // Send promotion notification
  static async notifyStudentPromotion(studentId, studentName, fromClass, toClass, status) {
    const title = `Student Promotion Update`;
    const message = `${studentName} has been ${status === 'passed' ? 'promoted to' : status} ${toClass}`;
    const type = status === 'passed' ? 'success' : 'info';
    
    return await this.sendToStudentParents(studentId, title, message, type, {
      fromClass,
      toClass,
      status
    });
  }
  
  static getGrade(percentage) {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C+';
    if (percentage >= 40) return 'C';
    if (percentage >= 33) return 'D';
    return 'F';
  }
}

module.exports = NotificationService;