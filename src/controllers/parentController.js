// controllers/parentController.js
const Parent = require('../models/Parent');
const User = require('../models/User');
const Student = require('../models/Student');  // ← ADD THIS LINE - it's missing!
const AcademicYear = require('../models/AcademicYear');
const Notification = require('../models/Notification');
const { broadcastToUser } = require('../config/socket');
const { sendEmail } = require('../services/emailService');
const Attendance = require('../models/Attendance');
const { Exam } = require("../models/Exam");
const Mark = require('../models/Mark');

// Helper: Send notification to parent
async function sendParentNotification(userId, title, message, type, data) {
  const notification = await Notification.create({
    userId,
    title,
    message,
    type,
    data
  });
  
  broadcastToUser(userId.toString(), 'notification', {
    id: notification._id,
    title,
    message,
    type,
    data: notification.data,
    timestamp: notification.createdAt,
    read: false
  });
}

// Register Parent
exports.registerParent = async (req, res) => {
  try {
    const { email, password, fullName, phone, alternatePhone, address, occupation } = req.body;
    
    if (!phone) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }
    
    // Check if user already exists with this phone
    const existingUserByPhone = await User.findOne({ phone });
    if (existingUserByPhone) {
      return res.status(400).json({ message: 'Mobile number already registered' });
    }
    
    // Check if email exists (only if provided)
    if (email) {
      const existingUserByEmail = await User.findOne({ email });
      if (existingUserByEmail) {
        return res.status(400).json({ message: 'Email already registered' });
      }
    }
    
    // Create User for login
    const userData = {
      password,
      name: fullName,
      role: 'parent',
      phone
    };
    
    if (email) {
      userData.email = email;
    }
    
    const user = await User.create(userData);
    
    // Create Parent profile
    const parent = await Parent.create({
      userId: user._id,
      fullName,
      email: email || null,
      phone,
      alternatePhone: alternatePhone || '',
      address: typeof address === 'string' ? { street: address } : address,
      occupation: occupation || '',
      students: [],
      profileCompleted: true
    });
    
    // Generate tokens for auto-login after registration (optional)
    const token = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();
    
    user.refreshToken = refreshToken;
    user.refreshTokenExpire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
    
    // Send welcome email only if email provided
    if (email) {
      try {
        await sendEmail({
          email: user.email,
          subject: 'Welcome to School Management System',
          template: 'parent_welcome',
          data: { name: fullName, email, phone }
        });
      } catch (error) {
        console.error('Email error:', error);
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Parent registered successfully. You can now login with your mobile number.',
      data: {
        parent: {
          _id: parent._id,
          fullName: parent.fullName,
          email: parent.email,
          phone: parent.phone
        },
        token,
        refreshToken
      }
    });
  } catch (error) {
    // Clean up if parent creation fails
    if (req.body.phone) {
      await User.deleteOne({ phone: req.body.phone });
    }
    console.error('Register parent error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Connect Student to Parent (using studentCode and dateOfBirth)
exports.connectStudent = async (req, res) => {
  try {
    const parentId = req.params.id;
    const { studentCode, dateOfBirth, relation } = req.body;
    
    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    // Check if already connected
    if (parent.hasConnection && parent.hasConnection(studentCode)) {
      return res.status(400).json({ message: 'Student already connected' });
    }
    
    const parsedDOB = new Date(dateOfBirth);
    
    // Find student by studentCode and dateOfBirth (across all years)
    const student = await Student.findOne({
      studentCode: studentCode,
      dateOfBirth: {
        $gte: new Date(parsedDOB.setHours(0, 0, 0, 0)),
        $lt: new Date(parsedDOB.setHours(23, 59, 59, 999))
      }
    }).sort({ academicYearId: -1 });
    
    if (!student) {
      // Store the connection request for future matching
      if (parent.addStudentConnection) {
        await parent.addStudentConnection(studentCode, parsedDOB, relation);
      }
      
      return res.status(202).json({ 
        success: true,
        message: 'Connection request saved. Student will be connected when data is imported.',
        pending: true,
        studentCode,
        relation
      });
    }
    
    // Student found - add connection
    if (parent.addStudentConnection) {
      await parent.addStudentConnection(studentCode, parsedDOB, relation);
    }
    
    // Update cached details immediately
    const connection = parent.students.find(s => s.studentCode === studentCode);
    if (connection) {
      connection.studentFullName = student.fullName;
      connection.className = `${student.className || ''} ${student.division || ''}`.trim();
      await parent.save();
    }
    
    // Send notification
    await sendParentNotification(
      parent.userId,
      'Student Connected Successfully',
      `Your child ${student.fullName} (${studentCode}) has been connected to your account.`,
      'success',
      { studentCode, studentName: student.fullName }
    );
    
    res.json({
      success: true,
      message: 'Student connected successfully',
      data: {
        studentCode: student.studentCode,
        studentName: student.fullName,
        className: `${student.className || ''} ${student.division || ''}`.trim(),
        relation: relation || 'father'
      }
    });
  } catch (error) {
    console.error('Error in connectStudent:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get parent by logged-in user ID
exports.getMyParentProfile = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user.id })
      .populate('userId', 'email phone photoUrl name');
    
    if (!parent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Parent profile not found' 
      });
    }
    
    res.json({
      success: true,
      data: parent
    });
  } catch (error) {
    console.error('Error in getMyParentProfile:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get parent profile with current student details
exports.getParentProfile = async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id)
      .populate('userId', 'email phone photoUrl');
    
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    // Get current academic year
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    // Get current student details
    let currentStudents = [];
    if (parent.getCurrentStudentDetails) {
      currentStudents = await parent.getCurrentStudentDetails(currentYear?._id);
    }
    
    // Check which connections have current data
    const connections = (parent.students || []).map(conn => {
      const current = currentStudents.find(s => s.studentCode === conn.studentCode);
      return {
        studentCode: conn.studentCode,
        relation: conn.relation,
        connectedSince: conn.connectedSince,
        currentDetails: current || null,
        hasCurrentData: !!current
      };
    });
    
    res.json({
      success: true,
      data: {
        ...parent.toObject(),
        connections,
        currentStudents,
        summary: {
          totalConnections: (parent.students || []).length,
          activeStudents: currentStudents.length,
          pendingStudents: (parent.students || []).length - currentStudents.length
        }
      }
    });
  } catch (error) {
    console.error('Error in getParentProfile:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get parent's current children (for logged-in parent) - ENHANCED with attendance & exam performance
exports.getMyChildren = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user.id });
    
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }
    
    // Get current academic year
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    if (!currentYear) {
      return res.status(404).json({ message: 'Current academic year not found' });
    }
    
    // Get current student details
    let children = [];
    if (parent.getCurrentStudentDetails) {
      children = await parent.getCurrentStudentDetails(currentYear._id);
    }
    
    // Get full student details
    const studentCodes = children.map(c => c.studentCode);
    const fullStudents = await Student.find({
      studentCode: { $in: studentCodes },
      academicYearId: currentYear._id
    })
      .populate('classId', 'name section classTeacherName')
      .select('-__v');
    
    // Import Attendance model
    const { Attendance } = require('../models/Attendance');
    
    // Merge with relation info, attendance, and exam performance
    const enrichedChildren = await Promise.all(fullStudents.map(async (student) => {
      const child = children.find(c => c.studentCode === student.studentCode);
      
      // Calculate attendance percentage - aggregate across all months
      let attendancePercentage = 0;
      let totalWorkingDays = 0;
      let totalPresentDays = 0;
      let monthlyAttendance = [];
      
      try {
        // Get attendance records for this student for the current academic year
        const attendanceRecords = await Attendance.find({
          studentId: student._id,
          academicYearId: currentYear._id
        }).sort({ year: 1, month: 1 });
        
        if (attendanceRecords.length > 0) {
          // Calculate totals across all months
          totalWorkingDays = attendanceRecords.reduce((sum, record) => sum + (record.totalWorkingDays || 0), 0);
          totalPresentDays = attendanceRecords.reduce((sum, record) => sum + (record.presentDays || 0), 0);
          attendancePercentage = totalWorkingDays > 0 ? (totalPresentDays / totalWorkingDays) * 100 : 0;
          
          // Prepare monthly breakdown
          monthlyAttendance = attendanceRecords.map(record => ({
            month: record.month,
            year: record.year,
            presentDays: record.presentDays,
            absentDays: record.absentDays,
            totalWorkingDays: record.totalWorkingDays,
            percentage: record.percentage,
            holidays: record.holidays || []
          }));
        }
      } catch (error) {
        console.error(`Error fetching attendance for student ${student._id}:`, error);
      }
      
      // Calculate exam performance from Mark model
      let examPerformance = {
        overallPercentage: 0,
        examCount: 0,
        bestExam: null,
        recentExams: [],
        subjectWisePerformance: {},
        trend: 'stable',
        grade: 'F',
        totalMarks: 0,
        totalMaxMarks: 0
      };
      
      try {
        // Get all marksheets for this student (published or finalized)
        const marksheets = await Mark.find({
          studentId: student._id,
          academicYearId: currentYear._id,
          status: { $in: ['published', 'reviewed'] }
        }).populate('examId', 'displayName examType term startDate');
        
        if (marksheets.length > 0) {
          // Calculate overall average across all exams
          const totalPercentage = marksheets.reduce((sum, mark) => sum + (mark.percentage || 0), 0);
          examPerformance.overallPercentage = totalPercentage / marksheets.length;
          examPerformance.examCount = marksheets.length;
          examPerformance.totalMarks = marksheets.reduce((sum, mark) => sum + (mark.totalMarks || 0), 0);
          examPerformance.totalMaxMarks = marksheets.reduce((sum, mark) => sum + (mark.totalMaxMarks || 0), 0);
          
          // Find best exam
          const bestResult = [...marksheets].sort((a, b) => (b.percentage || 0) - (a.percentage || 0))[0];
          if (bestResult) {
            examPerformance.bestExam = {
              examName: bestResult.examName,
              examId: bestResult.examId,
              percentage: bestResult.percentage,
              grade: bestResult.grade,
              rank: bestResult.rank,
              totalMarks: bestResult.totalMarks,
              totalMaxMarks: bestResult.totalMaxMarks
            };
          }
          
          // Get recent exams (last 3 by date)
          const sortedMarksheets = [...marksheets].sort((a, b) => 
            new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt)
          );
          
          examPerformance.recentExams = sortedMarksheets.slice(0, 3).map(mark => ({
            examId: mark.examId,
            examName: mark.examName,
            examType: mark.examType,
            term: mark.term,
            percentage: mark.percentage,
            grade: mark.grade,
            rank: mark.rank,
            totalMarks: mark.totalMarks,
            totalMaxMarks: mark.totalMaxMarks,
            status: mark.status,
            completedAt: mark.finalizedAt || mark.submittedAt || mark.createdAt
          }));
          
          // Calculate subject-wise performance across all exams
          const subjectPerformanceMap = new Map();
          
          for (const marksheet of marksheets) {
            if (marksheet.subjects && Array.isArray(marksheet.subjects)) {
              for (const subject of marksheet.subjects) {
                const subjectKey = subject.subjectId?.toString() || subject.subjectName;
                if (!subjectPerformanceMap.has(subjectKey)) {
                  subjectPerformanceMap.set(subjectKey, {
                    subjectId: subject.subjectId,
                    subjectName: subject.subjectName,
                    subjectCode: subject.subjectCode,
                    totalPercentage: 0,
                    totalScore: 0,
                    totalMaxMarks: 0,
                    count: 0,
                    bestPercentage: 0,
                    lastPercentage: 0,
                    lastScore: 0
                  });
                }
                
                const perf = subjectPerformanceMap.get(subjectKey);
                perf.totalPercentage += subject.percentage || 0;
                perf.totalScore += subject.totalScore || 0;
                perf.totalMaxMarks += subject.maxMarks || 0;
                perf.count++;
                perf.bestPercentage = Math.max(perf.bestPercentage, subject.percentage || 0);
                perf.lastPercentage = subject.percentage || 0;
                perf.lastScore = subject.totalScore || 0;
              }
            }
          }
          
          // Calculate averages
          for (const [key, perf] of subjectPerformanceMap) {
            examPerformance.subjectWisePerformance[key] = {
              subjectId: perf.subjectId,
              subjectName: perf.subjectName,
              subjectCode: perf.subjectCode,
              averagePercentage: perf.totalPercentage / perf.count,
              averageScore: perf.totalScore / perf.count,
              averageMaxMarks: perf.totalMaxMarks / perf.count,
              bestPercentage: perf.bestPercentage,
              lastPercentage: perf.lastPercentage,
              lastScore: perf.lastScore,
              examCount: perf.count
            };
          }
          
          // Determine performance trend (improving/declining/stable)
          if (sortedMarksheets.length >= 2) {
            const recentAvg = sortedMarksheets.slice(0, 2).reduce((sum, m) => sum + (m.percentage || 0), 0) / 2;
            const previousAvg = sortedMarksheets.slice(2, 4).reduce((sum, m) => sum + (m.percentage || 0), 0) / (Math.min(2, sortedMarksheets.length - 2));
            
            if (previousAvg > 0) {
              const change = recentAvg - previousAvg;
              if (change > 5) examPerformance.trend = 'improving';
              else if (change < -5) examPerformance.trend = 'declining';
              else examPerformance.trend = 'stable';
            }
          }
          
          // Calculate overall grade based on overall percentage
          const overallPct = examPerformance.overallPercentage;
          if (overallPct >= 90) examPerformance.grade = 'A+';
          else if (overallPct >= 80) examPerformance.grade = 'A';
          else if (overallPct >= 70) examPerformance.grade = 'B+';
          else if (overallPct >= 60) examPerformance.grade = 'B';
          else if (overallPct >= 50) examPerformance.grade = 'C+';
          else if (overallPct >= 40) examPerformance.grade = 'C';
          else if (overallPct >= 33) examPerformance.grade = 'D';
          else examPerformance.grade = 'F';
        }
      } catch (error) {
        console.error(`Error fetching marks for student ${student._id}:`, error);
      }
      
      // Calculate attendance grade
      let attendanceGrade = 'Good';
      if (attendancePercentage >= 90) attendanceGrade = 'Excellent';
      else if (attendancePercentage >= 75) attendanceGrade = 'Good';
      else if (attendancePercentage >= 60) attendanceGrade = 'Average';
      else attendanceGrade = 'Poor';
      
      return {
        ...student.toObject(),
        relation: child?.relation || 'guardian',
        connectedSince: child?.connectedSince,
        attendance: {
          percentage: Math.round(attendancePercentage * 100) / 100,
          totalWorkingDays,
          totalPresentDays,
          totalAbsentDays: totalWorkingDays - totalPresentDays,
          grade: attendanceGrade,
          monthlyBreakdown: monthlyAttendance
        },
        examPerformance,
        academicSummary: {
          attendancePercentage: Math.round(attendancePercentage * 100) / 100,
          examAverage: Math.round(examPerformance.overallPercentage * 100) / 100,
          examsTaken: examPerformance.examCount,
          overallGrade: examPerformance.grade,
          trend: examPerformance.trend,
          totalMarksObtained: examPerformance.totalMarks,
          totalMaxMarks: examPerformance.totalMaxMarks
        }
      };
    }));
    
    // Calculate class-level statistics for comparison
    let classAverages = {};
    if (enrichedChildren.length > 0 && enrichedChildren[0].classId) {
      const classId = enrichedChildren[0].classId;
      const allStudentsInClass = await Student.find({ 
        classId: classId, 
        status: 'active',
        academicYearId: currentYear._id
      }).select('_id');
      
      // Get all marks for students in this class
      const allMarks = await Mark.find({
        studentId: { $in: allStudentsInClass.map(s => s._id) },
        academicYearId: currentYear._id,
        status: { $in: ['published', 'reviewed'] }
      });
      
      if (allMarks.length > 0) {
        // Calculate average percentage per student
        const studentAverages = new Map();
        for (const mark of allMarks) {
          const studentId = mark.studentId.toString();
          if (!studentAverages.has(studentId)) {
            studentAverages.set(studentId, { totalPct: 0, count: 0 });
          }
          const stats = studentAverages.get(studentId);
          stats.totalPct += mark.percentage || 0;
          stats.count++;
        }
        
        let totalStudentAvg = 0;
        for (const stats of studentAverages.values()) {
          totalStudentAvg += stats.totalPct / stats.count;
        }
        const classAvgPercentage = studentAverages.size > 0 ? totalStudentAvg / studentAverages.size : 0;
        
        classAverages = {
          examPercentage: Math.round(classAvgPercentage * 100) / 100,
          totalStudents: allStudentsInClass.length,
          totalExamsTaken: Math.round(allMarks.length / allStudentsInClass.length),
          totalMarksheets: allMarks.length
        };
        
        // Add class rank for each student
        for (const child of enrichedChildren) {
          const studentMarks = allMarks.filter(m => m.studentId.toString() === child._id.toString());
          if (studentMarks.length > 0) {
            const studentAvg = studentMarks.reduce((sum, m) => sum + (m.percentage || 0), 0) / studentMarks.length;
            
            // Calculate how many students have higher average
            let higherCount = 0;
            for (const [otherStudentId, stats] of studentAverages.entries()) {
              if (otherStudentId !== child._id.toString()) {
                const otherAvg = stats.totalPct / stats.count;
                if (otherAvg > studentAvg) {
                  higherCount++;
                }
              }
            }
            
            child.examPerformance.classRank = higherCount + 1;
            child.examPerformance.totalStudentsInClass = allStudentsInClass.length;
            child.examPerformance.classAverage = classAvgPercentage;
          }
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        children: enrichedChildren,
        count: enrichedChildren.length,
        academicYear: currentYear.year || 'Current',
        classAverages,
        summary: {
          averageAttendance: enrichedChildren.length > 0 
            ? enrichedChildren.reduce((sum, c) => sum + (c.attendance?.percentage || 0), 0) / enrichedChildren.length 
            : 0,
          averageExamScore: enrichedChildren.length > 0 
            ? enrichedChildren.reduce((sum, c) => sum + (c.examPerformance?.overallPercentage || 0), 0) / enrichedChildren.length 
            : 0,
          totalExamsTaken: enrichedChildren.reduce((sum, c) => sum + (c.examPerformance?.examCount || 0), 0),
          childrenNeedingAttention: enrichedChildren.filter(c => 
            (c.attendance?.percentage || 0) < 75 || (c.examPerformance?.overallPercentage || 0) < 50
          ).length,
          topPerformer: enrichedChildren.length > 0 
            ? enrichedChildren.reduce((best, current) => 
                (current.examPerformance?.overallPercentage || 0) > (best.examPerformance?.overallPercentage || 0) ? current : best
              , enrichedChildren[0])
            : null
        }
      }
    });
  } catch (error) {
    console.error('Error in getMyChildren:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all parents (Admin only)
exports.getParents = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    
    const query = { isActive: true };
    if (search && search.trim()) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { 'students.studentCode': { $regex: search, $options: 'i' } }
      ];
    }
    
    const parents = await Parent.find(query)
      .populate('userId', 'email isActive lastLogin')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    
    const total = await Parent.countDocuments(query);
    
    // Get current year for student counts
    const currentYear = await AcademicYear.findOne({ isCurrent: true });
    
    // Add current student count for each parent
    const enrichedParents = await Promise.all(parents.map(async (parent) => {
      let currentStudents = [];
      if (parent.getCurrentStudentDetails) {
        currentStudents = await parent.getCurrentStudentDetails(currentYear?._id);
      }
      return {
        ...parent.toObject(),
        currentStudentCount: currentStudents.length,
        totalConnections: (parent.students || []).length
      };
    }));
    
    res.json({
      success: true,
      data: enrichedParents || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total || 0,
        pages: Math.ceil((total || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Error in getParents:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 }
    });
  }
};

// Remove student connection
exports.removeStudentConnection = async (req, res) => {
  try {
    const { parentId, studentCode } = req.params;
    
    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    if (parent.removeStudentConnection) {
      await parent.removeStudentConnection(studentCode);
    }
    
    res.json({
      success: true,
      message: 'Student connection removed successfully'
    });
  } catch (error) {
    console.error('Error in removeStudentConnection:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get students for a specific parent (Admin view)
exports.getParentStudents = async (req, res) => {
  try {
    const { parentId } = req.params;
    const { academicYearId } = req.query;
    
    const parent = await Parent.findById(parentId);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found' });
    }
    
    let yearId = academicYearId;
    if (!yearId) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      yearId = currentYear?._id;
    }
    
    let students = [];
    if (parent.getCurrentStudentDetails) {
      students = await parent.getCurrentStudentDetails(yearId);
    }
    
    // Get full student details
    const studentCodes = students.map(s => s.studentCode);
    const fullStudents = await Student.find({
      studentCode: { $in: studentCodes },
      academicYearId: yearId
    })
      .populate('classId', 'name section displayName')
      .select('studentCode fullName className division gender dateOfBirth status');
    
    // Merge with relation info
    const enrichedStudents = fullStudents.map(student => {
      const connection = (parent.students || []).find(c => c.studentCode === student.studentCode);
      return {
        ...student.toObject(),
        relation: connection?.relation || 'guardian',
        connectedSince: connection?.connectedSince
      };
    });
    
    // Also include connections without current student data
    const missingStudentCodes = (parent.students || [])
      .filter(c => !fullStudents.find(s => s.studentCode === c.studentCode))
      .map(c => ({
        studentCode: c.studentCode,
        relation: c.relation,
        connectedSince: c.connectedSince,
        status: 'not_enrolled',
        message: 'Student not enrolled in this academic year'
      }));
    
    res.json({
      success: true,
      data: {
        parent: {
          _id: parent._id,
          fullName: parent.fullName,
          phone: parent.phone
        },
        currentStudents: enrichedStudents,
        inactiveConnections: missingStudentCodes,
        total: enrichedStudents.length + missingStudentCodes.length
      }
    });
  } catch (error) {
    console.error('Error in getParentStudents:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getParentByUserId = async (req, res) => {
  try {
    const parent = await Parent.findOne({ userId: req.user.id })
      .populate('userId', 'email phone photoUrl');
    
    if (!parent) {
      return res.status(404).json({ message: 'Parent profile not found' });
    }
    
    res.json({
      success: true,
      data: parent
    });
  } catch (error) {
    console.error('Error in getParentByUserId:', error);
    res.status(500).json({ message: error.message });
  }
};