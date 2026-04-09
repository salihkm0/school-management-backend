const Subject = require('../models/Subject');
const Class = require('../models/Class');
const Exam = require('../models/Exam');
const Mark = require('../models/Mark');
const Staff = require('../models/Staff');

// @desc    Get all subjects
// @route   GET /api/subjects
// @access  Private
exports.getSubjects = async (req, res) => {
  try {
    const { type, isActive, search, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (type) query.type = type;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$text = { $search: search };
    }

    const subjects = await Subject.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ name: 1 });

    const total = await Subject.countDocuments(query);

    res.json({
      success: true,
      data: subjects,
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

// @desc    Get single subject
// @route   GET /api/subjects/:id
// @access  Private
exports.getSubject = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Get classes that have this subject
    const classes = await Class.find({ subjects: subject._id })
      .select('name section academicYear');

    // Get teachers teaching this subject
    const teachers = await Staff.find({ 
      'assignedSubjects.subjectId': subject._id 
    }).select('name');

    res.json({
      ...subject.toObject(),
      classes,
      teachers: teachers.map(t => t.name)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create subject
// @route   POST /api/subjects
// @access  Private/Admin
exports.createSubject = async (req, res) => {
  try {
    const { name, code, description, type, creditHours, department, gradeLevel } = req.body;

    // Check if subject already exists
    const existingSubject = await Subject.findOne({ 
      $or: [{ name }, { code }] 
    });

    if (existingSubject) {
      return res.status(400).json({ 
        message: 'Subject with this name or code already exists' 
      });
    }

    const subject = await Subject.create({
      name,
      code: code.toUpperCase(),
      description,
      type,
      creditHours,
      department,
      gradeLevel
    });

    res.status(201).json(subject);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update subject
// @route   PUT /api/subjects/:id
// @access  Private/Admin
exports.updateSubject = async (req, res) => {
  try {
    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    res.json(subject);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete subject
// @route   DELETE /api/subjects/:id
// @access  Private/Admin
exports.deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Check if subject is being used in any class
    const classesUsingSubject = await Class.find({ subjects: subject._id });
    if (classesUsingSubject.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete subject. It is being used in classes.',
        classes: classesUsingSubject.map(c => c.displayName)
      });
    }

    // Check if subject is being used in any exam
    const examsUsingSubject = await Exam.find({ 
      'subjectConfigs.subjectId': subject._id 
    });
    if (examsUsingSubject.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete subject. It is being used in exams.',
        exams: examsUsingSubject.map(e => e.name)
      });
    }

    // Soft delete - set isActive to false instead of deleting
    subject.isActive = false;
    await subject.save();

    res.json({ message: 'Subject deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get subjects by class
// @route   GET /api/subjects/class/:classId
// @access  Private
exports.getSubjectsByClass = async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.classId)
      .populate('subjects', 'name code description type creditHours');

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    res.json(classItem.subjects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get subjects by teacher
// @route   GET /api/subjects/teacher/:staffId
// @access  Private
exports.getSubjectsByTeacher = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.staffId);

    if (!staff) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    const subjectIds = staff.assignedSubjects.map(s => s.subjectId);
    const subjects = await Subject.find({ _id: { $in: subjectIds } });

    res.json(subjects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get subject statistics
// @route   GET /api/subjects/stats
// @access  Private/Admin
exports.getSubjectStats = async (req, res) => {
  try {
    const totalSubjects = await Subject.countDocuments();
    const activeSubjects = await Subject.countDocuments({ isActive: true });
    const coreSubjects = await Subject.countDocuments({ type: 'core' });
    const electiveSubjects = await Subject.countDocuments({ type: 'elective' });
    
    // Get subjects with most classes
    const subjectsWithClasses = await Class.aggregate([
      { $unwind: '$subjects' },
      { $group: { _id: '$subjects', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Populate subject details
    const popularSubjects = await Subject.find({
      _id: { $in: subjectsWithClasses.map(s => s._id) }
    });

    const formattedPopularSubjects = subjectsWithClasses.map(s => ({
      subject: popularSubjects.find(p => p._id.toString() === s._id.toString()),
      classCount: s.count
    }));

    res.json({
      totalSubjects,
      activeSubjects,
      coreSubjects,
      electiveSubjects,
      popularSubjects: formattedPopularSubjects
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bulk import subjects
// @route   POST /api/subjects/bulk-import
// @access  Private/Admin
exports.bulkImportSubjects = async (req, res) => {
  try {
    const { subjects } = req.body;
    
    const results = {
      success: [],
      failed: []
    };

    for (const subjectData of subjects) {
      try {
        const existingSubject = await Subject.findOne({ 
          $or: [{ name: subjectData.name }, { code: subjectData.code }] 
        });

        if (existingSubject) {
          results.failed.push({
            data: subjectData,
            error: 'Subject with this name or code already exists'
          });
          continue;
        }

        const subject = await Subject.create({
          name: subjectData.name,
          code: subjectData.code.toUpperCase(),
          description: subjectData.description,
          type: subjectData.type || 'core',
          creditHours: subjectData.creditHours || 1,
          department: subjectData.department,
          gradeLevel: subjectData.gradeLevel || 'all'
        });

        results.success.push(subject);
      } catch (error) {
        results.failed.push({
          data: subjectData,
          error: error.message
        });
      }
    }

    res.json({
      message: `Imported ${results.success.length} subjects, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Assign subject to multiple classes
// @route   POST /api/subjects/:id/assign-to-classes
// @access  Private/Admin
exports.assignSubjectToClasses = async (req, res) => {
  try {
    const { classIds } = req.body;
    const subjectId = req.params.id;

    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const results = {
      success: [],
      failed: []
    };

    for (const classId of classIds) {
      try {
        const classItem = await Class.findByIdAndUpdate(
          classId,
          { $addToSet: { subjects: subjectId } },
          { new: true }
        );

        if (classItem) {
          results.success.push(classItem.displayName);
        } else {
          results.failed.push({ classId, error: 'Class not found' });
        }
      } catch (error) {
        results.failed.push({ classId, error: error.message });
      }
    }

    res.json({
      message: `Subject assigned to ${results.success.length} classes`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};