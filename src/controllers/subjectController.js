// controllers/subjectController.js
const Subject = require('../models/Subject');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Exam = require('../models/Exam');
const Mark = require('../models/Mark');
const Staff = require('../models/Staff');
const Notification = require('../models/Notification');
const SubjectClassTemplate = require('../models/SubjectClassTemplate');
const { broadcastToRole, broadcastToUser } = require('../config/socket');

// Helper to send subject notification
async function sendSubjectNotification(subjectId, subjectName, title, message, type, data) {
  const classes = await Class.find({ subjects: subjectId });
  const userIds = [];
  
  for (const classItem of classes) {
    const students = await Student.find({ classId: classItem._id }).select('parentIds');
    const parentIds = [...new Set(students.flatMap(s => s.parentIds))];
    userIds.push(...parentIds);
    if (classItem.classTeacherId) userIds.push(classItem.classTeacherId);
  }
  
  const teachers = await Staff.find({ 'assignedSubjects.subjectId': subjectId });
  for (const teacher of teachers) {
    if (teacher.userId) userIds.push(teacher.userId);
  }
  
  const uniqueUserIds = [...new Set(userIds.map(id => id.toString()))];
  
  for (const userId of uniqueUserIds) {
    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      data: { ...data, subjectId, subjectName }
    });
    
    broadcastToUser(userId, 'notification', {
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

// Helper to send class notification (for subject assignment)
async function sendClassNotification(classId, title, message, type, data) {
  try {
    const students = await Student.find({ classId }).select('parentIds');
    const parentIds = [...new Set(students.flatMap(s => s.parentIds))];
    
    const classItem = await Class.findById(classId);
    if (classItem && classItem.classTeacherId) {
      parentIds.push(classItem.classTeacherId);
    }
    
    for (const userId of parentIds) {
      const notification = await Notification.create({
        userId,
        title,
        message,
        type,
        data: { ...data, classId }
      });
      
      broadcastToUser(userId, 'notification', {
        id: notification._id,
        title,
        message,
        type,
        data: notification.data,
        timestamp: notification.createdAt,
        read: false
      });
    }
  } catch (error) {
    console.error('Error sending class notification:', error);
  }
}

exports.getSubjects = async (req, res) => {
  try {
    const { type, isActive, search, department, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (type) query.type = type;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (department) query.department = department;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    const subjects = await Subject.find(query)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ department: 1, name: 1 });

    const total = await Subject.countDocuments(query);

    // Group by department
    const byDepartment = {};
    subjects.forEach(s => {
      const dept = s.department || 'Other';
      if (!byDepartment[dept]) byDepartment[dept] = [];
      byDepartment[dept].push(s);
    });

    res.json({
      success: true,
      data: subjects,
      grouped: byDepartment,
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

exports.getSubject = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const classes = await Class.find({ subjects: subject._id })
      .select('name section academicYearId')
      .populate('academicYearId', 'year');

    const teachers = await Staff.find({ 
      'assignedSubjects.subjectId': subject._id 
    }).select('name qualification');

    // Get templates that include this subject
    const templates = await SubjectClassTemplate.find({ 
      subjects: subject._id 
    }).select('className');

    res.json({
      ...subject.toObject(),
      classes: classes.map(c => ({
        _id: c._id,
        name: c.section ? `${c.name}-${c.section}` : c.name,
        academicYear: c.academicYearId?.year
      })),
      teachers: teachers.map(t => ({ name: t.name, qualification: t.qualification })),
      templates: templates.map(t => t.className)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createSubject = async (req, res) => {
  try {
    const { name, code, description, type, creditHours, department, gradeLevel } = req.body;

    const existingSubject = await Subject.findOne({ 
      $or: [{ name }, { code: code?.toUpperCase() }] 
    });

    if (existingSubject) {
      return res.status(400).json({ 
        message: 'Subject with this name or code already exists' 
      });
    }

    const subject = await Subject.create({
      name,
      code: code?.toUpperCase(),
      description,
      type,
      creditHours,
      department,
      gradeLevel
    });

    broadcastToRole('admin', 'subject:created', {
      subjectId: subject._id,
      subjectName: subject.name,
      subjectCode: subject.code,
      timestamp: new Date()
    });

    res.status(201).json(subject);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateSubject = async (req, res) => {
  try {
    const oldSubject = await Subject.findById(req.params.id);
    const subject = await Subject.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    if (oldSubject.name !== subject.name || oldSubject.code !== subject.code) {
      await sendSubjectNotification(
        subject._id,
        subject.name,
        'Subject Information Updated',
        `Subject ${oldSubject.name} has been updated to ${subject.name} (${subject.code})`,
        'info',
        { oldName: oldSubject.name, newName: subject.name, oldCode: oldSubject.code, newCode: subject.code }
      );
    }

    res.json(subject);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findById(req.params.id);

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const classesUsingSubject = await Class.find({ subjects: subject._id });
    if (classesUsingSubject.length > 0) {
      const classNames = classesUsingSubject.map(c => c.section ? `${c.name}-${c.section}` : c.name);
      return res.status(400).json({ 
        message: 'Cannot delete subject. It is being used in classes.',
        classes: classNames
      });
    }

    const templatesUsingSubject = await SubjectClassTemplate.find({ subjects: subject._id });
    if (templatesUsingSubject.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete subject. It is being used in subject templates.',
        templates: templatesUsingSubject.map(t => t.className)
      });
    }

    const examsUsingSubject = await Exam.find({ 
      'subjectConfigs.subjectId': subject._id 
    });
    if (examsUsingSubject.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete subject. It is being used in exams.',
        exams: examsUsingSubject.map(e => e.name)
      });
    }

    await sendSubjectNotification(
      subject._id,
      subject.name,
      'Subject Deactivation Notice',
      `Subject ${subject.name} (${subject.code}) is being deactivated.`,
      'warning',
      { deactivated: true }
    );

    subject.isActive = false;
    await subject.save();

    broadcastToRole('admin', 'subject:deactivated', {
      subjectId: subject._id,
      subjectName: subject.name,
      timestamp: new Date()
    });

    res.json({ message: 'Subject deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSubjectsByClass = async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.classId)
      .populate('subjects', 'name code description type creditHours department');

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Group by type
    const byType = {
      languages: classItem.subjects.filter(s => s.department === 'Languages'),
      core: classItem.subjects.filter(s => s.type === 'core' && s.department !== 'Languages'),
      elective: classItem.subjects.filter(s => s.type === 'elective')
    };

    res.json({
      class: {
        _id: classItem._id,
        name: classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name
      },
      subjects: classItem.subjects,
      byType,
      count: classItem.subjects.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSubjectsByTeacher = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.staffId);

    if (!staff) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    const subjectIds = staff.assignedSubjects?.map(s => s.subjectId) || [];
    const subjects = await Subject.find({ _id: { $in: subjectIds } });

    res.json(subjects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSubjectStats = async (req, res) => {
  try {
    const totalSubjects = await Subject.countDocuments();
    const activeSubjects = await Subject.countDocuments({ isActive: true });
    const coreSubjects = await Subject.countDocuments({ type: 'core' });
    const electiveSubjects = await Subject.countDocuments({ type: 'elective' });
    
    const departmentStats = await Subject.aggregate([
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const subjectsWithClasses = await Class.aggregate([
      { $unwind: '$subjects' },
      { $group: { _id: '$subjects', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

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
      departmentStats,
      popularSubjects: formattedPopularSubjects
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
          $or: [{ name: subjectData.name }, { code: subjectData.code?.toUpperCase() }] 
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
          code: subjectData.code?.toUpperCase(),
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

    broadcastToRole('admin', 'subjects:imported', {
      total: results.success.length,
      failed: results.failed.length,
      timestamp: new Date()
    });

    res.json({
      message: `Imported ${results.success.length} subjects, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
          const displayName = classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name;
          results.success.push(displayName);
          
          await sendClassNotification(
            classId,
            'New Subject Added',
            `${subject.name} has been added to your curriculum`,
            'info',
            { subjectId, subjectName: subject.name }
          );
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

// Get language subjects (for dropdown)
exports.getLanguageSubjects = async (req, res) => {
  try {
    const languages = await Subject.find({ 
      department: 'Languages',
      isActive: true 
    }).select('name code type');
    
    res.json(languages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get subjects by template for a class
exports.getSubjectsByTemplate = async (req, res) => {
  try {
    const { className } = req.params;
    
    const template = await SubjectClassTemplate.findOne({ 
      className,
      isActive: true 
    }).populate('subjects', 'name code type department creditHours');
    
    if (!template) {
      return res.json({ subjects: [], message: 'No template found for this class' });
    }
    
    res.json({
      className: template.className,
      subjects: template.subjects,
      sectionSpecific: template.sectionSpecific,
      sectionSubjects: template.sectionSpecific ? Object.fromEntries(template.sectionSubjects) : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};