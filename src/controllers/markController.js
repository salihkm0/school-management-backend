const Mark = require('../models/Mark');
const Exam = require('../models/Exam');
const Student = require('../models/Student');
const { broadcastToUser } = require('../config/socket');

exports.getMarks = async (req, res) => {
  try {
    const { examId, classId, subjectId, studentId, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (examId) query.examId = examId;
    if (subjectId) query.subjectId = subjectId;
    if (studentId) query.studentId = studentId;
    
    if (classId) {
      const students = await Student.find({ classId }).select('_id');
      query.studentId = { $in: students.map(s => s._id) };
    }

    const marks = await Mark.find(query)
      .populate('studentId', 'name admissionNumber rollNumber')
      .populate('examId', 'name term academicYear')
      .populate('subjectId', 'name code')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Mark.countDocuments(query);

    res.json({
      success: true,
      data: marks,
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

exports.enterMarks = async (req, res) => {
  try {
    const { marks } = req.body;
    
    const results = {
      success: [],
      failed: []
    };

    for (const markData of marks) {
      try {
        const existingMark = await Mark.findOne({
          studentId: markData.studentId,
          examId: markData.examId,
          subjectId: markData.subjectId
        });

        let mark;
        if (existingMark) {
          mark = await Mark.findByIdAndUpdate(
            existingMark._id,
            {
              ...markData,
              updatedBy: req.user.id,
              isEditable: false
            },
            { new: true }
          );
        } else {
          mark = await Mark.create({
            ...markData,
            enteredBy: req.user.id
          });
        }

        results.success.push(mark);

        const student = await Student.findById(markData.studentId);
        if (student && student.parentIds) {
          student.parentIds.forEach(parentId => {
            broadcastToUser(parentId, 'marks:entered', {
              studentId: student._id,
              studentName: student.name,
              examId: mark.examId,
              examName: mark.examName,
              subjectId: mark.subjectId,
              subjectName: mark.subjectName,
              marksObtained: mark.totalMarks,
              maxMarks: mark.maxMarks,
              percentage: mark.percentage,
              grade: mark.grade
            });
          });
        }
      } catch (error) {
        results.failed.push({
          data: markData,
          error: error.message
        });
      }
    }

    res.json({
      message: `Entered ${results.success.length} marks, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateMarks = async (req, res) => {
  try {
    const mark = await Mark.findById(req.params.id);
    
    if (!mark) {
      return res.status(404).json({ message: 'Mark not found' });
    }

    if (!mark.isEditable && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Marks cannot be edited' });
    }

    const updatedMark = await Mark.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        updatedBy: req.user.id
      },
      { new: true, runValidators: true }
    );

    res.json(updatedMark);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getExamRankings = async (req, res) => {
  try {
    const { classId } = req.query;

    const query = { examId: req.params.examId };
    if (classId) {
      const students = await Student.find({ classId }).select('_id');
      query.studentId = { $in: students.map(s => s._id) };
    }

    const marks = await Mark.find(query);
    
    const studentTotals = {};
    marks.forEach(mark => {
      if (!studentTotals[mark.studentId]) {
        studentTotals[mark.studentId] = {
          studentId: mark.studentId,
          studentName: mark.studentName,
          totalMarks: 0,
          maxMarks: 0,
          subjects: [],
          percentage: 0
        };
      }
      studentTotals[mark.studentId].totalMarks += mark.totalMarks;
      studentTotals[mark.studentId].maxMarks += mark.maxMarks;
      studentTotals[mark.studentId].subjects.push({
        subjectId: mark.subjectId,
        subjectName: mark.subjectName,
        marksObtained: mark.totalMarks,
        maxMarks: mark.maxMarks,
        percentage: mark.percentage,
        grade: mark.grade
      });
    });

    const rankings = Object.values(studentTotals).map(student => ({
      ...student,
      percentage: (student.totalMarks / student.maxMarks) * 100
    }));

    rankings.sort((a, b) => b.percentage - a.percentage);

    const result = rankings.map((student, index) => ({
      ...student,
      rank: index + 1
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.filterStudentsByMarks = async (req, res) => {
  try {
    const { examId, subjectId, minPercentage, maxPercentage, classId, grade } = req.body;
    
    const query = { examId };
    if (subjectId) query.subjectId = subjectId;
    
    let marks = await Mark.find(query);
    
    if (minPercentage !== undefined || maxPercentage !== undefined) {
      marks = marks.filter(mark => {
        const percentage = (mark.totalMarks / mark.maxMarks) * 100;
        if (minPercentage !== undefined && percentage < minPercentage) return false;
        if (maxPercentage !== undefined && percentage > maxPercentage) return false;
        return true;
      });
    }
    
    if (grade) {
      marks = marks.filter(mark => mark.grade === grade);
    }
    
    const studentIds = [...new Set(marks.map(m => m.studentId))];
    
    let students = await Student.find({ _id: { $in: studentIds } });
    if (classId) {
      students = students.filter(s => s.classId.toString() === classId);
    }
    
    res.json({
      count: students.length,
      students: students.map(s => ({
        id: s._id,
        name: s.name,
        admissionNumber: s.admissionNumber,
        classId: s.classId,
        marks: marks.filter(m => m.studentId.toString() === s._id.toString())
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};