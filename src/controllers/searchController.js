const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Class = require('../models/Class');

exports.globalSearch = async (req, res) => {
  try {
    const query = req.query.q || req.query.search;
    const limit = Math.min(parseInt(req.query.limit) || 15, 50);
    const type = req.query.type; // optional: 'student', 'staff', 'class'
    
    if (!query || query.trim() === '') {
      return res.status(200).json({
        success: true,
        data: {
          students: [],
          staff: [],
          classes: []
        }
      });
    }

    const trimmed = query.trim();
    const regex = new RegExp(trimmed.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');

    const queries = [];

    // Search Students
    if (!type || type === 'student' || type === 'students') {
      queries.push(
        Student.find({
          isActive: true,
          $or: [
            { fullName: regex },
            { fullNameMalayalam: regex },
            { admissionNo: regex },
            { studentCode: regex },
            { rollNumber: regex },
            { phoneNumber: regex },
            { eid: regex }
          ]
        })
        .populate('classId', 'name section displayName')
        .select('_id fullName fullNameMalayalam admissionNo studentCode rollNumber className division gender status photoUrl phoneNumber classId')
        .sort({ className: 1, division: 1, rollNumber: 1, fullName: 1 })
        .limit(limit)
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    // Search Staff
    if (!type || type === 'staff') {
      queries.push(
        Staff.find({
          isActive: true,
          $or: [
            { name: regex },
            { staffCode: regex },
            { email: regex },
            { phone: regex }
          ]
        })
        .select('_id name staffCode email role photoUrl phone')
        .limit(limit)
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    // Search Classes
    if (!type || type === 'class' || type === 'classes') {
      queries.push(
        Class.find({
          isActive: true,
          $or: [
            { name: regex },
            { displayName: regex },
            { section: regex }
          ]
        })
        .select('_id name section displayName')
        .limit(limit)
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    const [students, staff, classes] = await Promise.all(queries);

    res.status(200).json({
      success: true,
      data: {
        students,
        staff,
        classes
      }
    });
  } catch (error) {
    console.error('Error in globalSearch:', error);
    res.status(500).json({ success: false, message: 'Failed to perform search' });
  }
};
