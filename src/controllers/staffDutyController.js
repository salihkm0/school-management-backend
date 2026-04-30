const StaffDuty = require("../models/StaffDuty");
const StaffDutyStats = require("../models/StaffDutyStats");
const Staff = require("../models/Staff");
const Notification = require("../models/Notification");
const { broadcastToUser, broadcastToRole } = require("../config/socket");

// Shift configurations
const SHIFT_CONFIG = {
  morning: { label: 'Morning (9:00 AM - 12:00 PM)', duration: 3, startTime: '09:00 AM', endTime: '12:00 PM' },
  afternoon: { label: 'Afternoon (2:00 PM - 5:00 PM)', duration: 3, startTime: '02:00 PM', endTime: '05:00 PM' },
  full: { label: 'Full Day (9:00 AM - 5:00 PM)', duration: 8, startTime: '09:00 AM', endTime: '05:00 PM' }
};

// Helper function to send duty notification
async function sendDutyNotification(staffId, staffName, dutyType, dutyDate, shift, dutyId, className) {
  const dutyTypeNames = {
    exam: 'Exam Duty',
    invigilation: 'Invigilation Duty',
    supervision: 'Supervision Duty',
    hall_monitor: 'Hall Monitor Duty',
    security: 'Security Duty',
    sports: 'Sports Duty',
    arts: 'Arts Duty',
    workshop: 'Workshop Duty'
  };
  
  const shiftLabel = SHIFT_CONFIG[shift]?.label || shift;
  const formattedDate = new Date(dutyDate).toLocaleDateString();
  const title = `Duty Assignment: ${dutyTypeNames[dutyType] || dutyType}`;
  const message = `You have been assigned ${dutyTypeNames[dutyType] || dutyType} (${shiftLabel}) for ${className || 'the event'} on ${formattedDate}.`;
  
  const staff = await Staff.findById(staffId);
  if (!staff || !staff.userId) return;
  
  const notification = await Notification.create({
    userId: staff.userId,
    title,
    message,
    type: 'info',
    data: { staffId, staffName, dutyType, dutyDate, shift, dutyId, className }
  });
  
  broadcastToUser(staff.userId.toString(), 'notification', {
    id: notification._id,
    title,
    message,
    type: 'info',
    data: notification.data,
    timestamp: notification.createdAt,
    read: false
  });
  
  return notification;
}

// Helper to update stats
async function updateStaffDutyStats(staffId, staffName, dutyType, dutyCount, hours) {
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

  stats.overallStats.totalDuties += dutyCount;
  stats.overallStats.totalHours += hours;
  stats.overallStats.byType.set(
    dutyType,
    (stats.overallStats.byType.get(dutyType) || 0) + dutyCount,
  );
  stats.overallStats.lastUpdated = new Date();

  await stats.save();
}

// Enhanced Fair Distribution Algorithm with Shift Support
const fairDistributionScheduleWithShifts = async (staff, dutySlots, dutyType, excludedStaffIds = []) => {
  const availableStaff = staff.filter(
    (s) => !excludedStaffIds.includes(s._id.toString()),
  );
  
  if (availableStaff.length === 0) return { assignments: [], staffDutyCount: {}, staffSchedule: {} };
  
  // Get existing duty counts for each staff member
  const existingDutyCounts = {};
  for (const staffMember of availableStaff) {
    const existingDuties = await StaffDuty.find({
      staffId: staffMember._id,
      dutyType: dutyType,
      status: { $in: ['assigned', 'confirmed'] }
    });
    
    let totalExisting = 0;
    for (const duty of existingDuties) {
      totalExisting += duty.totalDuties;
    }
    existingDutyCounts[staffMember._id.toString()] = totalExisting;
  }
  
  const totalStaff = availableStaff.length;
  const totalDuties = dutySlots.length;
  
  // Create queue with existing duty counts
  const staffQueue = availableStaff.map((staffMember) => ({
    staff: staffMember,
    currentDuties: existingDutyCounts[staffMember._id.toString()] || 0,
    assignedDuties: 0,
  }));
  
  const assignments = [];
  const dailyUsage = new Map(); // Map of date -> Map of shift -> Set of staff IDs
  
  // Sort duty slots by date and shift priority
  const sortedSlots = [...dutySlots].sort((a, b) => {
    if (a.date !== b.date) return new Date(a.date) - new Date(b.date);
    const shiftPriority = { morning: 1, afternoon: 2, full: 3 };
    return shiftPriority[a.shift] - shiftPriority[b.shift];
  });
  
  for (const slot of sortedSlots) {
    const dateKey = new Date(slot.date).toISOString().split("T")[0];
    
    if (!dailyUsage.has(dateKey)) {
      dailyUsage.set(dateKey, new Map());
    }
    const dateUsage = dailyUsage.get(dateKey);
    
    if (!dateUsage.has(slot.shift)) {
      dateUsage.set(slot.shift, new Set());
    }
    const shiftUsage = dateUsage.get(slot.shift);
    
    // Sort staff by total duties (least first)
    staffQueue.sort((a, b) => (a.assignedDuties + a.currentDuties) - (b.assignedDuties + b.currentDuties));
    
    let selectedItem = null;
    
    // For full day shifts, check if staff already assigned any shift on this date
    if (slot.shift === 'full') {
      for (const item of staffQueue) {
        const dateShiftUsage = dateUsage.get('morning');
        const dateShiftAfternoonUsage = dateUsage.get('afternoon');
        const isAssignedMorning = dateShiftUsage?.has(item.staff._id.toString());
        const isAssignedAfternoon = dateShiftAfternoonUsage?.has(item.staff._id.toString());
        
        if (!isAssignedMorning && !isAssignedAfternoon && !shiftUsage.has(item.staff._id.toString())) {
          selectedItem = item;
          break;
        }
      }
    } else {
      // For morning/afternoon shifts, check if staff already assigned same shift on this date
      // Also check if staff is assigned full day
      for (const item of staffQueue) {
        const fullDayUsage = dateUsage.get('full');
        const isAssignedFullDay = fullDayUsage?.has(item.staff._id.toString());
        
        if (!isAssignedFullDay && !shiftUsage.has(item.staff._id.toString())) {
          selectedItem = item;
          break;
        }
      }
    }
    
    // If all staff assigned, pick the one with least total duties
    if (!selectedItem) {
      selectedItem = staffQueue.reduce((min, item) => 
        (item.assignedDuties + item.currentDuties) < (min.assignedDuties + min.currentDuties) ? item : min, 
        staffQueue[0]
      );
    }
    
    if (selectedItem) {
      assignments.push({
        staffId: selectedItem.staff._id,
        staffName: selectedItem.staff.name,
        dutyDate: new Date(slot.date),
        dutyType: dutyType,
        shift: slot.shift
      });
      
      selectedItem.assignedDuties++;
      shiftUsage.add(selectedItem.staff._id.toString());
    }
  }
  
  const staffDutyCount = {};
  staffQueue.forEach((item) => {
    const totalDuties = item.currentDuties + item.assignedDuties;
    staffDutyCount[item.staff._id.toString()] = {
      existing: item.currentDuties,
      new: item.assignedDuties,
      total: totalDuties
    };
  });
  
  return { assignments, staffDutyCount, staffSchedule: {} };
};

// GET /staff-duty
exports.getDuties = async (req, res) => {
  try {
    const { staffId, dutyType, startDate, endDate, page = 1, limit = 50 } = req.query;

    const query = {};
    if (staffId) query.staffId = staffId;
    if (dutyType) query.dutyType = dutyType;
    
    if (startDate || endDate) {
      query["duties.date"] = {};
      if (startDate) query["duties.date"].$gte = new Date(startDate);
      if (endDate) query["duties.date"].$lte = new Date(endDate);
    }

    const duties = await StaffDuty.find(query)
      .populate("staffId", "name email role")
      .populate("assignedBy", "name")
      .sort({ assignedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

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
    console.error('Error in getDuties:', error);
    res.status(500).json({ message: error.message });
  }
};

// GET /staff-duty/:id
exports.getDutyById = async (req, res) => {
  try {
    const duty = await StaffDuty.findById(req.params.id)
      .populate("staffId", "name email role")
      .populate("assignedBy", "name");

    if (!duty) {
      return res.status(404).json({ message: "Duty assignment not found" });
    }

    res.json({ success: true, data: duty });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /staff-duty/auto-assign - With Shift Support
exports.autoAssignDuties = async (req, res) => {
  try {
    const { dates, dutyType, excludedStaffIds = [], className = "School" } = req.body;
    
    // Create duty slots for each date and shift
    // If shift is 'full', only one duty per day
    // If shift is 'both' (morning + afternoon), two duties per day
    const getShiftsForDate = (date) => {
      // Check if the date object has a shift property
      if (date.shift) {
        if (date.shift === 'both') {
          return ['morning', 'afternoon'];
        }
        return [date.shift];
      }
      // Default to both shifts if not specified
      return ['morning', 'afternoon'];
    };
    
    const dutySlots = [];
    for (const date of dates) {
      const shifts = getShiftsForDate(date);
      for (const shift of shifts) {
        dutySlots.push({
          date: typeof date === 'object' ? date.date : date,
          shift: shift
        });
      }
    }
    
    if (dutySlots.length === 0) {
      return res.status(400).json({ message: "Please select at least one date and shift" });
    }

    const allStaff = await Staff.find({ isActive: true });
    if (allStaff.length === 0) {
      return res.status(400).json({ message: "No staff available for assignment" });
    }

    const { assignments, staffDutyCount } = await fairDistributionScheduleWithShifts(
      allStaff, 
      dutySlots, 
      dutyType, 
      excludedStaffIds
    );

    const savedAssignments = [];
    for (const assignment of assignments) {
      const existingDuty = await StaffDuty.findOne({
        staffId: assignment.staffId,
        "duties.date": assignment.dutyDate,
        "duties.shift": assignment.shift,
        dutyType: assignment.dutyType,
      });

      if (!existingDuty) {
        const duration = SHIFT_CONFIG[assignment.shift]?.duration || 8;
        
        const duty = new StaffDuty({
          staffId: assignment.staffId,
          staffName: assignment.staffName,
          dutyType: assignment.dutyType,
          duties: [{
            date: assignment.dutyDate,
            shift: assignment.shift,
            duration: duration,
            startTime: SHIFT_CONFIG[assignment.shift]?.startTime || '09:00 AM',
            endTime: SHIFT_CONFIG[assignment.shift]?.endTime || '05:00 PM',
          }],
          assignedBy: req.user.id,
          location: className,
        });
        
        await duty.save();
        savedAssignments.push(duty);

        await updateStaffDutyStats(
          assignment.staffId,
          assignment.staffName,
          assignment.dutyType,
          1,
          duration,
        );

        await sendDutyNotification(
          assignment.staffId,
          assignment.staffName,
          dutyType,
          assignment.dutyDate,
          assignment.shift,
          duty._id,
          className
        );
      }
    }

    const dutyCounts = Object.values(staffDutyCount).map(s => s.total);
    const maxDuties = Math.max(...dutyCounts);
    const minDuties = Math.min(...dutyCounts);
    const avgDuties = dutyCounts.reduce((a, b) => a + b, 0) / dutyCounts.length;
    const fairnessScore = maxDuties > 0 ? (minDuties / maxDuties) * 100 : 0;
    
    const distribution = {};
    for (const [staffId, data] of Object.entries(staffDutyCount)) {
      distribution[staffId] = data.total;
    }
    
    // Group assignments by date and shift for better visualization
    const assignmentsByDate = {};
    savedAssignments.forEach(assignment => {
      const dateKey = assignment.duties[0].date.toISOString().split('T')[0];
      if (!assignmentsByDate[dateKey]) {
        assignmentsByDate[dateKey] = {};
      }
      const shift = assignment.duties[0].shift;
      assignmentsByDate[dateKey][shift] = assignment;
    });

    res.json({
      success: true,
      message: `${savedAssignments.length} duties assigned for ${dutySlots.length} slots`,
      statistics: {
        totalStaff: allStaff.length,
        totalSlots: dutySlots.length,
        totalDuties: savedAssignments.length,
        dutiesPerStaff: {
          min: minDuties,
          max: maxDuties,
          avg: avgDuties.toFixed(2),
          fairness: fairnessScore.toFixed(2) + "%",
        },
        staffDistribution: distribution,
        perfectBalance: maxDuties - minDuties <= 1,
        existingLoad: Object.fromEntries(
          Object.entries(staffDutyCount).map(([id, data]) => [id, data.existing])
        ),
        newAssignments: Object.fromEntries(
          Object.entries(staffDutyCount).map(([id, data]) => [id, data.new])
        )
      },
      assignments: savedAssignments,
      assignmentsByDate: assignmentsByDate,
    });
  } catch (error) {
    console.error("Auto assign error:", error);
    res.status(500).json({ message: error.message });
  }
};

// POST /staff-duty/manual
exports.assignManualDuty = async (req, res) => {
  try {
    const { staffId, dutyType, dates, shift = "full", duration = 8, location, remarks, className } = req.body;

    if (!staffId) {
      return res.status(400).json({ message: "Please select a staff member" });
    }

    if (!dates || dates.length === 0) {
      return res.status(400).json({ message: "Please select at least one date" });
    }

    const staff = await Staff.findById(staffId);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const dutyRecords = [];
    for (const date of dates) {
      const dutyDate = new Date(date);
      
      const existingDuty = await StaffDuty.findOne({
        staffId,
        "duties.date": dutyDate,
        "duties.shift": shift,
        dutyType,
      });

      if (!existingDuty) {
        const shiftConfig = SHIFT_CONFIG[shift] || { duration: 8, startTime: '09:00 AM', endTime: '05:00 PM' };
        
        dutyRecords.push({
          date: dutyDate,
          shift: shift,
          duration: duration || shiftConfig.duration,
          startTime: req.body.startTime || shiftConfig.startTime,
          endTime: req.body.endTime || shiftConfig.endTime,
        });
      }
    }

    if (dutyRecords.length === 0) {
      return res.status(400).json({ message: "All selected dates already have duties assigned" });
    }

    const duty = new StaffDuty({
      staffId,
      staffName: staff.name,
      dutyType,
      duties: dutyRecords,
      assignedBy: req.user.id,
      location: location || className,
      remarks,
    });

    await duty.save();

    const totalHours = dutyRecords.reduce((sum, r) => sum + (r.duration || 8), 0);
    
    await updateStaffDutyStats(
      staffId,
      staff.name,
      dutyType,
      dutyRecords.length,
      totalHours,
    );

    for (const record of dutyRecords) {
      await sendDutyNotification(
        staffId,
        staff.name,
        dutyType,
        record.date,
        record.shift,
        duty._id,
        className || dutyType
      );
    }

    res.status(201).json({
      success: true,
      message: `${dutyRecords.length} duties assigned to ${staff.name}`,
      duties: [duty],
    });
  } catch (error) {
    console.error('Manual assign error:', error);
    res.status(500).json({ message: error.message });
  }
};

// GET /staff-duty/available-dates
exports.getAvailableDates = async (req, res) => {
  try {
    const { startDate, endDate, excludeWeekends = true, excludeHolidays = true } = req.query;

    const start = startDate ? new Date(startDate) : new Date();
    const end = endDate ? new Date(endDate) : new Date(new Date().setMonth(new Date().getMonth() + 3));

    const dates = [];
    const currentDate = new Date(start);

    const holidays = ["01-01", "01-26", "08-15", "10-02", "12-25"];

    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay();
      const isWeekend = excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6);
      const dateStr = `${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      const isHoliday = excludeHolidays && holidays.includes(dateStr);

      if (!isWeekend && !isHoliday) {
        dates.push({
          date: currentDate.toISOString().split('T')[0],
          dayOfWeek: currentDate.toLocaleDateString('en-US', { weekday: 'long' })
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({
      success: true,
      totalDates: dates.length,
      dates: dates,
    });
  } catch (error) {
    console.error('Error in getAvailableDates:', error);
    res.status(500).json({ message: error.message });
  }
};

// GET /staff-duty/stats
exports.getStaffDutyStats = async (req, res) => {
  try {
    const { staffId, dutyType, year, month } = req.query;

    let query = {};
    if (staffId) query.staffId = staffId;
    if (dutyType) query.dutyType = dutyType;

    let duties = await StaffDuty.find(query)
      .populate("staffId", "name role")
      .sort({ assignedAt: -1 });

    if (year) {
      const startDate = new Date(year, (month || 1) - 1, 1);
      const endDate = new Date(year, month ? month : 12, 0);
      duties = duties.filter(duty =>
        duty.duties.some(d => d.date >= startDate && d.date <= endDate)
      );
    }

    const staffStats = {};

    duties.forEach((duty) => {
      const sid = duty.staffId?._id?.toString() || duty.staffId?.toString();
      if (!sid) return;
      
      if (!staffStats[sid]) {
        staffStats[sid] = {
          staffName: duty.staffName,
          role: duty.staffId?.role,
          totalDuties: 0,
          totalHours: 0,
          byType: {},
          byShift: {},
          byMonth: {},
        };
      }

      staffStats[sid].totalDuties += duty.totalDuties;
      staffStats[sid].totalHours += duty.totalHours;
      staffStats[sid].byType[duty.dutyType] =
        (staffStats[sid].byType[duty.dutyType] || 0) + duty.totalDuties;

      duty.duties.forEach((d) => {
        const monthKey = `${d.date.getFullYear()}-${d.date.getMonth() + 1}`;
        staffStats[sid].byMonth[monthKey] = (staffStats[sid].byMonth[monthKey] || 0) + 1;
        staffStats[sid].byShift[d.shift] = (staffStats[sid].byShift[d.shift] || 0) + 1;
      });
    });

    const totalDuties = duties.reduce((sum, d) => sum + d.totalDuties, 0);
    const totalHours = duties.reduce((sum, d) => sum + d.totalHours, 0);
    const totalStaff = Object.keys(staffStats).length;

    const dutyCounts = Object.values(staffStats).map(s => s.totalDuties);
    const maxDuties = dutyCounts.length > 0 ? Math.max(...dutyCounts) : 0;
    const minDuties = dutyCounts.length > 0 ? Math.min(...dutyCounts) : 0;
    const fairnessScore = maxDuties > 0 ? (minDuties / maxDuties) * 100 : 0;

    res.json({
      success: true,
      summary: {
        totalStaff,
        totalDuties,
        totalHours,
        averagePerStaff: totalStaff > 0 ? (totalDuties / totalStaff).toFixed(2) : 0,
        fairnessScore: fairnessScore.toFixed(2),
        maxDuties,
        minDuties,
      },
      staffStats: staffStats,
      recentDuties: duties.slice(0, 50),
    });
  } catch (error) {
    console.error('Error in getStaffDutyStats:', error);
    res.status(500).json({ message: error.message });
  }
};

// GET /staff-duty/count/:staffId
exports.getStaffDutyCount = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { startDate, endDate, dutyType } = req.query;

    const query = { staffId };
    if (dutyType) query.dutyType = dutyType;

    let duties = await StaffDuty.find(query);

    if (startDate || endDate) {
      duties = duties.filter(duty =>
        duty.duties.some(d => {
          let match = true;
          if (startDate && d.date < new Date(startDate)) match = false;
          if (endDate && d.date > new Date(endDate)) match = false;
          return match;
        })
      );
    }

    let totalDuties = 0;
    let totalHours = 0;
    const byType = {};
    const byShift = {};

    duties.forEach((duty) => {
      totalDuties += duty.totalDuties;
      totalHours += duty.totalHours;
      byType[duty.dutyType] = (byType[duty.dutyType] || 0) + duty.totalDuties;
      
      duty.duties.forEach(d => {
        byShift[d.shift] = (byShift[d.shift] || 0) + 1;
      });
    });

    res.json({
      success: true,
      staffId,
      summary: {
        totalDuties,
        totalHours,
        byType,
        byShift,
      },
      details: duties,
    });
  } catch (error) {
    console.error('Error in getStaffDutyCount:', error);
    res.status(500).json({ message: error.message });
  }
};

// GET /staff-duty/summary
exports.getStaffDutySummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = {};
    if (startDate || endDate) {
      query["duties.date"] = {};
      if (startDate) query["duties.date"].$gte = new Date(startDate);
      if (endDate) query["duties.date"].$lte = new Date(endDate);
    }

    const duties = await StaffDuty.find(query).populate("staffId", "name");

    const staffSummary = {};
    const dailySummary = {};

    duties.forEach((duty) => {
      const staffId = duty.staffId?._id?.toString() || duty.staffId?.toString();
      if (!staffId) return;
      
      if (!staffSummary[staffId]) {
        staffSummary[staffId] = {
          staffName: duty.staffName,
          totalDuties: 0,
          dutyTypes: {},
          shifts: {},
        };
      }
      staffSummary[staffId].totalDuties += duty.totalDuties;
      staffSummary[staffId].dutyTypes[duty.dutyType] =
        (staffSummary[staffId].dutyTypes[duty.dutyType] || 0) + duty.totalDuties;

      duty.duties.forEach((d) => {
        const dateKey = d.date.toISOString().split("T")[0];
        if (!dailySummary[dateKey]) {
          dailySummary[dateKey] = {
            date: d.date,
            totalDuties: 0,
            duties: [],
          };
        }
        dailySummary[dateKey].totalDuties++;
        dailySummary[dateKey].duties.push({
          staffName: duty.staffName,
          dutyType: duty.dutyType,
          shift: d.shift,
        });
        staffSummary[staffId].shifts[d.shift] = (staffSummary[staffId].shifts[d.shift] || 0) + 1;
      });
    });

    res.json({
      success: true,
      staffSummary,
      dailySummary,
      totalDuties: duties.reduce((sum, d) => sum + d.totalDuties, 0),
    });
  } catch (error) {
    console.error('Error in getStaffDutySummary:', error);
    res.status(500).json({ message: error.message });
  }
};

// PUT /staff-duty/:id
exports.updateDuty = async (req, res) => {
  try {
    const duty = await StaffDuty.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!duty) {
      return res.status(404).json({ message: "Duty assignment not found" });
    }

    res.json({ success: true, data: duty });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /staff-duty/:id
exports.deleteDuty = async (req, res) => {
  try {
    const duty = await StaffDuty.findByIdAndDelete(req.params.id);
    if (!duty) {
      return res.status(404).json({ message: "Duty assignment not found" });
    }
    res.json({ success: true, message: "Duty assignment deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /staff-duty/bulk
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

// POST /staff-duty/multi-type-assign
exports.multiTypeAssign = async (req, res) => {
  try {
    const { dutyRequirements, excludedStaffIds = [] } = req.body;

    if (!dutyRequirements || dutyRequirements.length === 0) {
      return res.status(400).json({ message: "Please provide duty requirements" });
    }

    const allStaff = await Staff.find({ isActive: true });
    if (allStaff.length === 0) {
      return res.status(400).json({ message: "No staff available" });
    }

    const allAssignments = {};
    const allSaved = [];

    for (const requirement of dutyRequirements) {
      const { dutyType, dates, className = dutyType } = requirement;
      
      // Create duty slots with shifts
      const dutySlots = [];
      for (const date of dates) {
        const shifts = date.shift === 'both' ? ['morning', 'afternoon'] : [date.shift || 'morning'];
        for (const shift of shifts) {
          dutySlots.push({
            date: typeof date === 'object' ? date.date : date,
            shift: shift
          });
        }
      }
      
      const { assignments } = await fairDistributionScheduleWithShifts(allStaff, dutySlots, dutyType, excludedStaffIds);
      
      allAssignments[dutyType] = [];
      
      for (const assignment of assignments) {
        const existingDuty = await StaffDuty.findOne({
          staffId: assignment.staffId,
          "duties.date": assignment.dutyDate,
          "duties.shift": assignment.shift,
          dutyType: assignment.dutyType,
        });

        if (!existingDuty) {
          const duration = SHIFT_CONFIG[assignment.shift]?.duration || 8;
          
          const duty = new StaffDuty({
            staffId: assignment.staffId,
            staffName: assignment.staffName,
            dutyType: assignment.dutyType,
            duties: [{
              date: assignment.dutyDate,
              shift: assignment.shift,
              duration: duration,
              startTime: SHIFT_CONFIG[assignment.shift]?.startTime || '09:00 AM',
              endTime: SHIFT_CONFIG[assignment.shift]?.endTime || '05:00 PM',
            }],
            assignedBy: req.user.id,
            location: className,
          });
          
          await duty.save();
          allAssignments[dutyType].push(duty);
          allSaved.push(duty);

          await updateStaffDutyStats(
            assignment.staffId,
            assignment.staffName,
            dutyType,
            1,
            duration,
          );

          await sendDutyNotification(
            assignment.staffId,
            assignment.staffName,
            dutyType,
            assignment.dutyDate,
            assignment.shift,
            duty._id,
            className
          );
        }
      }
    }

    res.json({
      success: true,
      message: `${allSaved.length} duties assigned across ${dutyRequirements.length} types`,
      statistics: {
        totalStaff: allStaff.length,
        totalDuties: allSaved.length,
        byType: Object.entries(allAssignments).map(([type, assignments]) => ({
          type,
          count: assignments.length,
        })),
      },
      assignments: allAssignments,
    });
  } catch (error) {
    console.error("Multi-type assign error:", error);
    res.status(500).json({ message: error.message });
  }
};