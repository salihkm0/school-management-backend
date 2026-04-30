const { Attendance, AttendanceTemplate } = require('../models/Attendance');
const Student = require('../models/Student');
const Class = require('../models/Class');
const AcademicYear = require('../models/AcademicYear');
const Notification = require('../models/Notification');
const { broadcastToUser, broadcastToClass } = require('../config/socket');

// Helper function to send attendance warning
async function sendAttendanceWarning(student, month, year, attendancePercentage, classId) {
  const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
  const status = attendancePercentage >= 75 ? 'Good' : (attendancePercentage >= 60 ? 'Average' : 'Needs Improvement');
  
  let title, message, type;
  
  if (attendancePercentage < 60) {
    title = `⚠️ Attendance Warning: ${monthName} ${year}`;
    message = `${student.fullName} has only ${attendancePercentage.toFixed(1)}% attendance in ${monthName}. Please ensure regular attendance.`;
    type = 'error';
  } else if (attendancePercentage < 75) {
    title = `📊 Attendance Alert: ${monthName} ${year}`;
    message = `${student.fullName} has ${attendancePercentage.toFixed(1)}% attendance in ${monthName}. Needs improvement to reach 75%.`;
    type = 'warning';
  } else {
    title = `✅ Attendance Report: ${monthName} ${year}`;
    message = `${student.fullName} has ${attendancePercentage.toFixed(1)}% attendance in ${monthName}. Good job!`;
    type = 'success';
  }
  
  for (const parentId of student.parentIds) {
    const notification = await Notification.create({
      userId: parentId,
      title,
      message,
      type,
      data: { studentId: student._id, studentName: student.fullName, month, year, attendancePercentage, classId, status }
    });
    
    broadcastToUser(parentId, 'notification', {
      id: notification._id,
      title,
      message,
      type,
      data: notification.data,
      timestamp: notification.createdAt,
      read: false
    });
    
    broadcastToUser(parentId, 'attendance:warning', {
      studentId: student._id,
      studentName: student.fullName,
      month,
      year,
      attendancePercentage,
      status
    });
  }
}

// ==================== TEMPLATE CONTROLLERS ====================

exports.createAttendanceTemplate = async (req, res) => {
  try {
    const { name, academicYearId, classId, month, year, totalWorkingDays, holidays } = req.body;
    
    const existingTemplate = await AttendanceTemplate.findOne({
      academicYearId,
      classId: classId || null,
      month,
      year
    });
    
    if (existingTemplate) {
      return res.status(400).json({ message: 'Template already exists for this class and month' });
    }
    
    const template = await AttendanceTemplate.create({
      name,
      academicYearId,
      classId: classId || null,
      month,
      year,
      totalWorkingDays,
      holidays: holidays || [],
      createdBy: req.user._id
    });
    
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAttendanceTemplates = async (req, res) => {
  try {
    const { academicYearId, classId, isActive, year, month } = req.query;
    const query = {};
    if (academicYearId) query.academicYearId = academicYearId;
    if (classId) query.classId = classId;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (year) query.year = parseInt(year);
    if (month) query.month = parseInt(month);
    
    const templates = await AttendanceTemplate.find(query)
      .populate('academicYearId', 'name year')
      .populate('classId', 'name section displayName')
      .sort({ year: -1, month: 1 });
    
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAttendanceTemplateById = async (req, res) => {
  try {
    const template = await AttendanceTemplate.findById(req.params.id)
      .populate('academicYearId', 'name year')
      .populate('classId', 'name section displayName');
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateAttendanceTemplate = async (req, res) => {
  try {
    const template = await AttendanceTemplate.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteAttendanceTemplate = async (req, res) => {
  try {
    const template = await AttendanceTemplate.findByIdAndDelete(req.params.id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.applyTemplateToMonth = async (req, res) => {
  try {
    const { templateId, classId, year, month } = req.body;
    
    const template = await AttendanceTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    const students = await Student.find({ classId, status: 'active' });
    const academicYear = await AcademicYear.findOne({ isCurrent: true });
    
    const results = { success: [], updated: [], failed: [] };
    
    for (const student of students) {
      try {
        let attendance = await Attendance.findOne({
          studentId: student._id,
          year,
          month,
          classId
        });
        
        if (attendance) {
          attendance.totalWorkingDays = template.totalWorkingDays;
          attendance.totalHolidays = template.holidays.length;
          attendance.holidays = template.holidays;
          attendance.templateId = template._id;
          attendance.percentage = attendance.totalWorkingDays > 0 
            ? (attendance.presentDays / attendance.totalWorkingDays) * 100 
            : 0;
          await attendance.save();
          results.updated.push(student.fullName);
        } else {
          attendance = await Attendance.create({
            studentId: student._id,
            studentName: student.fullName,
            classId,
            academicYearId: academicYear?._id || template.academicYearId,
            year,
            month,
            totalWorkingDays: template.totalWorkingDays,
            totalHolidays: template.holidays.length,
            presentDays: 0,
            absentDays: template.totalWorkingDays,
            templateId: template._id,
            holidays: template.holidays,
            percentage: 0
          });
          results.success.push(student.fullName);
        }
      } catch (error) {
        results.failed.push({ studentName: student.fullName, error: error.message });
      }
    }
    
    res.json({
      success: true,
      message: `Template applied to ${results.success.length + results.updated.length} students`,
      data: {
        totalWorkingDays: template.totalWorkingDays,
        totalHolidays: template.holidays.length,
        holidays: template.holidays,
        created: results.success.length,
        updated: results.updated.length,
        failed: results.failed.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTemplateByClassAndMonth = async (req, res) => {
  try {
    const { classId, year, month } = req.params;
    
    const template = await AttendanceTemplate.findOne({
      $or: [
        { classId: classId },
        { classId: null }
      ],
      year: parseInt(year),
      month: parseInt(month),
      isActive: true
    }).populate('academicYearId', 'name year');
    
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==================== ATTENDANCE CONTROLLERS ====================

exports.getAttendance = async (req, res) => {
  try {
    const { studentId, classId, year, month, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (studentId) query.studentId = studentId;
    if (classId) query.classId = classId;
    if (year) query.year = parseInt(year);
    if (month) query.month = parseInt(month);

    const attendance = await Attendance.find(query)
      .populate('studentId', 'fullName admissionNo rollNumber')
      .populate('classId', 'name section')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ year: -1, month: -1 });

    const total = await Attendance.countDocuments(query);

    res.json({
      success: true,
      data: attendance,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAttendanceByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { academicYearId } = req.query;

    const student = await Student.findById(studentId).populate('academicYearId');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    let query = { studentId };
    
    // If academicYearId is provided, use it
    if (academicYearId) {
      query.academicYearId = academicYearId;
    } else if (student.academicYearId) {
      // Otherwise use student's current academic year
      query.academicYearId = student.academicYearId;
    }

    const attendance = await Attendance.find(query)
      .populate('academicYearId', 'name year')
      .sort({ year: -1, month: -1 });

    res.json(attendance || []);
  } catch (error) {
    console.error('Error in getAttendanceByStudent:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getAttendanceByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { year, month } = req.query;

    console.log('getAttendanceByClass called:', { classId, year, month });

    // Get all students in the class
    const allStudents = await Student.find({ classId, status: 'active' })
      .select('_id fullName studentCode admissionNo rollNumber')
      .sort({ rollNumber: 1, fullName: 1 });

    if (!allStudents || allStudents.length === 0) {
      return res.json({
        attendance: [],
        template: null,
        workingDays: 0,
        holidayCount: 0,
        totalStudents: 0,
        message: 'No students found in this class'
      });
    }

    // Get attendance records for this class/month/year
    const attendanceRecords = await Attendance.find({
      classId,
      year: parseInt(year),
      month: parseInt(month)
    });

    console.log('Found attendance records:', attendanceRecords.length);

    // Get template for this class and month
    const template = await AttendanceTemplate.findOne({
      $or: [
        { classId: classId },
        { classId: null }
      ],
      year: parseInt(year),
      month: parseInt(month),
      isActive: true
    });

    const workingDays = template?.totalWorkingDays || 25;
    const holidayCount = template?.holidays?.length || 0;

    // Create a map of existing attendance records
    const attendanceMap = new Map();
    attendanceRecords.forEach(record => {
      attendanceMap.set(record.studentId.toString(), {
        _id: record._id,
        presentDays: record.presentDays || 0,
        absentDays: record.absentDays || 0,
        totalWorkingDays: record.totalWorkingDays || workingDays,
        percentage: record.percentage || 0,
        templateId: record.templateId,
        holidays: record.holidays || [],
        academicYearId: record.academicYearId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      });
    });

    // Build complete attendance list with all students
    const completeAttendance = [];
    for (const student of allStudents) {
      const existingRecord = attendanceMap.get(student._id.toString());
      
      if (existingRecord) {
        // Use actual values from database
        completeAttendance.push({
          _id: existingRecord._id,
          studentId: {
            _id: student._id,
            fullName: student.fullName,
            admissionNo: student.admissionNo,
            rollNumber: student.rollNumber
          },
          studentName: student.fullName,
          classId: classId,
          academicYearId: existingRecord.academicYearId,
          year: parseInt(year),
          month: parseInt(month),
          totalWorkingDays: existingRecord.totalWorkingDays,
          totalHolidays: holidayCount,
          presentDays: existingRecord.presentDays,
          absentDays: existingRecord.absentDays,
          percentage: existingRecord.percentage,
          templateId: existingRecord.templateId,
          holidays: existingRecord.holidays,
          createdAt: existingRecord.createdAt,
          updatedAt: existingRecord.updatedAt
        });
      } else {
        // NEW RECORD - SET ABSENT DAYS TO 0, NOT WORKING DAYS
        // When no attendance record exists, it means no data has been entered yet
        // So we set presentDays = 0, absentDays = 0 (not entered yet)
        completeAttendance.push({
          _id: null,
          studentId: {
            _id: student._id,
            fullName: student.fullName,
            admissionNo: student.admissionNo,
            rollNumber: student.rollNumber
          },
          studentName: student.fullName,
          classId: classId,
          academicYearId: template?.academicYearId || null,
          year: parseInt(year),
          month: parseInt(month),
          totalWorkingDays: workingDays,
          totalHolidays: holidayCount,
          presentDays: 0,
          absentDays: 0,  // CHANGE THIS: from workingDays to 0
          percentage: 0,
          templateId: template?._id || null,
          holidays: template?.holidays || [],
          isNewRecord: true,
          isNotEntered: true  // Flag to indicate no data entered yet
        });
      }
    }

    res.json({
      attendance: completeAttendance,
      template: template || null,
      workingDays: workingDays,
      holidayCount: holidayCount,
      totalStudents: allStudents.length
    });
  } catch (error) {
    console.error('Error in getAttendanceByClass:', error);
    res.status(500).json({ message: error.message });
  }
};


exports.createAttendance = async (req, res) => {
  try {
    const { studentId, classId, year, month, presentDays, absentDays, totalWorkingDays, remarks } = req.body;

    const template = await AttendanceTemplate.findOne({
      $or: [{ classId: classId }, { classId: null }],
      year: parseInt(year),
      month: parseInt(month),
      isActive: true
    });
    
    const workingDays = template?.totalWorkingDays || totalWorkingDays || 25;

    const existingAttendance = await Attendance.findOne({
      studentId,
      year,
      month
    });

    if (existingAttendance) {
      return res.status(400).json({ message: 'Attendance already exists for this month' });
    }

    const finalPresentDays = presentDays !== undefined ? presentDays : (workingDays - (absentDays || 0));
    const finalAbsentDays = absentDays !== undefined ? absentDays : (workingDays - (presentDays || 0));
    const percentage = workingDays > 0 ? (finalPresentDays / workingDays) * 100 : 0;

    const attendance = await Attendance.create({
      studentId,
      studentName: (await Student.findById(studentId))?.fullName,
      classId,
      academicYearId: (await Class.findById(classId))?.academicYearId,
      year,
      month,
      totalWorkingDays: workingDays,
      presentDays: finalPresentDays,
      absentDays: finalAbsentDays,
      percentage: percentage,
      templateId: template?._id,
      remarks
    });

    const student = await Student.findById(studentId);
    if (student && percentage < 75) {
      await sendAttendanceWarning(student, month, year, percentage, classId);
    }
    
    const classItem = await Class.findById(classId);
    if (classItem && classItem.classTeacherId) {
      broadcastToUser(classItem.classTeacherId, 'attendance:updated', {
        studentId,
        studentName: student?.fullName,
        month,
        year,
        attendancePercentage: percentage,
        classId
      });
    }

    res.status(201).json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.bulkCreateAttendance = async (req, res) => {
  try {
    const { attendanceList } = req.body;
    
    const firstItem = attendanceList[0];
    const template = await AttendanceTemplate.findOne({
      $or: [{ classId: firstItem.classId }, { classId: null }],
      year: firstItem.year,
      month: firstItem.month,
      isActive: true
    });
    
    const workingDays = template?.totalWorkingDays || 25;
    
    const results = {
      success: [],
      failed: [],
      warnings: []
    };

    for (const attendanceData of attendanceList) {
      try {
        let attendance = await Attendance.findOne({
          studentId: attendanceData.studentId,
          year: attendanceData.year,
          month: attendanceData.month
        });

        // IMPORTANT FIX: Use the values directly from attendanceData
        // Don't recalculate using fallback logic that might change 0 to workingDays
        let presentDays = attendanceData.presentDays;
        let absentDays = attendanceData.absentDays;
        
        // Validate that absentDays + presentDays equals workingDays
        // If not, calculate based on which one is provided
        if (absentDays !== undefined && presentDays === undefined) {
          presentDays = workingDays - absentDays;
        } else if (presentDays !== undefined && absentDays === undefined) {
          absentDays = workingDays - presentDays;
        } else if (absentDays !== undefined && presentDays !== undefined) {
          // Both provided, use them as is
          // Just ensure they're valid
          presentDays = Math.min(Math.max(presentDays, 0), workingDays);
          absentDays = workingDays - presentDays;
        } else {
          // Neither provided - default to all absent
          absentDays = workingDays;
          presentDays = 0;
        }
        
        // Ensure values are within valid range
        absentDays = Math.min(Math.max(absentDays, 0), workingDays);
        presentDays = workingDays - absentDays;
        
        const percentage = workingDays > 0 ? (presentDays / workingDays) * 100 : 0;

        if (attendance) {
          // Update existing - preserve the values we calculated
          attendance.presentDays = presentDays;
          attendance.absentDays = absentDays;
          attendance.totalWorkingDays = workingDays;
          attendance.percentage = percentage;
          if (template?.holidays) attendance.holidays = template.holidays;
          if (template?._id) attendance.templateId = template._id;
          await attendance.save();
          results.success.push(attendance);
        } else {
          // Create new
          attendance = await Attendance.create({
            studentId: attendanceData.studentId,
            studentName: attendanceData.studentName,
            classId: attendanceData.classId,
            academicYearId: attendanceData.academicYearId,
            year: attendanceData.year,
            month: attendanceData.month,
            totalWorkingDays: workingDays,
            presentDays: presentDays,
            absentDays: absentDays,
            percentage: percentage,
            holidays: template?.holidays || [],
            templateId: template?._id
          });
          results.success.push(attendance);
        }
        
        if (percentage < 75 && percentage > 0) {
          const student = await Student.findById(attendance.studentId);
          if (student) {
            await sendAttendanceWarning(student, attendance.month, attendance.year, percentage, attendance.classId);
            results.warnings.push({
              studentId: student._id,
              studentName: student.fullName,
              percentage: percentage
            });
          }
        }
        
      } catch (error) {
        console.error('Error processing attendance:', error);
        results.failed.push({
          data: attendanceData,
          error: error.message
        });
      }
    }

    if (results.success.length > 0) {
      const classId = attendanceList[0]?.classId;
      if (classId) {
        broadcastToClass(classId, 'attendance:bulk-updated', {
          total: results.success.length,
          warnings: results.warnings.length,
          timestamp: new Date()
        });
      }
    }

    res.json({
      message: `Saved ${results.success.length} attendance records, ${results.failed.length} failed, ${results.warnings.length} warnings sent`,
      results
    });
  } catch (error) {
    console.error('Error in bulkCreateAttendance:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const { presentDays, absentDays, totalWorkingDays } = req.body;
    
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }
    
    const workingDays = totalWorkingDays || attendance.totalWorkingDays || 25;
    const finalPresentDays = presentDays !== undefined ? presentDays : (workingDays - (absentDays || attendance.absentDays));
    const finalAbsentDays = absentDays !== undefined ? absentDays : (workingDays - finalPresentDays);
    const percentage = workingDays > 0 ? (finalPresentDays / workingDays) * 100 : 0;
    
    attendance.presentDays = finalPresentDays;
    attendance.absentDays = finalAbsentDays;
    attendance.totalWorkingDays = workingDays;
    attendance.percentage = percentage;
    
    await attendance.save();

    if (percentage < 75 && percentage > 0) {
      const student = await Student.findById(attendance.studentId);
      if (student) {
        await sendAttendanceWarning(student, attendance.month, attendance.year, percentage, attendance.classId);
      }
    }

    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndDelete(req.params.id);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }
    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAttendanceSummary = async (req, res) => {
  try {
    const { classId, year, month } = req.query;

    // Get all students in the class FIRST
    const allStudents = await Student.find({ classId, status: 'active' })
      .select('_id fullName rollNumber admissionNo')
      .sort({ rollNumber: 1, fullName: 1 });

    if (!allStudents || allStudents.length === 0) {
      return res.json({
        totalStudents: 0,
        goodStanding: 0,
        needsAttention: 0,
        averageAttendance: "0",
        workingDays: 0,
        holidaysCount: 0,
        holidays: [],
        monthlySummary: {},
        studentDetails: [],
        template: null,
        message: 'No students found in this class'
      });
    }

    // Get template for this class and month
    const template = await AttendanceTemplate.findOne({
      $or: [
        { classId: classId },
        { classId: null }
      ],
      year: parseInt(year),
      month: parseInt(month),
      isActive: true
    });

    const workingDays = template?.totalWorkingDays || 25;
    const holidays = template?.holidays || [];

    // Get attendance records for the month
    const attendanceRecords = await Attendance.find({
      classId,
      year: parseInt(year),
      month: parseInt(month)
    });
    
    // Create a map of existing attendance records
    const attendanceMap = new Map();
    attendanceRecords.forEach(record => {
      attendanceMap.set(record.studentId.toString(), record);
    });
    
    const studentDetails = [];
    let totalPresent = 0;
    let totalStudents = 0;
    let goodStanding = 0;
    let needsAttention = 0;
    let totalPossibleDays = 0;

    for (const student of allStudents) {
      const record = attendanceMap.get(student._id.toString());
      
      let presentDays = 0;
      let absentDays = 0;
      let percentage = 0;
      
      if (record) {
        presentDays = record.presentDays || 0;
        absentDays = record.absentDays || 0;
        percentage = workingDays > 0 ? (presentDays / workingDays) * 100 : 0;
      } else {
        absentDays = workingDays;
        presentDays = 0;
        percentage = 0;
      }
      
      totalPresent += presentDays;
      totalPossibleDays += workingDays;
      totalStudents++;
      
      if (percentage >= 75) goodStanding++;
      if (percentage < 60 && percentage > 0) needsAttention++;
      
      const statusText = percentage >= 75 ? 'Good' : (percentage >= 60 ? 'Average' : (percentage > 0 ? 'Poor' : 'Not Recorded'));
      
      studentDetails.push({
        studentId: student._id,
        studentName: student.fullName,
        rollNumber: student.rollNumber,
        admissionNo: student.admissionNo,
        presentDays: presentDays,
        absentDays: absentDays,
        workingDays: workingDays,
        holidaysCount: holidays.length,
        holidayList: holidays,
        percentage: percentage,
        status: statusText
      });
    }

    const averageAttendance = totalPossibleDays > 0 ? (totalPresent / totalPossibleDays) * 100 : 0;

    // Calculate monthly summary
    const monthlySummary = {};
    for (let m = 1; m <= 12; m++) {
      const monthRecords = attendanceRecords.filter(a => a.month === m);
      if (monthRecords.length > 0) {
        const monthPresent = monthRecords.reduce((sum, a) => sum + (a.presentDays || 0), 0);
        const monthPossible = monthRecords.length * workingDays;
        monthlySummary[m] = {
          totalPresent: monthPresent,
          totalDays: monthPossible,
          averagePercentage: monthPossible > 0 ? (monthPresent / monthPossible) * 100 : 0,
          totalStudents: monthRecords.length
        };
      }
    }

    res.json({
      totalStudents,
      goodStanding,
      needsAttention,
      averageAttendance: averageAttendance.toFixed(1),
      workingDays: workingDays,
      holidaysCount: holidays.length,
      holidays: holidays,
      monthlySummary,
      studentDetails,
      template: template || null
    });
  } catch (error) {
    console.error('Error in getAttendanceSummary:', error);
    res.status(500).json({ message: error.message });
  }
};