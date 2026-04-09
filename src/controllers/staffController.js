const Staff = require("../models/Staff");
const User = require("../models/User");
const Class = require("../models/Class");
const { sendEmail } = require("../services/emailService");

exports.getStaff = async (req, res) => {
  try {
    const { role, isActive, page = 1, limit = 20, search } = req.query;

    const query = {};
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === "true";
    if (search) {
      query.$text = { $search: search };
    }

    const staff = await Staff.find(query)
      .populate("userId", "email name phone")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Staff.countDocuments(query);

    res.json({
      success: true,
      data: staff,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getStaffMember = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id)
      .populate("userId", "email name phone photoUrl")
      .populate("assignedClassId", "name section");

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createStaff = async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      phone,
      role,
      qualification,
      contact,
      dateOfJoining,
      subjectExpertise,
    } = req.body;

    const user = await User.create({
      email,
      password,
      name,
      role: "staff",
      phone,
    });

    const staff = await Staff.create({
      userId: user._id,
      name,
      role,
      qualification,
      contact,
      dateOfJoining: new Date(dateOfJoining),
      subjectExpertise: subjectExpertise || [],
    });

    await sendEmail({
      email: user.email,
      subject: "Welcome to School Management System",
      template: "staff_welcome",
      data: { name, email, password },
    });

    res.status(201).json({
      success: true,
      data: staff,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateStaff = async (req, res) => {
  try {
    const staff = await Staff.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    if (req.body.name || req.body.phone) {
      await User.findByIdAndUpdate(staff.userId, {
        name: req.body.name || staff.name,
        phone: req.body.phone,
      });
    }

    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    staff.isActive = false;
    await staff.save();

    await User.findByIdAndUpdate(staff.userId, { isActive: false });

    res.json({ message: "Staff deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.assignSubjects = async (req, res) => {
  try {
    const { subjects } = req.body;

    const staff = await Staff.findByIdAndUpdate(
      req.params.id,
      { assignedSubjects: subjects },
      { new: true },
    );

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    res.json({
      success: true,
      message: "Subjects assigned successfully",
      assignedSubjects: staff.assignedSubjects,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getStaffByClass = async (req, res) => {
  try {
    const staff = await Staff.findOne({
      assignedClassId: req.params.classId,
    }).populate("userId", "name email phone");

    res.json(staff);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getStaffSchedule = async (req, res) => {
  try {
    const staff = await Staff.findById(req.params.id);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const classes = await Class.find({
      "timetable.periods.teacherId": staff.userId,
    }).populate("subjects");

    const schedule = [];
    classes.forEach((classItem) => {
      classItem.timetable.forEach((day) => {
        day.periods.forEach((period) => {
          if (period.teacherId.toString() === staff.userId.toString()) {
            schedule.push({
              classId: classItem._id,
              className: classItem.name,
              section: classItem.section,
              subject: period.subjectId,
              day: day.day,
              startTime: period.startTime,
              endTime: period.endTime,
              room: period.room,
            });
          }
        });
      });
    });

    res.json(schedule);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
