require('dotenv').config();
const mongoose = require('mongoose');
const Staff = require('./src/models/Staff');
const Class = require('./src/models/Class');
const Exam = require('./src/models/Exam'); // If this fails, maybe it's const { Exam } ?

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const staff = await Staff.findOne({ employeeId: 'T001' }) || await Staff.findOne();
  console.log('Staff:', staff.name, staff._id);
  
  const teacherClasses = await Class.find({
    $or: [
      { classTeacherId: staff._id },
      { 'subjectTeachers.teacherId': staff._id }
    ],
    isActive: true
  }).select('_id classTeacherId subjectTeachers');
  
  console.log('Teacher Classes:', teacherClasses.length);
  
  let staffOrConditions = [{ createdBy: staff.userId }];
  teacherClasses.forEach(cls => {
    if (cls.classTeacherId && cls.classTeacherId.toString() === staff._id.toString()) {
      staffOrConditions.push({ classIds: cls._id });
    } else if (cls.subjectTeachers && cls.subjectTeachers.length > 0) {
      const theirSubjects = cls.subjectTeachers.filter(st => st.teacherId && st.teacherId.toString() === staff._id.toString());
      theirSubjects.forEach(st => {
        if (st.subjectId) {
          staffOrConditions.push({
            classIds: cls._id,
            'subjects.subjectId': st.subjectId
          });
        }
      });
    }
  });
  
  const ExamModel = mongoose.models.Exam || mongoose.model('Exam');
  const exams = await ExamModel.find({ $or: staffOrConditions, status: { $ne: 'deleted' } });
  console.log('Exams found:', exams.length);
  exams.forEach(e => console.log(' -', e.name));
  
  process.exit(0);
}

run();
