require('dotenv').config();
const mongoose = require('mongoose');
const Staff = require('./src/models/Staff');
const Class = require('./src/models/Class');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const staff = await Staff.findOne({ employeeId: 'T001' }) || await Staff.findOne();
  const teacherId = staff._id.toString();
  
  console.log('Testing with Staff ID:', teacherId);
  
  const classTeacherClasses = await Class.find({
    classTeacherId: teacherId,
    isActive: true
  }).select('_id name');
  
  const subjectTeacherClasses = await Class.find({
    'subjectTeachers.teacherId': teacherId,
    isActive: true
  }).select('_id name');
  
  console.log(`Class Teacher Classes:`, classTeacherClasses);
  console.log(`Subject Teacher Classes:`, subjectTeacherClasses);
  
  process.exit(0);
}

run();
