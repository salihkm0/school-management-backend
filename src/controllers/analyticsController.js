const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Class = require('../models/Class');
const Mark = require('../models/Mark');
const Exam = require('../models/Exam');
const Attendance = require('../models/Attendance');

exports.getDashboardAnalytics = async (req, res) => {
  try {
    const totalStudents = await Student.countDocuments({ status: 'active' });
    const totalStaff = await Staff.countDocuments({ isActive: true });
    const totalClasses = await Class.countDocuments({ isActive: true });
    
    const currentYear = new Date().getFullYear().toString();
    const currentExams = await Exam.countDocuments({ academicYear: currentYear });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const attendanceToday = await Attendance.countDocuments({
      createdAt: { $gte: today },
      status: 'present'
    });

    const recentActivities = await Mark.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('studentId', 'name')
      .populate('examId', 'name');

    const recentActivitiesFormatted = recentActivities.map(activity => ({
      type: 'marks_entered',
      description: `Marks entered for ${activity.studentId?.name} in ${activity.examId?.name}`,
      timestamp: activity.createdAt
    }));

    res.json({
      success: true,
      data: {
        totalStudents,
        totalStaff,
        totalClasses,
        currentExams,
        attendanceToday,
        recentActivities: recentActivitiesFormatted
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPerformanceAnalytics = async (req, res) => {
  try {
    const { examId, classId } = req.query;
    
    const query = {};
    if (examId) query.examId = examId;
    if (classId) {
      const students = await Student.find({ classId }).select('_id');
      query.studentId = { $in: students.map(s => s._id) };
    }
    
    const marks = await Mark.find(query);
    
    const totalMarks = marks.reduce((sum, m) => sum + m.totalMarks, 0);
    const totalMaxMarks = marks.reduce((sum, m) => sum + m.maxMarks, 0);
    const overallPercentage = (totalMarks / totalMaxMarks) * 100;
    
    const subjectPerformance = {};
    marks.forEach(mark => {
      if (!subjectPerformance[mark.subjectName]) {
        subjectPerformance[mark.subjectName] = {
          totalMarks: 0,
          maxMarks: 0,
          count: 0
        };
      }
      subjectPerformance[mark.subjectName].totalMarks += mark.totalMarks;
      subjectPerformance[mark.subjectName].maxMarks += mark.maxMarks;
      subjectPerformance[mark.subjectName].count++;
    });
    
    Object.keys(subjectPerformance).forEach(subject => {
      subjectPerformance[subject].percentage = 
        (subjectPerformance[subject].totalMarks / subjectPerformance[subject].maxMarks) * 100;
    });
    
    const gradeDistribution = {
      'A+': 0, 'A': 0, 'B+': 0, 'B': 0, 'C+': 0, 'C': 0, 'D': 0, 'F': 0
    };
    
    const studentPercentages = {};
    marks.forEach(mark => {
      if (!studentPercentages[mark.studentId]) {
        studentPercentages[mark.studentId] = {
          total: 0,
          max: 0
        };
      }
      studentPercentages[mark.studentId].total += mark.totalMarks;
      studentPercentages[mark.studentId].max += mark.maxMarks;
    });
    
    Object.values(studentPercentages).forEach(student => {
      const percentage = (student.total / student.max) * 100;
      if (percentage >= 90) gradeDistribution['A+']++;
      else if (percentage >= 80) gradeDistribution['A']++;
      else if (percentage >= 70) gradeDistribution['B+']++;
      else if (percentage >= 60) gradeDistribution['B']++;
      else if (percentage >= 50) gradeDistribution['C+']++;
      else if (percentage >= 40) gradeDistribution['C']++;
      else if (percentage >= 33) gradeDistribution['D']++;
      else gradeDistribution['F']++;
    });
    
    const topPerformers = Object.entries(studentPercentages)
      .map(([studentId, data]) => ({
        studentId,
        percentage: (data.total / data.max) * 100
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
          totalStudents: Object.keys(studentPercentages).length
        },
        subjectPerformance,
        gradeDistribution,
        topPerformers
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAttendanceAnalytics = async (req, res) => {
  try {
    const { classId, startDate, endDate } = req.query;
    
    const query = {};
    if (classId) {
      const students = await Student.find({ classId }).select('_id');
      query.studentId = { $in: students.map(s => s._id) };
    }
    if (startDate) query.createdAt = { $gte: new Date(startDate) };
    if (endDate) query.createdAt = { $lte: new Date(endDate) };
    
    const attendance = await Attendance.find(query);
    
    const monthlyAttendance = {};
    const classWiseAttendance = {};

    attendance.forEach(record => {
      const month = record.createdAt.toISOString().slice(0, 7);
      if (!monthlyAttendance[month]) {
        monthlyAttendance[month] = { present: 0, absent: 0, total: 0 };
      }
      monthlyAttendance[month].total++;
      if (record.status === 'present') {
        monthlyAttendance[month].present++;
      } else {
        monthlyAttendance[month].absent++;
      }
    });
    
    Object.keys(monthlyAttendance).forEach(month => {
      monthlyAttendance[month].percentage = 
        (monthlyAttendance[month].present / monthlyAttendance[month].total) * 100;
    });
    
    res.json({
      success: true,
      data: {
        monthlyAttendance,
        overallAttendance: {
          total: attendance.length,
          present: attendance.filter(a => a.status === 'present').length,
          absent: attendance.filter(a => a.status === 'absent').length,
          percentage: (attendance.filter(a => a.status === 'present').length / attendance.length) * 100
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTopPerformingClasses = async (req, res) => {
  try {
    const { examId, limit = 10 } = req.query;
    
    const classes = await Class.find({ isActive: true });
    const classPerformance = [];

    for (const classItem of classes) {
      const students = await Student.find({ classId: classItem._id });
      const studentIds = students.map(s => s._id);
      
      const marks = await Mark.find({
        studentId: { $in: studentIds },
        examId
      });
      
      if (marks.length === 0) continue;
      
      const totalMarks = marks.reduce((sum, m) => sum + m.totalMarks, 0);
      const totalMaxMarks = marks.reduce((sum, m) => sum + m.maxMarks, 0);
      const averagePercentage = (totalMarks / totalMaxMarks) * 100;
      
      classPerformance.push({
        classId: classItem._id,
        className: classItem.displayName,
        averagePercentage,
        totalStudents: students.length,
        totalMarks,
        totalMaxMarks
      });
    }
    
    classPerformance.sort((a, b) => b.averagePercentage - a.averagePercentage);
    
    res.json(classPerformance.slice(0, limit));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getStudentProgressTrend = async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const marks = await Mark.find({ studentId })
      .populate('examId', 'name term startDate')
      .sort({ 'examId.startDate': 1 });
    
    const progressTrend = marks.map(mark => ({
      examId: mark.examId._id,
      examName: mark.examId.name,
      term: mark.examId.term,
      date: mark.examId.startDate,
      percentage: mark.percentage,
      grade: mark.grade
    }));
    
    const subjectWiseTrend = {};
    marks.forEach(mark => {
      if (!subjectWiseTrend[mark.subjectName]) {
        subjectWiseTrend[mark.subjectName] = [];
      }
      subjectWiseTrend[mark.subjectName].push({
        examName: mark.examName,
        percentage: mark.percentage,
        grade: mark.grade
      });
    });
    
    res.json({
      progressTrend,
      subjectWiseTrend,
      overallAverage: progressTrend.reduce((sum, p) => sum + p.percentage, 0) / progressTrend.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};