const Student = require('../models/Student');
const Parent = require('../models/Parent');
const User = require('../models/User');

/**
 * Get all parent user accounts and details for students in a given class.
 * 
 * @param {string|import('mongoose').Types.ObjectId} classId 
 * @returns {Promise<{ parentsList: Array, parentUserIds: Array }>}
 */
async function getParentUsersByClass(classId) {
  if (!classId) return { parentsList: [], parentUserIds: [] };

  // 1. Find all students in this class
  const students = await Student.find({ classId }).lean();
  if (!students || students.length === 0) {
    return { parentsList: [], parentUserIds: [] };
  }

  // 2. Collect all codes and existing parentIds
  const studentCodes = students.map(s => s.studentCode).filter(Boolean).map(String);
  const admissionNos = students.map(s => s.admissionNo).filter(Boolean).map(String);
  const allCodes = Array.from(new Set([...studentCodes, ...admissionNos]));
  const existingParentIds = students.flatMap(s => s.parentIds || []).filter(Boolean);

  // 3. Find parents connected via students array OR parentIds/userId
  const parentQuery = {
    $or: [
      { 'students.studentCode': { $in: allCodes } },
      { _id: { $in: existingParentIds } },
      { userId: { $in: existingParentIds } }
    ],
    isActive: { $ne: false }
  };

  const parentDocs = await Parent.find(parentQuery)
    .populate('userId', '_id name email phone role photoUrl isActive')
    .lean();

  const parentsMap = new Map();
  const studentUpdates = [];

  for (const parent of parentDocs) {
    // If parent has a User account, that is the recipient for notifications
    const userObj = parent.userId && typeof parent.userId === 'object' ? parent.userId : null;
    const targetUserId = userObj?._id || parent.userId || parent._id;
    if (!targetUserId) continue;

    // Filter out inactive user accounts
    if (userObj && userObj.isActive === false) continue;

    const pIdStr = parent._id ? parent._id.toString() : '';
    const pUserIdStr = targetUserId.toString();
    const parentCodes = new Set((parent.students || []).map(cs => String(cs.studentCode)));

    // Match which students in this class belong to this parent
    const matchedStudents = students.filter(st => {
      const hasCode = parentCodes.has(String(st.studentCode)) ||
                      (st.admissionNo && parentCodes.has(String(st.admissionNo)));
      const hasParentId = (st.parentIds || []).some(id => {
        const s = id.toString();
        return s === pIdStr || s === pUserIdStr;
      });
      return hasCode || hasParentId;
    });

    const key = pUserIdStr;
    const studentNames = matchedStudents.map(s => s.fullName).filter(Boolean);
    const studentAdmissionNos = matchedStudents.map(s => s.admissionNo || s.studentCode).filter(Boolean);

    if (!parentsMap.has(key)) {
      parentsMap.set(key, {
        _id: targetUserId,
        userId: targetUserId,
        parentId: parent._id,
        name: parent.fullName || userObj?.name || 'Parent',
        email: parent.email || userObj?.email || '',
        phone: parent.phone || userObj?.phone || '',
        role: userObj?.role || 'parent',
        photoUrl: userObj?.photoUrl || null,
        studentNames,
        studentAdmissionNos,
        studentCount: matchedStudents.length
      });
    } else {
      const existing = parentsMap.get(key);
      studentNames.forEach(n => {
        if (!existing.studentNames.includes(n)) existing.studentNames.push(n);
      });
      studentAdmissionNos.forEach(a => {
        if (!existing.studentAdmissionNos.includes(a)) existing.studentAdmissionNos.push(a);
      });
      existing.studentCount = existing.studentNames.length;
    }

    // Prepare sync for students missing parent._id or parent.userId
    if (matchedStudents.length > 0 && parent._id) {
      for (const st of matchedStudents) {
        const hasParent = (st.parentIds || []).some(id => id.toString() === pIdStr);
        if (!hasParent) {
          studentUpdates.push({
            studentId: st._id,
            parentId: parent._id,
            userId: userObj?._id || null
          });
        }
      }
    }
  }

  // Also check if any existingParentIds reference User model directly (role: 'parent') without Parent doc
  if (existingParentIds.length > 0) {
    const directUserParents = await User.find({
      _id: { $in: existingParentIds },
      role: 'parent',
      isActive: { $ne: false }
    }).select('_id name email phone role photoUrl').lean();

    for (const u of directUserParents) {
      const key = u._id.toString();
      if (!parentsMap.has(key)) {
        const matchedStudents = students.filter(st => 
          (st.parentIds || []).some(id => id.toString() === key)
        );
        parentsMap.set(key, {
          _id: u._id,
          userId: u._id,
          parentId: null,
          name: u.name || 'Parent',
          email: u.email || '',
          phone: u.phone || '',
          role: u.role || 'parent',
          photoUrl: u.photoUrl || null,
          studentNames: matchedStudents.map(s => s.fullName).filter(Boolean),
          studentAdmissionNos: matchedStudents.map(s => s.admissionNo || s.studentCode).filter(Boolean),
          studentCount: matchedStudents.length
        });
      }
    }
  }

  // Background sync missing parentIds on student documents
  if (studentUpdates.length > 0) {
    Promise.all(studentUpdates.map(u => {
      const toAdd = [u.parentId];
      if (u.userId) toAdd.push(u.userId);
      return Student.updateOne({ _id: u.studentId }, { $addToSet: { parentIds: { $each: toAdd } } });
    })).catch(err => {
      console.warn('Background sync student parentIds error:', err.message);
    });
  }

  const parentsList = Array.from(parentsMap.values());
  const parentUserIds = parentsList.map(p => p._id);

  return { parentsList, parentUserIds };
}

/**
 * Get parent user IDs for a single student.
 * 
 * @param {string|import('mongoose').Types.ObjectId|Object} studentIdOrDoc 
 * @returns {Promise<Array>} Array of User._id
 */
async function getParentUsersByStudent(studentIdOrDoc) {
  let student = studentIdOrDoc;
  if (!student || !student._id || !student.studentCode) {
    student = await Student.findById(studentIdOrDoc).lean();
  }
  if (!student) return [];

  const codes = [student.studentCode, student.admissionNo].filter(Boolean).map(String);
  const existingParentIds = (student.parentIds || []).filter(Boolean);

  const parentDocs = await Parent.find({
    $or: [
      { 'students.studentCode': { $in: codes } },
      { _id: { $in: existingParentIds } },
      { userId: { $in: existingParentIds } }
    ],
    isActive: { $ne: false }
  }).populate('userId', '_id isActive role').lean();

  const userIds = new Set();
  const toSyncParentIds = [];

  for (const parent of parentDocs) {
    const userObj = parent.userId && typeof parent.userId === 'object' ? parent.userId : null;
    if (userObj && userObj.isActive === false) continue;
    const targetUserId = userObj?._id || parent.userId || parent._id;
    if (targetUserId) {
      userIds.add(targetUserId.toString());
    }
    if (parent._id) {
      toSyncParentIds.push(parent._id);
      if (userObj?._id) toSyncParentIds.push(userObj._id);
    }
  }

  // Also check if any parentId was directly a User
  if (existingParentIds.length > 0) {
    const directUsers = await User.find({
      _id: { $in: existingParentIds },
      role: 'parent',
      isActive: { $ne: false }
    }).select('_id').lean();
    for (const u of directUsers) {
      userIds.add(u._id.toString());
    }
  }

  // Background sync student parentIds
  if (toSyncParentIds.length > 0) {
    Student.updateOne(
      { _id: student._id },
      { $addToSet: { parentIds: { $each: toSyncParentIds } } }
    ).catch(() => {});
  }

  return Array.from(userIds);
}

module.exports = {
  getParentUsersByClass,
  getParentUsersByStudent
};
