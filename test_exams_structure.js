require('dotenv').config();
const mongoose = require('mongoose');
const Staff = require('./src/models/Staff');
const Class = require('./src/models/Class');
const Exam = require('./src/models/Exam');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const staff = await Staff.findOne({ employeeId: 'T001' }) || await Staff.findOne();
  console.log('Staff ID:', staff._id);
  
  const teacherClasses = await Class.find({
    $or: [
      { classTeacherId: staff._id },
      { 'subjectTeachers.teacherId': staff._id }
    ],
    isActive: true
  }).select('_id name classTeacherId subjectTeachers');
  
  console.log('\n--- Teacher Classes ---');
  teacherClasses.forEach(cls => {
    console.log(`Class: ${cls.name}`);
    console.log(`  classTeacherId: ${cls.classTeacherId}`);
    if (cls.subjectTeachers) {
      cls.subjectTeachers.forEach(st => {
        console.log(`  subjectTeacher: subj=${st.subjectId}, teacher=${st.teacherId}`);
      });
    }
  });
  
  let staffOrConditions = [{ createdBy: staff.userId }];
  // ... omitting the filter logic since we just want to see the exam ...
  
  const ExamModel = mongoose.models.Exam || mongoose.model('Exam');
  const exams = await ExamModel.find({ status: { $ne: 'deleted' } });
  console.log('\n--- Exams ---');
  exams.forEach(e => {
    console.log(`Exam: ${e.name}`);
    console.log(`  classIds: ${JSON.stringify(e.classIds)}`);
    console.log(`  subjects: ${JSON.stringify(e.subjects)}`);
  });
  
  process.exit(0);
}

run();
