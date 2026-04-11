const generateAttendance = (students, classId) => {
  const attendanceRecords = [];
  const currentYear = 2024;
  
  students.forEach(student => {
    // Generate for June to November 2024
    for (let month = 6; month <= 11; month++) {
      const totalDays = month === 6 ? 18 : month === 7 ? 22 : month === 8 ? 20 : 
                        month === 9 ? 21 : month === 10 ? 19 : 20;
      const absentDays = Math.floor(Math.random() * 5); // 0-4 absent days
      
      attendanceRecords.push({
        studentId: student._id,
        studentName: student.name,  // Required field
        classId: classId,
        year: currentYear,
        month: month,
        absentDays: absentDays,
        totalDays: totalDays
      });
    }
  });
  
  return attendanceRecords;
};

module.exports = generateAttendance;