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

// ==================== HELPER FUNCTIONS ====================

function getGradeFromPercentage(percentage) {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C+";
  if (percentage >= 40) return "C";
  if (percentage >= 33) return "D";
  return "F";
}

function countAPlusGrades(subjectResults) {
  if (!subjectResults || !Array.isArray(subjectResults)) return 0;
  return subjectResults.filter((s) => s.grade === "A+").length;
}

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
    
    broadcastToRole('admin', 'recent_activity:created', { activity });
    broadcastToRole('staff', 'recent_activity:created', { activity });
    
    return activity;
  } catch (error) {
    console.error('Error creating recent activity:', error);
    return null;
  }
}

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

// ==================== DASHBOARD ANALYTICS ====================

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

    const recentMarks = await Mark.find()
      .sort({ createdAt: -1 })
      .limit(100);

    const fullAPlusCount = recentMarks.filter((m) => {
      const subjects = m.subjects || [];
      if (subjects.length === 0) return false;
      return subjects.every((s) => s.grade === "A+");
    }).length;

    const recentActivities = await RecentActivity.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('performedBy', 'name role');

    let activities = recentActivities;
    if (activities.length === 0) {
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

    const maleCount = await Student.countDocuments({ gender: "M", status: "active" });
    const femaleCount = await Student.countDocuments({ gender: "F", status: "active" });
    const otherCount = await Student.countDocuments({ gender: "Other", status: "active" });

    const categoryDistribution = await Student.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$category", count: { $sum: 1 } } }
    ]);

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

// ==================== GRADE ANALYSIS (USING MARK MODEL) ====================

exports.getGradeAnalysis = async (req, res) => {
  try {
    const { examId, classId, academicYearId } = req.query;

    const query = {};
    if (examId) query.examId = examId;
    if (academicYearId) query.academicYearId = academicYearId;
    if (classId) query.classId = classId;

    console.log('Grade Analysis Query:', query);

    const marks = await Mark.find(query)
      .populate("studentId", "fullName admissionNo rollNumber studentCode")
      .sort({ percentage: -1 });

    console.log(`Found ${marks.length} mark records`);

    // Default empty response
    const emptyResponse = {
      success: true,
      data: {
        analysis: {
          fullAPlus: [],
          nineAPlus: [],
          eightAPlus: [],
          sevenAPlus: [],
          sixAPlus: [],
          fiveAPlus: [],
          fullAPlusWithoutMaths: [],
          fullAPlusWithoutEnglish: [],
          fullAPlusWithoutMalayalam: [],
          fullAPlusWithoutHindi: [],
          fullAPlusWithoutArabic: [],
          fullAPlusWithoutSocialScience: [],
          fullAPlusWithoutIT: [],
          statistics: {
            totalStudents: 0,
            fullAPlusCount: 0,
            nineAPlusCount: 0,
            eightAPlusCount: 0,
            sevenAPlusCount: 0,
            sixAPlusCount: 0,
            fiveAPlusCount: 0,
          },
        },
        gradeDistribution: {
          "A+": 0, A: 0, "B+": 0, B: 0, "C+": 0, C: 0, D: 0, F: 0,
        },
        subjectWiseAPlus: {},
        subjectWisePerformance: {},
        totalStudents: 0,
        summary: {
          fullAPlus: 0,
          nineAPlus: 0,
          eightAPlus: 0,
          sevenAPlus: 0,
          fullAPlusPercentage: 0,
          passPercentage: 0,
        },
      },
    };

    if (marks.length === 0) {
      return res.json(emptyResponse);
    }

    const studentResults = [];
    const gradeDistribution = {
      "A+": 0, A: 0, "B+": 0, B: 0, "C+": 0, C: 0, D: 0, F: 0,
    };
    const subjectWiseAPlus = {};
    const subjectWisePerformance = {};
    let totalPassed = 0;

    for (const mark of marks) {
      const subjects = mark.subjects || [];
      const subjectResults = subjects.map(subject => ({
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        grade: subject.grade,
        percentage: subject.percentage || 0,
        obtainedMarks: subject.totalScore || 0,
        maxMarks: subject.maxMarks || 0,
      }));

      const studentInfo = {
        studentId: mark.studentId?._id || mark.studentId,
        studentName: mark.studentName,
        studentCode: mark.studentCode,
        rollNumber: mark.rollNumber,
        admissionNumber: mark.admissionNo,
        totalMarks: mark.totalMarks || 0,
        totalMaxMarks: mark.totalMaxMarks || 0,
        percentage: mark.percentage || 0,
        grade: mark.grade,
        rank: mark.rank,
        subjectResults: subjectResults,
        aplusCount: countAPlusGrades(subjectResults),
        totalSubjects: subjects.length,
      };

      studentResults.push(studentInfo);

      if (gradeDistribution[mark.grade] !== undefined) {
        gradeDistribution[mark.grade]++;
      }

      if ((mark.percentage || 0) >= 40) totalPassed++;

      for (const subject of subjects) {
        const subjectName = subject.subjectName;
        if (!subjectWiseAPlus[subjectName]) {
          subjectWiseAPlus[subjectName] = 0;
        }
        if (!subjectWisePerformance[subjectName]) {
          subjectWisePerformance[subjectName] = { total: 0, max: 0, count: 0 };
        }
        if (subject.grade === "A+") {
          subjectWiseAPlus[subjectName]++;
        }
        subjectWisePerformance[subjectName].total += subject.totalScore || 0;
        subjectWisePerformance[subjectName].max += subject.maxMarks || 0;
        subjectWisePerformance[subjectName].count++;
      }
    }

    Object.keys(subjectWisePerformance).forEach(subject => {
      const perf = subjectWisePerformance[subject];
      perf.averagePercentage = perf.max > 0 ? (perf.total / perf.max) * 100 : 0;
    });

    const analysis = {
      fullAPlus: [],
      nineAPlus: [],
      eightAPlus: [],
      sevenAPlus: [],
      sixAPlus: [],
      fiveAPlus: [],
      fullAPlusWithoutMaths: [],
      fullAPlusWithoutEnglish: [],
      fullAPlusWithoutMalayalam: [],
      fullAPlusWithoutHindi: [],
      fullAPlusWithoutArabic: [],
      fullAPlusWithoutSocialScience: [],
      fullAPlusWithoutIT: [],
      statistics: {
        totalStudents: studentResults.length,
        fullAPlusCount: 0,
        nineAPlusCount: 0,
        eightAPlusCount: 0,
        sevenAPlusCount: 0,
        sixAPlusCount: 0,
        fiveAPlusCount: 0,
      },
    };

    for (const student of studentResults) {
      const totalSubjects = student.totalSubjects;
      const aplusCount = student.aplusCount;

      if (totalSubjects === 0) continue;

      if (aplusCount === totalSubjects) {
        analysis.fullAPlus.push(student);
        analysis.statistics.fullAPlusCount++;
      } else if (aplusCount === 9) {
        analysis.nineAPlus.push(student);
        analysis.statistics.nineAPlusCount++;
      } else if (aplusCount === 8) {
        analysis.eightAPlus.push(student);
        analysis.statistics.eightAPlusCount++;
      } else if (aplusCount === 7) {
        analysis.sevenAPlus.push(student);
        analysis.statistics.sevenAPlusCount++;
      } else if (aplusCount === 6) {
        analysis.sixAPlus.push(student);
        analysis.statistics.sixAPlusCount++;
      } else if (aplusCount === 5) {
        analysis.fiveAPlus.push(student);
        analysis.statistics.fiveAPlusCount++;
      }

      if (aplusCount === totalSubjects - 1 && totalSubjects > 0) {
        const nonAPlusSubject = student.subjectResults.find(s => s.grade !== "A+");
        const missingSubject = nonAPlusSubject?.subjectName || "";
        
        const nearFullInfo = {
          ...student,
          missingSubject,
          missingSubjectGrade: nonAPlusSubject?.grade,
          missingSubjectMarks: nonAPlusSubject?.obtainedMarks,
        };
        
        const missingLower = missingSubject.toLowerCase();
        if (missingLower.includes("math")) {
          analysis.fullAPlusWithoutMaths.push(nearFullInfo);
        }
        if (missingLower.includes("english")) {
          analysis.fullAPlusWithoutEnglish.push(nearFullInfo);
        }
        if (missingLower.includes("malayalam")) {
          analysis.fullAPlusWithoutMalayalam.push(nearFullInfo);
        }
        if (missingLower.includes("hindi")) {
          analysis.fullAPlusWithoutHindi.push(nearFullInfo);
        }
        if (missingLower.includes("arabic")) {
          analysis.fullAPlusWithoutArabic.push(nearFullInfo);
        }
        if (missingLower.includes("social")) {
          analysis.fullAPlusWithoutSocialScience.push(nearFullInfo);
        }
        if (missingLower.includes("it") || missingLower.includes("computer")) {
          analysis.fullAPlusWithoutIT.push(nearFullInfo);
        }
      }
    }

    const totalStudents = studentResults.length;
    const fullAPlusCount = analysis.statistics.fullAPlusCount;
    const passPercentage = totalStudents > 0 ? (totalPassed / totalStudents) * 100 : 0;

    res.json({
      success: true,
      data: {
        analysis,
        gradeDistribution,
        subjectWiseAPlus,
        subjectWisePerformance,
        totalStudents,
        summary: {
          fullAPlus: fullAPlusCount,
          nineAPlus: analysis.statistics.nineAPlusCount,
          eightAPlus: analysis.statistics.eightAPlusCount,
          sevenAPlus: analysis.statistics.sevenAPlusCount,
          fullAPlusPercentage: totalStudents > 0 ? (fullAPlusCount / totalStudents) * 100 : 0,
          passPercentage: passPercentage,
        },
      },
    });
  } catch (error) {
    console.error("Error in getGradeAnalysis:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== FULL A+ STUDENTS ====================

exports.getFullAPlusStudents = async (req, res) => {
  try {
    const { examId, classId, academicYearId } = req.query;

    const query = {};
    if (examId) query.examId = examId;
    if (classId) query.classId = classId;
    if (academicYearId) query.academicYearId = academicYearId;

    const marks = await Mark.find(query)
      .populate("studentId", "fullName admissionNo rollNumber photoUrl")
      .sort({ percentage: -1 });

    const fullAPlusStudents = marks.filter((mark) => {
      const subjects = mark.subjects || [];
      if (subjects.length === 0) return false;
      return subjects.every((s) => s.grade === "A+");
    });

    res.json({
      success: true,
      data: fullAPlusStudents.map((s) => ({
        studentId: s.studentId?._id,
        studentName: s.studentName,
        rollNumber: s.rollNumber,
        admissionNumber: s.admissionNo,
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

// ==================== NEAR FULL A+ STUDENTS ====================

exports.getNearFullAPlusStudents = async (req, res) => {
  try {
    const { examId, classId, academicYearId, missingSubject } = req.query;

    const query = {};
    if (examId) query.examId = examId;
    if (classId) query.classId = classId;
    if (academicYearId) query.academicYearId = academicYearId;

    const marks = await Mark.find(query)
      .populate("studentId", "fullName admissionNo rollNumber")
      .sort({ percentage: -1 });

    const nearFullAPlus = marks.filter((mark) => {
      const subjects = mark.subjects || [];
      const totalSubjects = subjects.length;
      if (totalSubjects === 0) return false;
      
      const aplusCount = subjects.filter((s) => s.grade === "A+").length;
      
      if (aplusCount !== totalSubjects - 1) return false;

      if (missingSubject) {
        const nonAPlusSubject = subjects.find((s) => s.grade !== "A+");
        return nonAPlusSubject?.subjectName?.toLowerCase().includes(missingSubject.toLowerCase());
      }

      return true;
    });

    res.json({
      success: true,
      data: nearFullAPlus.map((s) => {
        const subjects = s.subjects || [];
        const nonAPlusSubject = subjects.find((sub) => sub.grade !== "A+");
        const aplusCount = subjects.filter((sub) => sub.grade === "A+").length;
        
        return {
          studentId: s.studentId?._id,
          studentName: s.studentName,
          rollNumber: s.rollNumber,
          totalMarks: s.totalMarks,
          totalMaxMarks: s.totalMaxMarks,
          percentage: s.percentage,
          rank: s.rank,
          aplusCount: aplusCount,
          totalSubjects: subjects.length,
          missingSubject: nonAPlusSubject?.subjectName,
          missingSubjectGrade: nonAPlusSubject?.grade,
          missingSubjectMarks: nonAPlusSubject?.totalScore,
        };
      }),
      total: nearFullAPlus.length,
    });
  } catch (error) {
    console.error("Error in getNearFullAPlusStudents:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== TOP PERFORMING CLASSES ====================

exports.getTopPerformingClasses = async (req, res) => {
  try {
    const { examId, academicYearId, limit = 10 } = req.query;

    const classes = await Class.find({ isActive: true });
    const classPerformance = [];

    for (const classItem of classes) {
      const query = {};
      if (examId) query.examId = examId;
      if (academicYearId) query.academicYearId = academicYearId;
      query.classId = classItem._id;

      const marks = await Mark.find(query);

      if (marks.length === 0) continue;

      let totalMarks = 0;
      let totalMaxMarks = 0;
      
      for (const mark of marks) {
        totalMarks += mark.totalMarks || 0;
        totalMaxMarks += mark.totalMaxMarks || 0;
      }
      
      const averagePercentage = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0;

      classPerformance.push({
        classId: classItem._id,
        className: classItem.section
          ? `${classItem.name}-${classItem.section}`
          : classItem.name,
        averagePercentage,
        totalStudents: marks.length,
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

// ==================== PERFORMANCE ANALYTICS ====================

exports.getPerformanceAnalytics = async (req, res) => {
  try {
    const { examId, classId, academicYearId } = req.query;

    const query = {};
    if (examId) query.examId = examId;
    if (classId) query.classId = classId;
    if (academicYearId) query.academicYearId = academicYearId;

    const marks = await Mark.find(query).populate('studentId', 'fullName rollNumber admissionNo');

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

    const totalMarks = marks.reduce((sum, m) => sum + (m.totalMarks || 0), 0);
    const totalMaxMarks = marks.reduce((sum, m) => sum + (m.totalMaxMarks || 0), 0);
    const overallPercentage = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0;

    const subjectPerformance = {};
    const gradeDistribution = {
      "A+": 0, A: 0, "B+": 0, B: 0, "C+": 0, C: 0, D: 0, F: 0,
    };
    const studentPercentages = {};

    for (const mark of marks) {
      if (gradeDistribution[mark.grade] !== undefined) {
        gradeDistribution[mark.grade]++;
      }

      const studentKey = mark.studentId?._id?.toString() || mark.studentId;
      if (!studentPercentages[studentKey]) {
        studentPercentages[studentKey] = {
          studentName: mark.studentName,
          studentId: studentKey,
          totalMarks: 0,
          totalMaxMarks: 0,
        };
      }
      studentPercentages[studentKey].totalMarks += mark.totalMarks || 0;
      studentPercentages[studentKey].totalMaxMarks += mark.totalMaxMarks || 0;

      for (const subject of (mark.subjects || [])) {
        const subjectName = subject.subjectName;
        if (!subjectPerformance[subjectName]) {
          subjectPerformance[subjectName] = {
            totalMarks: 0,
            maxMarks: 0,
            count: 0,
          };
        }
        subjectPerformance[subjectName].totalMarks += subject.totalScore || 0;
        subjectPerformance[subjectName].maxMarks += subject.maxMarks || 0;
        subjectPerformance[subjectName].count++;
      }
    }

    Object.keys(subjectPerformance).forEach((subject) => {
      const perf = subjectPerformance[subject];
      perf.averagePercentage = perf.maxMarks > 0 ? (perf.totalMarks / perf.maxMarks) * 100 : 0;
    });

    const topPerformers = Object.values(studentPercentages)
      .map(s => ({
        studentId: s.studentId,
        studentName: s.studentName,
        percentage: s.totalMaxMarks > 0 ? (s.totalMarks / s.totalMaxMarks) * 100 : 0,
        totalMarks: s.totalMarks,
        totalMaxMarks: s.totalMaxMarks,
      }))
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 10);

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
        examWisePerformance: [],
      },
    });
  } catch (error) {
    console.error("Error in getPerformanceAnalytics:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== ATTENDANCE ANALYTICS ====================

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

// ==================== STUDENT PROGRESS TREND ====================

exports.getStudentProgressTrend = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYearId } = req.query;

    let query = { studentId };
    if (academicYearId) query.academicYearId = academicYearId;

    let marks = await Mark.find(query)
      .populate("examId", "name term startDate")
      .sort({ "examId.startDate": 1 });

    const progressTrend = marks.map((mark) => {
      let percentage = mark.percentage || 0;
      
      return {
        examId: mark.examId?._id,
        examName: mark.examId?.name,
        term: mark.examId?.term,
        date: mark.examId?.startDate,
        percentage: percentage,
        grade: mark.grade,
      };
    });

    const subjectWiseTrend = {};
    marks.forEach((mark) => {
      for (const subject of (mark.subjects || [])) {
        if (!subjectWiseTrend[subject.subjectName]) {
          subjectWiseTrend[subject.subjectName] = [];
        }
        subjectWiseTrend[subject.subjectName].push({
          examName: mark.examId?.name,
          percentage: subject.percentage || 0,
          grade: subject.grade,
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

// ==================== REPORT CARD GENERATION ====================

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
    }).sort({ term: 1, examType: 1 });

    const examResults = [];
    for (const exam of exams) {
      const marks = await Mark.findOne({
        studentId,
        examId: exam._id,
      });

      if (marks) {
        examResults.push({ exam, marks });
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

    for (const { exam, marks } of examResults) {
      const examData = {
        name: exam.displayName || exam.name,
        term: exam.term,
        subjects: [],
        totalMarks: marks.totalMarks,
        totalMaxMarks: marks.totalMaxMarks,
        percentage: marks.percentage?.toFixed(2) || "0.00",
        grade: marks.grade,
      };

      for (const subject of (marks.subjects || [])) {
        examData.subjects.push({
          name: subject.subjectName,
          code: subject.subjectCode || "",
          totalMarks: subject.totalScore,
          totalMax: subject.maxMarks,
          percentage: subject.percentage,
          grade: subject.grade,
        });
      }

      reportData.exams.push(examData);
    }

    res.json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    console.error("Report card generation error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== CLASS REPORT CARDS ====================

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
    const classItem = await Class.findById(classId);

    const allReportData = [];

    for (const student of students) {
      const exams = await Exam.find({
        academicYearId,
        classIds: classId,
      }).sort({ term: 1 });

      const examResults = [];
      for (const exam of exams) {
        const marks = await Mark.findOne({
          studentId: student._id,
          examId: exam._id,
        });
        if (marks) {
          examResults.push({ exam, marks });
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
        class: classItem?.displayName || student.className,
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

      for (const { exam, marks } of examResults) {
        const examData = {
          name: exam.displayName || exam.name,
          subjects: [],
          totalMarks: marks.totalMarks,
          percentage: marks.percentage?.toFixed(2) || "0.00",
          grade: marks.grade,
        };

        for (const subject of (marks.subjects || [])) {
          examData.subjects.push({
            name: subject.subjectName,
            totalMarks: subject.totalScore,
            totalMax: subject.maxMarks,
            grade: subject.grade,
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
        className: classItem?.displayName || "",
        students: allReportData,
      },
    });
  } catch (error) {
    console.error("Class report cards error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== PDF GENERATION (PLACEHOLDER) ====================

exports.generateReportCardPDF = async (req, res) => {
  try {
    const { studentId, academicYearId } = req.params;

    // First get the report data
    const student = await Student.findById(studentId).populate("classId", "name section displayName");
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

    const exams = await Exam.find({
      academicYearId: academicYear?._id,
      classIds: student.classId,
    }).sort({ term: 1 });

    const examResults = [];
    for (const exam of exams) {
      const marks = await Mark.findOne({
        studentId,
        examId: exam._id,
      });
      if (marks) {
        examResults.push({ exam, marks });
      }
    }

    const attendance = await Attendance.aggregate([
      { $match: { studentId: student._id, academicYearId: academicYear?._id } },
      {
        $group: {
          _id: null,
          totalDays: { $sum: 1 },
          presentDays: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
        },
      },
    ]);

    const attendanceStats = attendance[0] || { totalDays: 0, presentDays: 0 };

    // For now, return JSON. PDF generation can be added later
    res.json({
      success: true,
      message: "PDF generation not implemented yet. Use /api/analytics/report-card/:studentId for JSON data.",
      data: {
        student: {
          name: student.fullName,
          admissionNo: student.admissionNo,
          rollNumber: student.rollNumber,
        },
        academicYear: academicYear?.year,
        attendance: {
          totalDays: attendanceStats.totalDays,
          presentDays: attendanceStats.presentDays,
          percentage: attendanceStats.totalDays > 0 
            ? ((attendanceStats.presentDays / attendanceStats.totalDays) * 100).toFixed(1) 
            : 0,
        },
        exams: examResults.map(({ exam, marks }) => ({
          examName: exam.displayName || exam.name,
          percentage: marks.percentage,
          grade: marks.grade,
        })),
      },
    });
  } catch (error) {
    console.error("Report card PDF generation error:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.generateClassReportCardsPDF = async (req, res) => {
  try {
    const { classId, academicYearId } = req.params;

    const students = await Student.find({ classId, status: "active" }).limit(5);
    const classItem = await Class.findById(classId);
    const academicYear = await AcademicYear.findById(academicYearId);

    res.json({
      success: true,
      message: "PDF generation not implemented yet",
      data: {
        className: classItem?.displayName,
        academicYear: academicYear?.year,
        studentCount: students.length,
      },
    });
  } catch (error) {
    console.error("Class report cards PDF error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==================== RECENT ACTIVITIES ====================

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

// ==================== SUBSCRIBE TO DASHBOARD ====================

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

// ==================== EXPORTS ====================

module.exports.broadcastDashboardUpdate = broadcastDashboardUpdate;
module.exports.createRecentActivity = createRecentActivity;