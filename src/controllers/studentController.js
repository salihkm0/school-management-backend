// controllers/studentController.js
const Student = require('../models/Student');
const Class = require('../models/Class');
const AcademicYear = require('../models/AcademicYear');
const User = require('../models/User');
const Mark = require('../models/Mark');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const SamboornaImportService = require('../services/samboornaImportService');
const { broadcastToClass, broadcastToUser, broadcastToRole } = require('../config/socket');
const { parseCSV, parseExcel } = require('../services/excelService');
const { sortStudents } = require('../utils/studentSorter');
const path = require('path');
const fs = require('fs');

async function sendStudentNotification(student, title, message, type, data) {
  for (const parentId of student.parentIds) {
    const notification = await Notification.create({
      userId: parentId,
      title,
      message,
      type,
      data: { ...data, studentId: student._id, studentName: student.fullName }
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
  }
}

exports.getStudents = async (req, res) => {
  try {
    const { classId, academicYearId, status, page = 1, limit = 20, search } = req.query;
    
    const query = { isActive: true };
    if (classId) query.classId = classId;
    if (academicYearId) query.academicYearId = academicYearId;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { studentCode: { $regex: search, $options: 'i' } },
        { admissionNo: { $regex: search, $options: 'i' } }
      ];
    }

    let studentsQuery = Student.find(query)
      .populate('classId', 'name section displayName studentSortPreference')
      .populate('academicYearId', 'year name')
      .populate('parentIds', 'fullName email phone');

    if (classId) {
      const classObj = await Class.findById(classId);
      const sortPreference = classObj?.studentSortPreference || 'alphabetic';
      const allStudentsInClass = await studentsQuery;
      const sortedStudents = sortStudents(allStudentsInClass, sortPreference);
      
      const total = sortedStudents.length;
      const paginatedStudents = sortedStudents.slice((page - 1) * limit, page * limit);

      return res.json({
        data: paginatedStudents,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      });
    }

    const totalCount = await Student.countDocuments(query);
    const students = await studentsQuery
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ className: 1, division: 1, fullName: 1 });

    res.json({
      success: true,
      data: students,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('classId', 'name section displayName classTeacherName')
      .populate('academicYearId', 'year name')
      .populate('parentIds', 'fullName email phone')
      .populate('firstLanguagePaper1', 'name code department')
      .populate('firstLanguagePaper2', 'name code department')
      .populate('thirdLanguage', 'name code department')
      .populate('additionalLanguage', 'name code department');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json(student);
  } catch (error) {
    console.error('Error in getStudent:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.createStudent = async (req, res) => {
  try {
    const studentData = { ...req.body };
    
    if (studentData.classId) {
      const classInfo = await Class.findById(studentData.classId);
      if (classInfo) {
        studentData.academicYearId = classInfo.academicYearId;
        studentData.className = classInfo.name;
        studentData.division = classInfo.section;
      }
    }

    const student = await Student.create(studentData);

    if (student.classId) {
      await Class.findByIdAndUpdate(student.classId, {
        $inc: { studentCount: 1 }
      });
    }

    broadcastToClass(student.classId, 'student:added', {
      studentId: student._id,
      studentName: student.fullName,
      className: student.className,
      timestamp: new Date()
    });

    broadcastToRole('admin', 'student:added', {
      studentId: student._id,
      studentName: student.fullName,
      classId: student.classId,
      timestamp: new Date()
    });

    res.status(201).json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const oldStudent = await Student.findById(req.params.id);
    if (!oldStudent) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const student = await Student.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (oldStudent.classId?.toString() !== student.classId?.toString()) {
      if (oldStudent.classId) {
        await Class.findByIdAndUpdate(oldStudent.classId, {
          $inc: { studentCount: -1 }
        });
        broadcastToClass(oldStudent.classId, 'student:removed', {
          studentId: student._id,
          studentName: student.fullName
        });
      }
      
      if (student.classId) {
        const newClass = await Class.findById(student.classId);
        student.academicYearId = newClass.academicYearId;
        student.className = newClass.name;
        student.division = newClass.section;
        await student.save();
        
        await Class.findByIdAndUpdate(student.classId, {
          $inc: { studentCount: 1 }
        });
        
        broadcastToClass(student.classId, 'student:added', {
          studentId: student._id,
          studentName: student.fullName
        });
      }
    }

    student.parentIds?.forEach(parentId => {
      broadcastToUser(parentId, 'student:updated', {
        studentId: student._id,
        studentName: student.fullName,
        classId: student.classId,
        changes: req.body
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
    student.isActive = false;
    await student.save();

    if (student.classId) {
      await Class.findByIdAndUpdate(student.classId, {
        $inc: { studentCount: -1 }
      });
    }

    broadcastToClass(student.classId, 'student:removed', {
      studentId: student._id,
      studentName: student.fullName
    });

    await sendStudentNotification(
      student,
      'Student Status Updated',
      `${student.fullName} has been discontinued from the school.`,
      'warning',
      { status: 'discontinued' }
    );

    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// In studentController.js - update the importStudentsFromSamboorna function

exports.importStudentsFromSamboorna = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { academicYearId } = req.body;
    if (!academicYearId) {
      return res.status(400).json({ message: 'Academic year ID is required' });
    }

    const academicYear = await AcademicYear.findById(academicYearId);
    if (!academicYear) {
      return res.status(404).json({ message: 'Academic year not found' });
    }

    const importService = new SamboornaImportService(
      academicYearId,
      req.user._id,
      {
        autoCreateClasses: req.body.autoCreateClasses !== false,
        updateExistingStudents: req.body.updateExistingStudents !== false,
        batchSize: parseInt(req.body.batchSize) || 100
      }
    );

    // Use importFile instead of importFromCSV
    const result = await importService.importFile(
      req.file.path,
      req.file.originalname
    );

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    broadcastToRole('admin', 'students:imported', {
      batchId: result.batchId,
      total: result.statistics.successfulInserts,
      updated: result.statistics.updatedRecords,
      failed: result.statistics.failedRecords,
      classesCreated: result.statistics.classesCreated,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: `Imported ${result.statistics.successfulInserts} students, updated ${result.statistics.updatedRecords}, failed ${result.statistics.failedRecords}`,
      data: result
    });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: error.message });
  }
};

exports.importStudents = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { academicYearId, classId } = req.body;

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
        let targetClassId = classId;
        let targetAcademicYearId = academicYearId;

        if (!targetClassId && data.className) {
          const classModel = await Class.findOne({ 
            name: data.className,
            academicYearId: targetAcademicYearId 
          });
          if (classModel) {
            targetClassId = classModel._id;
          }
        }

        if (!targetClassId) {
          results.failed.push({ data, error: 'Class not found' });
          continue;
        }

        const classInfo = await Class.findById(targetClassId);
        
        const student = await Student.create({
          ...data,
          classId: targetClassId,
          academicYearId: classInfo.academicYearId,
          className: classInfo.name,
          division: classInfo.section,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
          admissionDate: data.admissionDate ? new Date(data.admissionDate) : new Date(),
          status: 'active'
        });

        await Class.findByIdAndUpdate(targetClassId, {
          $inc: { studentCount: 1 }
        });

        results.success.push(student);
      } catch (error) {
        results.failed.push({ data, error: error.message });
      }
    }

    fs.unlinkSync(filePath);

    broadcastToRole('admin', 'students:imported', {
      total: results.success.length,
      failed: results.failed.length,
      timestamp: new Date()
    });

    res.json({
      message: `Imported ${results.success.length} students, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: error.message });
  }
};

exports.getImportBatchStatus = async (req, res) => {
  try {
    const ImportBatch = require('../models/ImportBatch');
    const batch = await ImportBatch.findById(req.params.batchId)
      .populate('importedBy', 'name email')
      .populate('academicYearId', 'year name');
    
    if (!batch) {
      return res.status(404).json({ message: 'Import batch not found' });
    }

    res.json(batch);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getImportHistory = async (req, res) => {
  try {
    const ImportBatch = require('../models/ImportBatch');
    const { academicYearId, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (academicYearId) query.academicYearId = academicYearId;

    const batches = await ImportBatch.find(query)
      .populate('importedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await ImportBatch.countDocuments(query);

    res.json({
      success: true,
      data: batches,
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

exports.promoteStudents = async (req, res) => {
  try {
    const { fromClassId, toClassId, studentStatuses, newAcademicYearId } = req.body;
    
    const fromClass = await Class.findById(fromClassId);
    const toClass = await Class.findById(toClassId);

    if (!fromClass || !toClass) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const targetAcademicYearId = newAcademicYearId || toClass.academicYearId;
    const students = await Student.find({ classId: fromClassId, status: 'active' });
    const results = [];

    for (const student of students) {
      const status = studentStatuses[student._id] || 'active';
      let newClassId = fromClassId;
      let newStatus = status;
      let newAcademicYear = student.academicYearId;

      switch (status) {
        case 'passed':
          newClassId = toClassId;
          newStatus = 'active';
          newAcademicYear = targetAcademicYearId;
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
      student.academicYearId = newAcademicYear;
      
      const newClass = await Class.findById(newClassId);
      student.className = newClass.name;
      student.division = newClass.section;
      
      await student.save();

      results.push({
        studentId: student._id,
        studentName: student.fullName,
        fromClass: fromClassId,
        toClass: newClassId,
        status: newStatus
      });

      await sendStudentNotification(
        student,
        'Student Promotion Update',
        `${student.fullName} has been ${status === 'passed' ? 'promoted' : status === 'completed' ? 'completed the academic year' : status}`,
        status === 'passed' ? 'success' : 'info',
        { fromClass: fromClass.name, toClass: toClass.name, status: newStatus }
      );
    }

    await Class.findByIdAndUpdate(fromClassId, {
      $inc: { studentCount: -students.length }
    });
    
    const promotedCount = results.filter(r => r.toClass === toClassId).length;
    await Class.findByIdAndUpdate(toClassId, {
      $inc: { studentCount: promotedCount }
    });

    broadcastToClass(fromClassId, 'students:promoted', {
      promotedCount,
      results: results.slice(0, 10)
    });

    broadcastToRole('admin', 'students:promoted', {
      fromClass: fromClass.name,
      toClass: toClass.name,
      totalStudents: students.length,
      promotedCount,
      timestamp: new Date()
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
    const classId = req.params.classId;
    const classObj = await Class.findById(classId);
    const sortPreference = classObj?.studentSortPreference || 'alphabetic';

    const students = await Student.find({ 
      classId,
      isActive: true 
    })
      .select('fullName studentCode admissionNo rollNumber status gender photoUrl');

    const sortedStudents = sortStudents(students, sortPreference);

    res.json(sortedStudents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getStudentMarks = async (req, res) => {
  try {
    const marks = await Mark.find({ studentId: req.params.id })
      .populate('examId', 'name term academicYear')
      .sort({ createdAt: -1 });

    // Flatten the marks to extract individual subject entries
    const flattenedMarks = [];
    
    marks.forEach(markDocument => {
      // Check if marks are stored in subjects array (new structure)
      if (markDocument.subjects && Array.isArray(markDocument.subjects)) {
        markDocument.subjects.forEach(subject => {
          flattenedMarks.push({
            _id: markDocument._id,
            examId: markDocument.examId,
            examName: markDocument.examName,
            examType: markDocument.examType,
            term: markDocument.term,
            classId: markDocument.classId,
            className: markDocument.className,
            academicYearId: markDocument.academicYearId,
            academicYear: markDocument.academicYear,
            studentId: markDocument.studentId,
            studentName: markDocument.studentName,
            studentCode: markDocument.studentCode,
            admissionNo: markDocument.admissionNo,
            subjectId: subject.subjectId,
            subjectName: subject.subjectName,
            subjectCode: subject.subjectCode,
            theoryScore: subject.theoryScore || 0,
            practicalScore: subject.practicalScore || 0,
            totalScore: subject.totalScore || 0,
            maxMarks: subject.maxMarks || 0,
            passingMarks: subject.passingMarks || 0,
            percentage: subject.percentage || 0,
            grade: subject.grade || 'F',
            remarks: subject.remarks || '',
            isAbsent: subject.isAbsent || false,
            status: markDocument.status,
            isFinalized: markDocument.isFinalized,
            enteredAt: markDocument.enteredAt,
            lastUpdatedAt: markDocument.lastUpdatedAt,
            createdAt: markDocument.createdAt,
            updatedAt: markDocument.updatedAt
          });
        });
      } else {
        // Legacy structure - single subject per document
        flattenedMarks.push({
          ...markDocument.toObject(),
          theoryScore: markDocument.theoryScore || 0,
          practicalScore: markDocument.practicalScore || 0,
          totalScore: markDocument.totalScore || markDocument.totalMarks || 0,
          maxMarks: markDocument.maxMarks || 0
        });
      }
    });

    // Calculate analytics from flattened marks
    const analytics = {
      subjectWise: {},
      termWise: {},
      examWise: {},
      overall: {
        totalMarks: 0,
        totalMaxMarks: 0,
        averagePercentage: 0,
        totalSubjects: 0,
        examsCount: new Set()
      }
    };

    flattenedMarks.forEach(mark => {
      const subjectName = mark.subjectName || 'Unknown Subject';
      const examId = mark.examId?._id?.toString() || mark.examId?.toString();
      const term = mark.term || 'unknown';
      
      // Subject-wise analytics
      if (!analytics.subjectWise[subjectName]) {
        analytics.subjectWise[subjectName] = {
          totalMarks: 0,
          totalMaxMarks: 0,
          count: 0,
          averagePercentage: 0
        };
      }
      analytics.subjectWise[subjectName].totalMarks += mark.totalScore || 0;
      analytics.subjectWise[subjectName].totalMaxMarks += mark.maxMarks || 0;
      analytics.subjectWise[subjectName].count++;
      
      // Term-wise analytics
      if (!analytics.termWise[term]) {
        analytics.termWise[term] = {
          totalMarks: 0,
          totalMaxMarks: 0,
          count: 0,
          averagePercentage: 0
        };
      }
      analytics.termWise[term].totalMarks += mark.totalScore || 0;
      analytics.termWise[term].totalMaxMarks += mark.maxMarks || 0;
      analytics.termWise[term].count++;
      
      // Exam-wise analytics
      if (examId && mark.examId) {
        const examName = mark.examName || mark.examId?.name || 'Unknown Exam';
        if (!analytics.examWise[examId]) {
          analytics.examWise[examId] = {
            examName: examName,
            examType: mark.examType || mark.examId?.examType,
            term: term,
            totalMarks: 0,
            totalMaxMarks: 0,
            count: 0,
            subjects: []
          };
        }
        analytics.examWise[examId].totalMarks += mark.totalScore || 0;
        analytics.examWise[examId].totalMaxMarks += mark.maxMarks || 0;
        analytics.examWise[examId].count++;
        analytics.examWise[examId].subjects.push({
          subjectName: subjectName,
          theoryScore: mark.theoryScore || 0,
          practicalScore: mark.practicalScore || 0,
          totalScore: mark.totalScore || 0,
          maxMarks: mark.maxMarks || 0,
          percentage: mark.percentage || ((mark.totalScore / mark.maxMarks) * 100),
          grade: mark.grade
        });
      }
      
      // Overall analytics
      analytics.overall.totalMarks += mark.totalScore || 0;
      analytics.overall.totalMaxMarks += mark.maxMarks || 0;
      analytics.overall.totalSubjects++;
      if (examId) analytics.overall.examsCount.add(examId);
    });

    // Calculate percentages
    if (analytics.overall.totalMaxMarks > 0) {
      analytics.overall.averagePercentage = 
        (analytics.overall.totalMarks / analytics.overall.totalMaxMarks) * 100;
    }
    analytics.overall.examsCount = analytics.overall.examsCount.size;

    Object.keys(analytics.subjectWise).forEach(subject => {
      const subj = analytics.subjectWise[subject];
      if (subj.totalMaxMarks > 0) {
        subj.averagePercentage = (subj.totalMarks / subj.totalMaxMarks) * 100;
      }
    });

    Object.keys(analytics.termWise).forEach(term => {
      const termData = analytics.termWise[term];
      if (termData.totalMaxMarks > 0) {
        termData.averagePercentage = (termData.totalMarks / termData.totalMaxMarks) * 100;
      }
    });

    res.json({
      success: true,
      marks: flattenedMarks,
      analytics,
      summary: {
        totalExams: analytics.overall.examsCount,
        totalSubjects: analytics.overall.totalSubjects,
        overallPercentage: analytics.overall.averagePercentage.toFixed(2),
        totalMarksObtained: analytics.overall.totalMarks,
        totalMaxMarks: analytics.overall.totalMaxMarks
      }
    });
  } catch (error) {
    console.error('Error in getStudentMarks:', error);
    res.status(500).json({ message: error.message });
  }
};


exports.getStudentAcademicInfo = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate('firstLanguagePaper1', 'name code')
      .populate('firstLanguagePaper2', 'name code')
      .populate('thirdLanguage', 'name code')
      .populate('additionalLanguage', 'name code')
      .populate('classId', 'name section displayName');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json({
      success: true,
      data: {
        admissionNo: student.admissionNo,
        admissionDate: student.admissionDate,
        className: student.className,
        division: student.division,
        rollNumber: student.rollNumber,
        status: student.status,
        firstLanguagePaper1: student.firstLanguagePaper1 || null,
        firstLanguagePaper2: student.firstLanguagePaper2 || null,
        thirdLanguage: student.thirdLanguage || null,
        additionalLanguage: student.additionalLanguage || null,
        classDetails: student.classId
      }
    });
  } catch (error) {
    console.error('Error in getStudentAcademicInfo:', error);
    res.status(500).json({ message: error.message });
  }
};

// Export ALL students as CSV (no pagination)
exports.exportStudents = async (req, res) => {
  try {
    const { classId, academicYearId, status, search, format = 'csv' } = req.query;

    const query = { isActive: true };
    if (classId) query.classId = classId;
    if (academicYearId) query.academicYearId = academicYearId;
    if (status && status !== 'all') query.status = status;
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { studentCode: { $regex: search, $options: 'i' } },
        { admissionNo: { $regex: search, $options: 'i' } }
      ];
    }

    const students = await Student.find(query)
      .populate('classId', 'name section displayName')
      .populate('academicYearId', 'year name')
      .sort({ 'classId.name': 1, rollNumber: 1, fullName: 1 })
      .lean();

    const headers = [
      'SL No', 'Admission No', 'Student Name', 'Class', 'Division',
      'Roll No', 'Gender', 'Date of Birth', 'Religion', 'Caste',
      'Primary Phone', 'Father Name', 'Mother Name', 'Status'
    ];

    const rows = students.map((s, i) => [
      i + 1,
      s.admissionNo || '',
      s.fullName || '',
      s.classId ? (s.classId.name || '') : '',
      s.classId ? (s.classId.section || '') : '',
      s.rollNumber || '',
      s.gender === 'M' ? 'Male' : s.gender === 'F' ? 'Female' : (s.gender || ''),
      s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('en-IN') : '',
      s.religion || '',
      s.caste || '',
      s.contact?.primaryPhone || '',
      s.fatherName || '',
      s.motherName || '',
      s.status || 'active'
    ]);

    const xlsx = require('xlsx');
    const ws = xlsx.utils.aoa_to_sheet([headers, ...rows]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Students");

    const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const className = students[0]?.classId?.name || 'All';
    const filename = `Students_${className}_${Date.now()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error in exportStudents:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.bulkUpdateRollNumbers = async (req, res) => {
  try {
    const { updates } = req.body; // Expecting array of { studentId, rollNumber }
    if (!Array.isArray(updates)) {
      return res.status(400).json({ message: "Invalid updates format. Expected an array." });
    }

    const bulkOps = updates.map((update) => ({
      updateOne: {
        filter: { _id: update.studentId },
        update: { $set: { rollNumber: update.rollNumber || '' } }
      }
    }));

    if (bulkOps.length > 0) {
      await Student.bulkWrite(bulkOps);
    }

    res.json({ message: "Roll numbers updated successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};