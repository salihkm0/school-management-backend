const StaffDuty = require("../models/StaffDuty");
const StaffDutyStats = require("../models/StaffDutyStats");
const Staff = require("../models/Staff");
const Notification = require("../models/Notification");
const { broadcastToUser, broadcastToRole } = require("../config/socket");
const { generateStaffDutyPDF } = require("../services/pdf/staffDutyPdfService");

const roleDesignationMap = {
  'teacher': 'Teacher',
  'principal': 'Principal',
  'vice_principal': 'Vice Principal',
  'librarian': 'Librarian',
  'administrator': 'Administrator',
  'office_staff': 'Office Staff',
  'support_staff': 'Support Staff'
};

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
const fairDistributionScheduleWithShifts = async (staff, dutySlots, dutyType, excludedStaffIds = [], excludedStaff = []) => {
  const availableStaff = staff.filter(
    (s) => !excludedStaffIds.includes(s._id.toString()),
  );
  
  if (availableStaff.length === 0) return { assignments: [], staffDutyCount: {}, staffSchedule: {} };
  
  // Get existing duty counts, shift counts, and assignments (for clash prevention) for each staff member
  const existingDutyCounts = {};
  const existingShiftCounts = {};
  const existingAssignments = {}; // staffId -> [{dateStr, shift}]
  
  for (const staffMember of availableStaff) {
    const existingDuties = await StaffDuty.find({
      staffId: staffMember._id,
      status: { $ne: 'cancelled' }
    });
    
    let totalExisting = 0;
    const shifts = { morning: 0, afternoon: 0, full: 0 };
    const staffDBDuties = [];
    
    for (const duty of existingDuties) {
      const isSameType = duty.dutyType === dutyType;
      if (isSameType) {
        totalExisting += duty.duties ? duty.duties.length : 0;
      }
      for (const d of duty.duties) {
        if (!d.date) continue;
        const dDate = new Date(d.date);
        if (isNaN(dDate.getTime())) continue;
        
        if (isSameType && shifts[d.shift] !== undefined) {
          shifts[d.shift]++;
        }
        staffDBDuties.push({
          dateStr: dDate.toISOString().split('T')[0],
          shift: d.shift
        });
      }
    }
    existingDutyCounts[staffMember._id.toString()] = totalExisting;
    existingShiftCounts[staffMember._id.toString()] = shifts;
    existingAssignments[staffMember._id.toString()] = staffDBDuties;
  }
  
  const totalStaff = availableStaff.length;
  const totalDuties = dutySlots.length;
  
  // Create queue with existing duty and shift counts
  const staffQueue = availableStaff.map((staffMember) => {
    const sId = staffMember._id.toString();
    const histShifts = existingShiftCounts[sId] || { morning: 0, afternoon: 0, full: 0 };
    return {
      staff: staffMember,
      currentDuties: existingDutyCounts[sId] || 0,
      assignedDuties: 0,
      assignedShifts: { ...histShifts }
    };
  });
  
  const assignments = [];
  const dailyUsage = new Map(); // Map of date -> Map of shift -> Set of staff IDs

  const isStaffExcluded = (staffId, date) => {
    const targetDateStr = new Date(date).toISOString().split('T')[0];
    const exclusion = excludedStaff.find(e => e.staffId.toString() === staffId.toString());
    if (exclusion && exclusion.dates) {
      return exclusion.dates.some(d => new Date(d).toISOString().split('T')[0] === targetDateStr);
    }
    return false;
  };

  const hasDBAssignmentOnDate = (sId, date, shift) => {
    const targetDateStr = new Date(date).toISOString().split('T')[0];
    const dbAssignments = existingAssignments[sId] || [];
    
    // Check if they already have the exact same shift on this date in DB
    if (dbAssignments.some(a => a.dateStr === targetDateStr && a.shift === shift)) {
      return true;
    }
    
    // Check if they have a 'full' shift on this date in DB (can't do morning/afternoon)
    if (shift !== 'full' && dbAssignments.some(a => a.dateStr === targetDateStr && a.shift === 'full')) {
      return true;
    }
    
    // Check if the current slot is 'full' and they have any shift on this date in DB (can't do full)
    if (shift === 'full' && dbAssignments.some(a => a.dateStr === targetDateStr)) {
      return true;
    }
    
    return false;
  };
  
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
    
    // Filter staff queue to only those not excluded on this slot's date
    // AND who do not have database assignment conflicts
    const eligibleStaffQueue = staffQueue.filter(item => {
      const sId = item.staff._id.toString();
      return !isStaffExcluded(sId, slot.date) && !hasDBAssignmentOnDate(sId, slot.date, slot.shift);
    });

    // Sort eligible staff by total duties (least first) and then by specific shift count (least first)
    eligibleStaffQueue.sort((a, b) => {
      const aTotal = a.assignedDuties + a.currentDuties;
      const bTotal = b.assignedDuties + b.currentDuties;
      if (aTotal !== bTotal) return aTotal - bTotal;
      
      const aShift = a.assignedShifts[slot.shift] || 0;
      const bShift = b.assignedShifts[slot.shift] || 0;
      return aShift - bShift;
    });
    
    let selectedItem = null;
    
    // For full day shifts, check if staff already assigned any shift on this date (locally)
    if (slot.shift === 'full') {
      for (const item of eligibleStaffQueue) {
        const sId = item.staff._id.toString();
        const dateShiftUsage = dateUsage.get('morning');
        const dateShiftAfternoonUsage = dateUsage.get('afternoon');
        const isAssignedMorning = dateShiftUsage?.has(sId);
        const isAssignedAfternoon = dateShiftAfternoonUsage?.has(sId);
        
        if (!isAssignedMorning && !isAssignedAfternoon && !shiftUsage.has(sId)) {
          selectedItem = item;
          break;
        }
      }
    } else {
      // For morning/afternoon shifts, check if staff already assigned same shift on this date (locally)
      // Also check if staff is assigned full day (locally)
      for (const item of eligibleStaffQueue) {
        const sId = item.staff._id.toString();
        const fullDayUsage = dateUsage.get('full');
        const isAssignedFullDay = fullDayUsage?.has(sId);
        
        if (!isAssignedFullDay && !shiftUsage.has(sId)) {
          selectedItem = item;
          break;
        }
      }
    }
    
    // If all eligible staff assigned, pick the one with least total duties
    if (!selectedItem && eligibleStaffQueue.length > 0) {
      selectedItem = eligibleStaffQueue.reduce((min, item) => 
        (item.assignedDuties + item.currentDuties) < (min.assignedDuties + min.currentDuties) ? item : min, 
        eligibleStaffQueue[0]
      );
    }
    
    if (selectedItem) {
      assignments.push({
        staffId: selectedItem.staff._id,
        staffName: selectedItem.staff.name,
        dutyDate: new Date(slot.date),
        dutyType: dutyType,
        shift: slot.shift,
        room: slot.room
      });
      
      // We also update the item in staffQueue so their duty counts stay correct
      const queueItem = staffQueue.find(qi => qi.staff._id.toString() === selectedItem.staff._id.toString());
      if (queueItem) {
        queueItem.assignedDuties++;
        if (queueItem.assignedShifts[slot.shift] !== undefined) {
          queueItem.assignedShifts[slot.shift]++;
        }
      }
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
    const { staffId, dutyType, startDate, endDate, page = 1, limit = 50, location } = req.query;

    const query = {};
    if (staffId) query.staffId = staffId;
    if (dutyType) query.dutyType = dutyType;
    if (location) query.location = location;
    
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
    const { dates, dutyType, excludedStaffIds = [], excludedStaff = [], totalRooms = 1, rooms = [], className = "School" } = req.body;
    
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

    const roomsList = rooms && rooms.length > 0
      ? rooms.map((r, i) => (r && r.trim()) || `Room ${i + 1}`)
      : Array.from({ length: totalRooms || 1 }, (_, i) => `Room ${i + 1}`);
    
    const dutySlots = [];
    for (const date of dates) {
      const shifts = getShiftsForDate(date);
      for (const shift of shifts) {
        for (const room of roomsList) {
          dutySlots.push({
            date: typeof date === 'object' ? date.date : date,
            shift: shift,
            room: room
          });
        }
      }
    }
    
    if (dutySlots.length === 0) {
      return res.status(400).json({ message: "Please select at least one date and shift" });
    }

    const allStaff = await Staff.find({ isActive: { $ne: false } });
    if (allStaff.length === 0) {
      return res.status(400).json({ message: "No staff available for assignment" });
    }

    const { assignments, staffDutyCount } = await fairDistributionScheduleWithShifts(
      allStaff, 
      dutySlots, 
      dutyType, 
      excludedStaffIds,
      excludedStaff
    );

    const grouped = {};
    for (const assignment of assignments) {
      const sId = assignment.staffId.toString();
      if (!grouped[sId]) {
        grouped[sId] = {
          staffId: assignment.staffId,
          staffName: assignment.staffName,
          dutyType: assignment.dutyType,
          slots: []
        };
      }
      grouped[sId].slots.push({
        date: assignment.dutyDate,
        shift: assignment.shift,
        room: assignment.room
      });
    }

    const savedAssignments = [];
    for (const [staffId, group] of Object.entries(grouped)) {
      const dutyRecords = [];
      for (const slot of group.slots) {
        const existingDuty = await StaffDuty.findOne({
          staffId: group.staffId,
          dutyType: group.dutyType,
          "duties.date": slot.date,
          "duties.shift": slot.shift
        });

        if (!existingDuty) {
          const duration = SHIFT_CONFIG[slot.shift]?.duration || 8;
          dutyRecords.push({
            date: slot.date,
            shift: slot.shift,
            duration: duration,
            startTime: SHIFT_CONFIG[slot.shift]?.startTime || '09:00 AM',
            endTime: SHIFT_CONFIG[slot.shift]?.endTime || '05:00 PM',
            room: slot.room
          });
        }
      }

      if (dutyRecords.length > 0) {
        const duty = new StaffDuty({
          staffId: group.staffId,
          staffName: group.staffName,
          dutyType: group.dutyType,
          duties: dutyRecords,
          assignedBy: req.user.id,
          location: className,
        });

        await duty.save();
        savedAssignments.push(duty);

        const totalHours = dutyRecords.reduce((sum, d) => sum + (d.duration || 0), 0);
        await updateStaffDutyStats(
          group.staffId,
          group.staffName,
          group.dutyType,
          dutyRecords.length,
          totalHours
        );

        for (const record of dutyRecords) {
          await sendDutyNotification(
            group.staffId,
            group.staffName,
            group.dutyType,
            record.date,
            record.shift,
            duty._id,
            className
          );
        }
      }
    }

    const dutyCounts = Object.values(staffDutyCount).map(s => s.total);
    const maxDuties = dutyCounts.length > 0 ? Math.max(...dutyCounts) : 0;
    const minDuties = dutyCounts.length > 0 ? Math.min(...dutyCounts) : 0;
    const avgDuties = dutyCounts.length > 0 ? dutyCounts.reduce((a, b) => a + b, 0) / dutyCounts.length : 0;
    const fairnessScore = maxDuties > 0 ? (minDuties / maxDuties) * 100 : 0;
    
    const distribution = {};
    for (const [staffId, data] of Object.entries(staffDutyCount)) {
      distribution[staffId] = data.total;
    }
    
    // Group assignments by date and shift for better visualization
    const assignmentsByDate = {};
    savedAssignments.forEach(assignment => {
      assignment.duties.forEach(d => {
        const dateKey = d.date.toISOString().split('T')[0];
        if (!assignmentsByDate[dateKey]) {
          assignmentsByDate[dateKey] = {};
        }
        if (!assignmentsByDate[dateKey][d.shift]) {
          assignmentsByDate[dateKey][d.shift] = [];
        }
        assignmentsByDate[dateKey][d.shift].push({
          staffId: assignment.staffId,
          staffName: assignment.staffName,
          dutyType: assignment.dutyType,
          room: d.room,
          _id: assignment._id
        });
      });
    });

    res.json({
      success: true,
      message: `${assignments.length} duties assigned for ${dutySlots.length} slots`,
      statistics: {
        totalStaff: allStaff.length,
        totalSlots: dutySlots.length,
        totalDuties: assignments.length,
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
    const { staffId, dutyType, dates, shift = "full", duration = 8, location, room, remarks, className } = req.body;

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
          room: room
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
    query.status = { $ne: 'cancelled' }; // Ignore cancelled duties!

    let duties = await StaffDuty.find(query)
      .populate("staffId", "name role")
      .sort({ assignedAt: -1 });

    let filterStart = null;
    let filterEnd = null;
    if (year) {
      filterStart = new Date(year, (month || 1) - 1, 1);
      filterStart.setHours(0, 0, 0, 0);
      filterEnd = new Date(year, month ? month : 12, 0);
      filterEnd.setHours(23, 59, 59, 999);
    }

    const staffStats = {};

    duties.forEach((duty) => {
      const sid = duty.staffId?._id?.toString() || duty.staffId?.toString();
      if (!sid) return;

      const filteredDuties = (filterStart || filterEnd)
        ? duty.duties.filter(d => {
            if (!d.date) return false;
            const dDate = new Date(d.date);
            if (isNaN(dDate.getTime())) return false;
            return dDate >= filterStart && dDate <= filterEnd;
          })
        : duty.duties;

      if (filteredDuties.length === 0) return;
      
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

      const totalDutiesCount = filteredDuties.length;
      const totalHoursCount = filteredDuties.reduce((sum, d) => sum + (d.duration || 0), 0);

      staffStats[sid].totalDuties += totalDutiesCount;
      staffStats[sid].totalHours += totalHoursCount;
      staffStats[sid].byType[duty.dutyType] =
        (staffStats[sid].byType[duty.dutyType] || 0) + totalDutiesCount;

      filteredDuties.forEach((d) => {
        if (!d.date) return;
        const dDate = new Date(d.date);
        if (isNaN(dDate.getTime())) return;
        const monthKey = `${dDate.getFullYear()}-${dDate.getMonth() + 1}`;
        staffStats[sid].byMonth[monthKey] = (staffStats[sid].byMonth[monthKey] || 0) + 1;
        if (d.shift) {
          staffStats[sid].byShift[d.shift] = (staffStats[sid].byShift[d.shift] || 0) + 1;
        }
      });
    });

    const totalDuties = Object.values(staffStats).reduce((sum, s) => sum + s.totalDuties, 0);
    const totalHours = Object.values(staffStats).reduce((sum, s) => sum + s.totalHours, 0);
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
    query.status = { $ne: 'cancelled' }; // Ignore cancelled duties!

    let duties = await StaffDuty.find(query);

    let filterStart = startDate ? new Date(startDate) : null;
    if (filterStart) filterStart.setHours(0, 0, 0, 0);
    let filterEnd = endDate ? new Date(endDate) : null;
    if (filterEnd) filterEnd.setHours(23, 59, 59, 999);

    let totalDuties = 0;
    let totalHours = 0;
    const byType = {};
    const byShift = {};

    duties.forEach((duty) => {
      const filteredDuties = (filterStart || filterEnd)
        ? duty.duties.filter(d => {
            if (!d.date) return false;
            const dDate = new Date(d.date);
            if (isNaN(dDate.getTime())) return false;
            let match = true;
            if (filterStart && dDate < filterStart) match = false;
            if (filterEnd && dDate > filterEnd) match = false;
            return match;
          })
        : duty.duties;

      if (filteredDuties.length === 0) return;

      const totalDutiesCount = filteredDuties.length;
      const totalHoursCount = filteredDuties.reduce((sum, d) => sum + (d.duration || 0), 0);

      totalDuties += totalDutiesCount;
      totalHours += totalHoursCount;
      byType[duty.dutyType] = (byType[duty.dutyType] || 0) + totalDutiesCount;
      
      filteredDuties.forEach(d => {
        if (d.shift) {
          byShift[d.shift] = (byShift[d.shift] || 0) + 1;
        }
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
    query.status = { $ne: 'cancelled' }; // Ignore cancelled duties!

    const duties = await StaffDuty.find(query).populate("staffId", "name");

    let filterStart = startDate ? new Date(startDate) : null;
    if (filterStart) filterStart.setHours(0, 0, 0, 0);
    let filterEnd = endDate ? new Date(endDate) : null;
    if (filterEnd) filterEnd.setHours(23, 59, 59, 999);

    const staffSummary = {};
    const dailySummary = {};

    duties.forEach((duty) => {
      const staffId = duty.staffId?._id?.toString() || duty.staffId?.toString();
      if (!staffId) return;

      const filteredDuties = (filterStart || filterEnd)
        ? duty.duties.filter(d => {
            if (!d.date) return false;
            const dDate = new Date(d.date);
            if (isNaN(dDate.getTime())) return false;
            let match = true;
            if (filterStart && dDate < filterStart) match = false;
            if (filterEnd && dDate > filterEnd) match = false;
            return match;
          })
        : duty.duties;

      if (filteredDuties.length === 0) return;
      
      if (!staffSummary[staffId]) {
        staffSummary[staffId] = {
          staffName: duty.staffName,
          totalDuties: 0,
          dutyTypes: {},
          shifts: {},
        };
      }
      const totalDutiesCount = filteredDuties.length;
      staffSummary[staffId].totalDuties += totalDutiesCount;
      staffSummary[staffId].dutyTypes[duty.dutyType] =
        (staffSummary[staffId].dutyTypes[duty.dutyType] || 0) + totalDutiesCount;

      filteredDuties.forEach((d) => {
        if (!d.date) return;
        const dDate = new Date(d.date);
        if (isNaN(dDate.getTime())) return;
        const dateKey = dDate.toISOString().split("T")[0];
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
        if (d.shift) {
          staffSummary[staffId].shifts[d.shift] = (staffSummary[staffId].shifts[d.shift] || 0) + 1;
        }
      });
    });

    const totalDuties = Object.values(staffSummary).reduce((sum, s) => sum + s.totalDuties, 0);

    res.json({
      success: true,
      staffSummary,
      dailySummary,
      totalDuties,
    });
  } catch (error) {
    console.error('Error in getStaffDutySummary:', error);
    res.status(500).json({ message: error.message });
  }
};

// PUT /staff-duty/:id
exports.updateDuty = async (req, res) => {
  try {
    const duty = await StaffDuty.findById(req.params.id);

    if (!duty) {
      return res.status(404).json({ message: "Duty assignment not found" });
    }

    // Update fields
    Object.assign(duty, req.body);

    // Save the document to trigger pre-save hook and recalculate totalDuties and totalHours
    await duty.save();

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
    const { dutyRequirements, excludedStaffIds = [], excludedStaff = [] } = req.body;

    if (!dutyRequirements || dutyRequirements.length === 0) {
      return res.status(400).json({ message: "Please provide duty requirements" });
    }

    const allStaff = await Staff.find({ isActive: { $ne: false } });
    if (allStaff.length === 0) {
      return res.status(400).json({ message: "No staff available" });
    }

    const allAssignments = {};
    const allSaved = [];
    const allRawAssignments = [];

    for (const requirement of dutyRequirements) {
      const { dutyType, dates, className = dutyType, totalRooms = 1, rooms = [] } = requirement;
      
      const roomsList = rooms && rooms.length > 0
        ? rooms.map((r, i) => (r && r.trim()) || `Room ${i + 1}`)
        : Array.from({ length: totalRooms || 1 }, (_, i) => `Room ${i + 1}`);

      // Create duty slots with shifts
      const dutySlots = [];
      for (const date of dates) {
        const shifts = date.shift === 'both' ? ['morning', 'afternoon'] : [date.shift || 'morning'];
        for (const shift of shifts) {
          for (const room of roomsList) {
            dutySlots.push({
              date: typeof date === 'object' ? date.date : date,
              shift: shift,
              room: room
            });
          }
        }
      }
      
      const { assignments } = await fairDistributionScheduleWithShifts(allStaff, dutySlots, dutyType, excludedStaffIds, excludedStaff);
      
      allRawAssignments.push(...assignments.map(a => ({ ...a, className })));
      allAssignments[dutyType] = [];
    }

    // Now group allRawAssignments by (staffId, dutyType, className)
    const grouped = {};
    for (const assignment of allRawAssignments) {
      const key = `${assignment.staffId}_${assignment.dutyType}_${assignment.className}`;
      if (!grouped[key]) {
        grouped[key] = {
          staffId: assignment.staffId,
          staffName: assignment.staffName,
          dutyType: assignment.dutyType,
          className: assignment.className,
          slots: []
        };
      }
      grouped[key].slots.push({
        date: assignment.dutyDate,
        shift: assignment.shift,
        room: assignment.room
      });
    }

    for (const [key, group] of Object.entries(grouped)) {
      const dutyRecords = [];
      for (const slot of group.slots) {
        const existingDuty = await StaffDuty.findOne({
          staffId: group.staffId,
          dutyType: group.dutyType,
          "duties.date": slot.date,
          "duties.shift": slot.shift
        });

        if (!existingDuty) {
          const duration = SHIFT_CONFIG[slot.shift]?.duration || 8;
          dutyRecords.push({
            date: slot.date,
            shift: slot.shift,
            duration: duration,
            startTime: SHIFT_CONFIG[slot.shift]?.startTime || '09:00 AM',
            endTime: SHIFT_CONFIG[slot.shift]?.endTime || '05:00 PM',
            room: slot.room
          });
        }
      }

      if (dutyRecords.length > 0) {
        const duty = new StaffDuty({
          staffId: group.staffId,
          staffName: group.staffName,
          dutyType: group.dutyType,
          duties: dutyRecords,
          assignedBy: req.user.id,
          location: group.className,
        });

        await duty.save();
        allAssignments[group.dutyType].push(duty);
        allSaved.push(duty);

        const totalHours = dutyRecords.reduce((sum, d) => sum + (d.duration || 0), 0);
        await updateStaffDutyStats(
          group.staffId,
          group.staffName,
          group.dutyType,
          dutyRecords.length,
          totalHours
        );

        for (const record of dutyRecords) {
          await sendDutyNotification(
            group.staffId,
            group.staffName,
            group.dutyType,
            record.date,
            record.shift,
            duty._id,
            group.className
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

// ==================== PDF GENERATION CONTROLLERS ====================

// School logo URL
const SCHOOL_LOGO_URL = 'https://res.cloudinary.com/dmjqgjcut/image/upload/v1769946977/school-logo_uugskb.jpg';

const handlePDFGeneration = async (req, res, isAttachment) => {
  try {
    const { startDate, endDate, staffId, dutyType, location } = req.query;

    const query = {};
    if (staffId) query.staffId = staffId;
    if (dutyType) query.dutyType = dutyType;
    if (location) query.location = location;
    
    if (startDate || endDate) {
      query["duties.date"] = {};
      if (startDate) query["duties.date"].$gte = new Date(startDate);
      if (endDate) query["duties.date"].$lte = new Date(endDate);
    }

    const duties = await StaffDuty.find(query)
      .populate("staffId", "name email role staffCode designation")
      .sort({ assignedAt: -1 });

    const filterStart = startDate ? new Date(startDate) : null;
    if (filterStart) filterStart.setHours(0, 0, 0, 0);
    const filterEnd = endDate ? new Date(endDate) : null;
    if (filterEnd) filterEnd.setHours(23, 59, 59, 999);

    const formattedDutyList = [];
    
    for (const duty of duties) {
      const filteredDuties = (filterStart || filterEnd)
        ? duty.duties.filter(d => {
            let match = true;
            if (filterStart && d.date < filterStart) match = false;
            if (filterEnd && d.date > filterEnd) match = false;
            return match;
          })
        : duty.duties;

      if (filteredDuties.length === 0) continue;

      const designation = duty.staffId?.role
        ? (roleDesignationMap[duty.staffId.role] || duty.staffId.role)
        : (duty.staffId?.designation || '-');

      formattedDutyList.push({
        staffName: duty.staffName,
        designation: designation,
        dutyType: duty.dutyType,
        duties: filteredDuties,
        location: duty.location,
        totalDuties: filteredDuties.length,
        totalHours: filteredDuties.reduce((sum, d) => sum + (d.duration || 0), 0)
      });
    }

    let filterParts = [];
    if (startDate) filterParts.push(`From: ${new Date(startDate).toLocaleDateString('en-IN')}`);
    if (endDate) filterParts.push(`To: ${new Date(endDate).toLocaleDateString('en-IN')}`);
    if (dutyType) filterParts.push(`Type: ${dutyType.replace('_', ' ').toUpperCase()}`);
    const filterInfo = filterParts.length > 0 ? filterParts.join(' | ') : 'All Assignments';

    const templateData = {
      schoolLogoUrl: SCHOOL_LOGO_URL,
      dutyList: formattedDutyList,
      filterInfo
    };

    const pdfBuffer = await generateStaffDutyPDF(templateData);

    const dispositionMode = isAttachment ? 'attachment' : 'inline';
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdfBuffer.length);
    res.setHeader(
      "Content-Disposition",
      `${dispositionMode}; filename="Staff_Duty_List_${new Date().toISOString().split('T')[0]}.pdf"`
    );
    res.setHeader("Cache-Control", "no-cache");

    res.end(pdfBuffer);

  } catch (error) {
    console.error("Staff duty PDF generation error:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

exports.generateStaffDutyPDF = async (req, res) => {
  await handlePDFGeneration(req, res, false);
};

exports.downloadStaffDutyPDF = async (req, res) => {
  await handlePDFGeneration(req, res, true);
};