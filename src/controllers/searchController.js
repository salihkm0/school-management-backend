const Student = require('../models/Student');
const Staff = require('../models/Staff');
const Class = require('../models/Class');

exports.globalSearch = async (req, res) => {
  try {
    const query = req.query.q;
    
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

    const regex = new RegExp(query, 'i');

    // Run parallel queries
    const [students, staff, classes] = await Promise.all([
      Student.find({
        status: 'active',
        $or: [
          { fullName: regex },
          { admissionNo: regex },
          { studentCode: regex }
        ]
      })
      .select('_id fullName admissionNo studentCode photoUrl className')
      .limit(5),
      
      Staff.find({
        isActive: true,
        $or: [
          { name: regex },
          { staffCode: regex },
          { email: regex }
        ]
      })
      .select('_id name staffCode email role photoUrl')
      .limit(5),
      
      Class.find({
        isActive: true,
        $or: [
          { name: regex },
          { displayName: regex },
          { section: regex }
        ]
      })
      .select('_id name section displayName')
      .limit(5)
    ]);

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
