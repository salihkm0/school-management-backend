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
const mongoose = require('mongoose');
const { broadcastToRole, broadcastToUser } = require('../config/socket');
const { getCache, setCache } = require('../config/redis');

// ==================== ADMIN DASHBOARD ====================

exports.getAdminDashboard = async (req, res) => {
  try {
    const currentYear = await AcademicYear.findOne({ isCurrent: true }).lean();
    const currentYearId = currentYear?._id;

    // 1. Check Redis Cache for instantaneous response
    const cacheKey = `dashboard:admin:${currentYearId ? currentYearId.toString() : 'current'}`;
    const cachedDashboard = await getCache(cacheKey);
    if (cachedDashboard) {
      return res.json({
        success: true,
        data: cachedDashboard
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const currentYearStart = currentYear?.startDate || new Date(new Date().getFullYear(), 0, 1);

    // 2. Parallelize all independent database operations
    const [
      totalStudents,
      totalStaff,
      totalClasses,
      totalParents,
      currentExams,
      publishedExams,
      attendanceRecords,
      recentResults,
      studentDemographicsAgg,
      monthlyEnrollment,
      recentActivities,
      pendingExams,
      pendingDuties,
      upcomingEvents,
      examPerformance,
      dutyDistribution,
      topClasses,
      subjectPerformance,
      classDistribution,
      gradeDistribution,
      performanceTrends
    ] = await Promise.all([
      Student.countDocuments({ status: 'active' }),
      Staff.countDocuments({ isActive: true }),
      Class.countDocuments({ isActive: true }),
      Parent.countDocuments({ isActive: true }),
      Exam.countDocuments({
        academicYearId: currentYearId,
        isActive: true
      }),
      Exam.countDocuments({
        academicYearId: currentYearId,
        resultsPublished: true
      }),
      Attendance.find({
        createdAt: { $gte: today, $lt: tomorrow }
      }).lean(),
      ExamResult.find({ isPublished: true })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Student.aggregate([
        { $match: { status: "active" } },
        { $group: {
            _id: {
              className: { $ifNull: ["$className", "Unknown"] },
              category: { $ifNull: ["$category", "General"] },
              gender: { $ifNull: ["$gender", "Unknown"] }
            },
            count: { $sum: 1 }
        } }
      ]),
      Student.aggregate([
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
      ]),
      RecentActivity.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('performedBy', 'name role')
        .lean(),
      Exam.countDocuments({ 
        overallStatus: { $in: ['draft', 'submitted'] },
        isActive: true,
        academicYearId: currentYearId
      }),
      StaffDuty.countDocuments({ status: 'assigned' }),
      getUpcomingEvents(7),
      getExamPerformanceStats(currentYearId),
      getDutyDistributionStats(),
      getTopPerformingClasses(currentYearId, 5),
      getSubjectPerformanceStats(currentYearId),
      getClassDistributionStats(currentYearId),
      getGradeDistributionStats(currentYearId),
      getPerformanceTrends(currentYearId)
    ]);

    // Attendance calculation
    const attendanceToday = attendanceRecords.reduce((sum, a) => sum + (a.presentDays || 0), 0);
    const totalAttendanceToday = attendanceRecords.reduce((sum, a) => sum + (a.totalWorkingDays || 0), 0);
    const attendancePercentage = totalAttendanceToday > 0 
      ? (attendanceToday / totalAttendanceToday) * 100 
      : 0;

    // Full A+ count from recent results
    const fullAPlusCount = recentResults.filter((r) => {
      return r.grade === "A+" || (r.percentage >= 90);
    }).length;

    // Process consolidated demographics in memory (<1ms)
    let maleCount = 0;
    let femaleCount = 0;
    let otherCount = 0;
    const categoryMap = {};
    const standardGenderMap = {};
    const standardCategoryMap = {};

    for (const item of studentDemographicsAgg) {
      const className = item._id.className || 'Unknown';
      const category = item._id.category || 'General';
      const gender = item._id.gender || 'Unknown';
      const count = item.count || 0;

      // Gender totals
      if (gender === 'M') maleCount += count;
      else if (gender === 'F') femaleCount += count;
      else otherCount += count;

      // Category breakdown
      if (category) {
        if (!categoryMap[category]) {
          categoryMap[category] = { _id: category, count: 0, male: 0, female: 0, other: 0 };
        }
        categoryMap[category].count += count;
        if (gender === 'M') categoryMap[category].male += count;
        else if (gender === 'F') categoryMap[category].female += count;
        else categoryMap[category].other += count;
      }

      // Standard-wise gender
      if (!standardGenderMap[className]) {
        standardGenderMap[className] = { className, male: 0, female: 0, other: 0, total: 0 };
      }
      if (gender === 'M') standardGenderMap[className].male += count;
      else if (gender === 'F') standardGenderMap[className].female += count;
      else standardGenderMap[className].other += count;
      standardGenderMap[className].total += count;

      // Standard-wise category
      if (!standardCategoryMap[className]) {
        standardCategoryMap[className] = { 
          className, 
          categories: {}, 
          categoryDetails: {}, 
          male: 0, 
          female: 0, 
          other: 0, 
          total: 0 
        };
      }
      const catLabel = category || 'General';
      standardCategoryMap[className].categories[catLabel] = (standardCategoryMap[className].categories[catLabel] || 0) + count;

      if (!standardCategoryMap[className].categoryDetails[catLabel]) {
        standardCategoryMap[className].categoryDetails[catLabel] = {
          total: 0,
          male: 0,
          female: 0,
          other: 0
        };
      }
      standardCategoryMap[className].categoryDetails[catLabel].total += count;
      if (gender === 'M') {
        standardCategoryMap[className].categoryDetails[catLabel].male += count;
        standardCategoryMap[className].male += count;
      } else if (gender === 'F') {
        standardCategoryMap[className].categoryDetails[catLabel].female += count;
        standardCategoryMap[className].female += count;
      } else {
        standardCategoryMap[className].categoryDetails[catLabel].other += count;
        standardCategoryMap[className].other += count;
      }
      standardCategoryMap[className].total += count;
    }

    const categoryDistribution = Object.values(categoryMap).sort((a, b) => b.count - a.count);

    const standardGender = Object.values(standardGenderMap).sort((a, b) => {
      const aNum = parseInt(a.className);
      const bNum = parseInt(b.className);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: 'base' });
    });

    const standardCategory = Object.values(standardCategoryMap).sort((a, b) => {
      const aNum = parseInt(a.className);
      const bNum = parseInt(b.className);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.className.localeCompare(b.className, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Monthly enrollment
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const enrollmentTrend = [];
    for (let i = 1; i <= 12; i++) {
      const found = monthlyEnrollment.find(m => m._id === i);
      enrollmentTrend.push({
        month: monthNames[i - 1],
        count: found?.count || 0
      });
    }

    // Formatted activities
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

    const pendingAttendance = attendanceRecords.filter(a => (a.presentDays || 0) < (a.totalWorkingDays || 0)).length;

    const responseData = {
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
    };

    // Cache in Redis for 60 seconds
    await setCache(cacheKey, responseData, 60);

    res.json({
      success: true,
      data: responseData
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
    
    // 1. Parallelize initial profile fetches
    const [staff, currentYear] = await Promise.all([
      Staff.findOne({ userId }).populate('userId', 'name email phone').lean(),
      AcademicYear.findOne({ isCurrent: true }).lean()
    ]);
    
    if (!staff) {
      return res.status(404).json({ message: 'Staff profile not found' });
    }
    
    // 2. Parallelize assignments
    const [classTeacherClass, staffAssignment] = await Promise.all([
      Class.findOne({
        classTeacherId: staff._id,
        isActive: true,
        academicYearId: currentYear?._id
      }).populate('subjects', 'name code').lean(),
      
      StaffAssignment.findOne({
        staffId: staff._id,
        academicYearId: currentYear?._id
      }).populate('subjectsTaught.subjectId', 'name code type department')
        .populate('subjectsTaught.classId', 'name section displayName').lean()
    ]);

    const classTeacherClasses = classTeacherClass ? [classTeacherClass] : [];
    const subjectsTaught = staffAssignment?.subjectsTaught || [];
    const teachingClasses = [...new Map(
      subjectsTaught.map(s => [s.classId?._id?.toString(), s.classId])
    ).values()];
    
    // Today's Schedule
    const today = new Date();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
    const todaySchedule = [];
    
    const addScheduleItem = (time, subject, className, classId, room, isClassTeacher = false) => {
      todaySchedule.push({ time, subject, className, classId, type: 'class', room, isClassTeacher });
    };
    
    // Pre-fetch all subject IDs required for the schedule to avoid N+1 queries
    const subjectIdsToFetch = new Set();
    for (const cls of classTeacherClasses) {
      const timetable = cls.timetable || [];
      const daySchedule = timetable.find(t => t.day === dayName);
      if (daySchedule && daySchedule.periods) {
        daySchedule.periods.forEach(p => p.subjectId && subjectIdsToFetch.add(p.subjectId.toString()));
      }
    }
    const prefetchedSubjects = await Subject.find({ _id: { $in: Array.from(subjectIdsToFetch) } }).lean();
    const subjectMap = new Map(prefetchedSubjects.map(s => [s._id.toString(), s]));

    // Add class teacher classes to schedule
    for (const cls of classTeacherClasses) {
      const timetable = cls.timetable || [];
      const daySchedule = timetable.find(t => t.day === dayName);
      
      if (daySchedule && daySchedule.periods) {
        for (const period of daySchedule.periods) {
          const subject = period.subjectId ? subjectMap.get(period.subjectId.toString()) : null;
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
                subject.subjectId?.name || subject.subjectName,
                classItem.displayName || `${classItem.name}-${classItem.section}`,
                classItem._id,
                period.room
              );
            }
          }
        }
      }
    }
    todaySchedule.sort((a, b) => a.time.localeCompare(b.time));
    
    // 3. Parallelize duties, student counts, and attendance aggregation
    const dutyPromise = StaffDuty.find({
      staffId: staff._id,
      status: 'assigned',
      'duties.date': { $gte: new Date() }
    }).sort({ 'duties.date': 1 }).lean();

    const studentCountPromises = classTeacherClasses.map(cls => 
      Student.countDocuments({ classId: cls._id, status: 'active' })
    );

    // Optimized attendance aggregation
    const attendancePromises = classTeacherClasses.map(cls => 
      Attendance.aggregate([
        { $match: { classId: cls._id, academicYearId: currentYear?._id, totalWorkingDays: { $gt: 0 } } },
        { $group: { _id: null, avgAttendance: { $avg: { $divide: ["$presentDays", "$totalWorkingDays"] } } } }
      ])
    );

    const [upcomingDuties, studentCounts, attendanceStatsList] = await Promise.all([
      dutyPromise,
      Promise.all(studentCountPromises),
      Promise.all(attendancePromises)
    ]);

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
    formattedDuties.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Calculate total students and attendance
    const totalStudents = studentCounts.reduce((acc, count) => acc + count, 0);
    const pendingParentRequests = 0;
    
    let totalAttendanceSum = 0;
    let attendanceClassesCount = 0;
    attendanceStatsList.forEach(stats => {
      if (stats && stats.length > 0 && stats[0].avgAttendance != null) {
        totalAttendanceSum += (stats[0].avgAttendance * 100);
        attendanceClassesCount++;
      }
    });
    const averageAttendance = attendanceClassesCount > 0 ? totalAttendanceSum / attendanceClassesCount : 0;
    
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
      userId: parent.userId,
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
  }).lean();
  
  const dutyTypes = {};
  const perStaff = {};
  
  for (const duty of duties) {
    dutyTypes[duty.dutyType] = (dutyTypes[duty.dutyType] || 0) + (duty.totalDuties || 0);
    const staffId = duty.staffId ? duty.staffId.toString() : 'unknown';
    perStaff[staffId] = (perStaff[staffId] || 0) + (duty.totalDuties || 0);
  }
  
  const staffCount = Object.keys(perStaff).length;
  const totalDuties = duties.reduce((sum, d) => sum + (d.totalDuties || 0), 0);
  
  return {
    byType: dutyTypes,
    totalDuties,
    averagePerStaff: staffCount > 0 ? totalDuties / staffCount : 0,
    staffCount
  };
}

async function getTopPerformingClasses(academicYearId, limit = 5) {
  const classPerfAgg = await Mark.aggregate([
    {
      $match: {
        ...(academicYearId ? { academicYearId: new mongoose.Types.ObjectId(academicYearId) } : {}),
        isFinalized: true,
        totalMaxMarks: { $gt: 0 }
      }
    },
    {
      $group: {
        _id: "$classId",
        totalMarks: { $sum: "$totalMarks" },
        totalMaxMarks: { $sum: "$totalMaxMarks" },
        students: { $addToSet: "$studentId" }
      }
    },
    {
      $project: {
        classId: "$_id",
        studentCount: { $size: "$students" },
        averagePercentage: {
          $multiply: [
            { $divide: ["$totalMarks", "$totalMaxMarks"] },
            100
          ]
        }
      }
    },
    { $sort: { averagePercentage: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "classes",
        localField: "classId",
        foreignField: "_id",
        as: "classDoc"
      }
    },
    {
      $addFields: {
        classInfo: { $arrayElemAt: ["$classDoc", 0] }
      }
    }
  ]);

  return classPerfAgg.map(c => {
    const cls = c.classInfo;
    let className = "Class";
    if (cls) {
      className = cls.displayName || `${cls.name}${cls.section ? `-${cls.section}` : ''}`;
    }
    return {
      classId: c.classId,
      className,
      studentCount: c.studentCount,
      averagePercentage: c.averagePercentage ? c.averagePercentage.toFixed(1) : "0.0"
    };
  });
}

async function getSubjectPerformanceStats(academicYearId) {
  const subjectPerfAgg = await Mark.aggregate([
    {
      $match: {
        ...(academicYearId ? { academicYearId: new mongoose.Types.ObjectId(academicYearId) } : {}),
        isFinalized: true
      }
    },
    { $unwind: "$subjects" },
    {
      $group: {
        _id: "$subjects.subjectId",
        subjectName: { $first: "$subjects.subjectName" },
        subjectCode: { $first: "$subjects.subjectCode" },
        totalScore: { $sum: { $ifNull: ["$subjects.totalScore", 0] } },
        totalMax: { $sum: { $ifNull: ["$subjects.maxMarks", 100] } }
      }
    },
    {
      $match: { totalMax: { $gt: 0 } }
    },
    {
      $project: {
        subjectId: "$_id",
        subjectName: 1,
        subjectCode: 1,
        averageScore: {
          $multiply: [
            { $divide: ["$totalScore", "$totalMax"] },
            100
          ]
        }
      }
    },
    { $sort: { averageScore: -1 } },
    { $limit: 10 }
  ]);

  return subjectPerfAgg.map(s => ({
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    subjectCode: s.subjectCode,
    averageScore: s.averageScore ? s.averageScore.toFixed(1) : "0.0"
  }));
}

async function getClassDistributionStats(academicYearId) {
  const [classes, studentCounts] = await Promise.all([
    Class.find({
      ...(academicYearId ? { academicYearId } : {}),
      isActive: true
    }).select('displayName name section').lean(),
    Student.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$classId', count: { $sum: 1 } } }
    ])
  ]);

  const countMap = new Map();
  let totalStudents = 0;
  for (const sc of studentCounts) {
    if (sc._id) {
      countMap.set(sc._id.toString(), sc.count);
      totalStudents += sc.count;
    }
  }

  const distribution = classes.map(classItem => {
    const studentCount = countMap.get(classItem._id.toString()) || 0;
    return {
      classId: classItem._id,
      className: classItem.displayName || `${classItem.name}${classItem.section ? `-${classItem.section}` : ''}`,
      studentCount,
      percentage: 0
    };
  });

  for (const item of distribution) {
    item.percentage = totalStudents > 0 ? ((item.studentCount / totalStudents) * 100).toFixed(1) : "0";
  }

  return distribution;
}

async function getGradeDistributionStats(academicYearId) {
  const results = await ExamResult.find({ 
    isPublished: true,
    ...(academicYearId ? { academicYearId } : {})
  }).limit(1000).lean();
  
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
  const today = new Date();
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  
  const exams = await Exam.find({
    academicYearId,
    startDate: { $gte: sixMonthsAgo },
    resultsPublished: true
  }).select('_id startDate').lean();

  const examIds = exams.map(e => e._id);
  const results = examIds.length > 0 
    ? await ExamResult.find({ examId: { $in: examIds }, isPublished: true }).select('examId percentage').lean()
    : [];

  const examResultMap = new Map();
  for (const r of results) {
    const eid = r.examId.toString();
    if (!examResultMap.has(eid)) examResultMap.set(eid, []);
    examResultMap.get(eid).push(r.percentage || 0);
  }

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthName = monthDate.toLocaleDateString('en-US', { month: 'short' });
    const mYear = monthDate.getFullYear();
    const mMonth = monthDate.getMonth();

    const monthExams = exams.filter(e => {
      if (!e.startDate) return false;
      const d = new Date(e.startDate);
      return d.getFullYear() === mYear && d.getMonth() === mMonth;
    });

    let totalScore = 0;
    let count = 0;
    for (const me of monthExams) {
      const scores = examResultMap.get(me._id.toString()) || [];
      for (const s of scores) {
        totalScore += s;
        count++;
      }
    }

    months.push({
      month: monthName,
      avgScore: count > 0 ? (totalScore / count).toFixed(1) : 0,
      attendance: 0,
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