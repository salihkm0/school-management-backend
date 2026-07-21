// controllers/dashboardController.js
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Class = require('../models/Class');
const Parent = require('../models/Parent');
const User = require('../models/User');
const { Exam } = require('../models/Exam');
const Mark = require('../models/Mark');
const ExamResult = require('../models/ExamResult');
const { Attendance, AttendanceTemplate } = require('../models/Attendance');
const AcademicYear = require('../models/AcademicYear');
const StaffDuty = require('../models/StaffDuty');
const Notification = require('../models/Notification');
const { RecentActivity } = require('../models/RecentActivity');
const StaffAssignment = require('../models/StaffAssignment');
const Subject = require('../models/Subject');
const { broadcastToRole, broadcastToUser } = require('../config/socket');

// ==================== ADMIN DASHBOARD ====================

exports.getAdminDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    // Basic Stats
    const totalStudents = await Student.countDocuments({ status: 'active' });
    const totalStaff = await Staff.countDocuments({ isActive: true });
    const totalClasses = await Class.countDocuments({ isActive: true });
    const totalParents = await Parent.countDocuments({ isActive: true });
    
    // Exam Stats
    const currentExams = await Exam.countDocuments({
      academicYearId: currentYear?._id,
      isActive: true
    });
    
    const publishedExams = await Exam.countDocuments({
      academicYearId: currentYear?._id,
      resultsPublished: true
    });
    
    // Today's Attendance
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const attendanceRecords = await Attendance.find({
      createdAt: { $gte: today, $lt: tomorrow }
    });
    
    const attendanceToday = attendanceRecords.reduce((sum, a) => sum + a.presentDays, 0);
    const totalAttendanceToday = attendanceRecords.reduce((sum, a) => sum + a.totalWorkingDays, 0);
    
    const attendancePercentage = totalAttendanceToday > 0 
      ? (attendanceToday / totalAttendanceToday) * 100 
      : 0;
    
    // Recent Exam Results for A+ count
    const recentResults = await ExamResult.find({ isPublished: true })
      .sort({ createdAt: -1 })
      .limit(100);
    
    const fullAPlusCount = recentResults.filter((r) => {
      return r.grade === "A+" || (r.percentage >= 90);
    }).length;
    
    // Gender Distribution
    const genderDistribution = await Student.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$gender", count: { $sum: 1 } } }
    ]);
    
    const maleCount = genderDistribution.find(g => g._id === "M")?.count || 0;
    const femaleCount = genderDistribution.find(g => g._id === "F")?.count || 0;
    const otherCount = genderDistribution.find(g => g._id === "Other")?.count || 0;
    
    // Category Distribution
    const categoryDistribution = await Student.aggregate([
      { $match: { status: "active", category: { $exists: true, $ne: "" } } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Standard-wise Gender Distribution
    const standardGenderDistribution = await Student.aggregate([
      { $match: { status: "active" } },
      { $group: {
          _id: { className: "$className", gender: "$gender" },
          count: { $sum: 1 }
      } }
    ]);
    
    const standardGenderMap = {};
    for (const item of standardGenderDistribution) {
      const className = item._id.className || 'Unknown';
      const gender = item._id.gender || 'Unknown';
      if (!standardGenderMap[className]) {
        standardGenderMap[className] = { className, male: 0, female: 0, other: 0, total: 0 };
      }
      if (gender === 'M') standardGenderMap[className].male = item.count;
      else if (gender === 'F') standardGenderMap[className].female = item.count;
      else standardGenderMap[className].other = item.count;
      standardGenderMap[className].total += item.count;
    }
    const standardGender = Object.values(standardGenderMap).sort((a, b) => {
      const aNum = parseInt(a.className);
      const bNum = parseInt(b.className);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum;
      }
      return a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Standard-wise Category Distribution
    const standardCategoryDistribution = await Student.aggregate([
      { $match: { status: "active" } },
      { $group: {
          _id: { className: "$className", category: "$category" },
          count: { $sum: 1 }
      } }
    ]);

    const standardCategoryMap = {};
    for (const item of standardCategoryDistribution) {
      const className = item._id.className || 'Unknown';
      const category = item._id.category || 'General';
      if (!standardCategoryMap[className]) {
        standardCategoryMap[className] = { className, categories: {}, total: 0 };
      }
      const categoryLabel = category || 'General';
      standardCategoryMap[className].categories[categoryLabel] = item.count;
      standardCategoryMap[className].total += item.count;
    }
    const standardCategory = Object.values(standardCategoryMap).sort((a, b) => {
      const aNum = parseInt(a.className);
      const bNum = parseInt(b.className);
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return aNum - bNum;
      }
      return a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: 'base' });
    });
    
    // Monthly Enrollment Trend (current academic year)
    const currentYearStart = currentYear?.startDate || new Date(new Date().getFullYear(), 0, 1);
    const monthlyEnrollment = await Student.aggregate([
      { 
        $match: { 
          status: "active",
          createdAt: { $gte: currentYearStart }
        } 
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const enrollmentTrend = [];
    for (let i = 1; i <= 12; i++) {
      const found = monthlyEnrollment.find(m => m._id === i);
      enrollmentTrend.push({
        month: monthNames[i - 1],
        count: found?.count || 0
      });
    }
    
    // Recent Activities - FIXED: Get proper recent activities with all fields
    const recentActivities = await RecentActivity.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('performedBy', 'name role');
    
    const formattedActivities = recentActivities.map(a => ({
      id: a._id,
      title: a.title,
      description: a.description,
      type: a.activityType,
      severity: a.severity,
      timestamp: a.createdAt,
      performedBy: a.performedBy?.name || a.performedByName,
      performedByRole: a.performedByRole
    }));
    
    // Default activities removed (no mock data)
    
    // Pending Tasks
    const pendingExams = await Exam.countDocuments({ 
      overallStatus: { $in: ['draft', 'submitted'] },
      isActive: true,
      academicYearId: currentYear?._id
    });
    
    const pendingDuties = await StaffDuty.countDocuments({ status: 'assigned' });
    
    const pendingAttendance = attendanceRecords.filter(a => a.presentDays < a.totalWorkingDays).length;
    
    // Upcoming Events - Enhanced with more realistic data
    const upcomingEvents = await getUpcomingEvents(7);
    
    // Exam Performance Metrics
    const examPerformance = await getExamPerformanceStats(currentYear?._id);
    
    // Duty Distribution Stats
    const dutyDistribution = await getDutyDistributionStats();
    
    // Top Performing Classes
    const topClasses = await getTopPerformingClasses(currentYear?._id, 5);
    
    // Subject Performance Data for charts
    const subjectPerformance = await getSubjectPerformanceStats(currentYear?._id);
    
    // Class Distribution for pie chart
    const classDistribution = await getClassDistributionStats(currentYear?._id);
    
    // Grade Distribution for chart
    const gradeDistribution = await getGradeDistributionStats(currentYear?._id);
    
    // Performance Trends over months
    const performanceTrends = await getPerformanceTrends(currentYear?._id);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalStudents,
          totalStaff,
          totalClasses,
          totalParents,
          currentExams,
          publishedExams,
          attendanceToday,
          attendancePercentage: attendancePercentage.toFixed(1),
          fullAPlusCount
        },
        demographics: {
          gender: { male: maleCount, female: femaleCount, other: otherCount },
          category: categoryDistribution,
          standardGender,
          standardCategory
        },
        enrollmentTrend,
        recentActivities: formattedActivities,
        pendingTasks: {
          exams: pendingExams,
          duties: pendingDuties,
          attendance: pendingAttendance
        },
        upcomingEvents,
        examPerformance,
        dutyDistribution,
        topClasses,
        subjectPerformance,
        classDistribution,
        gradeDistribution,
        performanceTrends,
        academicYear: currentYear ? {
          id: currentYear._id,
          name: currentYear.name,
          year: currentYear.year,
          isCurrent: true
        } : null
      }
    });
  } catch (error) {
    console.error('Error in getAdminDashboard:', error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== STAFF DASHBOARD ====================

exports.getStaffDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get staff info
    const staff = await Staff.findOne({ userId }).populate('userId', 'name email phone');
    if (!staff) {
      return res.status(404).json({ message: 'Staff profile not found' });
    }
    
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    // Get class where staff is class teacher
    const classTeacherClass = await Class.findOne({
      classTeacherId: staff._id,
      isActive: true,
      academicYearId: currentYear?._id
    }).populate('subjects', 'name code');
    const classTeacherClasses = classTeacherClass ? [classTeacherClass] : [];
    
    // Get staff assignment for current year
    const staffAssignment = await StaffAssignment.findOne({
      staffId: staff._id,
      academicYearId: currentYear?._id
    }).populate('subjectsTaught.subjectId', 'name code type department')
      .populate('subjectsTaught.classId', 'name section displayName');
    
    // Get subjects taught by staff
    const subjectsTaught = staffAssignment?.subjectsTaught || [];
    
    // Get unique classes where staff teaches
    const teachingClasses = [...new Map(
      subjectsTaught.map(s => [s.classId?._id?.toString(), s.classId])
    ).values()];
    
    // Today's Schedule
    const today = new Date();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
    
    const todaySchedule = [];
    
    // Helper to add schedule items
    const addScheduleItem = (time, subject, className, classId, room, isClassTeacher = false) => {
      todaySchedule.push({
        time,
        subject,
        className,
        classId,
        type: 'class',
        room,
        isClassTeacher
      });
    };
    
    // Add class teacher classes to schedule
    for (const cls of classTeacherClasses) {
      const timetable = cls.timetable || [];
      const daySchedule = timetable.find(t => t.day === dayName);
      
      if (daySchedule && daySchedule.periods) {
        for (const period of daySchedule.periods) {
          const subject = await Subject.findById(period.subjectId);
          addScheduleItem(
            `${period.startTime || '09:00'} - ${period.endTime || '10:00'}`,
            subject?.name || 'Class',
            cls.displayName || `${cls.name}-${cls.section}`,
            cls._id,
            period.room,
            true
          );
        }
      } else {
        // If no timetable, add default entry
        addScheduleItem('09:00 - 10:00', 'Class Teacher Period', cls.displayName || `${cls.name}-${cls.section}`, cls._id, '', true);
      }
    }
    
    // Add subject teaching classes to schedule
    for (const subject of subjectsTaught) {
      const classItem = subject.classId;
      if (classItem) {
        const timetable = classItem.timetable || [];
        const daySchedule = timetable.find(t => t.day === dayName);
        
        if (daySchedule && daySchedule.periods) {
          for (const period of daySchedule.periods) {
            if (period.subjectId?.toString() === subject.subjectId?._id?.toString()) {
              addScheduleItem(
                `${period.startTime || '09:00'} - ${period.endTime || '10:00'}`,
                subject.subjectName,
                classItem.displayName || `${classItem.name}-${classItem.section}`,
                classItem._id,
                period.room
              );
            }
          }
        }
      }
    }
    
    // Sort schedule by time
    todaySchedule.sort((a, b) => a.time.localeCompare(b.time));
    
    // Pending Tasks logic removed as requested by user
    
    // Upcoming Duties
    const upcomingDuties = await StaffDuty.find({
      staffId: staff._id,
      status: 'assigned',
      'duties.date': { $gte: new Date() }
    }).sort({ 'duties.date': 1 });
    
    const formattedDuties = [];
    for (const duty of upcomingDuties) {
      for (const dutyDate of duty.duties) {
        if (dutyDate.date >= new Date()) {
          formattedDuties.push({
            id: duty._id,
            date: dutyDate.date,
            shift: dutyDate.shift || 'full',
            type: duty.dutyType,
            location: duty.location,
            status: duty.status
          });
        }
      }
    }
    
    // Sort duties by date
    formattedDuties.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Student Stats for Class Teacher
    let totalStudents = 0;
    let totalAttendanceSum = 0;
    let totalAttendanceCount = 0;
    let pendingParentRequests = 0;
    
    for (const cls of classTeacherClasses) {
      const studentsInClass = await Student.countDocuments({ classId: cls._id, status: 'active' });
      totalStudents += studentsInClass;
      
      // Get average attendance for this class — filter to current academic year only
      const attendanceRecords = await Attendance.find({
        classId: cls._id,
        academicYearId: currentYear?._id
      });
      let classAttendanceSum = 0;
      let classAttendanceCount = 0;
      for (const record of attendanceRecords) {
        if (record.totalWorkingDays > 0) {
          classAttendanceSum += (record.presentDays / record.totalWorkingDays) * 100;
          classAttendanceCount++;
          totalAttendanceCount++;
        }
      }
      if (classAttendanceCount > 0) {
        totalAttendanceSum += classAttendanceSum / classAttendanceCount;
      }
    }
    
    const averageAttendance = classTeacherClasses.length > 0 ? totalAttendanceSum / classTeacherClasses.length : 0;
    
    // Recent Activities (staff-related)
    const recentActivities = await RecentActivity.find({
      $or: [
        { performedBy: userId },
        { performedByName: staff.name },
        { 'details.classId': { $in: classTeacherClasses.map(c => c._id) } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('performedBy', 'name role');
    
    const formattedStaffActivities = recentActivities.map(a => ({
      id: a._id,
      title: a.title,
      description: a.description,
      type: a.activityType,
      severity: a.severity,
      timestamp: a.createdAt,
      performedBy: a.performedBy?.name || a.performedByName,
      performedByRole: a.performedByRole
    }));
    
    // Quick Stats
    const uniqueSubjects = new Set(subjectsTaught.map(s => s.subjectId?._id?.toString() || s.subjectId?.toString()).filter(Boolean));
    const quickStats = {
      classesTaught: teachingClasses.length + classTeacherClasses.length,
      subjectsTaught: uniqueSubjects.size,
      totalStudents: totalStudents,
      pendingTasks: 0
    };
    
    res.json({
      success: true,
      data: {
        staffInfo: {
          id: staff._id,
          name: staff.name,
          staffCode: staff.staffCode,
          role: staff.role,
          photoUrl: staff.photoUrl,
          email: staff.email || staff.userId?.email,
          phone: staff.contact
        },
        quickStats,
        todaySchedule: todaySchedule.slice(0, 10),
        pendingTasks: [],
        upcomingDuties: formattedDuties.slice(0, 10),
        recentActivities: formattedStaffActivities,
        classTeacherInfo: classTeacherClass ? {
          classes: [{
            id: classTeacherClass._id,
            name: classTeacherClass.displayName || `${classTeacherClass.name}${classTeacherClass.section ? '-' + classTeacherClass.section : ''}`,
            studentCount: totalStudents
          }],
          averageAttendance: averageAttendance.toFixed(1),
          pendingParentRequests,
          readyReports: []
        } : null,
        subjectClasses: teachingClasses.map(c => ({
          id: c._id,
          name: c.displayName || `${c.name}-${c.section}`,
          subjects: subjectsTaught.filter(s => s.classId?._id?.toString() === c._id.toString()).map(s => s.subjectId?.name || s.subjectName).filter((value, index, self) => self.indexOf(value) === index)
        })),
        academicYear: currentYear ? {
          id: currentYear._id,
          name: currentYear.name,
          year: currentYear.year
        } : null
      }
    });
  } catch (error) {
    console.error('Error in getStaffDashboard:', error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== PARENT DASHBOARD ====================

exports.getParentDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get parent info
    const parent = await Parent.findOne({ userId }).populate('userId', 'name email phone');
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }
    
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    // Get connected students
    const childrenConnections = parent.students || [];
    const studentCodes = childrenConnections.map(c => c.studentCode);
    
    // Get full student details with marks and attendance
    const students = await Student.find({ 
      studentCode: { $in: studentCodes },
      academicYearId: currentYear?._id,
      status: 'active'
    }).populate('classId', 'name section displayName classTeacherName');
    
    const studentDetails = [];
    let totalChildren = 0;
    let totalAttendance = 0;
    let totalPerformance = 0;
    
    for (const student of students) {
      const connection = childrenConnections.find(c => c.studentCode === student.studentCode);
      totalChildren++;
      
      // Get attendance summary
      const attendanceRecords = await Attendance.find({ studentId: student._id });
      let attendancePercentage = 0;
      if (attendanceRecords.length > 0) {
        let totalPresent = 0;
        let totalDays = 0;
        for (const record of attendanceRecords) {
          totalPresent += record.presentDays;
          totalDays += record.totalWorkingDays;
        }
        attendancePercentage = totalDays > 0 ? (totalPresent / totalDays) * 100 : 0;
      }
      totalAttendance += attendancePercentage;
      
      // Get performance summary (latest exam results)
      const latestResults = await ExamResult.find({ 
        studentId: student._id, 
        isPublished: true 
      })
        .sort({ createdAt: -1 })
        .limit(1);
      
      let performanceGrade = 'N/A';
      let performancePercentage = 0;
      
      if (latestResults.length > 0) {
        performancePercentage = latestResults[0].percentage || 0;
        performanceGrade = latestResults[0].grade || getGrade(performancePercentage);
        totalPerformance += performancePercentage;
      }
      
      // Get upcoming exams for student's class
      const upcomingExams = await Exam.find({
        classIds: student.classId,
        startDate: { $gte: new Date() },
        isActive: true
      })
        .select('name examType startDate endDate')
        .sort({ startDate: 1 })
        .limit(5);
      
      // Get recent notifications for this student
      const notifications = await Notification.find({
        userId: parent.userId,
        'data.studentId': student._id.toString()
      })
        .sort({ createdAt: -1 })
        .limit(5);
      
      studentDetails.push({
        _id: student._id,
        studentId: student._id,
        fullName: student.fullName,
        studentCode: student.studentCode,
        admissionNo: student.admissionNo,
        rollNumber: student.rollNumber || '-',
        className: student.classId?.displayName || `${student.className || ''} ${student.division || ''}`.trim(),
        classId: student.classId,
        relation: connection?.relation || 'guardian',
        photoUrl: student.photoUrl,
        attendancePercentage: attendancePercentage.toFixed(1),
        performance: {
          percentage: performancePercentage.toFixed(1),
          grade: performanceGrade
        },
        upcomingExams: upcomingExams.map(e => ({
          id: e._id,
          name: e.displayName || e.name,
          type: e.examType,
          date: e.startDate,
          daysLeft: Math.ceil((new Date(e.startDate) - new Date()) / (1000 * 60 * 60 * 24))
        })),
        recentNotifications: notifications.map(n => ({
          id: n._id,
          title: n.title,
          message: n.message,
          type: n.type,
          isRead: n.isRead,
          createdAt: n.createdAt
        }))
      });
    }
    
    // Fee Status (from actual data when available, currently empty)
    const feeStatus = {
      totalFee: 0,
      paid: 0,
      due: 0,
      lastPaymentDate: null,
      status: 'none'
    };
    
    // Recent Notifications for parent
    const recentNotifications = await Notification.find({ userId: parent.userId })
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Quick Stats
    const quickStats = {
      totalChildren: totalChildren,
      averageAttendance: totalChildren > 0 ? (totalAttendance / totalChildren).toFixed(1) : "0.0",
      averagePerformance: totalChildren > 0 ? (totalPerformance / totalChildren).toFixed(1) : "0.0",
      unreadNotifications: recentNotifications.filter(n => !n.isRead).length,
      feeDue: feeStatus.due
    };
    
    // Events and Holidays
    const upcomingEvents = await getUpcomingEvents(7);
    
    // School Announcements
    const announcements = await Notification.find({ 
      type: { $in: ['announcement', 'info'] },
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    })
      .sort({ createdAt: -1 })
      .limit(5);
    
    res.json({
      success: true,
      data: {
        parentInfo: {
          id: parent._id,
          name: parent.fullName,
          email: parent.email,
          phone: parent.phone,
          photoUrl: parent.userId?.photoUrl
        },
        quickStats,
        children: studentDetails,
        feeStatus,
        upcomingEvents,
        announcements: announcements.map(a => ({
          id: a._id,
          title: a.title,
          message: a.message,
          type: a.type,
          date: a.createdAt
        })),
        recentNotifications: recentNotifications.map(n => ({
          id: n._id,
          title: n.title,
          message: n.message,
          type: n.type,
          isRead: n.isRead,
          createdAt: n.createdAt
        })),
        academicYear: currentYear ? {
          id: currentYear._id,
          name: currentYear.name,
          year: currentYear.year
        } : null
      }
    });
  } catch (error) {
    console.error('Error in getParentDashboard:', error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== HELPER FUNCTIONS ====================

async function getUpcomingEvents(limit = 10) {
  // TODO: Implement actual database query when Event model is created
  // For now, return empty array instead of mock data
  return [];
}

async function getExamPerformanceStats(academicYearId) {
  const recentExams = await Exam.find({ academicYearId, resultsPublished: true, isActive: true })
    .sort({ createdAt: -1 })
    .limit(5);
  
  if (recentExams.length === 0) {
    return {
      averagePercentage: 0,
      passPercentage: 0,
      topPerformers: 0,
      trend: 'stable'
    };
  }
  
  const examResults = [];
  for (const exam of recentExams) {
    const results = await ExamResult.find({ examId: exam._id, isPublished: true });
    if (results.length > 0) {
      const avgPercentage = results.reduce((sum, r) => sum + (r.percentage || 0), 0) / results.length;
      const passCount = results.filter(r => (r.percentage || 0) >= 40).length;
      examResults.push({
        avgPercentage,
        passPercentage: (passCount / results.length) * 100
      });
    }
  }
  
  if (examResults.length === 0) {
    return {
      averagePercentage: 0,
      passPercentage: 0,
      topPerformers: 0,
      trend: 'stable'
    };
  }
  
  const averagePercentage = examResults.reduce((sum, e) => sum + e.avgPercentage, 0) / examResults.length;
  const passPercentage = examResults.reduce((sum, e) => sum + e.passPercentage, 0) / examResults.length;
  
  // Calculate trend
  let trend = 'stable';
  if (examResults.length >= 2) {
    const diff = examResults[0].avgPercentage - examResults[1].avgPercentage;
    if (diff > 2) {
      trend = 'up';
    } else if (diff < -2) {
      trend = 'down';
    }
  }
  
  // Count top performers (A+ grade)
  const topPerformers = await ExamResult.countDocuments({
    examId: { $in: recentExams.map(e => e._id) },
    grade: 'A+',
    isPublished: true
  });
  
  return {
    averagePercentage: averagePercentage.toFixed(1),
    passPercentage: passPercentage.toFixed(1),
    topPerformers,
    trend
  };
}

async function getDutyDistributionStats() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const duties = await StaffDuty.find({
    assignedAt: { $gte: thirtyDaysAgo }
  });
  
  const dutyTypes = {};
  const perStaff = {};
  
  for (const duty of duties) {
    dutyTypes[duty.dutyType] = (dutyTypes[duty.dutyType] || 0) + duty.totalDuties;
    const staffId = duty.staffId.toString();
    perStaff[staffId] = (perStaff[staffId] || 0) + duty.totalDuties;
  }
  
  const staffCount = Object.keys(perStaff).length;
  const totalDuties = duties.reduce((sum, d) => sum + d.totalDuties, 0);
  
  return {
    byType: dutyTypes,
    totalDuties,
    averagePerStaff: staffCount > 0 ? totalDuties / staffCount : 0,
    staffCount
  };
}

async function getTopPerformingClasses(academicYearId, limit = 5) {
  const classes = await Class.find({ academicYearId, isActive: true });
  const classPerformance = [];
  
  for (const classItem of classes) {
    const students = await Student.find({ classId: classItem._id, status: 'active' });
    if (students.length === 0) continue;
    
    const studentIds = students.map(s => s._id);
    const marks = await Mark.find({ 
      studentId: { $in: studentIds },
      isFinalized: true
    });
    
    if (marks.length === 0) continue;
    
    let totalMarks = 0;
    let totalMaxMarks = 0;
    let studentCount = 0;
    
    // Group by student to avoid double counting
    const studentMarks = new Map();
    for (const mark of marks) {
      const studentId = mark.studentId.toString();
      if (!studentMarks.has(studentId)) {
        studentMarks.set(studentId, { total: 0, max: 0 });
        studentCount++;
      }
      const current = studentMarks.get(studentId);
      current.total += mark.totalScore || 0;
      current.max += mark.totalMaxMarks || 100;
      studentMarks.set(studentId, current);
    }
    
    for (const [_, marks] of studentMarks) {
      totalMarks += marks.total;
      totalMaxMarks += marks.max;
    }
    
    const averagePercentage = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0;
    
    classPerformance.push({
      classId: classItem._id,
      className: classItem.displayName || `${classItem.name}${classItem.section ? `-${classItem.section}` : ''}`,
      studentCount: students.length,
      averagePercentage: averagePercentage.toFixed(1)
    });
  }
  
  return classPerformance
    .sort((a, b) => parseFloat(b.averagePercentage) - parseFloat(a.averagePercentage))
    .slice(0, limit);
}

async function getSubjectPerformanceStats(academicYearId) {
  const subjects = await Subject.find({ isActive: true });
  const subjectPerformance = [];
  
  for (const subject of subjects) {
    const marks = await Mark.find({ 
      'subjects.subjectId': subject._id,
      isFinalized: true 
    });
    
    if (marks.length === 0) continue;
    
    let totalScore = 0;
    let totalMax = 0;
    
    for (const mark of marks) {
      const subjectMark = mark.subjects.find(s => s.subjectId.toString() === subject._id.toString());
      if (subjectMark) {
        totalScore += subjectMark.totalScore || 0;
        totalMax += subjectMark.maxMarks || 100;
      }
    }
    
    const averageScore = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
    
    subjectPerformance.push({
      subjectId: subject._id,
      subjectName: subject.name,
      subjectCode: subject.code,
      averageScore: averageScore.toFixed(1)
    });
  }
  
  return subjectPerformance
    .sort((a, b) => parseFloat(b.averageScore) - parseFloat(a.averageScore))
    .slice(0, 10);
}

async function getClassDistributionStats(academicYearId) {
  const classes = await Class.find({ academicYearId, isActive: true });
  let totalStudents = 0;
  
  const distribution = [];
  for (const classItem of classes) {
    const studentCount = await Student.countDocuments({ classId: classItem._id, status: 'active' });
    totalStudents += studentCount;
    distribution.push({
      classId: classItem._id,
      className: classItem.displayName || `${classItem.name}${classItem.section ? `-${classItem.section}` : ''}`,
      studentCount,
      percentage: 0 // Will calculate after total
    });
  }
  
  // Calculate percentages
  for (const item of distribution) {
    item.percentage = totalStudents > 0 ? ((item.studentCount / totalStudents) * 100).toFixed(1) : 0;
  }
  
  return distribution;
}

async function getGradeDistributionStats(academicYearId) {
  const results = await ExamResult.find({ 
    isPublished: true,
    academicYearId
  }).limit(1000);
  
  const gradeCounts = {
    'A+': 0, 'A': 0, 'B+': 0, 'B': 0, 'C+': 0, 'C': 0, 'D': 0, 'F': 0
  };
  
  for (const result of results) {
    const grade = result.grade || getGrade(result.percentage || 0);
    if (gradeCounts.hasOwnProperty(grade)) {
      gradeCounts[grade]++;
    } else {
      gradeCounts['F']++;
    }
  }
  
  const total = results.length || 1;
  const distribution = Object.entries(gradeCounts).map(([grade, count]) => ({
    grade,
    count,
    percentage: ((count / total) * 100).toFixed(1)
  }));
  
  return distribution;
}

async function getPerformanceTrends(academicYearId) {
  const months = [];
  const today = new Date();
  
  // Get last 6 months
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthName = monthDate.toLocaleDateString('en-US', { month: 'short' });
    
    // Get exams in this month
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    
    const exams = await Exam.find({
      academicYearId,
      startDate: { $gte: monthStart, $lte: monthEnd },
      resultsPublished: true
    });
    
    let avgScore = 0;
    let examCount = 0;
    
    for (const exam of exams) {
      const results = await ExamResult.find({ examId: exam._id, isPublished: true });
      if (results.length > 0) {
        const examAvg = results.reduce((sum, r) => sum + (r.percentage || 0), 0) / results.length;
        avgScore += examAvg;
        examCount++;
      }
    }
    
    months.push({
      month: monthName,
      avgScore: examCount > 0 ? (avgScore / examCount).toFixed(1) : 0,
      attendance: 0, // Would need attendance trends
      target: 75
    });
  }
  
  return months;
}

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