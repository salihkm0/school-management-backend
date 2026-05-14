const { Exam, EXAM_TYPES, SESSION_TIMES, SUBMISSION_STATUS } = require('../models/Exam');
const Mark = require('../models/Mark');
const ExamResult = require('../models/ExamResult');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Staff = require('../models/Staff');
const StaffAssignment = require('../models/StaffAssignment');
const AcademicYear = require('../models/AcademicYear');
const Subject = require('../models/Subject');
const Notification = require('../models/Notification');
const { broadcastToClass, broadcastToUser, broadcastToRole } = require('../config/socket');

// Helper: Send exam notification to class
async function sendExamNotificationToClass(classId, examId, examName, title, message, type, data) {
  try {
    const students = await Student.find({ classId }).select('parentIds');
    const parentIds = [...new Set(students.flatMap(s => s.parentIds))];
    
    const classItem = await Class.findById(classId).select('classTeacherId');
    if (classItem?.classTeacherId) {
      parentIds.push(classItem.classTeacherId);
    }
    
    for (const userId of parentIds) {
      const notification = await Notification.create({
        userId,
        title,
        message,
        type,
        data: { ...data, examId, examName, classId }
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
    console.error('Error sending exam notification:', error);
  }
}

// Helper: Format exam response
async function formatExamResponse(exam) {
  const examObj = exam.toObject();
  
  if (examObj.classIds && examObj.classIds.length > 0 && !examObj.classIds[0].name) {
    const classes = await Class.find({ _id: { $in: examObj.classIds } }).select('name section displayName');
    examObj.classes = classes;
  }
  
  if (examObj.schedule && examObj.schedule.length > 0) {
    examObj.schedule = examObj.schedule.map(s => ({
      ...s,
      sessionLabel: {
        BF: 'Before Noon (9:00 AM - 12:00 PM)',
        AF: 'After Noon (2:00 PM - 5:00 PM)',
        FULL: 'Full Day (9:00 AM - 5:00 PM)'
      }[s.session] || s.session,
      hasPractical: (s.practicalMarks || 0) > 0,
      hasCE: s.ceEnabled || false,
      ceComponents: s.ceComponents || []
    }));
  }
  
  return examObj;
}

// Helper function: Auto-populate subjects from classes
async function autoPopulateSubjectsFromClasses(classIds, providedSchedule = null) {
  const classes = await Class.find({ _id: { $in: classIds } })
    .populate('subjects', 'name code type department');
  
  const subjectMap = new Map();
  
  classes.forEach(cls => {
    cls.subjects.forEach(subject => {
      const subjectId = subject._id.toString();
      
      if (!subjectMap.has(subjectId)) {
        const isLanguage = subject.department === 'Languages';
        
        subjectMap.set(subjectId, {
          subjectId: subject._id,
          subjectName: subject.name,
          subjectCode: subject.code,
          termMaxMarks: isLanguage ? 50 : 80,
          termPassingMarks: isLanguage ? 20 : 32,
          theoryMaxMarks: isLanguage ? 50 : 80,
          practicalMaxMarks: 0,
          ceEnabled: false,
          ceMaxMarks: 0,
          cePassingMarks: 0,
          ceComponents: [],
          termWeightage: 80,
          ceWeightage: 20,
          isLanguageSubject: isLanguage,
          hasPractical: false,
          totalMaxMarks: isLanguage ? 50 : 80,
          totalPassingMarks: isLanguage ? 20 : 32
        });
      }
    });
  });
  
  // Override with provided schedule if available
  if (providedSchedule && providedSchedule.length > 0) {
    providedSchedule.forEach(s => {
      const subjectId = s.subjectId.toString();
      if (subjectMap.has(subjectId)) {
        const subject = subjectMap.get(subjectId);
        subject.termMaxMarks = s.termMaxMarks || s.maxMarks || subject.termMaxMarks;
        subject.termPassingMarks = s.termPassingMarks || s.passingMarks || subject.termPassingMarks;
        subject.theoryMaxMarks = s.theoryMarks || subject.theoryMaxMarks;
        subject.practicalMaxMarks = s.practicalMarks || subject.practicalMaxMarks;
        subject.ceEnabled = s.ceEnabled || false;
        subject.ceMaxMarks = s.ceMaxMarks || 0;
        subject.cePassingMarks = s.cePassingMarks || 0;
        subject.ceComponents = s.ceComponents || [];
        subject.hasPractical = (s.practicalMarks || 0) > 0;
        subject.totalMaxMarks = (subject.termMaxMarks || 0) + (subject.ceMaxMarks || 0);
        subject.totalPassingMarks = (subject.termPassingMarks || 0) + (subject.cePassingMarks || 0);
      }
    });
  }
  
  return Array.from(subjectMap.values());
}

// Helper to build schedule with full subject details
async function buildScheduleWithSubjects(schedule, classIds) {
  const enrichedSchedule = [];
  const subjectMap = new Map();
  
  const classes = await Class.find({ _id: { $in: classIds } })
    .populate('subjects', 'name code type department');
  
  classes.forEach(cls => {
    cls.subjects.forEach(subject => {
      subjectMap.set(subject._id.toString(), subject);
    });
  });
  
  for (const s of schedule) {
    let subject = subjectMap.get(s.subjectId.toString());
    
    if (!subject) {
      subject = await Subject.findById(s.subjectId);
    }
    
    const isLanguage = subject?.department === 'Languages';
    const hasPractical = (s.practicalMarks || 0) > 0;
    const ceEnabled = s.ceEnabled || false;
    
    enrichedSchedule.push({
      subjectId: s.subjectId,
      subjectName: subject?.name || s.subjectName,
      subjectCode: subject?.code || s.subjectCode,
      examDate: new Date(s.examDate),
      session: s.session || 'BF',
      startTime: s.startTime || '09:00 AM',
      endTime: s.endTime || '12:00 PM',
      duration: s.duration || (s.session === 'FULL' ? 480 : 180),
      termMaxMarks: s.termMaxMarks || s.maxMarks || (isLanguage ? 50 : 80),
      termPassingMarks: s.termPassingMarks || s.passingMarks || (isLanguage ? 20 : 32),
      theoryMarks: s.theoryMarks || s.termMaxMarks || s.maxMarks || (isLanguage ? 50 : 80),
      practicalMarks: s.practicalMarks || 0,
      hasPractical: hasPractical,
      ceEnabled: ceEnabled,
      ceMaxMarks: s.ceMaxMarks || 0,
      cePassingMarks: s.cePassingMarks || 0,
      roomNumber: s.roomNumber,
      building: s.building,
      invigilators: s.invigilators || [],
      invigilatorNames: s.invigilatorNames || [],
      notes: s.notes,
      isAbsentAllowed: s.isAbsentAllowed !== false,
      graceTime: s.graceTime || 0
    });
  }
  
  return enrichedSchedule;
}

// Helper: Get class names for status
async function getClassNamesForStatus(classIds) {
  const classes = await Class.find({ _id: { $in: classIds } }).select('name section displayName');
  const classMap = new Map();
  classes.forEach(c => {
    classMap.set(c._id.toString(), c.displayName || (c.section ? `${c.name}-${c.section}` : c.name));
  });
  return classMap;
}

// ==================== API ENDPOINTS ====================

// Get all exams with filtering
exports.getExams = async (req, res) => {
  try {
    const { 
      classId, 
      academicYearId, 
      academicYear, 
      examType, 
      term, 
      overallStatus,
      isActive, 
      page = 1, 
      limit = 20 
    } = req.query;
    
    const query = { isActive: true };
    if (classId) query.classIds = classId;
    if (academicYearId) query.academicYearId = academicYearId;
    if (academicYear) query.academicYear = academicYear;
    if (examType) query.examType = examType;
    if (term) query.term = term;
    if (overallStatus) query.overallStatus = overallStatus;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const exams = await Exam.find(query)
      .populate('classIds', 'name section displayName')
      .populate('academicYearId', 'year name')
      .populate('subjects.subjectId', 'name code')
      .populate('createdBy', 'name')
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Exam.countDocuments(query);
    
    // Enhance exams with schedule details
    const formattedExams = await Promise.all(exams.map(async (exam) => {
      const examObj = await formatExamResponse(exam);
      
      // Add summary stats
      const totalStudents = await Student.countDocuments({
        classId: { $in: exam.classIds },
        status: 'active'
      });
      
      return {
        ...examObj,
        summary: {
          totalClasses: exam.classIds.length,
          totalSubjects: exam.subjects.length,
          totalStudents,
          hasPractical: exam.schedule.some(s => s.practicalMarks > 0),
          hasCE: exam.ceConfig?.enabled || exam.subjects.some(s => s.ceEnabled)
        }
      };
    }));

    res.json({
      success: true,
      data: formattedExams,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error in getExams:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get exam by ID with full details
exports.getExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('academicYearId', 'name year startDate endDate')
      .populate('classIds', 'name section displayName')
      .populate('subjects.subjectId', 'name code type department creditHours')
      .populate('schedule.subjectId', 'name code')
      .populate('schedule.invigilators', 'name staffCode')
      .populate('classSubmissionStatus.submittedBy', 'name')
      .populate('classSubmissionStatus.reviewedBy', 'name')
      .populate('createdBy', 'name email');

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    // Update submission stats for each class
    for (const classStatus of exam.classSubmissionStatus) {
      await exam.updateClassSubmissionStats(classStatus.classId);
    }
    
    // Get class details with student counts
    const classDetails = await Promise.all(exam.classIds.map(async (classItem) => {
      const studentCount = await Student.countDocuments({ 
        classId: classItem._id, 
        status: 'active' 
      });
      
      const submissionStatus = exam.classSubmissionStatus.find(
        cs => cs.classId.toString() === classItem._id.toString()
      );
      
      const marksEntered = await Mark.countDocuments({
        examId: exam._id,
        classId: classItem._id
      });
      
      const totalExpectedMarks = studentCount * exam.subjects.length;
      
      return {
        classId: classItem._id,
        className: classItem.name,
        section: classItem.section,
        displayName: classItem.displayName || (classItem.section ? `${classItem.name}-${classItem.section}` : classItem.name),
        studentCount,
        status: submissionStatus?.status || 'draft',
        submissionStatus: submissionStatus,
        marksEntryStats: {
          totalStudents: studentCount,
          marksEntered,
          marksPending: totalExpectedMarks - marksEntered,
          completionPercentage: totalExpectedMarks > 0 ? (marksEntered / totalExpectedMarks) * 100 : 0
        }
      };
    }));
    
    // Enhance schedule with detailed information
    const enhancedSchedule = exam.schedule.map(schedule => ({
      ...schedule.toObject(),
      sessionLabel: {
        BF: 'Before Noon (9:00 AM - 12:00 PM)',
        AF: 'After Noon (2:00 PM - 5:00 PM)',
        FULL: 'Full Day (9:00 AM - 5:00 PM)'
      }[schedule.session],
      hasPractical: (schedule.practicalMarks || 0) > 0,
      practicalMarks: schedule.practicalMarks || 0,
      theoryMarks: schedule.theoryMarks || schedule.termMaxMarks || 0,
      hasCE: schedule.ceEnabled || false,
      ceMaxMarks: schedule.ceMaxMarks || 0,
      cePassingMarks: schedule.cePassingMarks || 0,
      totalMaxMarks: (schedule.termMaxMarks || 0) + (schedule.ceMaxMarks || 0),
      totalPassingMarks: (schedule.termPassingMarks || 0) + (schedule.cePassingMarks || 0)
    }));
    
    // Enhance subjects with schedule info
    const enhancedSubjects = exam.subjects.map(subject => {
      const scheduleInfo = exam.schedule.find(s => s.subjectId.toString() === subject.subjectId.toString());
      return {
        ...subject.toObject(),
        schedule: scheduleInfo ? {
          examDate: scheduleInfo.examDate,
          session: scheduleInfo.session,
          sessionLabel: {
            BF: 'Before Noon (9:00 AM - 12:00 PM)',
            AF: 'After Noon (2:00 PM - 5:00 PM)',
            FULL: 'Full Day (9:00 AM - 5:00 PM)'
          }[scheduleInfo.session],
          duration: scheduleInfo.duration,
          roomNumber: scheduleInfo.roomNumber,
          building: scheduleInfo.building
        } : null,
        hasPractical: (subject.practicalMaxMarks || 0) > 0,
        hasCE: subject.ceEnabled || false
      };
    });
    
    const formattedExam = await formatExamResponse(exam);
    
    res.json({
      success: true,
      data: {
        ...formattedExam,
        classDetails,
        enhancedSchedule,
        enhancedSubjects,
        summary: {
          totalClasses: exam.classIds.length,
          totalSubjects: exam.subjects.length,
          totalMarks: exam.totalMaxMarks,
          hasPractical: exam.schedule.some(s => s.practicalMarks > 0),
          hasCE: exam.ceConfig?.enabled || exam.subjects.some(s => s.ceEnabled),
          totalStudents: classDetails.reduce((sum, c) => sum + c.studentCount, 0),
          classesSubmitted: exam.classSubmissionStatus.filter(cs => cs.status === 'submitted' || cs.status === 'reviewed').length,
          classesReviewed: exam.classSubmissionStatus.filter(cs => cs.status === 'reviewed').length,
          overallCompletion: classDetails.length > 0 
            ? classDetails.reduce((sum, c) => sum + (c.marksEntryStats?.completionPercentage || 0), 0) / classDetails.length 
            : 0
        }
      }
    });
  } catch (error) {
    console.error('Error in getExam:', error);
    res.status(500).json({ message: error.message });
  }
};

// Create new exam - COMPLETE VERSION with subject-level CE
exports.createExam = async (req, res) => {
  try {
    const {
      name,
      examType,
      description,
      academicYearId,
      term,
      classIds,
      subjects,
      schedule,
      schedulingMode,
      startDate,
      endDate,
      settings,
      globalCeConfig,
      termEntryDeadline,
      resultDeclarationDate
    } = req.body;

    // Validate academic year
    const academicYear = await AcademicYear.findById(academicYearId);
    if (!academicYear) {
      return res.status(404).json({ message: 'Academic year not found' });
    }

    // Validate schedule for subject-wise scheduling
    if (schedulingMode === 'subject_schedule' || !schedulingMode) {
      if (!schedule || schedule.length === 0) {
        return res.status(400).json({ message: 'Schedule is required for subject-wise scheduling' });
      }
    }

    // Prepare exam data
    const examData = {
      name: examType === 'custom' ? name : `${examType}_exam`,
      examType,
      description,
      academicYearId,
      academicYear: academicYear.year,
      term,
      classIds,
      schedulingMode: schedulingMode || 'subject_schedule',
      settings: settings || {},
      createdBy: req.user.id,
      termEntryDeadline: termEntryDeadline ? new Date(termEntryDeadline) : null,
      resultDeclarationDate: resultDeclarationDate ? new Date(resultDeclarationDate) : null,
      globalCeConfig: globalCeConfig || { enabled: false }
    };

    // Handle date range scheduling
    if (schedulingMode === 'date_range') {
      examData.startDate = new Date(startDate);
      examData.endDate = new Date(endDate);
      
      // Auto-populate subjects from classes
      if (!subjects || subjects.length === 0) {
        examData.subjects = await autoPopulateSubjectsFromClasses(classIds);
      } else {
        examData.subjects = subjects;
      }
      examData.schedule = [];
    } 
    // Handle subject-wise scheduling with subject-level CE
    else {
      const enrichedSchedule = [];
      
      for (const s of schedule) {
        // Get subject details if not provided
        let subject = null;
        if (!s.subjectName) {
          subject = await Subject.findById(s.subjectId);
        }
        
        // Parse marks
        const maxMarks = parseInt(s.maxMarks) || 100;
        const passingMarks = parseInt(s.passingMarks) || Math.floor(maxMarks * 0.4);
        const practicalMarks = parseInt(s.practicalMarks) || 0;
        const theoryMarks = maxMarks - practicalMarks;
        
        // Validate exam date
        let examDate = new Date(s.examDate);
        if (isNaN(examDate.getTime())) {
          return res.status(400).json({ 
            message: `Invalid exam date for subject ${subject?.name || s.subjectName}` 
          });
        }
        
        // Subject-level CE configuration (PER SUBJECT)
        const ceEnabled = s.ceEnabled || false;
        const ceMaxMarks = ceEnabled ? (parseInt(s.ceMaxMarks) || 20) : 0;
        const cePassingMarks = ceEnabled ? (parseInt(s.cePassingMarks) || 8) : 0;
        
        // CE Components for this specific subject
        const ceComponents = (s.ceComponents || [])
          .filter(c => c.name && c.name.trim())
          .map(comp => ({
            name: comp.name,
            maxMarks: parseInt(comp.maxMarks) || 0,
            weightage: parseInt(comp.weightage) || 0
          }));
        
        const scheduleItem = {
          // Basic subject info
          subjectId: s.subjectId,
          subjectName: subject?.name || s.subjectName,
          subjectCode: subject?.code || s.subjectCode,
          
          // Schedule details
          examDate: examDate,
          session: s.session || 'BF',
          startTime: s.startTime || (s.session === 'BF' ? '09:00 AM' : s.session === 'AF' ? '02:00 PM' : '09:00 AM'),
          endTime: s.endTime || (s.session === 'BF' ? '12:00 PM' : s.session === 'AF' ? '05:00 PM' : '05:00 PM'),
          duration: s.duration || (s.session === 'FULL' ? 480 : 180),
          
          // Term marks configuration
          maxMarks: maxMarks,
          passingMarks: passingMarks,
          theoryMarks: theoryMarks,
          practicalMarks: practicalMarks,
          hasPractical: practicalMarks > 0,
          termMaxMarks: maxMarks,
          termPassingMarks: passingMarks,
          termWeightage: 80,
          
          // Subject-level CE configuration
          ceEnabled: ceEnabled,
          ceMaxMarks: ceMaxMarks,
          cePassingMarks: cePassingMarks,
          ceComponents: ceComponents,
          ceWeightage: 20,
          
          // Logistics
          roomNumber: s.roomNumber || '',
          building: s.building || '',
          invigilators: s.invigilators || [],
          invigilatorNames: s.invigilatorNames || [],
          notes: s.notes || '',
          isAbsentAllowed: s.isAbsentAllowed !== false,
          graceTime: s.graceTime || 0
        };
        
        enrichedSchedule.push(scheduleItem);
      }
      
      examData.schedule = enrichedSchedule;
      
      // Calculate exam date range from schedule
      const dates = enrichedSchedule.map(s => new Date(s.examDate));
      examData.startDate = new Date(Math.min(...dates));
      examData.endDate = new Date(Math.max(...dates));
      
      // Build subjects array from schedule with subject-level CE
      const subjectMap = new Map();
      for (const s of enrichedSchedule) {
        const subjectKey = s.subjectId.toString();
        if (!subjectMap.has(subjectKey)) {
          const isLanguage = s.subjectCode && ['MAL', 'ENG', 'HIN', 'ARB', 'URD'].includes(s.subjectCode);
          
          subjectMap.set(subjectKey, {
            subjectId: s.subjectId,
            subjectName: s.subjectName,
            subjectCode: s.subjectCode,
            termMaxMarks: s.maxMarks,
            termPassingMarks: s.passingMarks,
            theoryMaxMarks: s.theoryMarks,
            practicalMaxMarks: s.practicalMarks,
            hasPractical: s.practicalMarks > 0,
            // Subject-level CE
            ceEnabled: s.ceEnabled,
            ceMaxMarks: s.ceMaxMarks,
            cePassingMarks: s.cePassingMarks,
            ceComponents: s.ceComponents || [],
            totalMaxMarks: (s.maxMarks || 0) + (s.ceMaxMarks || 0),
            totalPassingMarks: (s.passingMarks || 0) + (s.cePassingMarks || 0),
            weightage: 100,
            termWeightage: 80,
            ceWeightage: 20,
            isLanguageSubject: isLanguage
          });
        }
      }
      examData.subjects = Array.from(subjectMap.values());
    }

    // Build class submission status
    const classNamesMap = await getClassNamesForStatus(classIds);
    examData.classSubmissionStatus = await Promise.all(classIds.map(async (classId) => {
      const totalStudents = await Student.countDocuments({ classId, status: 'active' });
      const totalSubjects = examData.subjects.length;
      
      return {
        classId,
        className: classNamesMap.get(classId.toString()) || 'Unknown',
        classDisplayName: classNamesMap.get(classId.toString()) || 'Unknown',
        status: 'draft',
        totalStudents: totalStudents,
        marksEntryStats: {
          totalStudents: totalStudents,
          termMarksEntered: 0,
          ceMarksEntered: 0,
          marksPending: totalStudents * totalSubjects,
          completionPercentage: 0
        }
      };
    }));

    // Create the exam
    const exam = await Exam.create(examData);

    // Populate references for response
    const populatedExam = await Exam.findById(exam._id)
      .populate('classIds', 'name section displayName')
      .populate('academicYearId', 'year name')
      .populate('subjects.subjectId', 'name code type department')
      .populate('schedule.subjectId', 'name code')
      .populate('createdBy', 'name email');

    // Send notifications to classes
    for (const classId of exam.classIds) {
      const classItem = await Class.findById(classId);
      if (classItem) {
        let message = '';
        if (schedulingMode === 'date_range') {
          message = `${exam.displayName} has been scheduled from ${new Date(exam.startDate).toLocaleDateString()} to ${new Date(exam.endDate).toLocaleDateString()}.`;
        } else {
          const subjectCount = exam.schedule.length;
          const practicalCount = exam.schedule.filter(s => s.practicalMarks > 0).length;
          const ceEnabledCount = exam.schedule.filter(s => s.ceEnabled).length;
          message = `${exam.displayName} has been scheduled with ${subjectCount} subjects.`;
          if (practicalCount > 0) message += ` Includes ${practicalCount} practical exams.`;
          if (ceEnabledCount > 0) message += ` ${ceEnabledCount} subjects have CE components.`;
        }
        
        await sendExamNotificationToClass(
          classId,
          exam._id,
          exam.displayName,
          `📚 New Exam: ${exam.displayName}`,
          message,
          'exam',
          { 
            startDate: exam.startDate, 
            endDate: exam.endDate, 
            term: exam.term,
            schedulingMode,
            subjectCount: exam.subjects.length,
            hasPractical: exam.schedule.some(s => s.practicalMarks > 0),
            hasCE: exam.schedule.some(s => s.ceEnabled)
          }
        );
        
        broadcastToClass(classId, 'exam:created', {
          examId: exam._id,
          examName: exam.displayName,
          startDate: exam.startDate,
          endDate: exam.endDate,
          schedulingMode,
          subjectCount: exam.subjects.length,
          classId: classId,
          className: classItem.name
        });
      }
    }

    // Broadcast to admin
    broadcastToRole('admin', 'exam:created', {
      examId: exam._id,
      examName: exam.displayName,
      examType: exam.examType,
      classCount: exam.classIds.length,
      subjectCount: exam.subjects.length,
      hasCE: exam.schedule.some(s => s.ceEnabled),
      hasPractical: exam.schedule.some(s => s.practicalMarks > 0),
      timestamp: new Date()
    });

    // Format response
    const formattedExam = await formatExamResponse(populatedExam);
    
    // Add schedule with CE details
    const scheduleWithDetails = exam.schedule.map(s => ({
      ...s.toObject(),
      hasPractical: s.practicalMarks > 0,
      hasCE: s.ceEnabled,
      practicalMarks: s.practicalMarks,
      ceMaxMarks: s.ceMaxMarks,
      ceComponents: s.ceComponents || []
    }));
    
    const response = {
      ...formattedExam,
      schedule: scheduleWithDetails,
      summary: {
        totalClasses: exam.classIds.length,
        totalSubjects: exam.subjects.length,
        languageSubjects: exam.subjects.filter(s => s.isLanguageSubject).length,
        coreSubjects: exam.subjects.filter(s => !s.isLanguageSubject).length,
        hasCE: exam.schedule.some(s => s.ceEnabled),
        hasPractical: exam.schedule.some(s => s.practicalMarks > 0),
        ceTotalMarks: exam.subjects.reduce((sum, s) => sum + (s.ceMaxMarks || 0), 0),
        termTotalMarks: exam.subjects.reduce((sum, s) => sum + (s.termMaxMarks || 0), 0),
        grandTotalMarks: exam.subjects.reduce((sum, s) => sum + (s.totalMaxMarks || 0), 0),
        subjectsWithCE: exam.subjects.filter(s => s.ceEnabled).length
      }
    };

    res.status(201).json(response);
    
  } catch (error) {
    console.error('Error creating exam:', error);
    res.status(500).json({ message: error.message });
  }
};

// Update exam
exports.updateExam = async (req, res) => {
  try {
    const oldExam = await Exam.findById(req.params.id);
    if (!oldExam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const hasMarks = await Mark.exists({ examId: req.params.id });
    if (hasMarks && (req.body.subjects || req.body.schedule)) {
      return res.status(400).json({ 
        message: 'Cannot modify subjects or schedule after marks have been entered' 
      });
    }

    const exam = await Exam.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    const datesChanged = oldExam.startDate?.getTime() !== exam.startDate?.getTime() || 
                         oldExam.endDate?.getTime() !== exam.endDate?.getTime();
    
    if (datesChanged && !hasMarks) {
      for (const classId of exam.classIds) {
        await sendExamNotificationToClass(
          classId,
          exam._id,
          exam.displayName,
          `📅 Exam Schedule Updated: ${exam.displayName}`,
          `The schedule for ${exam.displayName} has been updated.`,
          'warning',
          { startDate: exam.startDate, endDate: exam.endDate }
        );
      }
    }

    res.json(await formatExamResponse(exam));
  } catch (error) {
    console.error('Error updating exam:', error);
    res.status(500).json({ message: error.message });
  }
};

// Delete exam
exports.deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const hasMarks = await Mark.exists({ examId: req.params.id });
    if (hasMarks) {
      return res.status(400).json({ 
        message: 'Cannot delete exam after marks have been entered. Please archive it instead.' 
      });
    }

    for (const classId of exam.classIds) {
      await sendExamNotificationToClass(
        classId,
        exam._id,
        exam.displayName,
        `❌ Exam Cancelled: ${exam.displayName}`,
        `${exam.displayName} has been cancelled.`,
        'error',
        { cancelled: true }
      );
      
      broadcastToClass(classId, 'exam:cancelled', {
        examId: exam._id,
        examName: exam.displayName
      });
    }

    await exam.deleteOne();
    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    console.error('Error deleting exam:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get exam types
exports.getExamTypes = async (req, res) => {
  res.json({
    success: true,
    data: {
      predefined: [
        { value: 'first', label: 'First Term Exam' },
        { value: 'second', label: 'Second Term Exam' },
        { value: 'final', label: 'Final Exam' },
        { value: 'mid', label: 'Mid Term Exam' },
        { value: 'quarterly', label: 'Quarterly Exam' },
        { value: 'half_yearly', label: 'Half Yearly Exam' },
        { value: 'annual', label: 'Annual Exam' },
        { value: 'unit_test', label: 'Unit Test' },
        { value: 'class_test', label: 'Class Test' },
        { value: 'subject_exam', label: 'Subject Exam' }
      ],
      custom: { value: 'custom', label: 'Custom Exam' }
    }
  });
};

// Get session times
exports.getSessionTimes = async (req, res) => {
  const sessions = {
    BF: { value: 'BF', label: 'Before Noon', timeRange: '9:00 AM - 12:00 PM', duration: 180 },
    AF: { value: 'AF', label: 'After Noon', timeRange: '2:00 PM - 5:00 PM', duration: 180 },
    FULL: { value: 'FULL', label: 'Full Day', timeRange: '9:00 AM - 5:00 PM', duration: 480 }
  };
  
  res.json({
    success: true,
    data: sessions
  });
};

// Get exam schedule for a class
exports.getExamSchedule = async (req, res) => {
  try {
    const { classId } = req.params;
    const { academicYearId } = req.query;
    
    const query = { classIds: classId, isActive: true };
    if (academicYearId) query.academicYearId = academicYearId;
    
    const exams = await Exam.find(query)
      .populate('schedule.subjectId', 'name code')
      .sort({ startDate: 1 });
    
    const schedule = exams.map(exam => ({
      examId: exam._id,
      examName: exam.displayName,
      examType: exam.examType,
      startDate: exam.startDate,
      endDate: exam.endDate,
      schedulingMode: exam.schedulingMode,
      hasCE: exam.ceConfig?.enabled || exam.subjects.some(s => s.ceEnabled),
      subjects: exam.schedulingMode === 'subject_schedule' 
        ? exam.schedule.map(s => ({
            subjectId: s.subjectId,
            subjectName: s.subjectName,
            subjectCode: s.subjectCode,
            examDate: s.examDate,
            session: s.session,
            sessionLabel: {
              BF: 'Before Noon (9:00 AM - 12:00 PM)',
              AF: 'After Noon (2:00 PM - 5:00 PM)',
              FULL: 'Full Day (9:00 AM - 5:00 PM)'
            }[s.session],
            startTime: s.startTime,
            endTime: s.endTime,
            duration: s.duration,
            maxMarks: s.termMaxMarks,
            passingMarks: s.termPassingMarks,
            theoryMarks: s.theoryMarks,
            practicalMarks: s.practicalMarks,
            hasPractical: (s.practicalMarks || 0) > 0,
            hasCE: s.ceEnabled || false,
            ceMaxMarks: s.ceMaxMarks,
            roomNumber: s.roomNumber,
            building: s.building
          }))
        : exam.subjects.map(s => ({
            subjectId: s.subjectId,
            subjectName: s.subjectName,
            subjectCode: s.subjectCode,
            maxMarks: s.termMaxMarks,
            passingMarks: s.termPassingMarks,
            theoryMarks: s.theoryMaxMarks,
            practicalMarks: s.practicalMaxMarks,
            hasPractical: (s.practicalMaxMarks || 0) > 0,
            hasCE: s.ceEnabled || false
          }))
    }));
    
    res.json({ success: true, data: schedule });
  } catch (error) {
    console.error('Error in getExamSchedule:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get marks entry summary for admin
exports.getMarksEntrySummary = async (req, res) => {
  try {
    const { examId } = req.params;
    
    console.log('Fetching marks summary for examId:', examId);
    
    const exam = await Exam.findById(examId)
      .populate('classIds', 'name section displayName')
      .populate('classSubmissionStatus.submittedBy', 'name')
      .populate('classSubmissionStatus.reviewedBy', 'name');
    
    if (!exam) {
      console.log('Exam not found with ID:', examId);
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    // Update submission stats for each class
    for (const classStatus of exam.classSubmissionStatus) {
      await exam.updateClassSubmissionStats(classStatus.classId);
    }
    
    const updatedExam = await Exam.findById(examId)
      .populate('classIds', 'name section displayName');
    
    // Get marks data for each class
    const classesData = await Promise.all(updatedExam.classSubmissionStatus.map(async (cs) => {
      const classInfo = updatedExam.classIds.find(c => c._id.toString() === cs.classId.toString());
      
      // Get marks for this class
      const marks = await Mark.find({
        examId: exam._id,
        classId: cs.classId
      });
      
      const totalStudents = cs.marksEntryStats?.totalStudents || 0;
      const marksEntered = marks.length;
      
      const subjectWiseStats = await Promise.all(exam.subjects.map(async (subject) => {
        const marksCount = await Mark.countDocuments({
          examId: exam._id,
          classId: cs.classId,
          subjectId: subject.subjectId,
          isFullyFinalized: true
        });
        
        const scheduleInfo = exam.schedule.find(s => s.subjectId?.toString() === subject.subjectId?.toString());
        
        return {
          subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          maxMarks: subject.termMaxMarks || subject.maxMarks || 100,
          passingMarks: subject.termPassingMarks || subject.passingMarks || 40,
          theoryMarks: subject.theoryMaxMarks || 0,
          practicalMarks: subject.practicalMaxMarks || 0,
          hasPractical: (subject.practicalMaxMarks || 0) > 0,
          ceEnabled: subject.ceEnabled || exam.ceConfig?.enabled || false,
          ceMaxMarks: subject.ceMaxMarks || exam.ceConfig?.maxMarks || 0,
          scheduleDate: scheduleInfo?.examDate,
          scheduleSession: scheduleInfo?.session,
          marksEntered: marksCount,
          totalStudents: totalStudents,
          pending: totalStudents - marksCount,
          completionPercentage: totalStudents > 0 ? (marksCount / totalStudents) * 100 : 0
        };
      }));
      
      return {
        classId: cs.classId,
        className: classInfo?.displayName || cs.className,
        section: classInfo?.section,
        displayName: classInfo?.displayName,
        status: cs.status || 'draft',
        submittedBy: cs.submittedBy,
        submittedByName: cs.submittedBy?.name,
        submittedAt: cs.submittedAt,
        reviewedBy: cs.reviewedBy,
        reviewedByName: cs.reviewedBy?.name,
        reviewedAt: cs.reviewedAt,
        stats: {
          totalStudents: totalStudents,
          termMarksEntered: marksEntered,
          marksPending: (totalStudents * exam.subjects.length) - marksEntered,
          completionPercentage: cs.marksEntryStats?.completionPercentage || 0
        },
        subjectWiseStats
      };
    }));
    
    const summary = {
      examId: exam._id,
      examName: exam.displayName,
      overallStatus: exam.overallStatus,
      hasCE: exam.ceConfig?.enabled || exam.subjects.some(s => s.ceEnabled),
      hasPractical: exam.schedule.some(s => s.practicalMarks > 0),
      classes: classesData,
      totalClasses: exam.classIds.length,
      classesSubmitted: exam.classSubmissionStatus.filter(cs => cs.status === 'submitted' || cs.status === 'reviewed').length,
      classesReviewed: exam.classSubmissionStatus.filter(cs => cs.status === 'reviewed').length,
      classesPublished: exam.classSubmissionStatus.filter(cs => cs.status === 'published').length,
      readyForPublish: exam.classSubmissionStatus.every(cs => cs.status === 'reviewed'),
      overallCompletion: exam.classSubmissionStatus.length > 0
        ? exam.classSubmissionStatus.reduce((sum, cs) => sum + (cs.marksEntryStats?.completionPercentage || 0), 0) / exam.classSubmissionStatus.length
        : 0
    };
    
    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Error in getMarksEntrySummary:', error);
    res.status(500).json({ message: error.message });
  }
};

// Clone exam for next academic year
exports.cloneExam = async (req, res) => {
  try {
    const sourceExam = await Exam.findById(req.params.id);
    if (!sourceExam) {
      return res.status(404).json({ message: 'Source exam not found' });
    }
    
    const { newAcademicYearId } = req.body;
    
    const newAcademicYear = await AcademicYear.findById(newAcademicYearId);
    if (!newAcademicYear) {
      return res.status(404).json({ message: 'Academic year not found' });
    }
    
    const examData = sourceExam.toObject();
    delete examData._id;
    delete examData.createdAt;
    delete examData.updatedAt;
    delete examData.__v;
    
    examData.academicYearId = newAcademicYearId;
    examData.academicYear = newAcademicYear.year;
    examData.name = `${sourceExam.name} (${newAcademicYear.year})`;
    examData.isPublished = false;
    examData.resultsPublished = false;
    examData.overallStatus = 'draft';
    examData.createdBy = req.user.id;
    examData.resultsPublishedAt = null;
    examData.resultsPublishedBy = null;
    
    examData.classSubmissionStatus = examData.classSubmissionStatus.map(cs => ({
      classId: cs.classId,
      status: 'draft',
      marksEntryStats: { totalStudents: 0, termMarksEntered: 0, ceMarksEntered: 0, marksPending: 0 }
    }));
    
    const newExam = await Exam.create(examData);
    
    res.status(201).json({
      success: true,
      message: 'Exam cloned successfully',
      data: await formatExamResponse(newExam)
    });
  } catch (error) {
    console.error('Error cloning exam:', error);
    res.status(500).json({ message: error.message });
  }
};

// Publish exam (admin only)
exports.publishExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const allReviewed = exam.classSubmissionStatus.every(cs => cs.status === 'reviewed');
    if (!allReviewed) {
      return res.status(400).json({ 
        message: 'All classes must be reviewed before publishing results' 
      });
    }
    
    exam.resultsPublished = true;
    exam.resultsPublishedAt = new Date();
    exam.resultsPublishedBy = req.user.id;
    exam.isPublished = true;
    exam.overallStatus = 'published';
    
    exam.classSubmissionStatus.forEach(cs => {
      cs.status = 'published';
    });
    
    await exam.save();
    
    const MarkController = require('./markController');
    for (const classStatus of exam.classSubmissionStatus) {
      await MarkController.generateAndPublishResults(exam._id, classStatus.classId, req.user.id);
    }
    
    // Notify all classes
    for (const classId of exam.classIds) {
      broadcastToClass(classId, 'results:published', {
        examId: exam._id,
        examName: exam.displayName,
        classId,
        timestamp: new Date()
      });
    }
    
    broadcastToRole('admin', 'results:published', {
      examId: exam._id,
      examName: exam.displayName,
      classCount: exam.classIds.length,
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      message: 'Exam results published successfully',
      exam: await formatExamResponse(exam)
    });
  } catch (error) {
    console.error('Error publishing exam:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get upcoming exams
exports.getUpcomingExams = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    let classIds = [];
    
    if (userRole === 'parent') {
      const students = await Student.find({ parentIds: userId });
      classIds = [...new Set(students.map(s => s.classId.toString()))];
    } else if (userRole === 'staff') {
      const staff = await Staff.findOne({ userId });
      if (staff) {
        const assignments = await StaffAssignment.find({ 
          staffId: staff._id,
          academicYearId: { $exists: true }
        });
        classIds = [...new Set(assignments.flatMap(a => a.subjectsTaught.map(s => s.classId.toString())))];
        if (staff.assignedClassId) {
          classIds.push(staff.assignedClassId.toString());
        }
      }
    } else if (userRole === 'admin') {
      const currentYear = await AcademicYear.findOne({ isCurrent: true });
      const classes = await Class.find({ academicYearId: currentYear?._id, isActive: true });
      classIds = classes.map(c => c._id.toString());
    }
    
    const today = new Date();
    const exams = await Exam.find({
      classIds: { $in: classIds },
      endDate: { $gte: today },
      isActive: true
    })
      .populate('classIds', 'name section displayName')
      .populate('academicYearId', 'year')
      .sort({ startDate: 1 })
      .limit(10);
    
    const formattedExams = await Promise.all(exams.map(async (exam) => {
      const examObj = await formatExamResponse(exam);
      const daysLeft = Math.ceil((new Date(exam.startDate) - today) / (1000 * 60 * 60 * 24));
      
      return {
        ...examObj,
        daysLeft: daysLeft > 0 ? daysLeft : 0,
        isUpcoming: daysLeft > 0,
        isOngoing: new Date(exam.startDate) <= today && new Date(exam.endDate) >= today,
        scheduleCount: exam.schedule.length,
        hasPractical: exam.schedule.some(s => s.practicalMarks > 0),
        hasCE: exam.ceConfig?.enabled || exam.subjects.some(s => s.ceEnabled)
      };
    }));
    
    res.json({
      success: true,
      data: formattedExams
    });
  } catch (error) {
    console.error('Error in getUpcomingExams:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get exam analytics
exports.getExamAnalytics = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const stats = {
      examId: exam._id,
      examName: exam.displayName,
      examType: exam.examType,
      term: exam.term,
      academicYear: exam.academicYear,
      totalClasses: exam.classIds.length,
      totalSubjects: exam.subjects.length,
      hasCE: exam.ceConfig?.enabled || exam.subjects.some(s => s.ceEnabled),
      hasPractical: exam.schedule.some(s => s.practicalMarks > 0),
      classWise: [],
      subjectWise: {},
      overallStats: {
        totalStudents: 0,
        totalMarksEntered: 0,
        totalMaxMarks: 0,
        averagePercentage: 0,
        passPercentage: 0
      }
    };
    
    let totalStudentsOverall = 0;
    let totalMarksOverall = 0;
    let totalMaxOverall = 0;
    
    for (const classStatus of exam.classSubmissionStatus) {
      const classInfo = await Class.findById(classStatus.classId).select('name section displayName');
      const students = await Student.find({ classId: classStatus.classId, status: 'active' });
      
      const marks = await Mark.find({
        examId: exam._id,
        classId: classStatus.classId,
        isFullyFinalized: true
      });
      
      const studentMarksMap = new Map();
      for (const mark of marks) {
        if (!studentMarksMap.has(mark.studentId.toString())) {
          studentMarksMap.set(mark.studentId.toString(), {
            studentId: mark.studentId,
            totalMarks: 0,
            maxMarks: 0
          });
        }
        const subjectConfig = exam.getSubjectConfig(mark.subjectId);
        if (subjectConfig) {
          const studentData = studentMarksMap.get(mark.studentId.toString());
          studentData.totalMarks += mark.totalScore || 0;
          studentData.maxMarks += subjectConfig.totalMaxMarks || subjectConfig.termMaxMarks || 0;
        }
      }
      
      const studentPercentages = Array.from(studentMarksMap.values()).map(s => ({
        ...s,
        percentage: s.maxMarks > 0 ? (s.totalMarks / s.maxMarks) * 100 : 0
      }));
      
      const classTotalMarks = studentPercentages.reduce((sum, s) => sum + s.totalMarks, 0);
      const classTotalMax = studentPercentages.reduce((sum, s) => sum + s.maxMarks, 0);
      
      totalStudentsOverall += students.length;
      totalMarksOverall += classTotalMarks;
      totalMaxOverall += classTotalMax;
      
      stats.classWise.push({
        classId: classStatus.classId,
        className: classInfo?.displayName || `${classInfo?.name}-${classInfo?.section}`,
        section: classInfo?.section,
        totalStudents: students.length,
        marksEntered: studentMarksMap.size,
        totalMarks: classTotalMarks,
        totalMaxMarks: classTotalMax,
        averagePercentage: studentPercentages.length > 0 
          ? studentPercentages.reduce((sum, s) => sum + s.percentage, 0) / studentPercentages.length 
          : 0,
        passPercentage: studentPercentages.length > 0
          ? (studentPercentages.filter(s => s.percentage >= 40).length / studentPercentages.length) * 100
          : 0,
        gradeDistribution: {
          'A+': studentPercentages.filter(s => s.percentage >= 90).length,
          'A': studentPercentages.filter(s => s.percentage >= 80 && s.percentage < 90).length,
          'B+': studentPercentages.filter(s => s.percentage >= 70 && s.percentage < 80).length,
          'B': studentPercentages.filter(s => s.percentage >= 60 && s.percentage < 70).length,
          'C+': studentPercentages.filter(s => s.percentage >= 50 && s.percentage < 60).length,
          'C': studentPercentages.filter(s => s.percentage >= 40 && s.percentage < 50).length,
          'D': studentPercentages.filter(s => s.percentage >= 33 && s.percentage < 40).length,
          'F': studentPercentages.filter(s => s.percentage < 33).length
        }
      });
    }
    
    for (const subject of exam.subjects) {
      const marks = await Mark.find({
        examId: exam._id,
        subjectId: subject.subjectId,
        isFullyFinalized: true
      });
      
      const scheduleInfo = exam.schedule.find(s => s.subjectId.toString() === subject.subjectId.toString());
      
      if (marks.length > 0) {
        const scores = marks.map(m => m.totalScore || 0);
        const theoryScores = marks.map(m => m.theoryScore || 0);
        const practicalScores = marks.map(m => m.practicalScore || 0);
        const maxMark = subject.totalMaxMarks || subject.termMaxMarks || 100;
        const passingMark = subject.totalPassingMarks || subject.termPassingMarks || 40;
        const theoryMax = subject.theoryMaxMarks || subject.termMaxMarks || 100;
        const practicalMax = subject.practicalMaxMarks || 0;
        
        stats.subjectWise[subject.subjectName] = {
          subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          subjectCode: subject.subjectCode,
          maxMarks: maxMark,
          passingMarks: passingMark,
          theoryMaxMarks: theoryMax,
          practicalMaxMarks: practicalMax,
          hasPractical: practicalMax > 0,
          hasCE: subject.ceEnabled || exam.ceConfig?.enabled || false,
          ceMaxMarks: subject.ceMaxMarks || exam.ceConfig?.maxMarks || 0,
          scheduleDate: scheduleInfo?.examDate,
          scheduleSession: scheduleInfo?.session,
          totalStudents: marks.length,
          highestScore: Math.max(...scores),
          lowestScore: Math.min(...scores),
          averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
          averageTheory: theoryScores.reduce((a, b) => a + b, 0) / theoryScores.length,
          averagePractical: practicalScores.reduce((a, b) => a + b, 0) / (practicalScores.length || 1),
          passCount: scores.filter(s => s >= passingMark).length,
          passPercentage: (scores.filter(s => s >= passingMark).length / scores.length) * 100,
          gradeDistribution: {
            'A+': scores.filter(s => (s / maxMark) * 100 >= 90).length,
            'A': scores.filter(s => (s / maxMark) * 100 >= 80 && (s / maxMark) * 100 < 90).length,
            'B+': scores.filter(s => (s / maxMark) * 100 >= 70 && (s / maxMark) * 100 < 80).length,
            'B': scores.filter(s => (s / maxMark) * 100 >= 60 && (s / maxMark) * 100 < 70).length,
            'C+': scores.filter(s => (s / maxMark) * 100 >= 50 && (s / maxMark) * 100 < 60).length,
            'C': scores.filter(s => (s / maxMark) * 100 >= 40 && (s / maxMark) * 100 < 50).length,
            'D': scores.filter(s => (s / maxMark) * 100 >= 33 && (s / maxMark) * 100 < 40).length,
            'F': scores.filter(s => (s / maxMark) * 100 < 33).length
          }
        };
      }
    }
    
    stats.overallStats = {
      totalStudents: totalStudentsOverall,
      totalMarksEntered: totalMarksOverall,
      totalMaxMarks: totalMaxOverall,
      averagePercentage: totalMaxOverall > 0 ? (totalMarksOverall / totalMaxOverall) * 100 : 0,
      passPercentage: stats.classWise.length > 0 
        ? stats.classWise.reduce((sum, c) => sum + c.passPercentage, 0) / stats.classWise.length 
        : 0
    };
    
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error in getExamAnalytics:', error);
    res.status(500).json({ message: error.message });
  }
};

// Export helper functions
module.exports.generateAndPublishResults = async (examId, classId, publishedBy) => {
  const Mark = require('../models/Mark');
  const ExamResult = require('../models/ExamResult');
  
  const exam = await Exam.findById(examId);
  if (!exam) return;
  
  const students = await Student.find({ classId, status: 'active' });
  const results = [];
  
  for (const student of students) {
    const marks = await Mark.find({
      studentId: student._id,
      examId,
      classId,
      isFinalized: true
    });
    
    if (marks.length === 0) continue;
    
    const subjectResults = [];
    let totalObtained = 0;
    let totalMax = 0;
    
    for (const mark of marks) {
      const subjectConfig = exam.getSubjectConfig(mark.subjectId);
      const scheduleInfo = exam.getSubjectSchedule(mark.subjectId);
      
      if (!subjectConfig) continue;
      
      const maxMarks = subjectConfig.termMaxMarks || 100;
      const obtainedMarks = mark.totalScore || 0;
      const theoryMarks = mark.theoryScore || 0;
      const practicalMarks = mark.practicalScore || 0;
      const percentage = maxMarks > 0 ? (obtainedMarks / maxMarks) * 100 : 0;
      const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B+' : percentage >= 60 ? 'B' : percentage >= 50 ? 'C+' : percentage >= 40 ? 'C' : percentage >= 33 ? 'D' : 'F';
      const status = percentage >= 40 ? 'pass' : 'fail';
      
      subjectResults.push({
        subjectId: mark.subjectId,
        subjectName: mark.subjectName,
        subjectCode: subjectConfig.subjectCode,
        maxMarks: maxMarks,
        obtainedMarks: obtainedMarks,
        theoryMarks: theoryMarks,
        practicalMarks: practicalMarks,
        percentage: percentage,
        grade: grade,
        status: status,
        examDate: scheduleInfo?.examDate,
        session: scheduleInfo?.session
      });
      
      totalObtained += obtainedMarks;
      totalMax += maxMarks;
    }
    
    const overallPercentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    const overallGrade = overallPercentage >= 90 ? 'A+' : overallPercentage >= 80 ? 'A' : overallPercentage >= 70 ? 'B+' : overallPercentage >= 60 ? 'B' : overallPercentage >= 50 ? 'C+' : overallPercentage >= 40 ? 'C' : overallPercentage >= 33 ? 'D' : 'F';
    
    const result = await ExamResult.findOneAndUpdate(
      { studentId: student._id, examId },
      {
        studentId: student._id,
        studentName: student.fullName,
        studentCode: student.studentCode,
        rollNumber: student.rollNumber,
        examId,
        examName: exam.displayName,
        classId,
        className: exam.classSubmissionStatus.find(cs => cs.classId.toString() === classId.toString())?.className,
        academicYearId: exam.academicYearId,
        academicYear: exam.academicYear,
        term: exam.term,
        subjectResults,
        totalMarks: totalObtained,
        totalMaxMarks: totalMax,
        percentage: overallPercentage,
        grade: overallGrade,
        isPublished: true,
        publishedAt: new Date(),
        publishedBy
      },
      { upsert: true, new: true }
    );
    
    results.push(result);
  }
  
  // Update rankings
  const sortedResults = results.sort((a, b) => b.percentage - a.percentage);
  let rank = 1;
  let prevPercentage = -1;
  
  for (let i = 0; i < sortedResults.length; i++) {
    if (sortedResults[i].percentage !== prevPercentage) {
      rank = i + 1;
    }
    sortedResults[i].rank = rank;
    prevPercentage = sortedResults[i].percentage;
    await sortedResults[i].save();
  }
  
  return results;
};


// Get exam classes with details
exports.getExamClasses = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('classIds', 'name section displayName academicYearId')
      .populate('classSubmissionStatus.submittedBy', 'name')
      .populate('classSubmissionStatus.reviewedBy', 'name');

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    // Update submission stats for each class
    for (const classStatus of exam.classSubmissionStatus) {
      await exam.updateClassSubmissionStats(classStatus.classId);
    }

    // Get fresh data after update
    const updatedExam = await Exam.findById(req.params.id)
      .populate('classIds', 'name section displayName');

    const classes = await Promise.all(updatedExam.classSubmissionStatus.map(async (cs) => {
      const classInfo = updatedExam.classIds.find(c => c._id.toString() === cs.classId.toString());
      
      // Get subject-wise stats
      const subjectWiseStats = await Promise.all(exam.subjects.map(async (subject) => {
        const marksCount = await Mark.countDocuments({
          examId: exam._id,
          classId: cs.classId,
          subjectId: subject.subjectId
        });
        
        const scheduleInfo = exam.schedule.find(s => s.subjectId?.toString() === subject.subjectId?.toString());
        const totalStudents = cs.marksEntryStats?.totalStudents || 0;
        
        return {
          subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          maxMarks: subject.termMaxMarks || subject.maxMarks || 100,
          passingMarks: subject.termPassingMarks || subject.passingMarks || 40,
          theoryMarks: subject.theoryMaxMarks || 0,
          practicalMarks: subject.practicalMaxMarks || 0,
          hasPractical: (subject.practicalMaxMarks || 0) > 0,
          ceEnabled: subject.ceEnabled || exam.ceConfig?.enabled || false,
          marksEntered: marksCount,
          totalStudents: totalStudents,
          pending: totalStudents - marksCount,
          completionPercentage: totalStudents > 0 ? (marksCount / totalStudents) * 100 : 0,
          scheduleDate: scheduleInfo?.examDate,
          scheduleSession: scheduleInfo?.session
        };
      }));

      return {
        classId: cs.classId,
        className: classInfo?.displayName || cs.className || classInfo?.name,
        section: classInfo?.section,
        displayName: classInfo?.displayName,
        totalStudents: cs.marksEntryStats?.totalStudents || 0,
        status: cs.status || 'draft',
        submittedBy: cs.submittedBy,
        submittedByName: cs.submittedBy?.name,
        submittedAt: cs.submittedAt,
        reviewedBy: cs.reviewedBy,
        reviewedByName: cs.reviewedBy?.name,
        reviewedAt: cs.reviewedAt,
        marksEntryStats: cs.marksEntryStats || {
          totalStudents: 0,
          termMarksEntered: 0,
          ceMarksEntered: 0,
          marksPending: 0,
          completionPercentage: 0
        },
        subjectWiseStats
      };
    }));

    res.json({
      success: true,
      data: {
        examId: exam._id,
        examName: exam.displayName,
        totalClasses: classes.length,
        classesSubmitted: classes.filter(c => c.status === 'submitted' || c.status === 'reviewed').length,
        classesReviewed: classes.filter(c => c.status === 'reviewed').length,
        classesPublished: classes.filter(c => c.status === 'published').length,
        readyForPublish: classes.length > 0 && classes.every(c => c.status === 'reviewed'),
        classes
      }
    });
  } catch (error) {
    console.error('Error in getExamClasses:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get exam subjects with details
exports.getExamSubjects = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('subjects.subjectId', 'name code type department');

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const subjects = exam.subjects.map(subject => {
      const scheduleInfo = exam.schedule.find(s => s.subjectId?.toString() === subject.subjectId?.toString());
      const hasCE = subject.ceEnabled || exam.ceConfig?.enabled;
      
      return {
        subjectId: subject.subjectId?._id || subject.subjectId,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        maxMarks: subject.maxMarks || subject.termMaxMarks || 100,
        passingMarks: subject.passingMarks || subject.termPassingMarks || 40,
        theoryMaxMarks: subject.theoryMaxMarks || subject.termMaxMarks || 80,
        practicalMaxMarks: subject.practicalMaxMarks || 0,
        hasPractical: (subject.practicalMaxMarks || 0) > 0,
        ceEnabled: hasCE,
        ceMaxMarks: hasCE ? (subject.ceMaxMarks || exam.ceConfig?.maxMarks || 0) : 0,
        cePassingMarks: hasCE ? (subject.cePassingMarks || exam.ceConfig?.passingMarks || 0) : 0,
        totalMaxMarks: (subject.maxMarks || subject.termMaxMarks || 0) + (subject.practicalMaxMarks || 0) + (hasCE ? (subject.ceMaxMarks || exam.ceConfig?.maxMarks || 0) : 0),
        totalPassingMarks: (subject.passingMarks || subject.termPassingMarks || 0) + (hasCE ? (subject.cePassingMarks || exam.ceConfig?.passingMarks || 0) : 0),
        examDate: scheduleInfo?.examDate,
        session: scheduleInfo?.session,
        roomNumber: scheduleInfo?.roomNumber,
        building: scheduleInfo?.building
      };
    });

    res.json({
      success: true,
      data: {
        examId: exam._id,
        examName: exam.displayName,
        totalSubjects: subjects.length,
        theorySubjects: subjects.filter(s => !s.hasPractical).length,
        practicalSubjects: subjects.filter(s => s.hasPractical).length,
        ceEnabledSubjects: subjects.filter(s => s.ceEnabled).length,
        subjects
      }
    });
  } catch (error) {
    console.error('Error in getExamSubjects:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get exam schedule details
exports.getExamScheduleDetails = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('schedule.subjectId', 'name code');

    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }

    const schedule = exam.schedule.map(s => ({
      subjectId: s.subjectId?._id || s.subjectId,
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      examDate: s.examDate,
      session: s.session,
      sessionLabel: {
        BF: 'Morning (9:00 AM - 12:00 PM)',
        AF: 'Afternoon (2:00 PM - 5:00 PM)',
        FULL: 'Full Day (9:00 AM - 5:00 PM)'
      }[s.session],
      startTime: s.startTime,
      endTime: s.endTime,
      duration: s.duration,
      maxMarks: s.maxMarks || s.termMaxMarks,
      passingMarks: s.passingMarks || s.termPassingMarks,
      theoryMarks: s.theoryMarks,
      practicalMarks: s.practicalMarks || 0,
      hasPractical: (s.practicalMarks || 0) > 0,
      hasCE: s.ceEnabled || exam.ceConfig?.enabled || false,
      ceMaxMarks: s.ceMaxMarks || exam.ceConfig?.maxMarks || 0,
      roomNumber: s.roomNumber,
      building: s.building,
      invigilators: s.invigilatorNames || [],
      notes: s.notes
    }));

    // Sort by date
    schedule.sort((a, b) => new Date(a.examDate) - new Date(b.examDate));

    res.json({
      success: true,
      data: {
        examId: exam._id,
        examName: exam.displayName,
        startDate: exam.startDate,
        endDate: exam.endDate,
        totalSubjects: schedule.length,
        schedule
      }
    });
  } catch (error) {
    console.error('Error in getExamScheduleDetails:', error);
    res.status(500).json({ message: error.message });
  }
};