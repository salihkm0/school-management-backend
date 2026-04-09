const Student = require('../models/Student');
const Class = require('../models/Class');
const User = require('../models/User');
const Mark = require('../models/Mark');
const Attendance = require('../models/Attendance');
const { broadcastToClass, broadcastToUser } = require('../config/socket');
const { parseCSV, parseExcel } = require('../services/excelService');
const path = require('path');
const fs = require('fs');

exports.getStudents = async (req, res) => {
  try {
    const { classId, status, page = 1, limit = 20, search } = req.query;
    
    const query = {};
    if (classId) query.classId = classId;
    if (status) query.status = status;
    if (search) {
      query.$text = { $search: search };
    }

    const students = await Student.find(query)
      .populate('classId', 'name section')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Student.countDocuments(query);

    res.json({
      success: true,
      data: students,
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

exports.getStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('classId', 'name section classTeacherName')
      .populate('parentIds', 'name email phone');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createStudent = async (req, res) => {
  try {
    const student = await Student.create(req.body);

    await Class.findByIdAndUpdate(student.classId, {
      $inc: { studentCount: 1 }
    });

    broadcastToClass(student.classId, 'student:added', {
      studentId: student._id,
      studentName: student.name,
      className: student.classId
    });

    res.status(201).json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const oldStudent = await Student.findById(req.params.id);
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (oldStudent.classId.toString() !== student.classId.toString()) {
      await Class.findByIdAndUpdate(oldStudent.classId, {
        $inc: { studentCount: -1 }
      });
      await Class.findByIdAndUpdate(student.classId, {
        $inc: { studentCount: 1 }
      });
    }

    student.parentIds.forEach(parentId => {
      broadcastToUser(parentId, 'student:updated', {
        studentId: student._id,
        studentName: student.name,
        classId: student.classId
      });
    });

    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    student.status = 'discontinued';
    await student.save();

    await Class.findByIdAndUpdate(student.classId, {
      $inc: { studentCount: -1 }
    });

    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.importStudents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    
    let studentsData;
    if (fileExt === '.csv') {
      studentsData = await parseCSV(filePath);
    } else if (['.xlsx', '.xls'].includes(fileExt)) {
      studentsData = await parseExcel(filePath);
    } else {
      return res.status(400).json({ message: 'Invalid file format' });
    }

    const results = {
      success: [],
      failed: []
    };

    for (const data of studentsData) {
      try {
        const classModel = await Class.findOne({ name: data.className });
        if (!classModel) {
          results.failed.push({ data, error: 'Class not found' });
          continue;
        }

        const student = await Student.create({
          ...data,
          classId: classModel._id,
          dateOfBirth: new Date(data.dateOfBirth),
          dateOfAdmission: new Date(data.dateOfAdmission || Date.now())
        });

        await Class.findByIdAndUpdate(classModel._id, {
          $inc: { studentCount: 1 }
        });

        results.success.push(student);
      } catch (error) {
        results.failed.push({ data, error: error.message });
      }
    }

    fs.unlinkSync(filePath);

    res.json({
      message: `Imported ${results.success.length} students, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.promoteStudents = async (req, res) => {
  try {
    const { fromClassId, toClassId, studentStatuses } = req.body;
    
    const fromClass = await Class.findById(fromClassId);
    const toClass = await Class.findById(toClassId);

    if (!fromClass || !toClass) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const students = await Student.find({ classId: fromClassId });
    const results = [];

    for (const student of students) {
      const status = studentStatuses[student._id] || 'active';
      let newClassId = fromClassId;
      let newStatus = status;

      switch (status) {
        case 'passed':
          newClassId = toClassId;
          newStatus = 'active';
          break;
        case 'failed':
          newClassId = fromClassId;
          newStatus = 'active';
          break;
        case 'completed':
          newStatus = 'completed';
          break;
        case 'discontinued':
          newStatus = 'discontinued';
          break;
        case 'transferred':
          newStatus = 'transferred';
          break;
      }

      student.classId = newClassId;
      student.status = newStatus;
      await student.save();

      results.push({
        studentId: student._id,
        studentName: student.name,
        fromClass: fromClassId,
        toClass: newClassId,
        status: newStatus
      });

      student.parentIds.forEach(parentId => {
        broadcastToUser(parentId, 'student:promoted', {
          studentId: student._id,
          studentName: student.name,
          fromClass: fromClass.name,
          toClass: newStatus === 'completed' ? 'Completed' : toClass.name,
          status: newStatus
        });
      });
    }

    await Class.findByIdAndUpdate(fromClassId, {
      $inc: { studentCount: -students.length }
    });
    
    const promotedCount = results.filter(r => r.toClass === toClassId).length;
    await Class.findByIdAndUpdate(toClassId, {
      $inc: { studentCount: promotedCount }
    });

    res.json({
      message: `${students.length} students processed`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getStudentsByClass = async (req, res) => {
  try {
    const students = await Student.find({ classId: req.params.classId })
      .select('name admissionNumber rollNumber status photoUrl');

    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getStudentMarks = async (req, res) => {
  try {
    const marks = await Mark.find({ studentId: req.params.id })
      .populate('examId', 'name term academicYear')
      .sort({ 'examId.startDate': -1 });

    const analytics = {
      subjectWise: {},
      termWise: {},
      overall: {
        totalMarks: 0,
        totalMaxMarks: 0,
        averagePercentage: 0
      }
    };

    marks.forEach(mark => {
      if (!analytics.subjectWise[mark.subjectName]) {
        analytics.subjectWise[mark.subjectName] = {
          totalMarks: 0,
          totalMaxMarks: 0,
          count: 0
        };
      }
      analytics.subjectWise[mark.subjectName].totalMarks += mark.totalMarks;
      analytics.subjectWise[mark.subjectName].totalMaxMarks += mark.maxMarks;
      analytics.subjectWise[mark.subjectName].count++;

      analytics.overall.totalMarks += mark.totalMarks;
      analytics.overall.totalMaxMarks += mark.maxMarks;
    });

    analytics.overall.averagePercentage = 
      (analytics.overall.totalMarks / analytics.overall.totalMaxMarks) * 100;

    Object.keys(analytics.subjectWise).forEach(subject => {
      analytics.subjectWise[subject].averagePercentage = 
        (analytics.subjectWise[subject].totalMarks / analytics.subjectWise[subject].totalMaxMarks) * 100;
    });

    res.json({
      marks,
      analytics
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};