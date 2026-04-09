const StaffDuty = require("../models/StaffDuty");
const StaffDutyStats = require("../models/StaffDutyStats");
const Staff = require("../models/Staff");
const { broadcastToUser } = require("../config/socket");

// ==================== ADVANCED DUTY SCHEDULING ALGORITHMS ====================

/**
 * Priority Queue Algorithm with Multiple Date Selection
 * Most efficient for large datasets with multiple dates
 */
const priorityQueueSchedule = (
  staff,
  dutyDates,
  dutyType,
  excludedStaffIds = [],
) => {
  const availableStaff = staff.filter(
    (s) => !excludedStaffIds.includes(s._id.toString()),
  );
  const totalStaff = availableStaff.length;
  const totalDuties = dutyDates.length;

  // Calculate target duties per staff
  const targetPerStaff = totalDuties / totalStaff;
  const minPerStaff = Math.floor(targetPerStaff);
  const maxPerStaff = Math.ceil(targetPerStaff);

  // Priority queue based on current duty count
  const staffQueue = availableStaff.map((staff) => ({
    staff,
    currentDuties: 0,
    priority: 0,
  }));

  const assignments = [];
  const dailyUsage = {};
  const staffSchedule = {};

  // Update priority function
  const updatePriorities = () => {
    staffQueue.forEach((item) => {
      const deviation = item.currentDuties - targetPerStaff;
      item.priority = -deviation;
    });
    staffQueue.sort((a, b) => b.priority - a.priority);
  };

  // Sort dates (optional - can be any order)
  const sortedDates = [...dutyDates].sort((a, b) => new Date(a) - new Date(b));

  for (const dutyDate of sortedDates) {
    const dateKey = new Date(dutyDate).toISOString().split("T")[0];
    dailyUsage[dateKey] = new Set();

    // Update priorities before each date
    updatePriorities();

    // Find staff with highest priority not used on this date
    let selectedItem = null;

    for (const item of staffQueue) {
      if (
        !dailyUsage[dateKey].has(item.staff._id.toString()) &&
        item.currentDuties < maxPerStaff
      ) {
        selectedItem = item;
        break;
      }
    }

    // If no staff available, reset daily usage
    if (!selectedItem) {
      dailyUsage[dateKey].clear();
      for (const item of staffQueue) {
        if (item.currentDuties < maxPerStaff) {
          selectedItem = item;
          break;
        }
      }
    }

    if (selectedItem) {
      assignments.push({
        staffId: selectedItem.staff._id,
        staffName: selectedItem.staff.name,
        dutyDate: new Date(dutyDate),
        dutyType: dutyType,
      });

      selectedItem.currentDuties++;
      dailyUsage[dateKey].add(selectedItem.staff._id.toString());

      if (!staffSchedule[selectedItem.staff._id.toString()]) {
        staffSchedule[selectedItem.staff._id.toString()] = [];
      }
      staffSchedule[selectedItem.staff._id.toString()].push({
        date: dutyDate,
        type: dutyType,
      });
    }
  }

  const staffDutyCount = {};
  staffQueue.forEach((item) => {
    staffDutyCount[item.staff._id.toString()] = item.currentDuties;
  });

  return { assignments, staffDutyCount, staffSchedule };
};

/**
 * Multi-Type Duty Scheduler
 * Handles multiple duty types simultaneously
 */
const multiTypeSchedule = (staff, dutyRequirements, excludedStaffIds = []) => {
  const availableStaff = staff.filter(
    (s) => !excludedStaffIds.includes(s._id.toString()),
  );
  const totalStaff = availableStaff.length;

  // Calculate total duties across all types
  let totalDuties = 0;
  dutyRequirements.forEach((req) => {
    totalDuties += req.dates.length;
  });

  const targetPerStaff = totalDuties / totalStaff;

  // Initialize staff queue
  const staffQueue = availableStaff.map((staff) => ({
    staff,
    dutyCounts: {},
    totalDuties: 0,
  }));

  const allAssignments = {};
  const staffSchedules = {};

  // Process each duty type
  for (const requirement of dutyRequirements) {
    const { dutyType, dates, priority = 1 } = requirement;
    const assignments = [];
    const dailyUsage = {};

    // Sort dates
    const sortedDates = [...dates].sort((a, b) => new Date(a) - new Date(b));

    for (const dutyDate of sortedDates) {
      const dateKey = new Date(dutyDate).toISOString().split("T")[0];
      if (!dailyUsage[dateKey]) dailyUsage[dateKey] = new Set();

      // Sort staff by current duty count (ascending)
      const sortedStaff = [...staffQueue].sort(
        (a, b) => (a.dutyCounts[dutyType] || 0) - (b.dutyCounts[dutyType] || 0),
      );

      let selectedItem = null;

      for (const item of sortedStaff) {
        if (!dailyUsage[dateKey].has(item.staff._id.toString())) {
          selectedItem = item;
          break;
        }
      }

      if (selectedItem) {
        assignments.push({
          staffId: selectedItem.staff._id,
          staffName: selectedItem.staff.name,
          dutyDate: new Date(dutyDate),
          dutyType: dutyType,
        });

        selectedItem.dutyCounts[dutyType] =
          (selectedItem.dutyCounts[dutyType] || 0) + 1;
        selectedItem.totalDuties++;
        dailyUsage[dateKey].add(selectedItem.staff._id.toString());

        if (!staffSchedules[selectedItem.staff._id.toString()]) {
          staffSchedules[selectedItem.staff._id.toString()] = [];
        }
        staffSchedules[selectedItem.staff._id.toString()].push({
          date: dutyDate,
          type: dutyType,
        });
      }
    }

    allAssignments[dutyType] = assignments;
  }

  // Calculate statistics
  const staffTotals = {};
  staffQueue.forEach((item) => {
    staffTotals[item.staff._id.toString()] = {
      name: item.staff.name,
      total: item.totalDuties,
      byType: item.dutyCounts,
    };
  });

  return { allAssignments, staffTotals, staffSchedules };
};

exports.getDuties = async (req, res) => {
  try {
    const {
      staffId,
      classId,
      startDate,
      endDate,
      dutyType,
      page = 1,
      limit = 50,
    } = req.query;

    const query = {};
    if (staffId) query.staffId = staffId;
    if (classId) query.classId = classId;
    if (dutyType) query.dutyType = dutyType;
    if (startDate || endDate) {
      query.dutyDate = {};
      if (startDate) query.dutyDate.$gte = new Date(startDate);
      if (endDate) query.dutyDate.$lte = new Date(endDate);
    }

    const duties = await StaffDuty.find(query)
      .populate("staffId", "name role")
      .populate("classId", "name section")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ dutyDate: 1, dayNumber: 1 });

    const total = await StaffDuty.countDocuments(query);

    res.json({
      success: true,
      data: duties,
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

exports.getDutyById = async (req, res) => {
  try {
    const duty = await StaffDuty.findById(req.params.id)
      .populate("staffId", "name role contact")
      .populate("classId", "name section")
      .populate("assignedBy", "name");

    if (!duty) {
      return res.status(404).json({ message: "Duty assignment not found" });
    }

    res.json(duty);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Auto assign duties with multiple date selection
// @route   POST /api/staff-duty/auto-assign
// @access  Private/Admin
exports.autoAssignDuties = async (req, res) => {
  try {
    const {
      dates, // Array of dates (multiple date selection)
      dutyType,
      excludedStaffIds = [],
      algorithm = "priority",
    } = req.body;

    if (!dates || dates.length === 0) {
      return res
        .status(400)
        .json({ message: "Please select at least one date" });
    }

    const allStaff = await Staff.find({ isActive: true });

    if (allStaff.length === 0) {
      return res.status(400).json({ message: "No staff available" });
    }

    console.log(`🚀 Starting duty scheduling...`);
    console.log(
      `   Staff: ${allStaff.length}, Dates: ${dates.length}, Type: ${dutyType}`,
    );

    // Run scheduling algorithm
    const { assignments, staffDutyCount, staffSchedule } =
      priorityQueueSchedule(allStaff, dates, dutyType, excludedStaffIds);

    // Save assignments to database
    const savedAssignments = [];
    for (const assignment of assignments) {
      const existingDuty = await StaffDuty.findOne({
        staffId: assignment.staffId,
        "duties.date": assignment.dutyDate,
        dutyType: assignment.dutyType,
      });

      if (!existingDuty) {
        const duty = await StaffDuty.create({
          staffId: assignment.staffId,
          staffName: assignment.staffName,
          dutyType: assignment.dutyType,
          duties: [
            {
              date: assignment.dutyDate,
              shift: "full",
              duration: 8,
            },
          ],
          assignedBy: req.user.id,
        });
        savedAssignments.push(duty);

        // Update staff duty statistics
        await updateStaffDutyStats(
          assignment.staffId,
          assignment.staffName,
          assignment.dutyType,
          1,
          8,
        );

        // Send real-time notification
        const staff = await Staff.findById(assignment.staffId);
        if (staff && staff.userId) {
          broadcastToUser(staff.userId.toString(), "duty:assigned", {
            dutyId: duty._id,
            dutyType: assignment.dutyType,
            dutyDate: assignment.dutyDate,
            staffName: assignment.staffName,
          });
        }
      }
    }

    // Calculate statistics
    const counts = Object.values(staffDutyCount);
    const maxDuties = Math.max(...counts);
    const minDuties = Math.min(...counts);
    const avgDuties = counts.reduce((a, b) => a + b, 0) / counts.length;
    const fairnessScore = (minDuties / maxDuties) * 100;

    res.json({
      success: true,
      message: `${savedAssignments.length} duties assigned for ${dates.length} dates`,
      statistics: {
        totalStaff: allStaff.length,
        totalDates: dates.length,
        totalDuties: savedAssignments.length,
        dutiesPerStaff: {
          min: minDuties,
          max: maxDuties,
          avg: avgDuties.toFixed(2),
          fairness: fairnessScore.toFixed(2) + "%",
        },
        staffDistribution: staffDutyCount,
        perfectBalance: maxDuties - minDuties <= 1,
      },
      assignments: savedAssignments,
      staffSchedule,
    });
  } catch (error) {
    console.error("Auto assign error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Multi-type duty scheduling (exam, sports, arts, workshop simultaneously)
// @route   POST /api/staff-duty/multi-type-assign
// @access  Private/Admin
exports.multiTypeAssign = async (req, res) => {
  try {
    const { dutyRequirements, excludedStaffIds = [] } = req.body;
    // dutyRequirements = [
    //   { dutyType: 'exam', dates: ['2024-01-15', '2024-01-16'], priority: 1 },
    //   { dutyType: 'sports', dates: ['2024-01-20', '2024-01-21'], priority: 2 },
    //   { dutyType: 'arts', dates: ['2024-01-25'], priority: 3 }
    // ]

    if (!dutyRequirements || dutyRequirements.length === 0) {
      return res
        .status(400)
        .json({ message: "Please provide duty requirements" });
    }

    const allStaff = await Staff.find({ isActive: true });

    if (allStaff.length === 0) {
      return res.status(400).json({ message: "No staff available" });
    }

    console.log(`🚀 Starting multi-type duty scheduling...`);

    const { allAssignments, staffTotals, staffSchedules } = multiTypeSchedule(
      allStaff,
      dutyRequirements,
      excludedStaffIds,
    );

    // Save all assignments to database
    const savedAssignments = {};
    const allSaved = [];

    for (const [dutyType, assignments] of Object.entries(allAssignments)) {
      savedAssignments[dutyType] = [];
      for (const assignment of assignments) {
        const existingDuty = await StaffDuty.findOne({
          staffId: assignment.staffId,
          "duties.date": assignment.dutyDate,
          dutyType: assignment.dutyType,
        });

        if (!existingDuty) {
          const duty = await StaffDuty.create({
            staffId: assignment.staffId,
            staffName: assignment.staffName,
            dutyType: assignment.dutyType,
            duties: [
              {
                date: assignment.dutyDate,
                shift: "full",
                duration: 8,
              },
            ],
            assignedBy: req.user.id,
          });
          savedAssignments[dutyType].push(duty);
          allSaved.push(duty);

          await updateStaffDutyStats(
            assignment.staffId,
            assignment.staffName,
            dutyType,
            1,
            8,
          );

          const staff = await Staff.findById(assignment.staffId);
          if (staff && staff.userId) {
            broadcastToUser(staff.userId.toString(), "duty:assigned", {
              dutyId: duty._id,
              dutyType: dutyType,
              dutyDate: assignment.dutyDate,
              staffName: assignment.staffName,
            });
          }
        }
      }
    }

    // Calculate overall statistics
    const totalDuties = allSaved.length;
    const totalDates = dutyRequirements.reduce(
      (sum, req) => sum + req.dates.length,
      0,
    );

    res.json({
      success: true,
      message: `${totalDuties} duties assigned across ${dutyRequirements.length} types`,
      statistics: {
        totalStaff: allStaff.length,
        totalDates,
        totalDuties,
        byType: Object.entries(savedAssignments).map(([type, assignments]) => ({
          type,
          count: assignments.length,
        })),
        staffDistribution: staffTotals,
      },
      assignments: savedAssignments,
      staffSchedules,
    });
  } catch (error) {
    console.error("Multi-type assign error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Manual assign duty with multiple dates
// @route   POST /api/staff-duty/manual
// @access  Private/Admin
exports.assignManualDuty = async (req, res) => {
  try {
    const { staffId, dutyType, dates, shift, duration, location, remarks } =
      req.body;

    if (!dates || dates.length === 0) {
      return res
        .status(400)
        .json({ message: "Please select at least one date" });
    }

    const staff = await Staff.findById(staffId);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const duties = [];
    const dutyRecords = [];

    for (const date of dates) {
      const dutyDate = new Date(date);

      // Check for conflicts
      const existingDuty = await StaffDuty.findOne({
        staffId,
        "duties.date": dutyDate,
        dutyType,
      });

      if (!existingDuty) {
        dutyRecords.push({
          date: dutyDate,
          shift: shift || "full",
          duration: duration || 8,
          startTime: req.body.startTime,
          endTime: req.body.endTime,
        });
      }
    }

    if (dutyRecords.length > 0) {
      const duty = await StaffDuty.create({
        staffId,
        staffName: staff.name,
        dutyType,
        duties: dutyRecords,
        assignedBy: req.user.id,
        location,
        remarks,
      });
      duties.push(duty);

      // Update statistics
      await updateStaffDutyStats(
        staffId,
        staff.name,
        dutyType,
        dutyRecords.length,
        dutyRecords.length * 8,
      );

      // Send notification
      broadcastToUser(staff.userId.toString(), "duty:assigned", {
        dutyId: duty._id,
        dutyType,
        dutyDates: dutyRecords.map((d) => d.date),
        staffName: staff.name,
      });
    }

    res.status(201).json({
      success: true,
      message: `${dutyRecords.length} duties assigned to ${staff.name}`,
      duties,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get available dates for scheduling
// @route   GET /api/staff-duty/available-dates
// @access  Private/Admin
exports.getAvailableDates = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      excludeWeekends = true,
      excludeHolidays = true,
    } = req.query;

    const start = new Date(startDate || new Date());
    const end = new Date(
      endDate || new Date(new Date().setMonth(new Date().getMonth() + 3)),
    );

    const dates = [];
    const currentDate = new Date(start);

    // Predefined holidays (can be fetched from database)
    const holidays = [
      "01-01", // New Year
      "01-26", // Republic Day
      "08-15", // Independence Day
      "10-02", // Gandhi Jayanti
      "12-25", // Christmas
    ];

    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay();
      const isWeekend = excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6);
      const dateStr = `${currentDate.getMonth() + 1}-${currentDate.getDate()}`;
      const isHoliday = excludeHolidays && holidays.includes(dateStr);

      if (!isWeekend && !isHoliday) {
        dates.push(new Date(currentDate));
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({
      success: true,
      totalDates: dates.length,
      dates: dates.map((d) => d.toISOString().split("T")[0]),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get staff duty statistics
// @route   GET /api/staff-duty/stats
// @access  Private/Admin
exports.getStaffDutyStats = async (req, res) => {
  try {
    const { staffId, dutyType, year, month } = req.query;

    let query = {};
    if (staffId) query.staffId = staffId;
    if (dutyType) query.dutyType = dutyType;

    // Date range filter
    if (year) {
      const startDate = new Date(year, (month || 0) - 1, 1);
      const endDate = new Date(year, month ? month : 12, 0);
      query["duties.date"] = { $gte: startDate, $lte: endDate };
    }

    const duties = await StaffDuty.find(query)
      .populate("staffId", "name role")
      .sort({ "duties.date": -1 });

    // Aggregate statistics
    const stats = {};
    const staffStats = {};

    duties.forEach((duty) => {
      const sid = duty.staffId._id.toString();
      if (!stats[sid]) {
        stats[sid] = {
          staffName: duty.staffName,
          role: duty.staffId?.role,
          totalDuties: 0,
          totalHours: 0,
          byType: {},
          byMonth: {},
        };
      }

      stats[sid].totalDuties += duty.totalDuties;
      stats[sid].totalHours += duty.totalHours;
      stats[sid].byType[duty.dutyType] =
        (stats[sid].byType[duty.dutyType] || 0) + duty.totalDuties;

      duty.duties.forEach((d) => {
        const monthKey = `${d.date.getFullYear()}-${d.date.getMonth() + 1}`;
        if (!stats[sid].byMonth[monthKey]) {
          stats[sid].byMonth[monthKey] = 0;
        }
        stats[sid].byMonth[monthKey]++;
      });
    });

    // Get overall totals
    const totalDuties = duties.reduce((sum, d) => sum + d.totalDuties, 0);
    const totalHours = duties.reduce((sum, d) => sum + d.totalHours, 0);

    res.json({
      success: true,
      summary: {
        totalStaff: Object.keys(stats).length,
        totalDuties,
        totalHours,
        averagePerStaff: (totalDuties / Object.keys(stats).length).toFixed(2),
      },
      staffStats: stats,
      recentDuties: duties.slice(0, 50),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get staff duty count
// @route   GET /api/staff-duty/count/:staffId
// @access  Private/Admin
exports.getStaffDutyCount = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { startDate, endDate, dutyType } = req.query;

    const query = { staffId };
    if (dutyType) query.dutyType = dutyType;

    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      query["duties.date"] = dateFilter;
    }

    const duties = await StaffDuty.find(query);

    let totalDuties = 0;
    let totalHours = 0;
    const byType = {};

    duties.forEach((duty) => {
      totalDuties += duty.totalDuties;
      totalHours += duty.totalHours;
      byType[duty.dutyType] = (byType[duty.dutyType] || 0) + duty.totalDuties;
    });

    res.json({
      success: true,
      staffId,
      summary: {
        totalDuties,
        totalHours,
        byType,
      },
      details: duties,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateDuty = async (req, res) => {
  try {
    const duty = await StaffDuty.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!duty) {
      return res.status(404).json({ message: "Duty assignment not found" });
    }

    res.json(duty);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteDuty = async (req, res) => {
  try {
    const duty = await StaffDuty.findByIdAndDelete(req.params.id);

    if (!duty) {
      return res.status(404).json({ message: "Duty assignment not found" });
    }

    res.json({ message: "Duty assignment deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bulk delete duties
// @route   DELETE /api/staff-duty/bulk
// @access  Private/Admin
exports.bulkDeleteDuties = async (req, res) => {
  try {
    const { dutyIds } = req.body;

    const result = await StaffDuty.deleteMany({ _id: { $in: dutyIds } });

    res.json({
      success: true,
      message: `${result.deletedCount} duties deleted`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getStaffDutySummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const query = {};
    if (startDate || endDate) {
      query.dutyDate = {};
      if (startDate) query.dutyDate.$gte = new Date(startDate);
      if (endDate) query.dutyDate.$lte = new Date(endDate);
    }

    const duties = await StaffDuty.find(query);

    const staffSummary = {};
    const dailySummary = {};

    duties.forEach((duty) => {
      const staffId = duty.staffId.toString();
      if (!staffSummary[staffId]) {
        staffSummary[staffId] = {
          staffName: duty.staffName,
          totalDuties: 0,
          dutyTypes: {},
        };
      }
      staffSummary[staffId].totalDuties++;
      staffSummary[staffId].dutyTypes[duty.dutyType] =
        (staffSummary[staffId].dutyTypes[duty.dutyType] || 0) + 1;

      const dateKey = duty.dutyDate.toISOString().split("T")[0];
      if (!dailySummary[dateKey]) {
        dailySummary[dateKey] = {
          date: duty.dutyDate,
          totalDuties: 0,
          duties: [],
        };
      }
      dailySummary[dateKey].totalDuties++;
      dailySummary[dateKey].duties.push(duty);
    });

    res.json({
      staffSummary,
      dailySummary,
      totalDuties: duties.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Helper function to update staff duty statistics
async function updateStaffDutyStats(
  staffId,
  staffName,
  dutyType,
  dutyCount,
  hours,
) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const monthKey = `${currentYear}-${currentMonth}`;
  const yearKey = `${currentYear}`;

  let stats = await StaffDutyStats.findOne({ staffId });

  if (!stats) {
    stats = new StaffDutyStats({
      staffId,
      staffName,
      monthlyStats: new Map(),
      yearlyStats: new Map(),
      overallStats: {
        totalDuties: 0,
        totalHours: 0,
        byType: new Map(),
      },
    });
  }

  // Update monthly stats
  if (!stats.monthlyStats.has(monthKey)) {
    stats.monthlyStats.set(monthKey, {
      totalDuties: 0,
      totalHours: 0,
      byType: new Map(),
    });
  }
  const monthly = stats.monthlyStats.get(monthKey);
  monthly.totalDuties += dutyCount;
  monthly.totalHours += hours;
  monthly.byType.set(dutyType, (monthly.byType.get(dutyType) || 0) + dutyCount);

  // Update yearly stats
  if (!stats.yearlyStats.has(yearKey)) {
    stats.yearlyStats.set(yearKey, {
      totalDuties: 0,
      totalHours: 0,
      byType: new Map(),
    });
  }
  const yearly = stats.yearlyStats.get(yearKey);
  yearly.totalDuties += dutyCount;
  yearly.totalHours += hours;
  yearly.byType.set(dutyType, (yearly.byType.get(dutyType) || 0) + dutyCount);

  // Update overall stats
  stats.overallStats.totalDuties += dutyCount;
  stats.overallStats.totalHours += hours;
  stats.overallStats.byType.set(
    dutyType,
    (stats.overallStats.byType.get(dutyType) || 0) + dutyCount,
  );
  stats.overallStats.lastUpdated = new Date();

  await stats.save();
}
