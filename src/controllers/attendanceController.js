 const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Class = require('../models/Class');

exports.getAttendance = async (req, res) => {
  try {
    const { studentId, classId, year, month, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (studentId) query.studentId = studentId;
    if (classId) query.classId = classId;
    if (year) query.year = parseInt(year);
    if (month) query.month = parseInt(month);

    const attendance = await Attendance.find(query)
      .populate('studentId', 'name admissionNumber rollNumber')
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
    const { year } = req.query;

    const query = { studentId };
    if (year) query.year = parseInt(year);

    const attendance = await Attendance.find(query)
      .sort({ year: -1, month: -1 });

    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAttendanceByClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { year, month } = req.query;

    const query = { classId };
    if (year) query.year = parseInt(year);
    if (month) query.month = parseInt(month);

    const attendance = await Attendance.find(query)
      .populate('studentId', 'name admissionNumber rollNumber')
      .sort({ year: -1, month: -1 });

    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createAttendance = async (req, res) => {
  try {
    const { studentId, classId, year, month, absentDays, totalDays } = req.body;

    const existingAttendance = await Attendance.findOne({
      studentId,
      year,
      month
    });

    if (existingAttendance) {
      return res.status(400).json({ message: 'Attendance already exists for this month' });
    }

    const attendance = await Attendance.create({
      studentId,
      classId,
      year,
      month,
      absentDays,
      totalDays
    });

    res.status(201).json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.bulkCreateAttendance = async (req, res) => {
  try {
    const { attendanceList } = req.body;
    
    const results = {
      success: [],
      failed: []
    };

    for (const attendanceData of attendanceList) {
      try {
        const existingAttendance = await Attendance.findOne({
          studentId: attendanceData.studentId,
          year: attendanceData.year,
          month: attendanceData.month
        });

        let attendance;
        if (existingAttendance) {
          attendance = await Attendance.findByIdAndUpdate(
            existingAttendance._id,
            attendanceData,
            { new: true }
          );
        } else {
          attendance = await Attendance.create(attendanceData);
        }

        results.success.push(attendance);
      } catch (error) {
        results.failed.push({
          data: attendanceData,
          error: error.message
        });
      }
    }

    res.json({
      message: `Saved ${results.success.length} attendance records, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
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
    const { classId, year } = req.query;

    const query = {};
    if (classId) query.classId = classId;
    if (year) query.year = parseInt(year);

    const attendance = await Attendance.find(query);
    
    const monthlySummary = {};
    const studentSummary = {};

    for (let month = 1; month <= 12; month++) {
      const monthAttendance = attendance.filter(a => a.month === month);
      if (monthAttendance.length > 0) {
        const totalAbsent = monthAttendance.reduce((sum, a) => sum + a.absentDays, 0);
        const totalPresent = monthAttendance.reduce((sum, a) => sum + a.presentDays, 0);
        const totalDays = monthAttendance.reduce((sum, a) => sum + a.totalDays, 0);
        
        monthlySummary[month] = {
          totalAbsent,
          totalPresent,
          totalDays,
          averagePercentage: (totalPresent / totalDays) * 100,
          totalStudents: monthAttendance.length
        };
      }
    }

    const studentIds = [...new Set(attendance.map(a => a.studentId.toString()))];
    for (const studentId of studentIds) {
      const studentAttendance = attendance.filter(a => a.studentId.toString() === studentId);
      const totalPresent = studentAttendance.reduce((sum, a) => sum + a.presentDays, 0);
      const totalDays = studentAttendance.reduce((sum, a) => sum + a.totalDays, 0);
      
      studentSummary[studentId] = {
        totalPresent,
        totalDays,
        percentage: (totalPresent / totalDays) * 100
      };
    }

    res.json({
      monthlySummary,
      studentSummary,
      overallAverage: attendance.reduce((sum, a) => sum + a.percentage, 0) / attendance.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};