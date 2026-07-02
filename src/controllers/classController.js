// controllers/classController.js
const Class = require('../models/Class');
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const StaffAssignment = require('../models/StaffAssignment');
const AcademicYear = require('../models/AcademicYear');
const Subject = require('../models/Subject');
const Notification = require('../models/Notification');
const SubjectClassTemplate = require('../models/SubjectClassTemplate');
const { RecentActivity, ACTIVITY_TYPES, ENTITY_TYPES, SEVERITY } = require('../models/RecentActivity');
const { broadcastToRole, broadcastToUser, broadcastToClass } = require('../config/socket');

// Helper function to create recent activity
async function createRecentActivity({
  title,
  description,
  activityType,
  entityType,
  entityId = null,
  entityModel = null,
  performedBy,
  performedByName,
  performedByRole,
  details = {},
  changes = {},
  ipAddress = null,
  userAgent = null,
  severity = SEVERITY.INFO,
  batchId = null
}) {
  try {
    const activity = await RecentActivity.create({
      title,
      description,
      activityType,
      entityType,
      entityId,
      entityModel,
      performedBy,
      performedByName,
      performedByRole,
      details,
      changes,
      ipAddress,
      userAgent,
      severity,
      batchId
    });
    
    broadcastToRole('admin', 'recent_activity:created', { activity });
    broadcastToRole('staff', 'recent_activity:created', { activity });
    
    return activity;
  } catch (error) {
    console.error('Error creating recent activity:', error);
    return null;
  }
}

// Helper function to get display name with academic year
async function getClassDisplayName(classItem) {
  let academicYear = classItem.academicYearId;
  
  if (academicYear && typeof academicYear === 'object' && !academicYear.year) {
    academicYear = await AcademicYear.findById(academicYear);
  }
  
  const baseName = classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name;
  
  if (academicYear && academicYear.year) {
    return `${baseName} ${academicYear.year}`;
  }
  
  return baseName;
}

async function sendClassNotification(classId, title, message, type, data) {
  try {
    const students = await Student.find({ classId }).select('parentIds');
    const parentIds = [...new Set(students.flatMap(s => s.parentIds))];
    
    const classItem = await Class.findById(classId);
    if (classItem && classItem.classTeacherId) {
      if (classItem.classTeacherId.userId) {
        parentIds.push(classItem.classTeacherId.userId);
      }
    }
    
    for (const userId of parentIds) {
      if (!userId) continue;
      const notification = await Notification.create({
        userId,
        title,
        message,
        type,
        data: { ...data, classId }
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
  } catch (error) {
    console.error('Error sending class notification:', error);
  }
}

// Auto-assign subjects from template
async function autoAssignSubjectsFromTemplate(className, section) {
  try {
    const template = await SubjectClassTemplate.findOne({ 
      className: className,
      isActive: true 
    });
    
    if (!template) {
      console.log(`No subject template found for class ${className}`);
      return [];
    }
    
    let subjectIds = [];
    
    if (template.sectionSpecific && template.sectionSubjects && section) {
      const sectionSubjects = template.sectionSubjects.get(section);
      if (sectionSubjects && sectionSubjects.length > 0) {
        subjectIds = sectionSubjects;
      } else {
        subjectIds = template.subjects;
      }
    } else {
      subjectIds = template.subjects;
    }
    
    return subjectIds;
  } catch (error) {
    console.error('Error auto-assigning subjects:', error);
    return [];
  }
}

// ==================== EXPORTS ====================

exports.getClasses = async (req, res) => {
  try {
    const { academicYearId, isActive, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (academicYearId) query.academicYearId = academicYearId;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const classes = await Class.find(query)
      .populate('classTeacherId', 'name email phone')
      .populate('subjects', 'name code type')
      .populate('subjectTeachers.teacherId', 'name')
      .populate('subjectTeachers.subjectId', 'name code')
      .populate('academicYearId', 'year name')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ name: 1, section: 1 });

    const classesWithDetails = await Promise.all(classes.map(async (classItem) => {
      const studentCount = await Student.countDocuments({ 
        classId: classItem._id,
        isActive: true 
      });
      
      const displayName = await getClassDisplayName(classItem);
      const baseName = classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name;
      
      return {
        ...classItem.toObject(),
        displayName,
        baseDisplayName: baseName,
        studentCount,
        subjectTeacherCount: classItem.subjectTeachers?.length || 0
      };
    }));

    const total = await Class.countDocuments(query);

    // Aggregate total students across ALL matching classes (not just current page)
    const allMatchingClassIds = await Class.find(query).select('_id').lean();
    const totalStudents = await Student.countDocuments({
      classId: { $in: allMatchingClassIds.map(c => c._id) },
      isActive: true
    });

    res.json({
      success: true,
      data: classesWithDetails,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
        totalStudents
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getClass = async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id)
      .populate('classTeacherId', 'name email phone qualification staffCode')
      .populate('subjects', 'name code description type creditHours')
      .populate('subjectTeachers.teacherId', 'name email contact qualification')
      .populate('subjectTeachers.subjectId', 'name code type')
      .populate('academicYearId', 'year name');

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const students = await Student.find({ classId: req.params.id, isActive: true })
      .select('fullName studentCode admissionNo rollNumber status gender');

    const displayName = await getClassDisplayName(classItem);
    const baseName = classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name;

    const template = await SubjectClassTemplate.findOne({ className: classItem.name });
    
    const subjectsWithTeachers = classItem.subjectTeachers.map(st => ({
      subject: st.subjectId,
      teacher: st.teacherId,
      periodsPerWeek: st.periodsPerWeek
    }));

    const subjectsWithoutTeachers = classItem.subjects.filter(
      s => !classItem.subjectTeachers.some(st => st.subjectId?.toString() === s?.toString())
    );

    const populatedSubjectsWithoutTeachers = await Subject.find({
      _id: { $in: subjectsWithoutTeachers }
    }).select('name code type creditHours');

    res.json({
      ...classItem.toObject(),
      displayName,
      baseDisplayName: baseName,
      students,
      studentCount: students.length,
      subjectsWithTeachers,
      subjectsWithoutTeachers: populatedSubjectsWithoutTeachers,
      template: template ? {
        _id: template._id,
        subjectCount: template.subjects.length
      } : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createClass = async (req, res) => {
  try {
    const { name, section, capacity, academicYearId } = req.body;
    
    const academicYear = await AcademicYear.findById(academicYearId);
    if (!academicYear) {
      return res.status(404).json({ message: 'Academic year not found' });
    }
    
    const existingClass = await Class.findOne({ name, section, academicYearId });
    if (existingClass) {
      return res.status(400).json({ message: 'Class already exists for this academic year' });
    }

    const templateSubjectIds = await autoAssignSubjectsFromTemplate(name, section);
    
    const classItem = await Class.create({
      name,
      section,
      capacity,
      academicYearId,
      subjects: templateSubjectIds,
      subjectTeachers: []
    });
    
    const populatedClass = await Class.findById(classItem._id)
      .populate('academicYearId', 'year name')
      .populate('subjects', 'name code');
    
    const displayName = await getClassDisplayName(populatedClass);
    const baseName = classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name;

    await createRecentActivity({
      title: `New Class Created: ${displayName}`,
      description: `Class ${displayName} was created with ${templateSubjectIds.length} subjects`,
      activityType: ACTIVITY_TYPES.CLASS_CREATED,
      entityType: ENTITY_TYPES.CLASS,
      entityId: classItem._id,
      entityModel: 'Class',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        className: name,
        section: section || null,
        capacity: capacity,
        subjectsCount: templateSubjectIds.length,
        academicYear: academicYear.year
      },
      severity: SEVERITY.SUCCESS
    });

    broadcastToRole('admin', 'class:created', {
      classId: classItem._id,
      className: displayName,
      academicYear: academicYear.year,
      subjectCount: templateSubjectIds.length,
      timestamp: new Date()
    });

    res.status(201).json({
      ...populatedClass.toObject(),
      displayName,
      baseDisplayName: baseName
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateClass = async (req, res) => {
  try {
    const beforeUpdate = await Class.findById(req.params.id).populate('academicYearId', 'year name');
    
    const classItem = await Class.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('academicYearId', 'year name').populate('subjects', 'name code');

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const displayName = await getClassDisplayName(classItem);
    const baseName = classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name;

    const changes = {};
    if (beforeUpdate.name !== classItem.name) changes.name = { from: beforeUpdate.name, to: classItem.name };
    if (beforeUpdate.section !== classItem.section) changes.section = { from: beforeUpdate.section, to: classItem.section };
    if (beforeUpdate.capacity !== classItem.capacity) changes.capacity = { from: beforeUpdate.capacity, to: classItem.capacity };

    if (Object.keys(changes).length > 0) {
      await createRecentActivity({
        title: `Class Updated: ${displayName}`,
        description: `Class ${displayName} information was updated`,
        activityType: ACTIVITY_TYPES.CLASS_UPDATED,
        entityType: ENTITY_TYPES.CLASS,
        entityId: classItem._id,
        entityModel: 'Class',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: {
          className: classItem.name,
          section: classItem.section,
          academicYear: classItem.academicYearId?.year
        },
        changes: changes,
        severity: SEVERITY.INFO
      });
    }

    await sendClassNotification(
      classItem._id,
      'Class Information Updated',
      `Updates have been made to your class: ${displayName}`,
      'info',
      { updates: Object.keys(req.body) }
    );

    res.json({
      ...classItem.toObject(),
      displayName,
      baseDisplayName: baseName
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteClass = async (req, res) => {
  try {
    const { transferToClassId } = req.body;
    const classItem = await Class.findById(req.params.id).populate('academicYearId', 'year name');

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const displayName = await getClassDisplayName(classItem);
    const studentCount = await Student.countDocuments({ classId: req.params.id });
    
    if (studentCount > 0 && !transferToClassId) {
      return res.status(400).json({ 
        message: `Cannot delete class with ${studentCount} students. Please specify a class to transfer students to.` 
      });
    }

    await createRecentActivity({
      title: `Class Deleted: ${displayName}`,
      description: `Class ${displayName} was deleted${transferToClassId ? ` and students transferred` : ''}`,
      activityType: ACTIVITY_TYPES.CLASS_DELETED,
      entityType: ENTITY_TYPES.CLASS,
      entityId: classItem._id,
      entityModel: 'Class',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        className: classItem.name,
        section: classItem.section,
        studentCount: studentCount,
        transferredTo: transferToClassId,
        academicYear: classItem.academicYearId?.year
      },
      severity: SEVERITY.WARNING
    });

    await sendClassNotification(
      classItem._id,
      'Class Deactivation Notice',
      `Your class ${displayName} is being deactivated.`,
      'warning',
      { deactivated: true }
    );

    if (transferToClassId) {
      await Student.updateMany(
        { classId: req.params.id },
        { classId: transferToClassId }
      );
    }

    // Remove class teacher from StaffAssignment
    if (classItem.classTeacherId) {
      await StaffAssignment.updateMany(
        { classTeacherOf: classItem._id },
        { classTeacherOf: null, classTeacherOfName: null }
      );
    }

    await classItem.deleteOne();

    broadcastToRole('admin', 'class:deleted', {
      classId: classItem._id,
      className: displayName,
      transferredTo: transferToClassId,
      timestamp: new Date()
    });

    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// FIXED: assignClassTeacher with proper removal support
exports.assignClassTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const { teacherId, academicYearId, subjectId, periodsPerWeek } = req.body;
    
    console.log('assignClassTeacher called:', { classId: id, teacherId, academicYearId, subjectId, periodsPerWeek });
    
    // Find the class
    const classItem = await Class.findById(id);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    const oldTeacherId = classItem.classTeacherId;
    
    // CASE 1: Remove teacher (teacherId is null, 'null', or undefined)
    if (!teacherId || teacherId === 'null' || teacherId === null) {
      // Remove from class
      classItem.classTeacherId = null;
      classItem.classTeacherName = null;
      await classItem.save();
      
      // Remove from StaffAssignment
      if (oldTeacherId) {
        await StaffAssignment.updateMany(
          { staffId: oldTeacherId, classTeacherOf: id },
          { classTeacherOf: null, classTeacherOfName: null }
        );
      }
      
      const displayName = await getClassDisplayName(classItem);
      
      await createRecentActivity({
        title: `Class Teacher Removed: ${displayName}`,
        description: `The class teacher was removed from ${displayName}`,
        activityType: ACTIVITY_TYPES.CLASS_TEACHER_REMOVED,
        entityType: ENTITY_TYPES.CLASS,
        entityId: classItem._id,
        entityModel: 'Class',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: {
          className: displayName,
          previousTeacherId: oldTeacherId
        },
        severity: SEVERITY.INFO
      });
      
      return res.json({
        success: true,
        message: 'Class teacher removed successfully',
        data: {
          ...classItem.toObject(),
          displayName
        }
      });
    }
    
    // CASE 2: Assign new teacher
    const teacher = await Staff.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    
    // Get academic year - either from request or from class
    let yearId = academicYearId;
    if (!yearId && classItem.academicYearId) {
      yearId = classItem.academicYearId;
    }
    
    if (!yearId) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      yearId = currentYear?._id;
    }
    
    if (!yearId) {
      return res.status(400).json({ message: 'Academic year not found' });
    }
    
    // Validate subject if provided
    let subject = null;
    if (subjectId) {
      if (!classItem.subjects.includes(subjectId)) {
        return res.status(400).json({ message: 'Subject not assigned to this class' });
      }
      subject = await Subject.findById(subjectId);
      if (!subject) {
        return res.status(404).json({ message: 'Subject not found' });
      }
    }
    
    // Check if teacher is already class teacher for another class in same academic year
    const existingAssignment = await StaffAssignment.findOne({
      staffId: teacherId,
      academicYearId: yearId,
      classTeacherOf: { $ne: null }
    });
    
    if (existingAssignment && existingAssignment.classTeacherOf.toString() !== id) {
      // Remove from previous class
      const previousClass = await Class.findById(existingAssignment.classTeacherOf);
      if (previousClass) {
        previousClass.classTeacherId = null;
        previousClass.classTeacherName = null;
        await previousClass.save();
      }
      
      // Remove from StaffAssignment
      existingAssignment.classTeacherOf = null;
      existingAssignment.classTeacherOfName = null;
      await existingAssignment.save();
    }
    
    // Update subjectTeachers mapping in classItem if subjectId is provided
    if (subjectId && subject) {
      const existingIndex = classItem.subjectTeachers.findIndex(
        st => st.subjectId?.toString() === subjectId
      );
      
      const subjectTeacherData = {
        subjectId,
        teacherId,
        teacherName: teacher.name,
        periodsPerWeek: periodsPerWeek ? parseInt(periodsPerWeek) : 1
      };
      
      if (existingIndex >= 0) {
        const oldSubjectTeacher = classItem.subjectTeachers[existingIndex];
        if (oldSubjectTeacher.teacherId && oldSubjectTeacher.teacherId.toString() !== teacherId) {
          const oldStaffAssignment = await StaffAssignment.findOne({
            staffId: oldSubjectTeacher.teacherId,
            academicYearId: yearId
          });
          if (oldStaffAssignment) {
            oldStaffAssignment.subjectsTaught = oldStaffAssignment.subjectsTaught.filter(
              s => !(s.subjectId?.toString() === subjectId && s.classId?.toString() === id)
            );
            await oldStaffAssignment.save();
          }
        }
        classItem.subjectTeachers[existingIndex] = subjectTeacherData;
      } else {
        classItem.subjectTeachers.push(subjectTeacherData);
      }
    }
    
    // Update class
    classItem.classTeacherId = teacherId;
    classItem.classTeacherName = teacher.name;
    await classItem.save();
    
    // Update StaffAssignment
    let staffAssignment = await StaffAssignment.findOne({
      staffId: teacherId,
      academicYearId: yearId
    });
    
    if (!staffAssignment) {
      staffAssignment = await StaffAssignment.create({
        staffId: teacherId,
        academicYearId: yearId,
        subjectsTaught: []
      });
    }
    
    const displayName = await getClassDisplayName(classItem);
    
    staffAssignment.classTeacherOf = classItem._id;
    staffAssignment.classTeacherOfName = displayName;
    
    // Add subject teaching to new teacher's assignment if provided
    if (subjectId && subject) {
      const subjectAssignmentIndex = staffAssignment.subjectsTaught.findIndex(
        s => s.subjectId?.toString() === subjectId && s.classId?.toString() === id
      );
      
      const subjectAssignmentData = {
        subjectId,
        subjectName: subject.name,
        subjectCode: subject.code,
        classId: id,
        className: classItem.name,
        section: classItem.section,
        periodsPerWeek: periodsPerWeek ? parseInt(periodsPerWeek) : 1
      };
      
      if (subjectAssignmentIndex >= 0) {
        staffAssignment.subjectsTaught[subjectAssignmentIndex] = subjectAssignmentData;
      } else {
        staffAssignment.subjectsTaught.push(subjectAssignmentData);
      }
    }
    
    await staffAssignment.save();
    
    // Create recent activity
    await createRecentActivity({
      title: `Class Teacher Assigned: ${displayName}`,
      description: `${teacher.name} was assigned as class teacher for ${displayName}${subject ? ` and to teach ${subject.name}` : ''}`,
      activityType: ACTIVITY_TYPES.CLASS_TEACHER_ASSIGNED,
      entityType: ENTITY_TYPES.CLASS,
      entityId: classItem._id,
      entityModel: 'Class',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        className: displayName,
        teacherId: teacherId,
        teacherName: teacher.name,
        previousTeacherId: oldTeacherId || null,
        subject: subject ? { name: subject.name, code: subject.code, periodsPerWeek } : null
      },
      severity: SEVERITY.SUCCESS
    });
    
    // Notify teacher via notification
    if (teacher.userId) {
      const notification = await Notification.create({
        userId: teacher.userId,
        title: 'Class Teacher Assignment',
        message: `You have been assigned as class teacher for ${displayName}${subject ? ` and to teach ${subject.name}` : ''}`,
        type: 'success',
        data: { classId: classItem._id, className: displayName, subjectId: subjectId || null }
      });
      
      broadcastToUser(teacher.userId.toString(), 'notification', {
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        data: notification.data,
        timestamp: notification.createdAt,
        read: false
      });
    }
    
    await sendClassNotification(
      classItem._id,
      'New Class Teacher',
      `${teacher.name} has been assigned as your class teacher`,
      'info',
      { teacherId, teacherName: teacher.name }
    );
    
    res.json({
      success: true,
      message: 'Class teacher assigned successfully',
      data: {
        ...classItem.toObject(),
        displayName
      }
    });
  } catch (error) {
    console.error('Assign class teacher error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.addSubjects = async (req, res) => {
  try {
    const { subjectIds } = req.body;
    
    const beforeUpdate = await Class.findById(req.params.id);
    const beforeSubjectCount = beforeUpdate?.subjects?.length || 0;

    const classItem = await Class.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { subjects: { $each: subjectIds } } },
      { new: true }
    ).populate('academicYearId', 'year name').populate('subjects', 'name code');

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const displayName = await getClassDisplayName(classItem);
    const addedSubjects = await Subject.find({ _id: { $in: subjectIds } }).select('name code');

    await createRecentActivity({
      title: `Subjects Added to ${displayName}`,
      description: `${subjectIds.length} new subject(s) were added to ${displayName}`,
      activityType: ACTIVITY_TYPES.SUBJECT_ASSIGNED,
      entityType: ENTITY_TYPES.CLASS,
      entityId: classItem._id,
      entityModel: 'Class',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        className: displayName,
        addedSubjects: addedSubjects.map(s => ({ name: s.name, code: s.code })),
        previousSubjectCount: beforeSubjectCount,
        newSubjectCount: classItem.subjects.length
      },
      severity: SEVERITY.INFO
    });

    await sendClassNotification(
      classItem._id,
      'New Subjects Added',
      `${subjectIds.length} new subject(s) have been added to your curriculum`,
      'info',
      { subjectCount: subjectIds.length }
    );

    res.json({
      ...classItem.toObject(),
      displayName
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.removeSubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    
    const subject = await Subject.findById(subjectId);
    
    const classItem = await Class.findByIdAndUpdate(
      req.params.id,
      { $pull: { subjects: subjectId } },
      { new: true }
    ).populate('academicYearId', 'year name').populate('subjects', 'name code');

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Also remove from subjectTeachers
    classItem.subjectTeachers = classItem.subjectTeachers.filter(
      st => st.subjectId?.toString() !== subjectId
    );
    await classItem.save();

    const displayName = await getClassDisplayName(classItem);

    await createRecentActivity({
      title: `Subject Removed from ${displayName}`,
      description: `${subject?.name || 'A subject'} was removed from ${displayName}`,
      activityType: ACTIVITY_TYPES.SUBJECT_REMOVED,
      entityType: ENTITY_TYPES.CLASS,
      entityId: classItem._id,
      entityModel: 'Class',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        className: displayName,
        removedSubject: subject ? { name: subject.name, code: subject.code } : { id: subjectId },
        remainingSubjectCount: classItem.subjects.length
      },
      severity: SEVERITY.INFO
    });

    res.json({
      ...classItem.toObject(),
      displayName
    });
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
    ).populate('academicYearId', 'year name');

    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const displayName = await getClassDisplayName(classItem);

    await createRecentActivity({
      title: `Timetable Updated: ${displayName}`,
      description: `The timetable for ${displayName} was updated`,
      activityType: ACTIVITY_TYPES.TIMETABLE_UPDATED,
      entityType: ENTITY_TYPES.CLASS,
      entityId: classItem._id,
      entityModel: 'Class',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        className: displayName,
        periodsCount: timetable?.reduce((sum, day) => sum + (day.periods?.length || 0), 0) || 0
      },
      severity: SEVERITY.INFO
    });

    await sendClassNotification(
      classItem._id,
      'Timetable Updated',
      `The timetable for ${displayName} has been updated. Please check your new schedule.`,
      'info',
      { updated: true }
    );

    broadcastToClass(classItem._id, 'timetable:updated', {
      classId: classItem._id,
      className: displayName,
      timestamp: new Date()
    });

    res.json({
      ...classItem.toObject(),
      displayName
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.applyTemplateToClass = async (req, res) => {
  try {
    const { templateId } = req.body;
    const classId = req.params.id;

    const classItem = await Class.findById(classId);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    let subjectIds = [];
    let templateName = '';
    
    if (templateId) {
      const template = await SubjectClassTemplate.findById(templateId);
      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }
      templateName = template.className;
      
      if (template.sectionSpecific && template.sectionSubjects && classItem.section) {
        const sectionSubjects = template.sectionSubjects.get(classItem.section);
        subjectIds = sectionSubjects || template.subjects;
      } else {
        subjectIds = template.subjects;
      }
    } else {
      subjectIds = await autoAssignSubjectsFromTemplate(classItem.name, classItem.section);
      templateName = 'Default Template';
    }

    if (subjectIds.length > 0) {
      await Class.findByIdAndUpdate(classId, {
        $addToSet: { subjects: { $each: subjectIds } }
      });
    }

    const updatedClass = await Class.findById(classId).populate('subjects', 'name code');
    const displayName = await getClassDisplayName(updatedClass);

    await createRecentActivity({
      title: `Template Applied to ${displayName}`,
      description: `Template "${templateName}" was applied to ${displayName}, adding ${subjectIds.length} subjects`,
      activityType: ACTIVITY_TYPES.TEMPLATE_APPLIED,
      entityType: ENTITY_TYPES.CLASS,
      entityId: classId,
      entityModel: 'Class',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        className: displayName,
        templateName: templateName,
        subjectsAdded: subjectIds.length,
        totalSubjects: updatedClass.subjects.length
      },
      severity: SEVERITY.INFO
    });

    res.json({
      message: `Applied ${subjectIds.length} subjects to class`,
      data: {
        ...updatedClass.toObject(),
        displayName
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.syncAllSubjectTemplates = async (req, res) => {
  try {
    const { academicYearId } = req.params;

    if (!academicYearId) {
      return res.status(400).json({ message: 'Academic Year ID is required' });
    }

    const classes = await Class.find({ academicYearId, isActive: true });
    
    if (!classes.length) {
      return res.status(404).json({ message: 'No classes found for the selected academic year' });
    }

    let updatedCount = 0;
    let skippedCount = 0;

    for (const classItem of classes) {
      // 1. Get subjects from template (re-using the proven autoAssign function)
      const templateSubjectIds = await autoAssignSubjectsFromTemplate(classItem.name, classItem.section);

      // 2. Extract language subjects from all active students in this class
      const students = await Student.find({ classId: classItem._id, isActive: true });
      const languageSet = new Set();
      
      for (const student of students) {
        const languages = [
          student.firstLanguagePaper1,
          student.firstLanguagePaper2,
          student.thirdLanguage,
          student.additionalLanguage
        ].filter(l => l);
        
        for (const lang of languages) {
          if (lang && typeof lang === 'object' && lang.name) {
            languageSet.add(lang.name);
          } else if (lang && typeof lang === 'string') {
            languageSet.add(lang);
          }
        }
      }
      
      // 3. Get or create the actual Subject records for these languages
      const languageSubjectIds = await getOrCreateLanguageSubjects([...languageSet]);
      
      // 4. Merge template subjects and language subjects without duplicates
      const allSubjectIds = [...new Set([
        ...templateSubjectIds.map(s => s.toString()), 
        ...languageSubjectIds.map(s => s.toString())
      ])];

      if (allSubjectIds.length > 0) {
        // OVERWRITE the class subjects with the complete synced list (just like individual sync)
        await Class.findByIdAndUpdate(classItem._id, {
          subjects: allSubjectIds
        });
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    await createRecentActivity({
      title: 'Bulk Sync Subject Templates',
      description: `Synced templates for ${updatedCount} classes in academic year`,
      activityType: ACTIVITY_TYPES.TEMPLATE_APPLIED,
      entityType: ENTITY_TYPES.CLASS,
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      severity: SEVERITY.INFO
    });

    res.json({
      message: `Successfully synced templates for ${updatedCount} classes. ${skippedCount} skipped.`,
      updatedCount,
      skippedCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.syncClassSubjects = async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const beforeSubjectCount = classItem.subjects.length;
    
    const templateSubjectIds = await autoAssignSubjectsFromTemplate(classItem.name, classItem.section);
    
    const students = await Student.find({ classId: classItem._id, isActive: true });
    const languageSet = new Set();
    
    for (const student of students) {
      const languages = [
        student.firstLanguagePaper1,
        student.firstLanguagePaper2,
        student.thirdLanguage,
        student.additionalLanguage
      ].filter(l => l);
      
      for (const lang of languages) {
        if (lang && typeof lang === 'object' && lang.name) {
          languageSet.add(lang.name);
        } else if (lang && typeof lang === 'string') {
          languageSet.add(lang);
        }
      }
    }
    
    const languageSubjectIds = await getOrCreateLanguageSubjects([...languageSet]);
    const allSubjectIds = [...new Set([...templateSubjectIds.map(s => s.toString()), ...languageSubjectIds.map(s => s.toString())])];
    
    await Class.findByIdAndUpdate(classItem._id, {
      subjects: allSubjectIds
    });
    
    const updatedClass = await Class.findById(classItem._id).populate('subjects', 'name code');
    const displayName = await getClassDisplayName(updatedClass);

    await createRecentActivity({
      title: `Subjects Synced: ${displayName}`,
      description: `Subjects for ${displayName} were synced from templates and student languages`,
      activityType: ACTIVITY_TYPES.SUBJECT_SYNCED,
      entityType: ENTITY_TYPES.CLASS,
      entityId: classItem._id,
      entityModel: 'Class',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        className: displayName,
        previousSubjectCount: beforeSubjectCount,
        newSubjectCount: allSubjectIds.length,
        templateSubjects: templateSubjectIds.length,
        languageSubjects: languageSubjectIds.length
      },
      severity: SEVERITY.INFO
    });

    res.json({
      message: `Synced ${allSubjectIds.length} subjects for class`,
      data: {
        ...updatedClass.toObject(),
        displayName
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get or create language subjects
async function getOrCreateLanguageSubjects(languageNames) {
  const subjectIds = [];
  
  for (const langName of languageNames) {
    if (!langName || langName === 'Not Applicable') continue;
    
    let cleanName = langName.trim();
    if (cleanName.includes('(')) {
      cleanName = cleanName.split('(')[0].trim();
    }
    
    const languageMap = {
      'Malayalam': { code: 'MAL', type: 'core' },
      'English': { code: 'ENG', type: 'core' },
      'Hindi': { code: 'HIN', type: 'core' },
      'Arabic': { code: 'ARB', type: 'elective' },
      'Urdu': { code: 'URD', type: 'elective' },
      'Sanskrit': { code: 'SAN', type: 'elective' }
    };
    
    const mapped = languageMap[cleanName];
    let code = cleanName.substring(0, 3).toUpperCase();
    let type = 'elective';
    
    if (mapped) {
      code = mapped.code;
      type = mapped.type;
    }
    
    let subject = await Subject.findOne({ 
      $or: [{ name: cleanName }, { code: code }] 
    });
    
    if (!subject) {
      subject = await Subject.create({
        name: cleanName,
        code: code,
        description: `${cleanName} language`,
        type: type,
        creditHours: cleanName === 'English' || cleanName === 'Malayalam' ? 4 : 3,
        department: 'Languages',
        gradeLevel: 'all'
      });
    }
    
    subjectIds.push(subject._id);
  }
  
  return subjectIds;
}

// ==================== SUBJECT-TEACHER MAPPINGS ====================

exports.assignSubjectTeacher = async (req, res) => {
  try {
    const { subjectId, teacherId, periodsPerWeek } = req.body;
    const classId = req.params.id;
    
    const classItem = await Class.findById(classId);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    if (!classItem.subjects.includes(subjectId)) {
      return res.status(400).json({ message: 'Subject not assigned to this class' });
    }
    
    const teacher = await Staff.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    
    const subject = await Subject.findById(subjectId);
    
    const existingIndex = classItem.subjectTeachers.findIndex(
      st => st.subjectId?.toString() === subjectId
    );
    
    const subjectTeacherData = {
      subjectId,
      teacherId,
      teacherName: teacher.name,
      periodsPerWeek: periodsPerWeek || 1
    };
    
    if (existingIndex >= 0) {
      classItem.subjectTeachers[existingIndex] = subjectTeacherData;
    } else {
      classItem.subjectTeachers.push(subjectTeacherData);
    }
    
    await classItem.save();
    
    // Update StaffAssignment
    let staffAssignment = await StaffAssignment.findOne({
      staffId: teacherId,
      academicYearId: classItem.academicYearId
    });
    
    if (!staffAssignment) {
      staffAssignment = await StaffAssignment.create({
        staffId: teacherId,
        academicYearId: classItem.academicYearId,
        subjectsTaught: []
      });
    }
    
    const subjectAssignmentIndex = staffAssignment.subjectsTaught.findIndex(
      s => s.subjectId?.toString() === subjectId && s.classId?.toString() === classId
    );
    
    const subjectAssignmentData = {
      subjectId,
      subjectName: subject.name,
      subjectCode: subject.code,
      classId,
      className: classItem.name,
      section: classItem.section,
      periodsPerWeek: periodsPerWeek || 1
    };
    
    if (subjectAssignmentIndex >= 0) {
      staffAssignment.subjectsTaught[subjectAssignmentIndex] = subjectAssignmentData;
    } else {
      staffAssignment.subjectsTaught.push(subjectAssignmentData);
    }
    
    await staffAssignment.save();
    
    const displayName = await getClassDisplayName(classItem);
    
    await createRecentActivity({
      title: `Subject Teacher Assigned: ${displayName}`,
      description: `${teacher.name} was assigned to teach ${subject.name} for ${displayName}`,
      activityType: ACTIVITY_TYPES.SUBJECT_TEACHER_ASSIGNED,
      entityType: ENTITY_TYPES.CLASS,
      entityId: classId,
      entityModel: 'Class',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        className: displayName,
        subject: { name: subject.name, code: subject.code },
        teacher: { name: teacher.name, id: teacherId },
        periodsPerWeek: periodsPerWeek || 1
      },
      severity: SEVERITY.INFO
    });
    
    if (teacher.userId) {
      await Notification.create({
        userId: teacher.userId,
        title: 'Subject Assignment',
        message: `You have been assigned to teach ${subject.name} for ${displayName}`,
        type: 'info',
        data: { classId, subjectId, periodsPerWeek }
      });
    }
    
    res.json({
      success: true,
      message: `${teacher.name} assigned to teach ${subject.name} for ${displayName}`,
      subjectTeachers: classItem.subjectTeachers
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.bulkAssignSubjectTeachers = async (req, res) => {
  try {
    const { assignments } = req.body;
    const classId = req.params.id;
    
    const classItem = await Class.findById(classId);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    const results = {
      success: [],
      failed: []
    };
    
    for (const assignment of assignments) {
      try {
        if (!classItem.subjects.includes(assignment.subjectId)) {
          results.failed.push({
            subjectId: assignment.subjectId,
            error: 'Subject not assigned to this class'
          });
          continue;
        }
        
        const teacher = await Staff.findById(assignment.teacherId);
        if (!teacher) {
          results.failed.push({
            subjectId: assignment.subjectId,
            teacherId: assignment.teacherId,
            error: 'Teacher not found'
          });
          continue;
        }
        
        const subject = await Subject.findById(assignment.subjectId);
        
        const existingIndex = classItem.subjectTeachers.findIndex(
          st => st.subjectId?.toString() === assignment.subjectId
        );
        
        const subjectTeacherData = {
          subjectId: assignment.subjectId,
          teacherId: assignment.teacherId,
          teacherName: teacher.name,
          periodsPerWeek: assignment.periodsPerWeek || 1
        };
        
        if (existingIndex >= 0) {
          classItem.subjectTeachers[existingIndex] = subjectTeacherData;
        } else {
          classItem.subjectTeachers.push(subjectTeacherData);
        }
        
        let staffAssignment = await StaffAssignment.findOne({
          staffId: assignment.teacherId,
          academicYearId: classItem.academicYearId
        });
        
        if (!staffAssignment) {
          staffAssignment = await StaffAssignment.create({
            staffId: assignment.teacherId,
            academicYearId: classItem.academicYearId,
            subjectsTaught: []
          });
        }
        
        const subjectAssignmentIndex = staffAssignment.subjectsTaught.findIndex(
          s => s.subjectId?.toString() === assignment.subjectId && s.classId?.toString() === classId
        );
        
        const subjectAssignmentData = {
          subjectId: assignment.subjectId,
          subjectName: subject.name,
          subjectCode: subject.code,
          classId,
          className: classItem.name,
          section: classItem.section,
          periodsPerWeek: assignment.periodsPerWeek || 1
        };
        
        if (subjectAssignmentIndex >= 0) {
          staffAssignment.subjectsTaught[subjectAssignmentIndex] = subjectAssignmentData;
        } else {
          staffAssignment.subjectsTaught.push(subjectAssignmentData);
        }
        
        await staffAssignment.save();
        
        results.success.push({
          subjectId: assignment.subjectId,
          subjectName: subject.name,
          teacherId: assignment.teacherId,
          teacherName: teacher.name,
          periodsPerWeek: assignment.periodsPerWeek || 1
        });
      } catch (error) {
        results.failed.push({
          subjectId: assignment.subjectId,
          teacherId: assignment.teacherId,
          error: error.message
        });
      }
    }
    
    await classItem.save();
    
    const displayName = await getClassDisplayName(classItem);

    if (results.success.length > 0) {
      await createRecentActivity({
        title: `Bulk Subject Teachers Assigned: ${displayName}`,
        description: `${results.success.length} subject teachers were assigned for ${displayName}`,
        activityType: ACTIVITY_TYPES.BULK_SUBJECT_TEACHER_ASSIGNED,
        entityType: ENTITY_TYPES.CLASS,
        entityId: classId,
        entityModel: 'Class',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: {
          className: displayName,
          totalAssigned: results.success.length,
          totalFailed: results.failed.length,
          assignments: results.success.map(a => ({
            subject: a.subjectName,
            teacher: a.teacherName,
            periodsPerWeek: a.periodsPerWeek
          }))
        },
        severity: SEVERITY.SUCCESS
      });
    }
    
    broadcastToClass(classId, 'subject-teachers:updated', {
      classId,
      className: displayName,
      assignments: results.success.length,
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      message: `Assigned ${results.success.length} teachers, ${results.failed.length} failed`,
      displayName,
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.removeSubjectTeacher = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const classId = req.params.id;
    
    const classItem = await Class.findById(classId);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    const removedTeacher = classItem.subjectTeachers.find(
      st => st.subjectId?.toString() === subjectId
    );
    
    const subject = await Subject.findById(subjectId);
    
    classItem.subjectTeachers = classItem.subjectTeachers.filter(
      st => st.subjectId?.toString() !== subjectId
    );
    
    await classItem.save();
    
    if (removedTeacher && removedTeacher.teacherId) {
      const staffAssignment = await StaffAssignment.findOne({
        staffId: removedTeacher.teacherId,
        academicYearId: classItem.academicYearId
      });
      
      if (staffAssignment) {
        staffAssignment.subjectsTaught = staffAssignment.subjectsTaught.filter(
          s => !(s.subjectId?.toString() === subjectId && s.classId?.toString() === classId)
        );
        await staffAssignment.save();
      }
    }
    
    const displayName = await getClassDisplayName(classItem);

    if (removedTeacher) {
      await createRecentActivity({
        title: `Subject Teacher Removed: ${displayName}`,
        description: `${removedTeacher.teacherName} was removed from teaching ${subject?.name || 'a subject'} in ${displayName}`,
        activityType: ACTIVITY_TYPES.SUBJECT_TEACHER_REMOVED,
        entityType: ENTITY_TYPES.CLASS,
        entityId: classId,
        entityModel: 'Class',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: {
          className: displayName,
          subject: subject ? { name: subject.name, code: subject.code } : { id: subjectId },
          teacher: { name: removedTeacher.teacherName, id: removedTeacher.teacherId }
        },
        severity: SEVERITY.INFO
      });
    }
    
    res.json({
      success: true,
      message: 'Teacher removed from subject',
      subjectTeachers: classItem.subjectTeachers
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getClassSubjectTeachers = async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id)
      .populate('subjectTeachers.teacherId', 'name email contact qualification photoUrl')
      .populate('subjectTeachers.subjectId', 'name code type creditHours');
    
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    const bySubjectType = {};
    
    for (const st of classItem.subjectTeachers) {
      const type = st.subjectId?.type || 'other';
      if (!bySubjectType[type]) {
        bySubjectType[type] = [];
      }
      bySubjectType[type].push({
        subject: st.subjectId,
        teacher: st.teacherId,
        periodsPerWeek: st.periodsPerWeek
      });
    }
    
    const subjectsWithTeachers = classItem.subjectTeachers.map(st => st.subjectId?.toString()).filter(Boolean);
    const subjectsWithoutTeachers = classItem.subjects.filter(
      s => !subjectsWithTeachers.includes(s?.toString())
    );
    
    const populatedSubjects = await Subject.find({
      _id: { $in: subjectsWithoutTeachers }
    }).select('name code type creditHours');
    
    const displayName = await getClassDisplayName(classItem);
    
    res.json({
      class: {
        _id: classItem._id,
        name: classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name,
        displayName,
        classTeacher: classItem.classTeacherId ? {
          _id: classItem.classTeacherId,
          name: classItem.classTeacherName
        } : null
      },
      subjectTeachers: classItem.subjectTeachers,
      bySubjectType,
      subjectsWithoutTeachers: populatedSubjects,
      totalSubjects: classItem.subjects.length,
      assignedTeachers: classItem.subjectTeachers.length,
      unassignedSubjects: populatedSubjects.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllClassesSubjectTeachers = async (req, res) => {
  try {
    const { academicYearId } = req.params;
    
    const classes = await Class.find({ academicYearId, isActive: true })
      .populate('subjectTeachers.teacherId', 'name staffCode')
      .populate('subjectTeachers.subjectId', 'name code type')
      .populate('classTeacherId', 'name staffCode')
      .sort({ name: 1, section: 1 });
    
    const result = await Promise.all(classes.map(async (c) => {
      const displayName = await getClassDisplayName(c);
      return {
        _id: c._id,
        name: c.section ? `${c.name}-${c.section}` : c.name,
        displayName,
        classTeacher: c.classTeacherId,
        subjectTeachers: c.subjectTeachers.map(st => ({
          subject: st.subjectId,
          teacher: st.teacherId,
          periodsPerWeek: st.periodsPerWeek
        })),
        totalSubjects: c.subjects.length,
        assignedTeachers: c.subjectTeachers.length
      };
    }));
    
    res.json({
      academicYearId,
      totalClasses: result.length,
      classes: result
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTeacherClassesAndSubjects = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { academicYearId } = req.query;
    
    let yearId = academicYearId;
    if (!yearId) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      yearId = currentYear?._id;
    }
    
    if (!yearId) {
      return res.status(400).json({ message: 'Academic year ID is required' });
    }
    
    const classes = await Class.find({
      academicYearId: yearId,
      'subjectTeachers.teacherId': teacherId
    })
      .populate('subjectTeachers.subjectId', 'name code type')
      .select('name section subjectTeachers');
    
    const result = classes.map(c => ({
      classId: c._id,
      className: c.section ? `${c.name}-${c.section}` : c.name,
      subjects: c.subjectTeachers
        .filter(st => st.teacherId?.toString() === teacherId)
        .map(st => ({
          subjectId: st.subjectId?._id,
          subjectName: st.subjectId?.name,
          subjectCode: st.subjectId?.code,
          subjectType: st.subjectId?.type,
          periodsPerWeek: st.periodsPerWeek
        }))
    }));
    
    const classTeacherOf = await Class.findOne({
      academicYearId: yearId,
      classTeacherId: teacherId
    }).select('name section');
    
    const teacher = await Staff.findById(teacherId).select('name staffCode');
    
    const totalPeriodsPerWeek = result.reduce((sum, c) => 
      sum + c.subjects.reduce((s, subj) => s + (subj.periodsPerWeek || 0), 0), 0
    );
    
    res.json({
      teacher: {
        _id: teacherId,
        name: teacher?.name,
        staffCode: teacher?.staffCode
      },
      academicYearId: yearId,
      classes: result,
      classTeacherOf: classTeacherOf ? {
        classId: classTeacherOf._id,
        className: classTeacherOf.section ? `${classTeacherOf.name}-${classTeacherOf.section}` : classTeacherOf.name
      } : null,
      summary: {
        totalClasses: result.length,
        totalSubjects: result.reduce((sum, c) => sum + c.subjects.length, 0),
        totalPeriodsPerWeek
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Sync language subjects for a class
exports.syncLanguageSubjects = async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    const beforeCount = classItem.subjects.length;
    
    // Get language subjects from students
    const students = await Student.find({ classId: classItem._id, isActive: true });
    const languageSet = new Set();
    
    for (const student of students) {
      const languages = [
        student.firstLanguagePaper1,
        student.firstLanguagePaper2,
        student.thirdLanguage,
        student.additionalLanguage
      ].filter(l => l);
      
      for (const lang of languages) {
        if (lang && typeof lang === 'object' && lang.name) {
          languageSet.add(lang.name);
        } else if (lang && typeof lang === 'string') {
          languageSet.add(lang);
        }
      }
    }
    
    const languageSubjectIds = await getOrCreateLanguageSubjects([...languageSet]);
    
    // Add language subjects to class
    await Class.findByIdAndUpdate(classItem._id, {
      $addToSet: { subjects: { $each: languageSubjectIds } }
    });
    
    const updatedClass = await Class.findById(classItem._id);
    const displayName = await getClassDisplayName(updatedClass);
    
    await createRecentActivity({
      title: `Language Subjects Synced: ${displayName}`,
      description: `Language subjects were synced for the class`,
      activityType: ACTIVITY_TYPES.LANGUAGE_SUBJECTS_SYNCED,
      entityType: ENTITY_TYPES.CLASS,
      entityId: classItem._id,
      entityModel: 'Class',
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        className: classItem.name,
        section: classItem.section,
        previousSubjectCount: beforeCount,
        newSubjectCount: updatedClass.subjects.length,
        languageSubjects: languageSubjectIds.length
      },
      severity: SEVERITY.INFO
    });
    
    res.json({
      success: true,
      message: 'Language subjects synced successfully',
      data: {
        classId: classItem._id,
        className: displayName,
        languageSubjectsAdded: languageSubjectIds.length,
        totalSubjects: updatedClass.subjects.length,
        languageSubjectIds
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Sync language subjects for all classes in an academic year
exports.syncAllClassesLanguageSubjects = async (req, res) => {
  try {
    const { academicYearId } = req.params;
    
    const classes = await Class.find({ academicYearId, isActive: true });
    const results = [];
    
    for (const classItem of classes) {
      try {
        const students = await Student.find({ classId: classItem._id, isActive: true });
        const languageSet = new Set();
        
        for (const student of students) {
          const languages = [
            student.firstLanguagePaper1,
            student.firstLanguagePaper2,
            student.thirdLanguage,
            student.additionalLanguage
          ].filter(l => l);
          
          for (const lang of languages) {
            if (lang && typeof lang === 'object' && lang.name) {
              languageSet.add(lang.name);
            } else if (lang && typeof lang === 'string') {
              languageSet.add(lang);
            }
          }
        }
        
        const languageSubjectIds = await getOrCreateLanguageSubjects([...languageSet]);
        
        await Class.findByIdAndUpdate(classItem._id, {
          $addToSet: { subjects: { $each: languageSubjectIds } }
        });
        
        results.push({
          classId: classItem._id,
          className: classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name,
          success: true,
          languageSubjectsAdded: languageSubjectIds.length
        });
      } catch (error) {
        results.push({
          classId: classItem._id,
          className: classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name,
          success: false,
          error: error.message
        });
      }
    }
    
    await createRecentActivity({
      title: `All Classes Language Subjects Synced`,
      description: `Language subjects were synced for ${results.length} classes in academic year`,
      activityType: ACTIVITY_TYPES.BULK_LANGUAGE_SUBJECTS_SYNCED,
      entityType: ENTITY_TYPES.SYSTEM,
      entityId: null,
      entityModel: null,
      performedBy: req.user._id,
      performedByName: req.user.name,
      performedByRole: req.user.role,
      details: {
        academicYearId,
        totalClasses: results.length,
        classesUpdated: results.filter(r => r.success).length
      },
      severity: SEVERITY.INFO
    });
    
    res.json({
      success: true,
      message: `Synced language subjects for ${results.length} classes`,
      data: results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get language subjects for a class
exports.getClassLanguageSubjects = async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id);
    if (!classItem) {
      return res.status(404).json({ message: 'Class not found' });
    }
    
    // Get core subjects (non-language)
    const coreSubjects = await Subject.find({
      _id: { $in: classItem.subjects },
      type: { $ne: 'elective' }
    }).select('name code type creditHours');
    
    // Get language subjects
    const languageSubjects = await Subject.find({
      _id: { $in: classItem.subjects },
      $or: [
        { type: 'elective' },
        { name: { $in: ['Malayalam', 'English', 'Hindi', 'Arabic', 'Urdu', 'Sanskrit'] } }
      ]
    }).select('name code type creditHours');
    
    // Get student-wise language distribution
    const students = await Student.find({ classId: classItem._id, status: 'active' })
      .select('fullName studentCode firstLanguagePaper1 firstLanguagePaper2 thirdLanguage additionalLanguage')
      .populate('firstLanguagePaper1', 'name code')
      .populate('firstLanguagePaper2', 'name code')
      .populate('thirdLanguage', 'name code')
      .populate('additionalLanguage', 'name code');
    
    const languageDistribution = {};
    students.forEach(student => {
      const languages = [
        student.firstLanguagePaper1,
        student.firstLanguagePaper2,
        student.thirdLanguage,
        student.additionalLanguage
      ].filter(l => l);
      
      languages.forEach(lang => {
        const langId = lang._id.toString();
        if (!languageDistribution[langId]) {
          languageDistribution[langId] = {
            subject: lang,
            count: 0,
            students: []
          };
        }
        languageDistribution[langId].count++;
        languageDistribution[langId].students.push({
          studentId: student._id,
          studentName: student.fullName,
          studentCode: student.studentCode
        });
      });
    });
    
    const displayName = await getClassDisplayName(classItem);
    
    res.json({
      success: true,
      data: {
        classId: classItem._id,
        className: displayName,
        coreSubjects,
        languageSubjects,
        languageDistribution: Object.values(languageDistribution),
        summary: {
          totalStudents: students.length,
          coreSubjectCount: coreSubjects.length,
          languageSubjectCount: languageSubjects.length,
          totalSubjectCount: classItem.subjects.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// controllers/classController.js
// Add this function to your existing classController.js

// Get classes where teacher is class teacher ONLY (not subject teacher)
exports.getTeacherClassTeacherClasses = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { academicYearId } = req.query;
    
    console.log('getTeacherClassTeacherClasses called with:', { teacherId, academicYearId });
    
    let yearId = academicYearId;
    if (!yearId) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      yearId = currentYear?._id;
    }
    
    if (!yearId) {
      return res.status(400).json({ message: 'Academic year not found' });
    }
    
    // Find classes where this teacher is class teacher ONLY
    const classes = await Class.find({
      classTeacherId: teacherId,
      academicYearId: yearId,
      isActive: true
    }).populate('subjects', 'name code');
    
    console.log(`Found ${classes.length} classes where teacher ${teacherId} is class teacher`);
    
    // Add student count to each class
    const classesWithCount = await Promise.all(classes.map(async (cls) => {
      const studentCount = await Student.countDocuments({ 
        classId: cls._id, 
        isActive: true 
      });
      return {
        ...cls.toObject(),
        studentCount
      };
    }));
    
    res.json({
      success: true,
      data: classesWithCount,
      summary: {
        totalClasses: classesWithCount.length,
        academicYearId: yearId
      }
    });
  } catch (error) {
    console.error('Error in getTeacherClassTeacherClasses:', error);
    res.status(500).json({ message: error.message });
  }
};

// Keep the original getTeacherClasses for subject teachers if needed
exports.getTeacherClasses = async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { academicYearId } = req.query;
    
    let yearId = academicYearId;
    if (!yearId) {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      yearId = currentYear?._id;
    }
    
    if (!yearId) {
      return res.status(400).json({ message: 'Academic year not found' });
    }
    
    // Find classes where this teacher is class teacher
    const classTeacherClasses = await Class.find({
      classTeacherId: teacherId,
      academicYearId: yearId,
      isActive: true
    }).populate('subjects', 'name code');
    
    // Find classes where this teacher teaches subjects
    const subjectTeacherClasses = await Class.find({
      'subjectTeachers.teacherId': teacherId,
      academicYearId: yearId,
      isActive: true
    }).populate('subjects', 'name code');
    
    // Combine and deduplicate
    const allClasses = [...classTeacherClasses, ...subjectTeacherClasses];
    const uniqueClasses = Array.from(new Map(allClasses.map(c => [c._id.toString(), c])).values());
    
    // Add student count to each class
    const classesWithCount = await Promise.all(uniqueClasses.map(async (cls) => {
      const studentCount = await Student.countDocuments({ 
        classId: cls._id, 
        isActive: true 
      });
      return {
        ...cls.toObject(),
        studentCount,
        isClassTeacher: classTeacherClasses.some(c => c._id.toString() === cls._id.toString()),
        isSubjectTeacher: subjectTeacherClasses.some(c => c._id.toString() === cls._id.toString())
      };
    }));
    
    res.json({
      success: true,
      data: classesWithCount,
      summary: {
        totalClasses: classesWithCount.length,
        asClassTeacher: classTeacherClasses.length,
        asSubjectTeacher: subjectTeacherClasses.length,
        academicYearId: yearId
      }
    });
  } catch (error) {
    console.error('Error in getTeacherClasses:', error);
    res.status(500).json({ message: error.message });
  }
};

// Export helper functions
module.exports.autoAssignSubjectsFromTemplate = autoAssignSubjectsFromTemplate;
module.exports.getOrCreateLanguageSubjects = getOrCreateLanguageSubjects;
module.exports.getClassDisplayName = getClassDisplayName;