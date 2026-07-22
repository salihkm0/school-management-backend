require('dotenv').config();
const mongoose = require('mongoose');
const Staff = require('./src/models/Staff');
const Class = require('./src/models/Class');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const staff = await Staff.findOne({ employeeId: 'T001' }) || await Staff.findOne();
  const staffIdString = staff._id.toString();
  
  console.log('Testing with String ID:', staffIdString);
  
  const classTeacherClasses = await Class.find({
    classTeacherId: staffIdString
  });
  
  const subjectTeacherClasses = await Class.find({
    'subjectTeachers.teacherId': staffIdString
  });
  
  console.log(`Class Teacher Classes Count: ${classTeacherClasses.length}`);
  console.log(`Subject Teacher Classes Count: ${subjectTeacherClasses.length}`);
  
  process.exit(0);
}

run();
