const Class = require('../models/Class');
const Student = require('../models/Student');
const Staff = require('../models/Staff');

exports.getClasses = async (req, res) => {
  try {
    const { academicYear, isActive, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (academicYear) query.academicYear = academicYear;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const classes = await Class.find(query)
      .populate('classTeacherId', 'name')
      .populate('subjects', 'name code')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ name: 1, section: 1 });

    const total = await Class.countDocuments(query);

    res.json({
      success: true,
      data: classes,
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

exports.getClass = async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id)
      .populate('classTeacherId', 'name')
      .populate('subjects', 'name code description');

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const students = await Student.find({ classId: req.params.id })
      .select('name admissionNumber rollNumber status');

    res.json({
      ...classItem.toObject(),
      students,
      studentCount: students.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createClass = async (req, res) => {
  try {
    const { name, section, capacity, academicYear } = req.body;
    
    const existingClass = await Class.findOne({ name, section, academicYear });
    if (existingClass) {
      return res.status(400).json({ message: 'Class already exists for this academic year' });
    }

    const classItem = await Class.create(req.body);

    res.status(201).json(classItem);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateClass = async (req, res) => {
  try {
    const classItem = await Class.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json(classItem);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    const { transferToClassId } = req.body;
    const classItem = await Class.findById(req.params.id);

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    if (transferToClassId) {
      await Student.updateMany(
        { classId: req.params.id },
        { classId: transferToClassId }
      );
      
      const studentCount = await Student.countDocuments({ classId: req.params.id });
      await Class.findByIdAndUpdate(transferToClassId, {
        $inc: { studentCount }
      });
    }

    await classItem.deleteOne();

    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.assignClassTeacher = async (req, res) => {
  try {
    const { teacherId } = req.body;
    
    const teacher = await Staff.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const classItem = await Class.findByIdAndUpdate(
      req.params.id,
      {
        classTeacherId: teacherId,
        classTeacherName: teacher.name
      },
      { new: true }
    );

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    await Staff.findByIdAndUpdate(teacherId, {
      assignedClassId: req.params.id
    });

    res.json({
      success: true,
      message: 'Class teacher assigned successfully',
      class: classItem
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addSubjects = async (req, res) => {
  try {
    const { subjectIds } = req.body;
    
    const classItem = await Class.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { subjects: { $each: subjectIds } } },
      { new: true }
    );

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json(classItem);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateTimetable = async (req, res) => {
  try {
    const { timetable } = req.body;
    
    const classItem = await Class.findByIdAndUpdate(
      req.params.id,
      { timetable },
      { new: true }
    );

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json(classItem);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};