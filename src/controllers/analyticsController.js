// controllers/analyticsController.js
const Student = require("../models/Student");
const Staff = require("../models/Staff");
const Class = require("../models/Class");
const Mark = require("../models/Mark");
const { Exam } = require("../models/Exam");
const ExamResult = require("../models/ExamResult");
const { Attendance } = require("../models/Attendance");
const AcademicYear = require("../models/AcademicYear");
const StaffDuty = require("../models/StaffDuty"); 
const { RecentActivity, ACTIVITY_TYPES, ENTITY_TYPES, SEVERITY } = require("../models/RecentActivity");
const { broadcastToRole, broadcastToUser } = require("../config/socket");
const puppeteer = require("puppeteer");
const ejs = require("ejs");
const path = require("path");
const pdfService = require("../services/pdf/reportCardService");
const fs = require("fs");
const PDFDocument = require("pdfkit");

// Grade order and values for analysis
const GRADE_VALUES = {
  "A+": 10,
  A: 9,
  "B+": 8,
  B: 7,
  "C+": 6,
  C: 5,
  D: 4,
  F: 3,
};

// Helper: Create recent activity
async function createRecentActivity({
  title,
  description,
  activityType,
  entityType,
  entityId = null,
  entityModel = null,
  performedBy,
  performedByName,
  performedByRole,
  details = {},
  changes = {},
  ipAddress = null,
  userAgent = null,
  severity = SEVERITY.INFO,
  batchId = null
}) {
  try {
    const activity = await RecentActivity.create({
      title,
      description,
      activityType,
      entityType,
      entityId,
      entityModel,
      performedBy,
      performedByName,
      performedByRole,
      details,
      changes,
      ipAddress,
      userAgent,
      severity,
      batchId
    });
    
    // Broadcast to admin and staff
    broadcastToRole('admin', 'recent_activity:created', { activity });
    broadcastToRole('staff', 'recent_activity:created', { activity });
    
    return activity;
  } catch (error) {
    console.error('Error creating recent activity:', error);
    return null;
  }
}

// Helper: Count A+ grades in subjects
function countAPlusGrades(subjectResults) {
  return subjectResults.filter((s) => s.grade === "A+").length;
}

// Helper: Check if student has A+ in specific subject
function hasAPlusInSubject(subjectResults, subjectName) {
  const subject = subjectResults.find((s) =>
    s.subjectName?.toLowerCase().includes(subjectName.toLowerCase()),
  );
  return subject?.grade === "A+";
}

// Helper: Get full A+ analysis
function analyzeFullAPlus(results) {
  const analysis = {
    fullAPlus: [],
    nineAPlus: [],
    eightAPlus: [],
    sevenAPlus: [],
    sixAPlus: [],
    fiveAPlus: [],

    fullAPlusWithoutMaths: [],
    fullAPlusWithoutScience: [],
    fullAPlusWithoutEnglish: [],
    fullAPlusWithoutMalayalam: [],
    fullAPlusWithoutHindi: [],
    fullAPlusWithoutArabic: [],
    fullAPlusWithoutSocialScience: [],
    fullAPlusWithoutIT: [],

    statistics: {
      totalStudents: results.length,
      fullAPlusCount: 0,
      nineAPlusCount: 0,
      eightAPlusCount: 0,
      sevenAPlusCount: 0,
      sixAPlusCount: 0,
      fiveAPlusCount: 0,
    },
  };

  results.forEach((result) => {
    const subjectResults = result.subjectResults || [];
    const totalSubjects = subjectResults.length;
    const aplusCount = countAPlusGrades(subjectResults);

    const studentInfo = {
      studentId: result.studentId?._id || result.studentId,
      studentName: result.studentName,
      rollNumber: result.rollNumber,
      admissionNumber: result.studentCode,
      totalMarks: result.totalMarks,
      totalMaxMarks: result.totalMaxMarks,
      percentage: result.percentage,
      rank: result.rank,
      aplusCount,
      totalSubjects,
    };

    if (aplusCount === totalSubjects) {
      analysis.fullAPlus.push(studentInfo);
      analysis.statistics.fullAPlusCount++;
    } else if (aplusCount === 9) {
      analysis.nineAPlus.push(studentInfo);
      analysis.statistics.nineAPlusCount++;
    } else if (aplusCount === 8) {
      analysis.eightAPlus.push(studentInfo);
      analysis.statistics.eightAPlusCount++;
    } else if (aplusCount === 7) {
      analysis.sevenAPlus.push(studentInfo);
      analysis.statistics.sevenAPlusCount++;
    } else if (aplusCount === 6) {
      analysis.sixAPlus.push(studentInfo);
      analysis.statistics.sixAPlusCount++;
    } else if (aplusCount === 5) {
      analysis.fiveAPlus.push(studentInfo);
      analysis.statistics.fiveAPlusCount++;
    }

    if (aplusCount === totalSubjects - 1) {
      const nonAPlusSubject = subjectResults.find((s) => s.grade !== "A+");
      const missingSubject = nonAPlusSubject?.subjectName || "";

      const nearFullInfo = {
        ...studentInfo,
        missingSubject,
        missingSubjectGrade: nonAPlusSubject?.grade,
        missingSubjectMarks: nonAPlusSubject?.obtainedMarks,
      };

      if (!hasAPlusInSubject(subjectResults, "Math")) {
        analysis.fullAPlusWithoutMaths.push(nearFullInfo);
      }
      if (!hasAPlusInSubject(subjectResults, "Science")) {
        analysis.fullAPlusWithoutScience.push(nearFullInfo);
      }
      if (!hasAPlusInSubject(subjectResults, "English")) {
        analysis.fullAPlusWithoutEnglish.push(nearFullInfo);
      }
      if (!hasAPlusInSubject(subjectResults, "Malayalam")) {
        analysis.fullAPlusWithoutMalayalam.push(nearFullInfo);
      }
      if (!hasAPlusInSubject(subjectResults, "Hindi")) {
        analysis.fullAPlusWithoutHindi.push(nearFullInfo);
      }
      if (!hasAPlusInSubject(subjectResults, "Arabic")) {
        analysis.fullAPlusWithoutArabic.push(nearFullInfo);
      }
      if (!hasAPlusInSubject(subjectResults, "Social")) {
        analysis.fullAPlusWithoutSocialScience.push(nearFullInfo);
      }
      if (
        !hasAPlusInSubject(subjectResults, "IT") &&
        !hasAPlusInSubject(subjectResults, "Computer")
      ) {
        analysis.fullAPlusWithoutIT.push(nearFullInfo);
      }
    }
  });

  return analysis;
}

// Helper to broadcast dashboard updates
async function broadcastDashboardUpdate() {
  try {
    const totalStudents = await Student.countDocuments({ status: "active" });
    const totalStaff = await Staff.countDocuments({ isActive: true });
    const totalClasses = await Class.countDocuments({ isActive: true });
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    const currentExams = await Exam.countDocuments({
      academicYearId: currentYear?._id,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const attendanceToday = await Attendance.countDocuments({
      createdAt: { $gte: today },
      status: "present",
    });

    broadcastToRole("admin", "dashboard:updated", {
      totalStudents,
      totalStaff,
      totalClasses,
      currentExams,
      attendanceToday,
      timestamp: new Date(),
    });
    broadcastToRole("staff", "dashboard:updated", {
      totalStudents,
      totalStaff,
      totalClasses,
      currentExams,
      attendanceToday,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error broadcasting dashboard update:", error);
  }
}

// ==================== EXPORTS ====================

// Dashboard Analytics
exports.getDashboardAnalytics = async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments({ status: "active" });
    const totalStaff = await Staff.countDocuments({ isActive: true });
    const totalClasses = await Class.countDocuments({ isActive: true });

    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    const currentExams = await Exam.countDocuments({
      academicYearId: currentYear?._id,
      isActive: true,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const attendanceToday = await Attendance.countDocuments({
      createdAt: { $gte: today },
      status: "present",
    });

    // Get recent exam results for A+ count
    const recentResults = await ExamResult.find({ isPublished: true })
      .sort({ createdAt: -1 })
      .limit(100);

    const fullAPlusCount = recentResults.filter((r) => {
      return r.subjectResults?.every((s) => s.grade === "A+");
    }).length;

    // Get recent activities from the RecentActivity model
    const recentActivities = await RecentActivity.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('performedBy', 'name role');

    // If no activities in RecentActivity model, create some default ones
    let activities = recentActivities;
    if (activities.length === 0) {
      // Create sample activities for demonstration
      const recentStudents = await Student.find()
        .sort({ createdAt: -1 })
        .limit(3)
        .select("fullName createdAt");
      const recentStaff = await Staff.find()
        .sort({ createdAt: -1 })
        .limit(2)
        .select("name createdAt");
      const recentExams = await Exam.find()
        .sort({ createdAt: -1 })
        .limit(2)
        .select("name createdAt");

      const sampleActivities = [
        ...recentStudents.map((s) => ({
          type: "student_added",
          description: `New student added: ${s.fullName}`,
          timestamp: s.createdAt,
          performedByRole: "admin",
        })),
        ...recentStaff.map((s) => ({
          type: "staff_added",
          description: `New staff member: ${s.name}`,
          timestamp: s.createdAt,
          performedByRole: "admin",
        })),
        ...recentExams.map((e) => ({
          type: "exam_created",
          description: `New exam created: ${e.name}`,
          timestamp: e.createdAt,
          performedByRole: "admin",
        })),
      ];
      
      activities = sampleActivities
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);
    } else {
      activities = activities.map(activity => ({
        type: activity.activityType,
        description: activity.description,
        timestamp: activity.createdAt,
        performedByRole: activity.performedByRole,
        title: activity.title
      }));
    }

    // Get gender distribution
    const maleCount = await Student.countDocuments({ gender: "M", status: "active" });
    const femaleCount = await Student.countDocuments({ gender: "F", status: "active" });
    const otherCount = await Student.countDocuments({ gender: "Other", status: "active" });

    // Get category distribution
    const categoryDistribution = await Student.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$category", count: { $sum: 1 } } }
    ]);

    // Get monthly student enrollment trends
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

    // Get recent exam results statistics
    const examResults = await ExamResult.find({ isPublished: true })
      .sort({ createdAt: -1 })
      .limit(50);
    
    const examPerformance = examResults.length > 0 ? {
      averagePercentage: examResults.reduce((sum, r) => sum + (r.percentage || 0), 0) / examResults.length,
      highestPercentage: Math.max(...examResults.map(r => r.percentage || 0)),
      lowestPercentage: Math.min(...examResults.map(r => r.percentage || 0)),
      passedCount: examResults.filter(r => (r.percentage || 0) >= 40).length,
      failedCount: examResults.filter(r => (r.percentage || 0) < 40).length
    } : null;

    // Get pending tasks count
    const pendingExams = await Exam.countDocuments({ 
      overallStatus: { $in: ['draft', 'submitted'] },
      isActive: true 
    });
    const pendingDuties = await StaffDuty?.countDocuments({ status: 'assigned' }) || 0;
    const pendingAttendance = await Attendance.countDocuments({ 
      status: { $ne: 'present' },
      createdAt: { $gte: today }
    });

    res.json({
      success: true,
      data: {
        totalStudents,
        totalStaff,
        totalClasses,
        currentExams,
        attendanceToday,
        fullAPlusCount,
        academicYear: currentYear?.year,
        recentActivities: activities,
        demographics: {
          gender: {
            male: maleCount,
            female: femaleCount,
            other: otherCount
          },
          category: categoryDistribution
        },
        enrollmentTrend,
        examPerformance,
        pendingTasks: {
          exams: pendingExams,
          duties: pendingDuties,
          attendance: pendingAttendance
        }
      },
    });
  } catch (error) {
    console.error("Error in getDashboardAnalytics:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get Recent Activities API
exports.getRecentActivities = async (req, res) => {
  try {
    const { limit = 20, activityType, entityType, severity } = req.query;
    
    const query = {};
    if (activityType) query.activityType = activityType;
    if (entityType) query.entityType = entityType;
    if (severity) query.severity = severity;
    
    const activities = await RecentActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('performedBy', 'name role');
    
    const total = await RecentActivity.countDocuments(query);
    
    res.json({
      success: true,
      data: activities,
      pagination: {
        total,
        limit: parseInt(limit),
        returned: activities.length
      }
    });
  } catch (error) {
    console.error("Error in getRecentActivities:", error);
    res.status(500).json({ message: error.message });
  }
};

// Subscribe to dashboard updates
exports.subscribeDashboard = async (req, res) => {
  try {
    const userId = req.user.id;

    broadcastToUser(userId, "dashboard:subscribed", {
      message: "Subscribed to dashboard updates",
      timestamp: new Date(),
    });

    const totalStudents = await Student.countDocuments({ status: "active" });
    const totalStaff = await Staff.countDocuments({ isActive: true });
    const totalClasses = await Class.countDocuments({ isActive: true });
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    const currentExams = await Exam.countDocuments({
      academicYearId: currentYear?._id,
    });

    res.json({
      success: true,
      message: "Subscribed to dashboard updates",
      data: { totalStudents, totalStaff, totalClasses, currentExams },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Performance Analytics
exports.getPerformanceAnalytics = async (req, res) => {
  try {
    const { examId, classId, academicYearId } = req.query;

    const query = {};
    if (examId) query.examId = examId;
    if (classId) {
      const students = await Student.find({ classId }).select("_id");
      query.studentId = { $in: students.map((s) => s._id) };
    }
    if (academicYearId) query.academicYearId = academicYearId;

    const marks = await Mark.find(query).populate('examId', 'name term');

    if (marks.length === 0) {
      return res.json({
        success: true,
        data: {
          overall: {
            totalMarks: 0,
            totalMaxMarks: 0,
            overallPercentage: 0,
            totalStudents: 0,
          },
          subjectPerformance: {},
          gradeDistribution: {},
          topPerformers: [],
          examWisePerformance: []
        },
      });
    }

    const totalMarks = marks.reduce((sum, m) => sum + (m.totalScore || 0), 0);
    const totalMaxMarks = marks.reduce(
      (sum, m) => sum + (m.totalMaxMarks || 0),
      0,
    );
    const overallPercentage =
      totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0;

    const subjectPerformance = {};
    marks.forEach((mark) => {
      if (mark.subjects && Array.isArray(mark.subjects)) {
        mark.subjects.forEach(subject => {
          const subjectName = subject.subjectName;
          if (!subjectPerformance[subjectName]) {
            subjectPerformance[subjectName] = {
              totalMarks: 0,
              maxMarks: 0,
              count: 0
            };
          }
          subjectPerformance[subjectName].totalMarks += subject.totalScore || 0;
          subjectPerformance[subjectName].maxMarks += subject.maxMarks || 0;
          subjectPerformance[subjectName].count++;
        });
      } else {
        const subjectName = mark.subjectName;
        if (!subjectPerformance[subjectName]) {
          subjectPerformance[subjectName] = {
            totalMarks: 0,
            maxMarks: 0,
            count: 0
          };
        }
        subjectPerformance[subjectName].totalMarks += mark.totalScore || 0;
        subjectPerformance[subjectName].maxMarks += mark.totalMaxMarks || 0;
        subjectPerformance[subjectName].count++;
      }
    });

    Object.keys(subjectPerformance).forEach((subject) => {
      const perf = subjectPerformance[subject];
      perf.averagePercentage =
        perf.maxMarks > 0 ? (perf.totalMarks / perf.maxMarks) * 100 : 0;
    });

    const gradeDistribution = {
      "A+": 0,
      A: 0,
      "B+": 0,
      B: 0,
      "C+": 0,
      C: 0,
      D: 0,
      F: 0,
    };

    const studentPercentages = {};
    marks.forEach((mark) => {
      let studentTotal = 0;
      let studentMax = 0;
      
      if (mark.subjects && Array.isArray(mark.subjects)) {
        mark.subjects.forEach(subject => {
          studentTotal += subject.totalScore || 0;
          studentMax += subject.maxMarks || 0;
        });
      } else {
        studentTotal = mark.totalScore || 0;
        studentMax = mark.totalMaxMarks || 0;
      }
      
      if (!studentPercentages[mark.studentId]) {
        studentPercentages[mark.studentId] = { total: 0, max: 0 };
      }
      studentPercentages[mark.studentId].total += studentTotal;
      studentPercentages[mark.studentId].max += studentMax;
    });

    Object.values(studentPercentages).forEach((student) => {
      const percentage =
        student.max > 0 ? (student.total / student.max) * 100 : 0;
      if (percentage >= 90) gradeDistribution["A+"]++;
      else if (percentage >= 80) gradeDistribution["A"]++;
      else if (percentage >= 70) gradeDistribution["B+"]++;
      else if (percentage >= 60) gradeDistribution["B"]++;
      else if (percentage >= 50) gradeDistribution["C+"]++;
      else if (percentage >= 40) gradeDistribution["C"]++;
      else if (percentage >= 33) gradeDistribution["D"]++;
      else gradeDistribution["F"]++;
    });

    const topPerformers = Object.entries(studentPercentages)
      .map(([studentId, data]) => ({
        studentId,
        percentage: data.max > 0 ? (data.total / data.max) * 100 : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 10);

    // Exam-wise performance
    const examWisePerformance = {};
    marks.forEach((mark) => {
      const examName = mark.examId?.name || 'Unknown Exam';
      if (!examWisePerformance[examName]) {
        examWisePerformance[examName] = { totalMarks: 0, totalMax: 0, count: 0 };
      }
      let markTotal = 0;
      let markMax = 0;
      if (mark.subjects && Array.isArray(mark.subjects)) {
        mark.subjects.forEach(subject => {
          markTotal += subject.totalScore || 0;
          markMax += subject.maxMarks || 0;
        });
      } else {
        markTotal = mark.totalScore || 0;
        markMax = mark.totalMaxMarks || 0;
      }
      examWisePerformance[examName].totalMarks += markTotal;
      examWisePerformance[examName].totalMax += markMax;
      examWisePerformance[examName].count++;
    });

    const examPerformanceArray = Object.entries(examWisePerformance).map(([name, data]) => ({
      examName: name,
      averagePercentage: data.totalMax > 0 ? (data.totalMarks / data.totalMax) * 100 : 0,
      totalStudents: data.count,
      totalMarks: data.totalMarks,
      totalMaxMarks: data.totalMax
    }));

    res.json({
      success: true,
      data: {
        overall: {
          totalMarks,
          totalMaxMarks,
          overallPercentage,
          totalStudents: Object.keys(studentPercentages).length,
        },
        subjectPerformance,
        gradeDistribution,
        topPerformers,
        examWisePerformance: examPerformanceArray
      },
    });
  } catch (error) {
    console.error("Error in getPerformanceAnalytics:", error);
    res.status(500).json({ message: error.message });
  }
};

// Attendance Analytics
exports.getAttendanceAnalytics = async (req, res) => {
  try {
    const { classId, startDate, endDate, academicYearId } = req.query;

    const query = {};
    if (classId) {
      const students = await Student.find({ classId }).select("_id");
      query.studentId = { $in: students.map((s) => s._id) };
    }
    if (academicYearId) query.academicYearId = academicYearId;
    if (startDate) query.date = { $gte: new Date(startDate) };
    if (endDate) query.date = { ...query.date, $lte: new Date(endDate) };

    const attendance = await Attendance.find(query);

    const monthlyAttendance = {};

    attendance.forEach((record) => {
      const month = record.date ? record.date.getMonth() + 1 : new Date().getMonth() + 1;
      const year = record.date ? record.date.getFullYear() : new Date().getFullYear();
      const monthKey = `${year}-${month}`;
      
      if (!monthlyAttendance[monthKey]) {
        monthlyAttendance[monthKey] = { 
          present: 0, 
          absent: 0, 
          total: 0,
          month,
          year
        };
      }
      monthlyAttendance[monthKey].total++;
      if (record.status === "present") {
        monthlyAttendance[monthKey].present++;
      } else {
        monthlyAttendance[monthKey].absent++;
      }
    });

    const monthlyChartData = Object.entries(monthlyAttendance).map(([key, data]) => ({
      month: new Date(data.year, data.month - 1, 1).toLocaleString('default', { month: 'short' }),
      percentage: data.total > 0 ? (data.present / data.total) * 100 : 0,
      present: data.present,
      absent: data.absent,
      total: data.total
    })).sort((a, b) => {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months.indexOf(a.month) - months.indexOf(b.month);
    });

    const totalPresent = attendance.filter(
      (a) => a.status === "present",
    ).length;

    res.json({
      success: true,
      data: {
        monthlyAttendance: monthlyChartData,
        overallAttendance: {
          total: attendance.length,
          present: totalPresent,
          absent: attendance.length - totalPresent,
          percentage:
            attendance.length > 0
              ? (totalPresent / attendance.length) * 100
              : 0,
        },
      },
    });
  } catch (error) {
    console.error("Error in getAttendanceAnalytics:", error);
    res.status(500).json({ message: error.message });
  }
};

// Top Performing Classes
exports.getTopPerformingClasses = async (req, res) => {
  try {
    const { examId, academicYearId, limit = 10 } = req.query;

    const classes = await Class.find({ isActive: true });
    const classPerformance = [];

    for (const classItem of classes) {
      const students = await Student.find({ classId: classItem._id, status: 'active' });
      const studentIds = students.map((s) => s._id);

      const markQuery = { studentId: { $in: studentIds } };
      if (examId) markQuery.examId = examId;
      if (academicYearId) markQuery.academicYearId = academicYearId;

      const marks = await Mark.find(markQuery);

      if (marks.length === 0) continue;

      let totalMarks = 0;
      let totalMaxMarks = 0;
      
      marks.forEach(mark => {
        if (mark.subjects && Array.isArray(mark.subjects)) {
          mark.subjects.forEach(subject => {
            totalMarks += subject.totalScore || 0;
            totalMaxMarks += subject.maxMarks || 0;
          });
        } else {
          totalMarks += mark.totalScore || 0;
          totalMaxMarks += mark.totalMaxMarks || 0;
        }
      });
      
      const averagePercentage =
        totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0;

      classPerformance.push({
        classId: classItem._id,
        className: classItem.section
          ? `${classItem.name}-${classItem.section}`
          : classItem.name,
        averagePercentage,
        totalStudents: students.length,
        totalMarks,
        totalMaxMarks,
      });
    }

    classPerformance.sort((a, b) => b.averagePercentage - a.averagePercentage);

    res.json(classPerformance.slice(0, parseInt(limit)));
  } catch (error) {
    console.error("Error in getTopPerformingClasses:", error);
    res.status(500).json({ message: error.message });
  }
};

// Student Progress Trend
exports.getStudentProgressTrend = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYearId } = req.query;

    const marks = await Mark.find({ studentId })
      .populate("examId", "name term startDate")
      .sort({ "examId.startDate": 1 });

    if (academicYearId) {
      marks = marks.filter(m => m.academicYearId?.toString() === academicYearId);
    }

    const progressTrend = marks.map((mark) => {
      let percentage = 0;
      if (mark.subjects && Array.isArray(mark.subjects)) {
        let total = 0;
        let max = 0;
        mark.subjects.forEach(subject => {
          total += subject.totalScore || 0;
          max += subject.maxMarks || 0;
        });
        percentage = max > 0 ? (total / max) * 100 : 0;
      } else {
        percentage = mark.totalPercentage || 
          (mark.totalScore && mark.totalMaxMarks ? (mark.totalScore / mark.totalMaxMarks) * 100 : 0);
      }
      
      return {
        examId: mark.examId?._id,
        examName: mark.examId?.name,
        term: mark.examId?.term,
        date: mark.examId?.startDate,
        percentage: percentage,
        grade: mark.finalGrade,
      };
    });

    const subjectWiseTrend = {};
    marks.forEach((mark) => {
      if (mark.subjects && Array.isArray(mark.subjects)) {
        mark.subjects.forEach(subject => {
          if (!subjectWiseTrend[subject.subjectName]) {
            subjectWiseTrend[subject.subjectName] = [];
          }
          subjectWiseTrend[subject.subjectName].push({
            examName: mark.examId?.name,
            percentage: subject.percentage || 0,
            grade: subject.grade,
          });
        });
      } else if (mark.subjectName) {
        if (!subjectWiseTrend[mark.subjectName]) {
          subjectWiseTrend[mark.subjectName] = [];
        }
        subjectWiseTrend[mark.subjectName].push({
          examName: mark.examId?.name,
          percentage: mark.totalPercentage || 0,
          grade: mark.finalGrade,
        });
      }
    });

    const average =
      progressTrend.length > 0
        ? progressTrend.reduce((sum, p) => sum + p.percentage, 0) /
          progressTrend.length
        : 0;

    res.json({
      success: true,
      data: { progressTrend, subjectWiseTrend, overallAverage: average },
    });
  } catch (error) {
    console.error("Error in getStudentProgressTrend:", error);
    res.status(500).json({ message: error.message });
  }
};

// Grade Analysis
exports.getGradeAnalysis = async (req, res) => {
  try {
    const { examId, classId, academicYearId } = req.query;

    const query = { isPublished: true };
    if (examId) query.examId = examId;
    if (classId) query.classId = classId;
    if (academicYearId) query.academicYearId = academicYearId;

    const results = await ExamResult.find(query)
      .populate("studentId", "fullName admissionNo rollNumber")
      .populate("subjectResults.subjectId", "name code");

    const analysis = analyzeFullAPlus(results);

    const gradeDistribution = {
      "A+": 0,
      A: 0,
      "B+": 0,
      B: 0,
      "C+": 0,
      C: 0,
      D: 0,
      F: 0,
    };

    results.forEach((result) => {
      if (gradeDistribution[result.grade] !== undefined) {
        gradeDistribution[result.grade]++;
      }
    });

    const subjectWiseAPlus = {};
    const subjectWisePerformance = {};
    
    if (results.length > 0 && results[0].subjectResults) {
      results[0].subjectResults.forEach((subject) => {
        subjectWiseAPlus[subject.subjectName] = 0;
        subjectWisePerformance[subject.subjectName] = { total: 0, max: 0, count: 0 };
      });

      results.forEach((result) => {
        result.subjectResults?.forEach((subject) => {
          if (subject.grade === "A+") {
            subjectWiseAPlus[subject.subjectName]++;
          }
          subjectWisePerformance[subject.subjectName].total += subject.obtainedMarks || 0;
          subjectWisePerformance[subject.subjectName].max += subject.maxMarks || 0;
          subjectWisePerformance[subject.subjectName].count++;
        });
      });
    }

    // Calculate average percentages
    Object.keys(subjectWisePerformance).forEach(subject => {
      const perf = subjectWisePerformance[subject];
      perf.averagePercentage = perf.max > 0 ? (perf.total / perf.max) * 100 : 0;
    });

    res.json({
      success: true,
      data: {
        analysis,
        gradeDistribution,
        subjectWiseAPlus,
        subjectWisePerformance,
        totalStudents: results.length,
        summary: {
          fullAPlus: analysis.statistics.fullAPlusCount,
          nineAPlus: analysis.statistics.nineAPlusCount,
          eightAPlus: analysis.statistics.eightAPlusCount,
          sevenAPlus: analysis.statistics.sevenAPlusCount,
          fullAPlusPercentage:
            results.length > 0
              ? (analysis.statistics.fullAPlusCount / results.length) * 100
              : 0,
          passPercentage:
            results.length > 0
              ? (results.filter((r) => r.percentage >= 40).length /
                  results.length) *
                100
              : 0,
        },
      },
    });
  } catch (error) {
    console.error("Error in getGradeAnalysis:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get Full A+ Students
exports.getFullAPlusStudents = async (req, res) => {
  try {
    const { examId, classId, academicYearId } = req.query;

    const query = { isPublished: true };
    if (examId) query.examId = examId;
    if (classId) query.classId = classId;
    if (academicYearId) query.academicYearId = academicYearId;

    const results = await ExamResult.find(query)
      .populate("studentId", "fullName admissionNo rollNumber photoUrl")
      .sort({ rank: 1 });

    const fullAPlusStudents = results.filter((result) => {
      return (
        result.subjectResults?.length > 0 &&
        result.subjectResults.every((s) => s.grade === "A+")
      );
    });

    res.json({
      success: true,
      data: fullAPlusStudents.map((s) => ({
        studentId: s.studentId?._id,
        studentName: s.studentName,
        rollNumber: s.rollNumber,
        admissionNumber: s.studentCode,
        totalMarks: s.totalMarks,
        totalMaxMarks: s.totalMaxMarks,
        percentage: s.percentage,
        rank: s.rank,
        photoUrl: s.studentId?.photoUrl,
      })),
      total: fullAPlusStudents.length,
    });
  } catch (error) {
    console.error("Error in getFullAPlusStudents:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get Near Full A+ Students
exports.getNearFullAPlusStudents = async (req, res) => {
  try {
    const { examId, classId, academicYearId, missingSubject } = req.query;

    const query = { isPublished: true };
    if (examId) query.examId = examId;
    if (classId) query.classId = classId;
    if (academicYearId) query.academicYearId = academicYearId;

    const results = await ExamResult.find(query)
      .populate("studentId", "fullName admissionNo rollNumber")
      .sort({ percentage: -1 });

    const nearFullAPlus = results.filter((result) => {
      const subjectResults = result.subjectResults || [];
      const totalSubjects = subjectResults.length;
      const aplusCount = countAPlusGrades(subjectResults);

      if (aplusCount !== totalSubjects - 1) return false;

      if (missingSubject) {
        const nonAPlusSubject = subjectResults.find((s) => s.grade !== "A+");
        return nonAPlusSubject?.subjectName
          ?.toLowerCase()
          .includes(missingSubject.toLowerCase());
      }

      return true;
    });

    res.json({
      success: true,
      data: nearFullAPlus.map((s) => {
        const nonAPlusSubject = s.subjectResults?.find(
          (sub) => sub.grade !== "A+",
        );
        return {
          studentId: s.studentId?._id,
          studentName: s.studentName,
          rollNumber: s.rollNumber,
          totalMarks: s.totalMarks,
          percentage: s.percentage,
          rank: s.rank,
          aplusCount: countAPlusGrades(s.subjectResults),
          totalSubjects: s.subjectResults?.length || 0,
          missingSubject: nonAPlusSubject?.subjectName,
          missingSubjectGrade: nonAPlusSubject?.grade,
          missingSubjectMarks: nonAPlusSubject?.obtainedMarks,
        };
      }),
      total: nearFullAPlus.length,
    });
  } catch (error) {
    console.error("Error in getNearFullAPlusStudents:", error);
    res.status(500).json({ message: error.message });
  }
};

// Generate Report Card
exports.generateReportCard = async (req, res) => {
  try {
    const { studentId, academicYearId } = req.params;

    const student = await Student.findById(studentId).populate(
      "classId",
      "name section displayName",
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    let academicYear = null;
    if (academicYearId) {
      academicYear = await AcademicYear.findById(academicYearId);
    } else {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const exams = await Exam.find({
      academicYearId: academicYear?._id,
      classIds: student.classId,
      resultsPublished: true,
    }).sort({ term: 1, examType: 1 });

    const examResults = [];
    for (const exam of exams) {
      const result = await ExamResult.findOne({
        studentId,
        examId: exam._id,
      });

      if (result) {
        examResults.push({ exam, result });
      }
    }

    const attendance = await Attendance.aggregate([
      { $match: { studentId: student._id, academicYearId: academicYear?._id } },
      {
        $group: {
          _id: null,
          totalDays: { $sum: 1 },
          presentDays: {
            $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
          },
          absentDays: {
            $sum: { $cond: [{ $eq: ["$status", "absent"] }, 1, 0] },
          },
        },
      },
    ]);

    const attendanceStats = attendance[0] || {
      totalDays: 0,
      presentDays: 0,
      absentDays: 0,
    };

    const reportData = {
      schoolName: "PPM HSS KOTTUKKARA",
      schoolLogo: process.env.SCHOOL_LOGO_URL || "/uploads/logo.png",
      academicYear: academicYear?.year || new Date().getFullYear().toString(),
      student: {
        name: student.fullName,
        admissionNo: student.admissionNo,
        rollNumber: student.rollNumber,
        class:
          student.classId?.displayName ||
          `${student.className || ""} ${student.division || ""}`.trim(),
        dob: student.dateOfBirth
          ? new Date(student.dateOfBirth).toLocaleDateString()
          : "",
        gender: student.gender,
        caste: student.casteName,
        religion: student.religion,
        fatherName: student.fatherFullName,
        motherName: student.motherFullName,
        address:
          `${student.houseName || ""} ${student.streetName || ""} ${student.postOffice || ""}`.trim(),
        phone: student.phoneNumber,
        photoUrl: student.photoUrl,
      },
      attendance: {
        totalDays: attendanceStats.totalDays,
        presentDays: attendanceStats.presentDays,
        absentDays: attendanceStats.absentDays,
        percentage:
          attendanceStats.totalDays > 0
            ? (
                (attendanceStats.presentDays / attendanceStats.totalDays) *
                100
              ).toFixed(1)
            : 0,
      },
      exams: [],
    };

    for (const { exam, result } of examResults) {
      const examData = {
        name: exam.displayName || exam.name,
        term: exam.term,
        subjects: [],
        totalMarks: result.totalMarks,
        totalMaxMarks: result.totalMaxMarks,
        percentage: result.percentage?.toFixed(2) || "0.00",
        grade: result.grade,
        rank: result.rank,
      };

      for (const subjectResult of result.subjectResults || []) {
        const markRecord = await Mark.findOne({
          studentId,
          examId: exam._id,
          subjectId: subjectResult.subjectId,
        });

        examData.subjects.push({
          name: subjectResult.subjectName,
          code: subjectResult.subjectCode || "",
          teMarks:
            markRecord?.termMarks?.totalScore ||
            subjectResult.termMarks?.obtained ||
            0,
          teMax:
            markRecord?.termMarks?.maxMarks ||
            subjectResult.termMarks?.max ||
            0,
          ceMarks:
            markRecord?.ceMarks?.totalScore ||
            subjectResult.ceMarks?.obtained ||
            0,
          ceMax:
            markRecord?.ceMarks?.maxMarks || subjectResult.ceMarks?.max || 0,
          totalMarks: subjectResult.obtainedMarks,
          totalMax: subjectResult.maxMarks,
          percentage: subjectResult.percentage,
          grade: subjectResult.grade,
          status: subjectResult.status || subjectResult.overallStatus,
        });
      }

      reportData.exams.push(examData);
    }

    // For now, return JSON. PDF generation can be added later
    res.json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    console.error("Report card generation error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Generate Class Report Cards
exports.generateClassReportCards = async (req, res) => {
  try {
    const { classId, academicYearId } = req.params;

    const students = await Student.find({ classId, status: "active" }).sort({
      rollNumber: 1,
      fullName: 1,
    });

    if (students.length === 0) {
      return res
        .status(404)
        .json({ message: "No students found in this class" });
    }

    const academicYear = await AcademicYear.findById(academicYearId);

    const allReportData = [];

    for (const student of students) {
      const exams = await Exam.find({
        academicYearId,
        classIds: classId,
        resultsPublished: true,
      }).sort({ term: 1 });

      const examResults = [];
      for (const exam of exams) {
        const result = await ExamResult.findOne({
          studentId: student._id,
          examId: exam._id,
        });
        if (result) {
          examResults.push({ exam, result });
        }
      }

      const attendance = await Attendance.aggregate([
        { $match: { studentId: student._id, academicYearId } },
        {
          $group: {
            _id: null,
            totalDays: { $sum: 1 },
            presentDays: {
              $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] },
            },
          },
        },
      ]);

      const attendanceStats = attendance[0] || { totalDays: 0, presentDays: 0 };

      const studentData = {
        name: student.fullName,
        admissionNo: student.admissionNo,
        rollNumber: student.rollNumber,
        class: student.className,
        exams: [],
        attendance: {
          totalDays: attendanceStats.totalDays,
          presentDays: attendanceStats.presentDays,
          percentage:
            attendanceStats.totalDays > 0
              ? (
                  (attendanceStats.presentDays / attendanceStats.totalDays) *
                  100
                ).toFixed(1)
              : 0,
        },
      };

      for (const { exam, result } of examResults) {
        const examData = {
          name: exam.displayName || exam.name,
          subjects: [],
          totalMarks: result.totalMarks,
          percentage: result.percentage?.toFixed(2) || "0.00",
          grade: result.grade,
          rank: result.rank,
        };

        for (const subjectResult of result.subjectResults || []) {
          const markRecord = await Mark.findOne({
            studentId: student._id,
            examId: exam._id,
            subjectId: subjectResult.subjectId,
          });

          examData.subjects.push({
            name: subjectResult.subjectName,
            teMarks: markRecord?.termMarks?.totalScore || 0,
            teMax: markRecord?.termMarks?.maxMarks || 0,
            ceMarks: markRecord?.ceMarks?.totalScore || 0,
            ceMax: markRecord?.ceMarks?.maxMarks || 0,
            totalMarks: subjectResult.obtainedMarks,
            totalMax: subjectResult.maxMarks,
            grade: subjectResult.grade,
          });
        }

        studentData.exams.push(examData);
      }

      allReportData.push(studentData);
    }

    res.json({
      success: true,
      data: {
        schoolName: "PPM HSS KOTTUKKARA",
        academicYear: academicYear?.year || "",
        className: students[0]?.className || "",
        students: allReportData,
      },
    });
  } catch (error) {
    console.error("Class report cards error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.generateReportCardPDF = async (req, res) => {
  try {
    let { studentId, academicYearId } = req.params;

    studentId = studentId?.trim();
    academicYearId = academicYearId?.trim();

    console.log(`Generating report card for student: ${studentId}`);

    // Validate ObjectId
    if (!studentId || !studentId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid student ID format" });
    }

    const student = await Student.findById(studentId).populate(
      "classId",
      "name section displayName",
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    let academicYear = null;
    if (academicYearId && academicYearId.match(/^[0-9a-fA-F]{24}$/)) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const academicYearString = academicYear?.year || "2025-2026";
    const academicYearObjectId = academicYear?._id || null;

    // Get exams
    const exams = await Exam.find({
      academicYearId: academicYearObjectId,
      classIds: student.classId,
      resultsPublished: true,
    }).sort({ term: 1 });

    console.log(`Found ${exams.length} exams`);

    const examResults = [];
    for (const exam of exams) {
      const result = await ExamResult.findOne({
        studentId,
        examId: exam._id,
      });
      if (result) {
        examResults.push({ exam, result });
      }
    }

    // Get attendance
    const attendanceRecords = await Attendance.find({
      studentId: student._id,
      academicYearId: academicYearObjectId,
    });

    const totalDays = attendanceRecords.length || 61;
    const presentDays =
      attendanceRecords.filter((a) => a.status === "present").length || 61;
    const absentDays = totalDays - presentDays;
    const attendancePercentage =
      totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : "100.0";

    // Prepare template data
    const templateData = {
      schoolName: "PPM HSS KOTTUKKARA",
      academicYear: academicYearString,
      student: {
        name: student.fullName || "ABHISHA K",
        admissionNo: student.admissionNo || "39331",
        rollNumber: student.rollNumber || "1",
        class: student.classId?.displayName || "10 A",
        dob: student.dateOfBirth
          ? new Date(student.dateOfBirth).toLocaleDateString("en-IN")
          : "15/08/2010",
        gender: student.gender || "F",
        fatherName: student.fatherFullName || "SUDHEER K",
        motherName: student.motherFullName || "SHEEJA P",
        phone: student.phoneNumber || "9876543210",
      },
      attendance: {
        totalDays,
        presentDays,
        absentDays,
        percentage: attendancePercentage,
      },
      exams: [],
    };

    // Process exam results
    for (const { exam, result } of examResults) {
      const examData = {
        name: exam.displayName || exam.name || "Term End Examination",
        term: exam.term || "Term 1",
        subjects: [],
      };

      for (const subjectResult of result.subjectResults || []) {
        const markRecord = await Mark.findOne({
          studentId,
          examId: exam._id,
          subjectId: subjectResult.subjectId,
        });

        examData.subjects.push({
          name: subjectResult.subjectName || "Subject",
          ceMax:
            markRecord?.ceMarks?.maxMarks || subjectResult.ceMarks?.max || 10,
          teMax:
            markRecord?.termMarks?.maxMarks ||
            subjectResult.termMarks?.max ||
            40,
          ceMarks:
            markRecord?.ceMarks?.totalScore ||
            subjectResult.ceMarks?.obtained ||
            10,
          teMarks:
            markRecord?.termMarks?.totalScore ||
            subjectResult.termMarks?.obtained ||
            35,
          grade: subjectResult.grade || "B",
        });
      }

      templateData.exams.push(examData);
    }

    // Generate PDF
    const pdfBuffer = await pdfService.generateReportCard(templateData);

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="ReportCard_${(student.fullName || "student").replace(/\s+/g, "_")}.pdf"`,
    );
    res.setHeader("Cache-Control", "no-cache");

    // Send PDF
    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.length,
      "Content-Disposition": 'inline; filename="report.pdf"',
    });

    console.log('PDF buffer size:', pdfBuffer?.length);

    res.end(pdfBuffer); // ✅ NOT res.send
  } catch (error) {
    console.error("Report card PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

// Generate Class Report Cards PDF
exports.generateClassReportCardsPDF = async (req, res) => {
  try {
    const { classId, academicYearId } = req.params;

    const classItem = await Class.findById(classId);
    if (!classItem) {
      return res.status(404).json({ message: "Class not found" });
    }

    const students = await Student.find({ classId, status: "active" }).sort({
      rollNumber: 1,
      fullName: 1,
    });

    if (students.length === 0) {
      return res
        .status(404)
        .json({ message: "No students found in this class" });
    }

    let academicYear = null;
    if (academicYearId) {
      academicYear = await AcademicYear.findById(academicYearId);
    }
    if (!academicYear) {
      academicYear = await AcademicYear.findOne({ isCurrent: true });
    }

    const allStudentData = [];

    for (const student of students) {
      const exams = await Exam.find({
        academicYearId: academicYear?._id,
        classIds: classId,
        resultsPublished: true,
      }).sort({ term: 1 });

      const examResults = [];
      for (const exam of exams) {
        const result = await ExamResult.findOne({
          studentId: student._id,
          examId: exam._id,
        });
        if (result) {
          examResults.push({ exam, result });
        }
      }

      const attendanceRecords = await Attendance.find({
        studentId: student._id,
        academicYearId: academicYear?._id,
      });

      const totalDays = attendanceRecords.length;
      const presentDays = attendanceRecords.filter(
        (a) => a.status === "present",
      ).length;

      const studentData = {
        name: student.fullName,
        admissionNo: student.admissionNo,
        rollNumber: student.rollNumber,
        class:
          classItem.displayName ||
          `${classItem.name} ${classItem.section || ""}`.trim(),
        dob: student.dateOfBirth ? formatDate(student.dateOfBirth) : "",
        gender: student.gender,
        caste: student.casteName,
        religion: student.religion,
        fatherName: student.fatherFullName,
        motherName: student.motherFullName,
        phone: student.phoneNumber,
        photoUrl: student.photoUrl,
        attendance: {
          totalDays,
          presentDays,
          absentDays: totalDays - presentDays,
          percentage:
            totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : 0,
        },
        exams: [],
      };

      for (const { exam, result } of examResults) {
        const examData = {
          name: exam.displayName || exam.name,
          term: exam.term,
          subjects: [],
          totalMarks: result.totalMarks,
          totalMaxMarks: result.totalMaxMarks,
          percentage: result.percentage?.toFixed(2) || "0.00",
          grade: result.grade,
          rank: result.rank,
        };

        for (const subjectResult of result.subjectResults || []) {
          const markRecord = await Mark.findOne({
            studentId: student._id,
            examId: exam._id,
            subjectId: subjectResult.subjectId,
          });

          examData.subjects.push({
            name: subjectResult.subjectName,
            teMarks: markRecord?.termMarks?.totalScore || 0,
            teMax: markRecord?.termMarks?.maxMarks || 0,
            ceMarks: markRecord?.ceMarks?.totalScore || 0,
            ceMax: markRecord?.ceMarks?.maxMarks || 0,
            totalMarks: subjectResult.obtainedMarks,
            totalMax: subjectResult.maxMarks,
            percentage: subjectResult.percentage,
            grade: subjectResult.grade,
          });
        }

        studentData.exams.push(examData);
      }

      allStudentData.push(studentData);
    }

    const reportData = {
      schoolName: "PPM HSS KOTTUKKARA",
      schoolLogo: "/uploads/logo.png",
      academicYear: academicYear?.year || "",
      className:
        classItem.displayName ||
        `${classItem.name} ${classItem.section || ""}`.trim(),
      students: allStudentData,
    };

    const pdfBuffer = await pdfService.generateClassReportCards(reportData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=ClassReportCards_${reportData.className}_${academicYear?.year}.pdf`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Class report cards PDF error:", error);
    res.status(500).json({ message: error.message });
  }
};

// Helper function
function formatDate(date) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Export broadcast helper for use in other controllers
module.exports.broadcastDashboardUpdate = broadcastDashboardUpdate;
module.exports.createRecentActivity = createRecentActivity;