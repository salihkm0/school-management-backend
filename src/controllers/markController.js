// controllers/markController.js
const Mark = require('../models/Mark');
const { Exam, SUBMISSION_STATUS } = require('../models/Exam');
const ExamResult = require('../models/ExamResult');
const Student = require('../models/Student');
const Staff = require('../models/Staff');
const User = require('../models/User');
const StaffAssignment = require('../models/StaffAssignment');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Notification = require('../models/Notification');
const { broadcastToUser, broadcastToClass, broadcastToRole } = require('../config/socket');

// Helper: Check if user is system admin (from User model)
async function isSystemAdmin(userId) {
  const user = await User.findById(userId);
  return user?.role === 'admin';
}

// Helper: Check if user is admin (System Admin OR Staff with admin roles)
async function isAdminUser(userId, staff) {
  const systemAdmin = await isSystemAdmin(userId);
  if (systemAdmin) return true;
  if (!staff) return false;
  const adminRoles = ['principal', 'administrator', 'manager', 'admin'];
  return adminRoles.includes(staff.role);
}

// Helper: Get staff or create virtual admin staff object
async function getStaffOrAdmin(userId) {
  const user = await User.findById(userId);
  
  if (user?.role === 'admin') {
    let adminStaff = await Staff.findOne({ userId: user._id });
    if (adminStaff) {
      return {
        _id: adminStaff._id,
        name: adminStaff.name,
        role: adminStaff.role,
        isSystemAdmin: true,
        userId: user._id,
        email: user.email
      };
    }
    return {
      _id: user._id,
      name: user.name,
      role: 'admin',
      isSystemAdmin: true,
      isVirtualAdmin: true,
      userId: user._id,
      email: user.email
    };
  }
  
  const staff = await Staff.findOne({ userId });
  if (staff) {
    return {
      _id: staff._id,
      name: staff.name,
      role: staff.role,
      isSystemAdmin: false,
      userId: staff.userId,
      email: staff.email
    };
  }
  return null;
}

// Helper: Check teacher permission for a subject in a class
async function hasSubjectPermission(userId, staffId, classId, subjectId) {
  const staff = await Staff.findById(staffId);
  if (await isSystemAdmin(userId)) {
    return { allowed: true, isSystemAdmin: true };
  }
  if (!staff) return { allowed: false, reason: 'Staff not found' };
  
  const adminRoles = ['principal', 'administrator', 'manager', 'admin'];
  if (adminRoles.includes(staff.role)) {
    return { allowed: true, isStaffAdmin: true };
  }
  
  const exam = await Exam.findOne({ 'classSubmissionStatus.classId': classId }).sort({ createdAt: -1 });
  if (!exam) return { allowed: false, reason: 'Exam not found' };
  
  const staffAssignment = await StaffAssignment.findOne({
    staffId,
    academicYearId: exam.academicYearId
  });
  
  if (!staffAssignment) return { allowed: false, reason: 'No assignment found for this academic year' };
  
  const isClassTeacher = staffAssignment.classTeacherOf?.toString() === classId.toString();
  if (isClassTeacher) return { allowed: true, isClassTeacher: true };
  
  const teachesSubject = staffAssignment.subjectsTaught.some(
    s => s.subjectId.toString() === subjectId.toString() && 
         s.classId.toString() === classId.toString()
  );
  
  if (teachesSubject) return { allowed: true, isSubjectTeacher: true };
  return { allowed: false, reason: 'Not authorized for this subject in this class' };
}

// Helper: Check class teacher permission
async function hasClassTeacherPermission(userId, staffId, classId) {
  if (await isSystemAdmin(userId)) return true;
  const staff = await Staff.findById(staffId);
  if (!staff) return false;
  const adminRoles = ['principal', 'administrator', 'manager', 'admin'];
  if (adminRoles.includes(staff.role)) return true;
  const exam = await Exam.findOne({ 'classSubmissionStatus.classId': classId }).sort({ createdAt: -1 });
  if (!exam) return false;
  const staffAssignment = await StaffAssignment.findOne({
    staffId,
    academicYearId: exam.academicYearId
  });
  return staffAssignment?.classTeacherOf?.toString() === classId.toString();
}

// Helper: Calculate grade
function calculateGrade(percentage) {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C+';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
}

// ==================== NEW API ENDPOINTS ====================

// Get or create marksheet for a student
exports.getOrCreateMarksheet = async (req, res) => {
  try {
    const { examId, classId, studentId } = req.params;
    const userId = req.user.id;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    let marksheet = await Mark.findOne({ studentId, examId, classId });
    
    if (!marksheet) {
      const subjects = exam.subjects.map(subject => ({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        maxMarks: subject.maxMarks || subject.termMaxMarks || 100,
        passingMarks: subject.passingMarks || subject.termPassingMarks || 40,
        theoryScore: 0,
        practicalScore: 0,
        totalScore: 0,
        percentage: 0,
        grade: 'F',
        remarks: '',
        isAbsent: false
      }));
      
      marksheet = new Mark({
        studentId,
        studentName: student.fullName,
        studentCode: student.studentCode,
        rollNumber: student.rollNumber,
        admissionNo: student.admissionNo,
        examId,
        examName: exam.displayName || exam.name,
        examType: exam.examType,
        term: exam.term,
        classId,
        className: student.className,
        academicYearId: exam.academicYearId,
        academicYear: exam.academicYear,
        subjects,
        status: 'draft'
      });
      await marksheet.save();
    }
    
    res.json({ success: true, data: marksheet });
  } catch (error) {
    console.error('Error in getOrCreateMarksheet:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get all marksheets for a class
exports.getMarksheetsByClass = async (req, res) => {
  try {
    const { examId, classId } = req.params;
    const userId = req.user.id;
    
    const staffOrAdmin = await getStaffOrAdmin(userId);
    if (!staffOrAdmin) {
      return res.status(403).json({ message: 'Staff record not found' });
    }
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const students = await Student.find({ classId, status: 'active' })
      .select('_id fullName studentCode rollNumber admissionNo')
      .sort({ rollNumber: 1, fullName: 1 });
    
    const marksheets = await Mark.find({ examId, classId });
    const marksheetMap = new Map();
    marksheets.forEach(m => marksheetMap.set(m.studentId.toString(), m));
    
    const examSubjects = exam.subjects.map(s => ({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      maxMarks: s.maxMarks || s.termMaxMarks || 100,
      passingMarks: s.passingMarks || s.termPassingMarks || 40
    }));
    
    const studentMarks = students.map(student => {
      const existing = marksheetMap.get(student._id.toString());
      
      if (existing) {
        return {
          studentId: student._id,
          studentName: student.fullName,
          studentCode: student.studentCode,
          rollNumber: student.rollNumber,
          admissionNo: student.admissionNo,
          marksheetId: existing._id,
          subjects: existing.subjects,
          totalMarks: existing.totalMarks,
          totalMaxMarks: existing.totalMaxMarks,
          percentage: existing.percentage,
          grade: existing.grade,
          status: existing.status,
          isFinalized: existing.isFinalized,
          lastUpdated: existing.updatedAt
        };
      } else {
        return {
          studentId: student._id,
          studentName: student.fullName,
          studentCode: student.studentCode,
          rollNumber: student.rollNumber,
          admissionNo: student.admissionNo,
          marksheetId: null,
          subjects: examSubjects.map(s => ({
            subjectId: s.subjectId,
            subjectName: s.subjectName,
            subjectCode: s.subjectCode,
            theoryScore: 0,
            practicalScore: 0,
            totalScore: 0,
            maxMarks: s.maxMarks,
            passingMarks: s.passingMarks,
            percentage: 0,
            grade: 'F',
            remarks: '',
            isAbsent: false
          })),
          totalMarks: 0,
          totalMaxMarks: examSubjects.reduce((sum, s) => sum + s.maxMarks, 0),
          percentage: 0,
          grade: 'F',
          status: 'draft',
          isFinalized: false
        };
      }
    });
    
    res.json({
      success: true,
      data: {
        examId: exam._id,
        examName: exam.displayName || exam.name,
        classId,
        className: students[0]?.className || '',
        subjects: examSubjects,
        students: studentMarks,
        summary: {
          totalStudents: students.length,
          marksheetsCreated: marksheets.length,
          completedMarksheets: marksheets.filter(m => m.isFinalized).length
        }
      }
    });
  } catch (error) {
    console.error('Error in getMarksheetsByClass:', error);
    res.status(500).json({ message: error.message });
  }
};

// Update single student marks
exports.updateStudentMarks = async (req, res) => {
  try {
    const { examId, classId, studentId } = req.params;
    const { subjects, remarks } = req.body;
    const userId = req.user.id;
    
    const staffOrAdmin = await getStaffOrAdmin(userId);
    if (!staffOrAdmin) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    let marksheet = await Mark.findOne({ studentId, examId, classId });
    const exam = await Exam.findById(examId);
    
    if (!marksheet) {
      const student = await Student.findById(studentId);
      const examSubjects = exam.subjects.map(subject => ({
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        subjectCode: subject.subjectCode,
        maxMarks: subject.maxMarks || subject.termMaxMarks || 100,
        passingMarks: subject.passingMarks || subject.termPassingMarks || 40,
        theoryScore: 0,
        practicalScore: 0,
        totalScore: 0,
        percentage: 0,
        grade: 'F',
        remarks: '',
        isAbsent: false
      }));
      
      marksheet = new Mark({
        studentId,
        studentName: student.fullName,
        studentCode: student.studentCode,
        rollNumber: student.rollNumber,
        admissionNo: student.admissionNo,
        examId,
        examName: exam.displayName || exam.name,
        examType: exam.examType,
        term: exam.term,
        classId,
        className: student.className,
        academicYearId: exam.academicYearId,
        academicYear: exam.academicYear,
        subjects: examSubjects,
        status: 'draft'
      });
    }
    
    if (subjects && Array.isArray(subjects)) {
      subjects.forEach(updatedSubject => {
        const subjectIndex = marksheet.subjects.findIndex(
          s => s.subjectId.toString() === updatedSubject.subjectId
        );
        if (subjectIndex !== -1) {
          marksheet.subjects[subjectIndex].theoryScore = updatedSubject.theoryScore || 0;
          marksheet.subjects[subjectIndex].practicalScore = updatedSubject.practicalScore || 0;
          marksheet.subjects[subjectIndex].remarks = updatedSubject.remarks || '';
          marksheet.subjects[subjectIndex].isAbsent = updatedSubject.isAbsent || false;
        }
      });
    }
    
    if (remarks) marksheet.remarks = remarks;
    marksheet.lastUpdatedBy = staffOrAdmin._id ? staffOrAdmin._id.toString() : userId.toString();
    marksheet.lastUpdatedAt = new Date();
    await marksheet.save();
    
    res.json({ success: true, message: 'Marks updated successfully', data: marksheet });
  } catch (error) {
    console.error('Error in updateStudentMarks:', error);
    res.status(500).json({ message: error.message });
  }
};

// Bulk update marks for all students
exports.bulkUpdateMarks = async (req, res) => {
  try {
    const { examId, classId } = req.params;
    const { studentsData } = req.body;
    const userId = req.user.id;
    
    const staffOrAdmin = await getStaffOrAdmin(userId);
    if (!staffOrAdmin) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const results = { success: [], failed: [] };
    
    for (const studentData of studentsData) {
      try {
        let marksheet = await Mark.findOne({
          studentId: studentData.studentId,
          examId,
          classId
        });
        
        if (!marksheet) {
          const student = await Student.findById(studentData.studentId);
          const examSubjects = exam.subjects.map(subject => ({
            subjectId: subject.subjectId,
            subjectName: subject.subjectName,
            subjectCode: subject.subjectCode,
            maxMarks: subject.maxMarks || subject.termMaxMarks || 100,
            passingMarks: subject.passingMarks || subject.termPassingMarks || 40,
            theoryScore: 0,
            practicalScore: 0,
            totalScore: 0,
            percentage: 0,
            grade: 'F',
            remarks: '',
            isAbsent: false
          }));
          
          marksheet = new Mark({
            studentId: studentData.studentId,
            studentName: student.fullName,
            studentCode: student.studentCode,
            rollNumber: student.rollNumber,
            admissionNo: student.admissionNo,
            examId,
            examName: exam.displayName || exam.name,
            examType: exam.examType,
            term: exam.term,
            classId,
            className: student.className,
            academicYearId: exam.academicYearId,
            academicYear: exam.academicYear,
            subjects: examSubjects,
            status: 'draft'
          });
        }
        
        if (studentData.subjects && Array.isArray(studentData.subjects)) {
          studentData.subjects.forEach(updatedSubject => {
            const subjectIndex = marksheet.subjects.findIndex(
              s => s.subjectId.toString() === updatedSubject.subjectId
            );
            if (subjectIndex !== -1) {
              marksheet.subjects[subjectIndex].theoryScore = updatedSubject.theoryScore || 0;
              marksheet.subjects[subjectIndex].practicalScore = updatedSubject.practicalScore || 0;
              marksheet.subjects[subjectIndex].remarks = updatedSubject.remarks || '';
              marksheet.subjects[subjectIndex].isAbsent = updatedSubject.isAbsent || false;
            }
          });
        }
        
        if (studentData.remarks) marksheet.remarks = studentData.remarks;
        marksheet.lastUpdatedBy = staffOrAdmin._id ? staffOrAdmin._id.toString() : userId.toString();
        marksheet.lastUpdatedAt = new Date();
        await marksheet.save();
        
        results.success.push({ studentId: studentData.studentId, studentName: marksheet.studentName });
      } catch (error) {
        results.failed.push({ studentId: studentData.studentId, error: error.message });
      }
    }
    
    const examDoc = await Exam.findById(examId);
    if (examDoc) {
      const classSubmission = examDoc.classSubmissionStatus.find(
        cs => cs.classId.toString() === classId
      );
      if (classSubmission) {
        await examDoc.updateClassSubmissionStats(classId);
      }
    }
    
    res.json({
      success: true,
      message: `Updated ${results.success.length} students, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    console.error('Error in bulkUpdateMarks:', error);
    res.status(500).json({ message: error.message });
  }
};

// Submit marks for review (class teacher)
exports.submitMarksForReview = async (req, res) => {
  try {
    const { examId, classId } = req.body;
    const userId = req.user.id;
    
    const staffOrAdmin = await getStaffOrAdmin(userId);
    if (!staffOrAdmin) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    
    const isSysAdmin = staffOrAdmin.isSystemAdmin || false;
    const isStaffAdmin = !isSysAdmin && ['principal', 'administrator', 'manager', 'admin'].includes(staffOrAdmin.role);
    const isAdmin = isSysAdmin || isStaffAdmin;
    const isClassTeacher = isAdmin ? true : await hasClassTeacherPermission(userId, staffOrAdmin._id, classId);
    
    if (!isClassTeacher) {
      return res.status(403).json({ message: 'Only class teacher can submit marks for review' });
    }
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const classSubmission = exam.classSubmissionStatus.find(
      cs => cs.classId.toString() === classId
    );
    
    if (!classSubmission) {
      return res.status(404).json({ message: 'Class not found in exam' });
    }
    
    if (classSubmission.status !== 'draft') {
      return res.status(400).json({ message: `Marks already ${classSubmission.status}` });
    }
    
    const submittedById = staffOrAdmin._id ? staffOrAdmin._id.toString() : userId.toString();
    
    const marksToUpdate = await Mark.updateMany(
      { examId, classId, status: 'draft' },
      {
        status: 'submitted',
        isFinalized: true,
        finalizedAt: new Date(),
        finalizedBy: submittedById,
        submittedBy: submittedById,
        submittedAt: new Date(),
        lastUpdatedBy: submittedById,
        lastUpdatedAt: new Date()
      }
    );
    
    classSubmission.status = 'submitted';
    classSubmission.submittedBy = submittedById;
    classSubmission.submittedAt = new Date();
    await exam.save();
    await exam.updateClassSubmissionStats(classId);
    
    broadcastToRole('admin', 'marks:submitted', {
      examId: exam._id,
      examName: exam.displayName,
      classId,
      submittedBy: staffOrAdmin.name,
      marksCount: marksToUpdate.modifiedCount,
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      message: `Submitted ${marksToUpdate.modifiedCount} marksheets for review`,
      examStatus: exam.overallStatus
    });
  } catch (error) {
    console.error('Error in submitMarksForReview:', error);
    res.status(500).json({ message: error.message });
  }
};

// Review marks (admin)
exports.reviewMarks = async (req, res) => {
  try {
    const { examId, classId } = req.body;
    const userId = req.user.id;
    
    const staffOrAdmin = await getStaffOrAdmin(userId);
    if (!staffOrAdmin) {
      return res.status(403).json({ message: 'Staff record not found' });
    }
    
    const isSysAdmin = staffOrAdmin.isSystemAdmin || false;
    const isStaffAdmin = !isSysAdmin && ['principal', 'administrator', 'manager', 'admin'].includes(staffOrAdmin.role);
    const isAdmin = isSysAdmin || isStaffAdmin;
    
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admin can review marks' });
    }
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const classSubmission = exam.classSubmissionStatus.find(
      cs => cs.classId.toString() === classId
    );
    
    if (!classSubmission) {
      return res.status(404).json({ message: 'Class not found in exam' });
    }
    
    if (classSubmission.status !== 'submitted') {
      return res.status(400).json({ 
        message: `Marks must be submitted before review. Current status: ${classSubmission.status}` 
      });
    }
    
    const reviewedCount = await Mark.updateMany(
      { examId, classId, status: 'submitted' },
      {
        status: 'reviewed',
        reviewedBy: userId.toString(),
        reviewedAt: new Date()
      }
    );
    
    classSubmission.status = 'reviewed';
    classSubmission.reviewedBy = userId;
    classSubmission.reviewedAt = new Date();
    await exam.save();
    
    broadcastToRole('admin', 'marks:reviewed', {
      examId: exam._id,
      examName: exam.displayName,
      classId,
      reviewedBy: staffOrAdmin.name,
      reviewedCount: reviewedCount.modifiedCount,
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      message: `Reviewed ${reviewedCount.modifiedCount} marksheets`,
      examStatus: exam.overallStatus
    });
  } catch (error) {
    console.error('Error in reviewMarks:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get student marksheet (for viewing results)
exports.getStudentMarksheet = async (req, res) => {
  try {
    const { examId, studentId } = req.params;
    
    const marksheet = await Mark.findOne({ examId, studentId })
      .populate('studentId', 'fullName rollNumber admissionNo')
      .populate('subjects.subjectId', 'name code');
    
    if (!marksheet) {
      return res.status(404).json({ message: 'Marksheet not found' });
    }
    
    res.json({ success: true, data: marksheet });
  } catch (error) {
    console.error('Error in getStudentMarksheet:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get class rankings
exports.getClassRankings = async (req, res) => {
  try {
    const { examId, classId } = req.params;
    
    const marksheets = await Mark.find({ examId, classId, status: 'published' })
      .sort({ percentage: -1 })
      .populate('studentId', 'fullName rollNumber admissionNo');
    
    let rank = 1;
    let prevPercentage = -1;
    for (let i = 0; i < marksheets.length; i++) {
      if (marksheets[i].percentage !== prevPercentage) {
        rank = i + 1;
      }
      marksheets[i].rank = rank;
      prevPercentage = marksheets[i].percentage;
      await marksheets[i].save();
    }
    
    res.json({
      success: true,
      data: {
        examId,
        examName: marksheets[0]?.examName,
        classId,
        totalStudents: marksheets.length,
        rankings: marksheets
      }
    });
  } catch (error) {
    console.error('Error in getClassRankings:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get teacher's permissions for a class/exam
// Get teacher's permissions for a class/exam
exports.getTeacherPermissions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { examId, classId } = req.params;
    
    const user = await User.findById(userId);
    const isSystemAdmin = user?.role === 'admin';
    
    let staffOrAdmin = null;
    if (!isSystemAdmin) {
      staffOrAdmin = await Staff.findOne({ userId });
    }
    
    const exam = await Exam.findById(examId).populate('subjects.subjectId');
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    // Get the class object to check subject teachers
    const classObj = await Class.findById(classId).populate('subjectTeachers.teacherId', 'name');
    
    if (isSystemAdmin) {
      const allowedSubjects = exam.subjects.map(s => ({
        subjectId: s.subjectId?._id || s.subjectId,
        subjectName: s.subjectName,
        termMaxMarks: s.termMaxMarks || 100,
        termPassingMarks: s.termPassingMarks || 40,
        ceEnabled: s.ceEnabled || exam.ceConfig?.enabled || false,
        ceMaxMarks: s.ceMaxMarks || exam.ceConfig?.maxMarks || 0,
        cePassingMarks: s.cePassingMarks || exam.ceConfig?.passingMarks || 0,
        canEdit: true,
        isAdmin: true
      }));
      
      const classSubmission = exam.classSubmissionStatus.find(
        cs => cs.classId.toString() === classId
      );
      
      return res.json({
        success: true,
        data: {
          teacherId: user._id,
          teacherName: user.name,
          role: 'admin',
          isSystemAdmin: true,
          isAdmin: true,
          isClassTeacher: true,
          allowedSubjects,
          classStatus: classSubmission?.status || 'draft',
          canSubmit: true,
          canReview: true,
          canPublish: true
        }
      });
    }
    
    if (!staffOrAdmin) {
      return res.status(404).json({ message: 'Staff record not found' });
    }
    
    const isStaffAdmin = ['principal', 'administrator', 'manager', 'admin'].includes(staffOrAdmin.role);
    const isAdmin = isStaffAdmin;
    
    // Check if staff is class teacher for this class
    let isClassTeacher = false;
    if (classObj && classObj.classTeacherId) {
      const classTeacherId = classObj.classTeacherId._id || classObj.classTeacherId;
      isClassTeacher = classTeacherId.toString() === staffOrAdmin._id.toString();
    }
    
    // If not class teacher, check if staff is a subject teacher for any subject in this class
    let allowedSubjects = [];
    let isSubjectTeacher = false;
    
    if (isClassTeacher || isAdmin) {
      // Class teacher or admin can edit all subjects
      allowedSubjects = exam.subjects.map(s => ({
        subjectId: s.subjectId?._id || s.subjectId,
        subjectName: s.subjectName,
        termMaxMarks: s.termMaxMarks || 100,
        termPassingMarks: s.termPassingMarks || 40,
        ceEnabled: s.ceEnabled || exam.ceConfig?.enabled || false,
        ceMaxMarks: s.ceMaxMarks || exam.ceConfig?.maxMarks || 0,
        cePassingMarks: s.cePassingMarks || exam.ceConfig?.passingMarks || 0,
        canEdit: true,
        isClassTeacher: !isAdmin && isClassTeacher,
        isAdmin: isAdmin
      }));
    } else {
      // Check subject teachers from the class object
      if (classObj && classObj.subjectTeachers && classObj.subjectTeachers.length > 0) {
        // Find subjects where this teacher is assigned
        const teacherSubjects = classObj.subjectTeachers.filter(st => {
          const teacherId = st.teacherId?._id || st.teacherId;
          return teacherId && teacherId.toString() === staffOrAdmin._id.toString();
        });
        
        if (teacherSubjects.length > 0) {
          isSubjectTeacher = true;
          
          // Get the subject details from the exam
          for (const teacherSubject of teacherSubjects) {
            const subjectId = teacherSubject.subjectId?._id || teacherSubject.subjectId;
            const examSubject = exam.subjects.find(s => {
              const examSubjectId = s.subjectId?._id || s.subjectId;
              return examSubjectId && examSubjectId.toString() === subjectId.toString();
            });
            
            if (examSubject) {
              allowedSubjects.push({
                subjectId: subjectId,
                subjectName: examSubject.subjectName,
                termMaxMarks: examSubject.termMaxMarks || 100,
                termPassingMarks: examSubject.termPassingMarks || 40,
                ceEnabled: examSubject.ceEnabled || exam.ceConfig?.enabled || false,
                ceMaxMarks: examSubject.ceMaxMarks || exam.ceConfig?.maxMarks || 0,
                cePassingMarks: examSubject.cePassingMarks || exam.ceConfig?.passingMarks || 0,
                canEdit: true,
                isSubjectTeacher: true,
                periodsPerWeek: teacherSubject.periodsPerWeek
              });
            }
          }
        }
      }
      
      // Also check StaffAssignment as fallback
      if (allowedSubjects.length === 0) {
        const staffAssignment = await StaffAssignment.findOne({
          staffId: staffOrAdmin._id,
          academicYearId: exam.academicYearId
        });
        
        if (staffAssignment && staffAssignment.subjectsTaught) {
          const teacherSubjects = staffAssignment.subjectsTaught.filter(
            s => s.classId && s.classId.toString() === classId
          );
          
          for (const teacherSubject of teacherSubjects) {
            const subjectId = teacherSubject.subjectId?._id || teacherSubject.subjectId;
            const examSubject = exam.subjects.find(s => {
              const examSubjectId = s.subjectId?._id || s.subjectId;
              return examSubjectId && examSubjectId.toString() === subjectId.toString();
            });
            
            if (examSubject) {
              allowedSubjects.push({
                subjectId: subjectId,
                subjectName: examSubject.subjectName,
                termMaxMarks: examSubject.termMaxMarks || 100,
                termPassingMarks: examSubject.termPassingMarks || 40,
                ceEnabled: examSubject.ceEnabled || exam.ceConfig?.enabled || false,
                ceMaxMarks: examSubject.ceMaxMarks || exam.ceConfig?.maxMarks || 0,
                cePassingMarks: examSubject.cePassingMarks || exam.ceConfig?.passingMarks || 0,
                canEdit: true,
                isSubjectTeacher: true
              });
            }
          }
        }
      }
    }
    
    const classSubmission = exam.classSubmissionStatus.find(
      cs => cs.classId.toString() === classId
    );
    
    // Determine if user can submit (only class teacher or admin)
    const canSubmit = (isClassTeacher || isAdmin) && classSubmission?.status === 'draft';
    
    res.json({
      success: true,
      data: {
        teacherId: staffOrAdmin._id,
        teacherName: staffOrAdmin.name,
        role: staffOrAdmin.role,
        isSystemAdmin: false,
        isStaffAdmin,
        isAdmin,
        isClassTeacher,
        isSubjectTeacher,
        allowedSubjects,
        classStatus: classSubmission?.status || 'draft',
        canSubmit: canSubmit,
        canReview: isAdmin,
        canPublish: isAdmin && classSubmission?.status === 'reviewed',
        hasEditPermission: allowedSubjects.length > 0 || isClassTeacher || isAdmin
      }
    });
  } catch (error) {
    console.error('Error in getTeacherPermissions:', error);
    res.status(500).json({ message: error.message });
  }
};

// Publish exam results (Admin only)
exports.publishResults = async (req, res) => {
  try {
    const { examId, classId } = req.body;
    const userId = req.user.id;
    
    const staffOrAdmin = await getStaffOrAdmin(userId);
    if (!staffOrAdmin) {
      return res.status(403).json({ message: 'Staff record not found' });
    }
    
    const isSysAdmin = staffOrAdmin.isSystemAdmin || false;
    const isStaffAdmin = !isSysAdmin && ['principal', 'administrator', 'manager', 'admin'].includes(staffOrAdmin.role);
    const isAdmin = isSysAdmin || isStaffAdmin;
    
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admin can publish results' });
    }
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    // Update marksheets to published status
    await Mark.updateMany(
      { examId, classId, status: 'reviewed' },
      { status: 'published' }
    );
    
    await generateAndPublishResults(examId, classId, userId);
    
    exam.resultsPublished = true;
    exam.resultsPublishedAt = new Date();
    exam.resultsPublishedBy = userId;
    
    const classSubmission = exam.classSubmissionStatus.find(
      cs => cs.classId.toString() === classId
    );
    if (classSubmission) {
      classSubmission.status = 'published';
    }
    
    await exam.save();
    
    broadcastToClass(classId, 'results:published', {
      examId: exam._id,
      examName: exam.displayName,
      classId,
      timestamp: new Date()
    });
    
    broadcastToRole('admin', 'results:published', {
      examId: exam._id,
      examName: exam.displayName,
      classId,
      publishedBy: staffOrAdmin.name,
      timestamp: new Date()
    });
    
    res.json({
      success: true,
      message: 'Results published successfully'
    });
  } catch (error) {
    console.error('Error in publishResults:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get class results (rankings) - kept for backward compatibility
exports.getClassResults = async (req, res) => {
  try {
    const { examId, classId } = req.params;
    
    const marksheets = await Mark.find({ examId, classId, status: 'published' })
      .sort({ percentage: -1 })
      .populate('studentId', 'fullName studentCode rollNumber');
    
    res.json({
      success: true,
      data: {
        examId,
        examName: marksheets[0]?.examName,
        classId,
        totalStudents: marksheets.length,
        students: marksheets,
        summary: {
          averagePercentage: marksheets.length > 0 
            ? marksheets.reduce((sum, m) => sum + m.percentage, 0) / marksheets.length 
            : 0,
          passPercentage: marksheets.length > 0
            ? (marksheets.filter(m => m.percentage >= 40).length / marksheets.length) * 100
            : 0
        }
      }
    });
  } catch (error) {
    console.error('Error in getClassResults:', error);
    res.status(500).json({ message: error.message });
  }
};

// Helper function to generate and publish results
async function generateAndPublishResults(examId, classId, publishedBy) {
  const exam = await Exam.findById(examId);
  if (!exam) return;
  
  const marksheets = await Mark.find({ examId, classId, status: 'published' });
  const results = [];
  
  for (const marksheet of marksheets) {
    const subjectResults = marksheet.subjects.map(subject => ({
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      subjectCode: subject.subjectCode,
      maxMarks: subject.maxMarks,
      obtainedMarks: subject.totalScore,
      theoryMarks: subject.theoryScore,
      practicalMarks: subject.practicalScore,
      percentage: subject.percentage,
      grade: subject.grade,
      status: subject.percentage >= 40 ? 'pass' : 'fail'
    }));
    
    const result = await ExamResult.findOneAndUpdate(
      { studentId: marksheet.studentId, examId },
      {
        studentId: marksheet.studentId,
        studentName: marksheet.studentName,
        studentCode: marksheet.studentCode,
        rollNumber: marksheet.rollNumber,
        examId,
        examName: exam.displayName,
        classId,
        className: marksheet.className,
        academicYearId: exam.academicYearId,
        academicYear: exam.academicYear,
        term: exam.term,
        subjectResults,
        totalMarks: marksheet.totalMarks,
        totalMaxMarks: marksheet.totalMaxMarks,
        percentage: marksheet.percentage,
        grade: marksheet.grade,
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
}

// Export helper functions
module.exports.generateAndPublishResults = generateAndPublishResults;
module.exports.hasSubjectPermission = hasSubjectPermission;
module.exports.hasClassTeacherPermission = hasClassTeacherPermission;
module.exports.isAdminUser = isAdminUser;
module.exports.getStaffOrAdmin = getStaffOrAdmin;