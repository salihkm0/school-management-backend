const StaffDuty = require('../models/StaffDuty');
const Staff = require('../models/Staff');
const Class = require('../models/Class');
const { broadcastToUser } = require('../config/socket');

class DutyScheduler {
  constructor() {
    this.isRunning = false;
  }

  async autoScheduleDuties(config) {
    const {
      totalDays,
      startDate,
      excludedStaffIds = [],
      dutyType = 'exam',
      classesPerDay = null
    } = config;

    const allStaff = await Staff.find({ isActive: true });
    const availableStaff = allStaff.filter(s => !excludedStaffIds.includes(s._id.toString()));
    const allClasses = await Class.find({ isActive: true });
    
    let classes = allClasses;
    if (classesPerDay && classesPerDay < allClasses.length) {
      classes = this.shuffleArray([...allClasses]).slice(0, classesPerDay);
    }

    if (availableStaff.length === 0 || classes.length === 0) {
      throw new Error('No staff or classes available');
    }

    const assignments = [];
    const staffDutyCount = {};
    
    availableStaff.forEach(staff => {
      staffDutyCount[staff._id.toString()] = 0;
    });

    for (let day = 0; day < totalDays; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + day);
      
      const usedStaffToday = [];
      let remainingStaff = [...availableStaff];
      
      // Shuffle classes for variety each day
      const shuffledClasses = this.shuffleArray([...classes]);
      
      for (const classItem of shuffledClasses) {
        let selectedStaff = null;
        let lowestCount = Infinity;
        
        // Find staff with lowest duty count not used today
        for (const staff of remainingStaff) {
          if (!usedStaffToday.includes(staff._id.toString())) {
            const currentCount = staffDutyCount[staff._id.toString()];
            if (currentCount < lowestCount) {
              lowestCount = currentCount;
              selectedStaff = staff;
            }
          }
        }
        
        // If no staff available, reset used staff and try again
        if (!selectedStaff && remainingStaff.length > 0) {
          usedStaffToday.length = 0;
          selectedStaff = remainingStaff[0];
        }
        
        if (selectedStaff) {
          const duty = await StaffDuty.create({
            staffId: selectedStaff._id,
            staffName: selectedStaff.name,
            classId: classItem._id,
            className: classItem.displayName || `${classItem.name} ${classItem.section || ''}`,
            dutyDate: currentDate,
            dayNumber: day + 1,
            dutyType: dutyType,
            assignedBy: config.assignedBy || null,
            status: 'assigned'
          });
          
          assignments.push(duty);
          staffDutyCount[selectedStaff._id.toString()]++;
          usedStaffToday.push(selectedStaff._id.toString());
          remainingStaff = remainingStaff.filter(s => s._id.toString() !== selectedStaff._id.toString());
          
          // Send real-time notification
          broadcastToUser(selectedStaff.userId.toString(), 'duty:assigned', {
            dutyId: duty._id,
            className: duty.className,
            dutyDate: duty.dutyDate,
            dutyType: duty.dutyType,
            dayNumber: duty.dayNumber
          });
        }
      }
    }

    return {
      assignments,
      staffDutyCount,
      totalAssignments: assignments.length,
      averagePerStaff: assignments.length / availableStaff.length
    };
  }

  async getStaffAvailability(staffId, startDate, endDate) {
    const duties = await StaffDuty.find({
      staffId,
      dutyDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    });
    
    const availableDates = [];
    const currentDate = new Date(startDate);
    const end = new Date(endDate);
    
    while (currentDate <= end) {
      const hasDuty = duties.some(d => 
        d.dutyDate.toDateString() === currentDate.toDateString()
      );
      availableDates.push({
        date: new Date(currentDate),
        available: !hasDuty
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return availableDates;
  }

  async reassignDuty(dutyId, newStaffId) {
    const oldDuty = await StaffDuty.findById(dutyId);
    if (!oldDuty) {
      throw new Error('Duty assignment not found');
    }
    
    const newStaff = await Staff.findById(newStaffId);
    if (!newStaff) {
      throw new Error('New staff not found');
    }
    
    // Check if new staff already has duty on same date
    const existingDuty = await StaffDuty.findOne({
      staffId: newStaffId,
      dutyDate: oldDuty.dutyDate
    });
    
    if (existingDuty) {
      throw new Error('New staff already has duty on this date');
    }
    
    // Update the duty
    const updatedDuty = await StaffDuty.findByIdAndUpdate(
      dutyId,
      {
        staffId: newStaffId,
        staffName: newStaff.name,
        status: 'assigned'
      },
      { new: true }
    );
    
    // Notify both staff members
    broadcastToUser(oldDuty.staffId.toString(), 'duty:reassigned', {
      dutyId: updatedDuty._id,
      message: `Your duty on ${updatedDuty.dutyDate.toDateString()} has been reassigned`
    });
    
    broadcastToUser(newStaff.userId.toString(), 'duty:assigned', {
      dutyId: updatedDuty._id,
      className: updatedDuty.className,
      dutyDate: updatedDuty.dutyDate,
      dutyType: updatedDuty.dutyType
    });
    
    return updatedDuty;
  }

  async generateDutyReport(startDate, endDate) {
    const duties = await StaffDuty.find({
      dutyDate: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }).populate('staffId', 'name role');
    
    const report = {
      totalDuties: duties.length,
      byStaff: {},
      byDate: {},
      byType: {}
    };
    
    duties.forEach(duty => {
      const staffId = duty.staffId._id.toString();
      if (!report.byStaff[staffId]) {
        report.byStaff[staffId] = {
          name: duty.staffName,
          role: duty.staffId?.role,
          count: 0,
          duties: []
        };
      }
      report.byStaff[staffId].count++;
      report.byStaff[staffId].duties.push({
        date: duty.dutyDate,
        className: duty.className,
        type: duty.dutyType
      });
      
      const dateKey = duty.dutyDate.toISOString().split('T')[0];
      if (!report.byDate[dateKey]) {
        report.byDate[dateKey] = {
          date: duty.dutyDate,
          count: 0,
          duties: []
        };
      }
      report.byDate[dateKey].count++;
      report.byDate[dateKey].duties.push({
        staffName: duty.staffName,
        className: duty.className,
        type: duty.dutyType
      });
      
      report.byType[duty.dutyType] = (report.byType[duty.dutyType] || 0) + 1;
    });
    
    return report;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  async getBalancedSchedule(totalDays, startDate) {
    const allStaff = await Staff.find({ isActive: true });
    const allClasses = await Class.find({ isActive: true });
    
    const totalDutiesNeeded = totalDays * allClasses.length;
    const idealPerStaff = Math.ceil(totalDutiesNeeded / allStaff.length);
    
    const schedule = [];
    const staffAssignments = {};
    
    allStaff.forEach(staff => {
      staffAssignments[staff._id.toString()] = 0;
    });
    
    for (let day = 0; day < totalDays; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + day);
      
      const daySchedule = {
        date: currentDate,
        assignments: []
      };
      
      // Sort staff by current assignment count
      const sortedStaff = [...allStaff].sort((a, b) => 
        staffAssignments[a._id.toString()] - staffAssignments[b._id.toString()]
      );
      
      for (const classItem of allClasses) {
        // Find staff with lowest assignments
        let selectedStaff = sortedStaff.find(staff => 
          staffAssignments[staff._id.toString()] < idealPerStaff
        );
        
        if (!selectedStaff) {
          selectedStaff = sortedStaff[0];
        }
        
        daySchedule.assignments.push({
          staffId: selectedStaff._id,
          staffName: selectedStaff.name,
          classId: classItem._id,
          className: classItem.displayName
        });
        
        staffAssignments[selectedStaff._id.toString()]++;
      }
      
      schedule.push(daySchedule);
    }
    
    return schedule;
  }
}

module.exports = new DutyScheduler();