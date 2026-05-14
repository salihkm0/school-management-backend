// controllers/dashboardController.js
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Class = require('../models/Class');
const Parent = require('../models/Parent');
const User = require('../models/User');
const { Exam } = require('../models/Exam');
const Mark = require('../models/Mark');
const ExamResult = require('../models/ExamResult');
const { Attendance } = require('../models/Attendance');
const AcademicYear = require('../models/AcademicYear');
const StaffDuty = require('../models/StaffDuty');
const Notification = require('../models/Notification');
const { RecentActivity } = require('../models/RecentActivity');
const StaffAssignment = require('../models/StaffAssignment');
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
    const attendanceToday = await Attendance.countDocuments({
      createdAt: { $gte: today },
      status: 'present'
    });
    
    const totalAttendanceToday = await Attendance.countDocuments({
      createdAt: { $gte: today }
    });
    
    const attendancePercentage = totalAttendanceToday > 0 
      ? (attendanceToday / totalAttendanceToday) * 100 
      : 0;
    
    // Recent Exam Results
    const recentResults = await ExamResult.find({ isPublished: true })
      .sort({ createdAt: -1 })
      .limit(100);
    
    const fullAPlusCount = recentResults.filter((r) => {
      return r.subjectResults?.every((s) => s.grade === "A+");
    }).length;
    
    // Gender Distribution
    const maleCount = await Student.countDocuments({ gender: "M", status: "active" });
    const femaleCount = await Student.countDocuments({ gender: "F", status: "active" });
    const otherCount = await Student.countDocuments({ gender: "Other", status: "active" });
    
    // Category Distribution
    const categoryDistribution = await Student.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$category", count: { $sum: 1 } } }
    ]);
    
    // Monthly Enrollment Trend
    const monthlyEnrollment = await Student.aggregate([
      { $match: { status: "active" } },
      {
        $group: {
          _id: { $month: "$createdAt" },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const enrollmentTrend = monthlyEnrollment.map(item => ({
      month: monthNames[item._id - 1],
      count: item.count
    }));
    
    // Recent Activities
    const recentActivities = await RecentActivity.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('performedBy', 'name role');
    
    // Pending Tasks
    const pendingExams = await Exam.countDocuments({ 
      overallStatus: { $in: ['draft', 'submitted'] },
      isActive: true 
    });
    
    const pendingDuties = await StaffDuty.countDocuments({ status: 'assigned' });
    
    const pendingAttendance = await Attendance.countDocuments({ 
      status: { $ne: 'present' },
      createdAt: { $gte: today }
    });
    
    // Upcoming Events
    const upcomingEvents = await getUpcomingEvents();
    
    // Performance Metrics
    const examPerformance = await getExamPerformanceStats(currentYear?._id);
    
    // Staff Duty Distribution
    const dutyDistribution = await getDutyDistributionStats();
    
    // Top Performing Classes
    const topClasses = await getTopPerformingClasses(currentYear?._id);
    
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
          category: categoryDistribution
        },
        enrollmentTrend,
        recentActivities: recentActivities.map(a => ({
          id: a._id,
          title: a.title,
          description: a.description,
          type: a.activityType,
          severity: a.severity,
          timestamp: a.createdAt,
          performedBy: a.performedBy?.name,
          performedByRole: a.performedByRole
        })),
        pendingTasks: {
          exams: pendingExams,
          duties: pendingDuties,
          attendance: pendingAttendance
        },
        upcomingEvents,
        examPerformance,
        dutyDistribution,
        topClasses,
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
    
    // Get classes where staff is class teacher
    const classTeacherClasses = await Class.find({
      classTeacherId: staff._id,
      isActive: true
    }).populate('subjects', 'name code');
    
    // Get staff assignment for current year
    const staffAssignment = await StaffAssignment.findOne({
      staffId: staff._id,
      academicYearId: currentYear?._id
    }).populate('subjectsTaught.subjectId', 'name code')
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
    
    // Add class teacher classes to schedule
    for (const cls of classTeacherClasses) {
      const timetable = cls.timetable || [];
      const daySchedule = timetable.find(t => t.day === dayName);
      
      if (daySchedule && daySchedule.periods) {
        for (const period of daySchedule.periods) {
          const subject = await Subject.findById(period.subjectId);
          todaySchedule.push({
            time: `${period.startTime || '09:00'} - ${period.endTime || '10:00'}`,
            subject: subject?.name || 'Class',
            className: cls.displayName || `${cls.name}-${cls.section}`,
            classId: cls._id,
            type: 'class',
            room: period.room,
            isClassTeacher: true
          });
        }
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
              todaySchedule.push({
                time: `${period.startTime || '09:00'} - ${period.endTime || '10:00'}`,
                subject: subject.subjectName,
                className: classItem.displayName || `${classItem.name}-${classItem.section}`,
                classId: classItem._id,
                type: 'class',
                room: period.room
              });
            }
          }
        }
      }
    }
    
    // Sort schedule by time
    todaySchedule.sort((a, b) => a.time.localeCompare(b.time));
    
    // Pending Tasks
    const pendingTasks = [];
    
    // Check for pending attendance marking
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    for (const cls of classTeacherClasses) {
      const studentsInClass = await Student.countDocuments({ classId: cls._id, status: 'active' });
      const attendanceMarked = await Attendance.countDocuments({
        classId: cls._id,
        createdAt: { $gte: todayDate }
      });
      
      if (attendanceMarked < studentsInClass) {
        pendingTasks.push({
          id: `attendance_${cls._id}`,
          title: 'Mark Attendance',
          description: `Mark attendance for ${cls.displayName || `${cls.name}-${cls.section}`}`,
          deadline: 'Today 4:00 PM',
          priority: 'high',
          link: `/attendance?classId=${cls._id}`,
          type: 'attendance'
        });
      }
    }
    
    // Check for pending marks entry
    const pendingExams = await Exam.find({
      classIds: { $in: classTeacherClasses.map(c => c._id) },
      overallStatus: 'draft',
      endDate: { $lt: new Date() }
    });
    
    for (const exam of pendingExams) {
      pendingTasks.push({
        id: `exam_${exam._id}`,
        title: 'Enter Exam Marks',
        description: `Enter marks for ${exam.displayName || exam.name}`,
        deadline: new Date(exam.endDate).toLocaleDateString(),
        priority: 'high',
        link: `/exams/marks?examId=${exam._id}`,
        type: 'exam'
      });
    }
    
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
    
    // Student Stats for Class Teacher
    let totalStudents = 0;
    let averageAttendance = 0;
    let pendingParentRequests = 0;
    
    for (const cls of classTeacherClasses) {
      const studentsInClass = await Student.countDocuments({ classId: cls._id, status: 'active' });
      totalStudents += studentsInClass;
      
      // Get average attendance for this class
      const attendanceRecords = await Attendance.find({ classId: cls._id });
      if (attendanceRecords.length > 0) {
        const totalPresent = attendanceRecords.reduce((sum, a) => sum + a.presentDays, 0);
        const totalDays = attendanceRecords.reduce((sum, a) => sum + a.totalWorkingDays, 0);
        const classAvg = totalDays > 0 ? (totalPresent / totalDays) * 100 : 0;
        averageAttendance += classAvg;
      }
    }
    
    if (classTeacherClasses.length > 0) {
      averageAttendance = averageAttendance / classTeacherClasses.length;
    }
    
    // Recent Activities (staff-related)
    const recentActivities = await RecentActivity.find({
      $or: [
        { performedBy: userId },
        { 'details.classId': { $in: classTeacherClasses.map(c => c._id) } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('performedBy', 'name role');
    
    // Quick Stats
    const quickStats = {
      classesTaught: teachingClasses.length + classTeacherClasses.length,
      subjectsTaught: subjectsTaught.length,
      totalStudents: totalStudents,
      pendingTasks: pendingTasks.length
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
          email: staff.email,
          phone: staff.contact
        },
        quickStats,
        todaySchedule,
        pendingTasks,
        upcomingDuties: formattedDuties.slice(0, 5),
        recentActivities: recentActivities.map(a => ({
          id: a._id,
          title: a.title,
          description: a.description,
          type: a.activityType,
          severity: a.severity,
          timestamp: a.createdAt
        })),
        classTeacherInfo: classTeacherClasses.length > 0 ? {
          classes: classTeacherClasses.map(c => ({
            id: c._id,
            name: c.displayName || `${c.name}-${c.section}`,
            studentCount: c.studentCount || 0
          })),
          averageAttendance: averageAttendance.toFixed(1),
          pendingParentRequests
        } : null,
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
    const children = await parent.getCurrentStudentDetails(currentYear?._id);
    
    // Get full student details with marks and attendance
    const studentDetails = [];
    let totalChildren = 0;
    let totalAttendance = 0;
    let totalPerformance = 0;
    
    for (const child of children) {
      const student = await Student.findOne({ 
        studentCode: child.studentCode,
        academicYearId: currentYear?._id 
      }).populate('classId', 'name section displayName classTeacherName');
      
      if (student) {
        totalChildren++;
        
        // Get attendance summary
        const attendanceRecords = await Attendance.find({ studentId: student._id });
        let attendancePercentage = 0;
        if (attendanceRecords.length > 0) {
          const totalPresent = attendanceRecords.reduce((sum, a) => sum + a.presentDays, 0);
          const totalDays = attendanceRecords.reduce((sum, a) => sum + a.totalWorkingDays, 0);
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
        
        // Get upcoming exams
        const upcomingExams = await Exam.find({
          classIds: student.classId,
          startDate: { $gte: new Date() },
          isActive: true
        })
          .select('name examType startDate endDate')
          .sort({ startDate: 1 })
          .limit(3);
        
        // Get recent notifications for this student
        const notifications = await Notification.find({
          userId: parent.userId,
          'data.studentId': student._id
        })
          .sort({ createdAt: -1 })
          .limit(5);
        
        studentDetails.push({
          _id: student._id,
          studentId: student._id,
          fullName: student.fullName,
          studentCode: student.studentCode,
          admissionNo: student.admissionNo,
          rollNumber: student.rollNumber,
          className: student.classId?.displayName || child.className,
          classId: student.classId,
          relation: child.relation,
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
    }
    
    // Fee Status (placeholder - implement actual fee collection logic)
    const feeStatus = {
      totalFee: 25000,
      paid: 20000,
      due: 5000,
      lastPaymentDate: new Date(),
      status: 'partial'
    };
    
    // Recent Notifications for parent
    const recentNotifications = await Notification.find({ userId: parent.userId })
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Quick Stats
    const quickStats = {
      totalChildren: totalChildren,
      averageAttendance: totalChildren > 0 ? (totalAttendance / totalChildren).toFixed(1) : 0,
      averagePerformance: totalChildren > 0 ? (totalPerformance / totalChildren).toFixed(1) : 0,
      unreadNotifications: recentNotifications.filter(n => !n.isRead).length,
      feeDue: feeStatus.due
    };
    
    // Events and Holidays
    const upcomingEvents = await getUpcomingEvents(5);
    
    // School Announcements
    const announcements = await Notification.find({ 
      type: 'announcement',
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
  const today = new Date();
  const events = [
    { id: 1, title: 'Parent-Teacher Meeting', date: new Date(today.getFullYear(), today.getMonth(), 20), type: 'Meeting', priority: 'high' },
    { id: 2, title: 'Final Exams Begin', date: new Date(today.getFullYear(), today.getMonth(), 25), type: 'Exam', priority: 'high' },
    { id: 3, title: 'Sports Day', date: new Date(today.getFullYear(), today.getMonth(), 30), type: 'Event', priority: 'medium' },
    { id: 4, title: 'Independence Day Celebration', date: new Date(today.getFullYear(), 7, 15), type: 'Event', priority: 'high' },
    { id: 5, title: 'Teacher\'s Day', date: new Date(today.getFullYear(), 8, 5), type: 'Event', priority: 'medium' },
    { id: 6, title: 'Onam Celebration', date: new Date(today.getFullYear(), 8, 10), type: 'Event', priority: 'high' },
    { id: 7, title: 'Christmas Vacation', date: new Date(today.getFullYear(), 11, 23), type: 'Holiday', priority: 'medium' },
  ];
  
  // Filter upcoming events
  const upcoming = events
    .filter(e => e.date >= today)
    .sort((a, b) => a.date - b.date)
    .slice(0, limit)
    .map(e => ({
      id: e.id,
      title: e.title,
      date: e.date,
      type: e.type,
      priority: e.priority,
      daysLeft: Math.ceil((e.date - today) / (1000 * 60 * 60 * 24))
    }));
  
  return upcoming;
}

async function getExamPerformanceStats(academicYearId) {
  const recentExams = await Exam.find({ academicYearId, resultsPublished: true })
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
    if (examResults[0].avgPercentage > examResults[1].avgPercentage + 2) {
      trend = 'up';
    } else if (examResults[0].avgPercentage < examResults[1].avgPercentage - 2) {
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
    perStaff[duty.staffId.toString()] = (perStaff[duty.staffId.toString()] || 0) + duty.totalDuties;
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
    const marks = await Mark.find({ studentId: { $in: studentIds } });
    
    if (marks.length === 0) continue;
    
    let totalMarks = 0;
    let totalMaxMarks = 0;
    
    for (const mark of marks) {
      totalMarks += mark.totalScore || 0;
      totalMaxMarks += mark.totalMaxMarks || 100;
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