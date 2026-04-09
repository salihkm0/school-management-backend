const Exam = require('../models/Exam');
const Mark = require('../models/Mark');
const Student = require('../models/Student');
const { broadcastToClass, broadcastToUser } = require('../config/socket');

exports.getExams = async (req, res) => {
  try {
    const { classId, academicYear, term, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (classId) query.classIds = classId;
    if (academicYear) query.academicYear = academicYear;
    if (term) query.term = term;

    const exams = await Exam.find(query)
      .populate('classIds', 'name section')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ startDate: -1 });

    const total = await Exam.countDocuments(query);

    res.json({
      success: true,
      data: exams,
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

exports.getExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('classIds', 'name section')
      .populate('subjectConfigs.subjectId', 'name code');

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    res.json(exam);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createExam = async (req, res) => {
  try {
    const exam = await Exam.create(req.body);

    exam.classIds.forEach(classId => {
      broadcastToClass(classId, 'exam:created', {
        examId: exam._id,
        examName: exam.name,
        startDate: exam.startDate,
        endDate: exam.endDate
      });
    });

    res.status(201).json(exam);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateExam = async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    res.json(exam);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    await Mark.deleteMany({ examId: req.params.id });
    await exam.deleteOne();

    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.publishExam = async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      { isPublished: true },
      { new: true }
    );

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    exam.classIds.forEach(async classId => {
      const students = await Student.find({ classId });
      students.forEach(student => {
        student.parentIds.forEach(parentId => {
          broadcastToUser(parentId, 'exam:published', {
            examId: exam._id,
            examName: exam.name,
            studentId: student._id,
            studentName: student.name
          });
        });
      });
    });

    res.json({ message: 'Exam results published successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getExamAnalytics = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const marks = await Mark.find({ examId: req.params.id });
    
    const stats = {
      totalStudents: new Set(marks.map(m => m.studentId)).size,
      totalSubjects: new Set(marks.map(m => m.subjectId)).size,
      subjectWise: {},
      topPerformers: [],
      lowPerformers: [],
      passPercentage: 0,
      averagePercentage: 0
    };

    const studentTotals = {};
    const subjectTotals = {};

    marks.forEach(mark => {
      if (!studentTotals[mark.studentId]) {
        studentTotals[mark.studentId] = {
          total: 0,
          max: 0,
          name: mark.studentName
        };
      }
      studentTotals[mark.studentId].total += mark.totalMarks;
      studentTotals[mark.studentId].max += mark.maxMarks;

      if (!subjectTotals[mark.subjectName]) {
        subjectTotals[mark.subjectName] = {
          total: 0,
          max: 0,
          count: 0
        };
      }
      subjectTotals[mark.subjectName].total += mark.totalMarks;
      subjectTotals[mark.subjectName].max += mark.maxMarks;
      subjectTotals[mark.subjectName].count++;
    });

    Object.keys(subjectTotals).forEach(subject => {
      stats.subjectWise[subject] = {
        averagePercentage: (subjectTotals[subject].total / subjectTotals[subject].max) * 100,
        totalStudents: subjectTotals[subject].count
      };
    });

    const studentPercentages = Object.keys(studentTotals).map(studentId => ({
      studentId,
      name: studentTotals[studentId].name,
      percentage: (studentTotals[studentId].total / studentTotals[studentId].max) * 100,
      total: studentTotals[studentId].total,
      max: studentTotals[studentId].max
    }));

    studentPercentages.sort((a, b) => b.percentage - a.percentage);

    stats.topPerformers = studentPercentages.slice(0, 10);
    stats.lowPerformers = studentPercentages.slice(-10).reverse();
    
    stats.passPercentage = (studentPercentages.filter(s => s.percentage >= 40).length / studentPercentages.length) * 100;
    stats.averagePercentage = studentPercentages.reduce((sum, s) => sum + s.percentage, 0) / studentPercentages.length;

    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};