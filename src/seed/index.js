require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Models
const User = require('../models/User');
const Staff = require('../models/Staff');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const { Exam } = require('../models/Exam');
const { Attendance } = require('../models/Attendance');
const Mark = require('../models/Mark');
const AcademicYear = require('../models/AcademicYear');

// Seed Data
const subjectsData = require('./subjects');
const classesData = require('./classes');
const staffData = require('./staff');
const studentsData = require('./students');
const examsData = require('./exams');
const generateAttendance = require('./attendance');

const seedDatabase = async () => {
  try {
    // Check if MONGODB_URI exists
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    // Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    console.log(`   URI: ${process.env.MONGODB_URI}`);
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    console.log('\n🧹 Clearing existing data...');
    await AcademicYear.deleteMany({});
    await User.deleteMany({});
    await Staff.deleteMany({});
    await Student.deleteMany({});
    await Class.deleteMany({});
    await Subject.deleteMany({});
    await Exam.deleteMany({});
    await Attendance.deleteMany({});
    await Mark.deleteMany({});
    console.log('   ✅ All collections cleared');

    // 1. Create Subjects
    console.log('\n📚 Creating subjects...');
    const subjects = await Subject.insertMany(subjectsData);
    console.log(`   ✅ Created ${subjects.length} subjects`);

    // Create a map for easy subject lookup
    const subjectMap = {};
    subjects.forEach(s => { subjectMap[s.name] = s; });

    // 1.5 Create Academic Year
    console.log('\n📅 Creating academic year...');
    const academicYear = await AcademicYear.create({
      name: '2023-2024',
      year: '2023-2024',
      startDate: new Date('2023-06-01'),
      endDate: new Date('2024-05-31'),
      isCurrent: true,
      isActive: true
    });
    console.log(`   ✅ Created academic year: ${academicYear.name}`);

    // 2. Create Classes
    console.log('\n🏫 Creating classes...');
    const classesDataWithYear = classesData.map(c => ({ ...c, academicYearId: academicYear._id }));
    const classes = await Class.insertMany(classesDataWithYear);
    console.log(`   ✅ Created ${classes.length} classes`);

    // Create a map for easy class lookup
    const classMap = {};
    classes.forEach(cls => {
      // Key format: "1", "2", ..., "11-Science", "11-Commerce", etc.
      const key = cls.section ? `${cls.name}-${cls.section}` : cls.name;
      classMap[key] = cls;
      console.log(`   Class key: ${key} -> ${cls.name} ${cls.section || ''}`);
    });

    // 3. Create Users for Staff
    console.log('\n👥 Creating users...');
    
    const staffNames = [
      { email: 'principal@ksmschool.edu', name: 'Dr. K. Suresh Kumar' },
      { email: 'viceprincipal@ksmschool.edu', name: 'Smt. M. Sarada Devi' },
      { email: 'adminoffice@ksmschool.edu', name: 'Shri. P. Rajendran' },
      { email: 'leelavathy.k@ksmschool.edu', name: 'Smt. K. Leelavathy' },
      { email: 'gopinathan.m@ksmschool.edu', name: 'Shri. M. Gopinathan' },
      { email: 'mary.joseph@ksmschool.edu', name: 'Smt. Mary Joseph' },
      { email: 'thomas.mathew@ksmschool.edu', name: 'Shri. Thomas Mathew' },
      { email: 'sheeba.george@ksmschool.edu', name: 'Smt. Sheeba George' },
      { email: 'pushpa.rani@ksmschool.edu', name: 'Smt. Pushpa Rani' },
      { email: 'ramesh.chandra@ksmschool.edu', name: 'Shri. Ramesh Chandra' },
      { email: 'sreekumar.v@ksmschool.edu', name: 'Shri. V. Sreekumar' },
      { email: 'bindu.nair@ksmschool.edu', name: 'Smt. Bindu V. Nair' },
      { email: 'anil.kumar@ksmschool.edu', name: 'Shri. Anil Kumar' },
      { email: 'geetha.kumari@ksmschool.edu', name: 'Smt. Geetha Kumari' },
      { email: 'mohanan.kp@ksmschool.edu', name: 'Shri. K. P. Mohanan' },
      { email: 'rema.devi@ksmschool.edu', name: 'Smt. Rema Devi' },
      { email: 'suresh.babu@ksmschool.edu', name: 'Shri. Suresh Babu' },
      { email: 'vijayan.ak@ksmschool.edu', name: 'Shri. A. K. Vijayan' },
      { email: 'lathika.menon@ksmschool.edu', name: 'Smt. Lathika Menon' },
      { email: 'biju.thomas@ksmschool.edu', name: 'Shri. Biju Thomas' },
      { email: 'rajeev.kr@ksmschool.edu', name: 'Shri. K. R. Rajeev' },
      { email: 'valsala.kumari@ksmschool.edu', name: 'Smt. Valsala Kumari' }
    ];

    const users = [];
    
    // Admin user
    const adminUser = await User.create({
      email: 'admin@ksmschool.edu',
      password: 'Admin@123',
      name: 'System Administrator',
      role: 'admin',
      phone: '9876543210',
      isActive: true
    });
    users.push(adminUser);

    // Staff users
    for (const staffInfo of staffNames) {
      const user = await User.create({
        email: staffInfo.email,
        password: 'Staff@123',
        name: staffInfo.name.replace(/Dr\. |Smt\. |Shri\. /g, ''),
        role: 'staff',
        phone: `9${Math.floor(8000000000 + Math.random() * 1999999999)}`,
        isActive: true
      });
      users.push(user);
    }
    
    console.log(`   ✅ Created ${users.length} users`);

    // 4. Create Staff with User associations
    console.log('\n👨‍🏫 Creating staff members...');
    
    const staffWithUsers = staffData.map((staff, index) => {
      // Find matching user for this staff member
      let staffUser;
      
      if (index === 0) {
        staffUser = users.find(u => u.email === 'principal@ksmschool.edu');
      } else if (index === 1) {
        staffUser = users.find(u => u.email === 'viceprincipal@ksmschool.edu');
      } else if (index === 2) {
        staffUser = users.find(u => u.email === 'adminoffice@ksmschool.edu');
      } else {
        // For teachers, match by index + 3 (since first 3 are admin users)
        staffUser = users[index + 3];
      }

      // Assign subjects (just subjectId and subjectName)
      const assignedSubjects = [];
      if (staff.subjectExpertise) {
        staff.subjectExpertise.forEach(exp => {
          const subject = subjectMap[exp];
          if (subject) {
            assignedSubjects.push({
              subjectId: subject._id,
              subjectName: subject.name
            });
          }
        });
      }

      return {
        userId: staffUser?._id,
        name: staff.name,
        role: staff.role,
        qualification: staff.qualification,
        contact: `9${Math.floor(8000000000 + Math.random() * 1999999999)}`,
        subjectExpertise: staff.subjectExpertise,
        dateOfJoining: new Date(staff.dateOfJoining),
        assignedSubjects,
        isActive: true,
        salary: 35000 + (index * 1500),
        emergencyContact: {
          name: `${staff.name.split(' ').slice(-1)[0]} Emergency`,
          phone: `9${Math.floor(8000000000 + Math.random() * 1999999999)}`,
          relation: index % 2 === 0 ? 'Spouse' : 'Sibling'
        }
      };
    });

    // Filter out any staff without userId
    const validStaff = staffWithUsers.filter(s => s.userId);
    const staff = await Staff.insertMany(validStaff);
    console.log(`   ✅ Created ${staff.length} staff members`);

    // Create staff map for class teacher assignment
    const staffMap = {};
    staff.forEach(s => { staffMap[s.name] = s; });

    // 5. Update classes with class teachers and subjects
    console.log('\n📋 Assigning class teachers and subjects...');
    
    const classTeacherAssignments = {
      '1': staffMap['Smt. K. Leelavathy'],
      '2': staffMap['Smt. Sheeba George'],
      '3': staffMap['Smt. Bindu V. Nair'],
      '4': staffMap['Smt. Rema Devi'],
      '5': staffMap['Shri. M. Gopinathan'],
      '6': staffMap['Smt. Mary Joseph'],
      '7': staffMap['Shri. V. Sreekumar'],
      '8': staffMap['Smt. Geetha Kumari'],
      '9': staffMap['Shri. A. K. Vijayan'],
      '10': staffMap['Smt. Lathika Menon'],
      '11-Science': staffMap['Shri. K. P. Mohanan'],
      '11-Commerce': staffMap['Shri. Biju Thomas'],
      '12-Science': staffMap['Smt. Rema Devi'],
      '12-Commerce': staffMap['Smt. Lathika Menon']
    };

    // Assign subjects to each class based on grade level
    for (const cls of classes) {
      const key = cls.section ? `${cls.name}-${cls.section}` : cls.name;
      const classNum = parseInt(cls.name);
      
      // Determine subjects based on class level
      let classSubjects = [];
      
      if (classNum <= 4) {
        // Primary classes
        classSubjects = subjects.filter(s => 
          ['Malayalam', 'English', 'Mathematics', 'Environmental Studies'].includes(s.name)
        );
      } else if (classNum <= 7) {
        // Upper Primary
        classSubjects = subjects.filter(s => 
          ['Malayalam', 'English', 'Hindi', 'Mathematics', 'Basic Science', 'Social Science'].includes(s.name)
        );
      } else if (classNum <= 10) {
        // High School
        classSubjects = subjects.filter(s => 
          ['Malayalam', 'English', 'Hindi', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Social Science'].includes(s.name)
        );
      } else if (cls.section === 'Science') {
        // Higher Secondary Science
        classSubjects = subjects.filter(s => 
          ['English', 'Physics (HS)', 'Chemistry (HS)', 'Mathematics (HS)', 'Biology (HS)'].includes(s.name)
        );
      } else if (cls.section === 'Commerce') {
        // Higher Secondary Commerce
        classSubjects = subjects.filter(s => 
          ['English', 'Accountancy', 'Business Studies', 'Economics', 'Computer Application'].includes(s.name)
        );
      }

      cls.subjects = classSubjects.map(s => s._id);
      
      // Assign class teacher
      const teacher = classTeacherAssignments[key];
      if (teacher) {
        cls.classTeacherId = teacher._id;
        cls.classTeacherName = teacher.name;
      }
      
      await cls.save();
    }
    console.log('   ✅ Class teachers and subjects assigned');

    // 6. Create Students
    console.log('\n👨‍🎓 Creating students...');
    console.log(`   Total students to create: ${studentsData.length}`);
    
    const studentsWithClassIds = studentsData.map(student => {
      let classKey;
      
      // Extract class number from admission number: KSM2401A001 -> 01 -> 1
      const match = student.admissionNumber.match(/KSM24(\d{2})([ASC])/);
      
      if (match) {
        const classNum = parseInt(match[1]); // 01 -> 1, 11 -> 11
        const sectionCode = match[2]; // A, S, or C
        
        if (sectionCode === 'S') {
          classKey = `${classNum}-Science`;
        } else if (sectionCode === 'C') {
          classKey = `${classNum}-Commerce`;
        } else {
          classKey = `${classNum}`;
        }
      } else {
        console.log(`   ⚠️ Could not parse admission number: ${student.admissionNumber}`);
        return null;
      }
      
      const targetClass = classMap[classKey];
      
      if (!targetClass) {
        console.log(`   ⚠️ No class found for key: ${classKey}, admission: ${student.admissionNumber}`);
        return null;
      }
      
      return {
        ...student,
        fullName: student.name,
        admissionNo: student.admissionNumber,
        studentCode: `STU${student.admissionNumber}`,
        academicYearId: targetClass.academicYearId || academicYear._id,
        classId: targetClass._id
      };
    }).filter(s => s !== null);

    console.log(`   Valid students after mapping: ${studentsWithClassIds.length}`);

    // Insert in chunks to avoid memory issues
    const chunkSize = 50;
    const students = [];
    
    for (let i = 0; i < studentsWithClassIds.length; i += chunkSize) {
      const chunk = studentsWithClassIds.slice(i, i + chunkSize);
      const inserted = await Student.insertMany(chunk);
      students.push(...inserted);
      console.log(`   Inserted ${students.length}/${studentsWithClassIds.length} students...`);
    }
    
    console.log(`   ✅ Created ${students.length} students`);

    // Update class student counts
    for (const cls of classes) {
      const count = students.filter(s => s.classId?.toString() === cls._id.toString()).length;
      cls.studentCount = count;
      await cls.save();
    }

    // 7. Create Exams with class associations
    console.log('\n📝 Creating exams...');
    const classIds = classes.map(c => c._id);
    
    const examsWithClasses = examsData.map(exam => {
      // Different subject configs based on exam
      const subjectConfigs = [];
      
      classes.forEach(cls => {
        const classSubjects = cls.subjects || [];
        classSubjects.forEach(subId => {
          const subject = subjects.find(s => s._id.toString() === subId.toString());
          if (subject && !subjectConfigs.find(sc => sc.subjectId.toString() === subId.toString())) {
            subjectConfigs.push({
              subjectId: subject._id,
              subjectName: subject.name,
              maxMarks: 100,
              passingMarks: 35,
              theoryMarks: 80,
              practicalMarks: 20,
              weightage: 100
            });
          }
        });
      });

      return {
        ...exam,
        examType: exam.type || 'first_term', 
        classIds,
        academicYearId: academicYear._id,
        academicYear: academicYear.name,
        term: 'first',
        subjectConfigs
      };
    });

    const exams = await Exam.insertMany(examsWithClasses);
    console.log(`   ✅ Created ${exams.length} exams`);

    // 8. Create Sample Marks
    console.log('\n📊 Creating sample marks for first term exam...');
    const firstExam = exams[0];
    let marksCreated = 0;
    
    if (firstExam && students.length > 0) {
      // Generate marks for first 150 students
      const sampleStudents = students.slice(0, 150);
      const marksToInsert = [];
      
      for (const student of sampleStudents) {
        const studentClass = classes.find(c => c._id.toString() === student.classId?.toString());
        if (!studentClass) continue;
        
        const studentMarks = {
          studentId: student._id,
          studentName: student.fullName,
          classId: studentClass._id,
          academicYearId: academicYear._id,
          examId: firstExam._id,
          examName: firstExam.name,
          subjects: [],
          totalMarks: 0,
          totalMaxMarks: 0,
          status: 'published',
          enteredBy: users[0]._id
        };
        
        for (const subId of studentClass.subjects || []) {
          const subject = subjects.find(s => s._id.toString() === subId.toString());
          if (!subject) continue;
          
          const theoryMarks = Math.floor(55 + Math.random() * 35);
          const practicalMarks = Math.floor(12 + Math.random() * 13);
          
          studentMarks.subjects.push({
            subjectId: subject._id,
            subjectName: subject.name,
            theoryScore: theoryMarks,
            practicalScore: practicalMarks,
            totalMarks: theoryMarks + practicalMarks,
            maxMarks: 100,
            passingMarks: 35,
            isEntered: true
          });
          studentMarks.totalMarks += (theoryMarks + practicalMarks);
          studentMarks.totalMaxMarks += 100;
        }
        
        if (studentMarks.subjects.length > 0) {
          studentMarks.percentage = (studentMarks.totalMarks / studentMarks.totalMaxMarks) * 100;
          marksToInsert.push(studentMarks);
        }
      }
      
      if (marksToInsert.length > 0) {
        await Mark.insertMany(marksToInsert);
        marksCreated = marksToInsert.length;
        console.log(`   ✅ Created ${marksCreated} mark entries`);
      }
    }

    // 9. Create Attendance Records
    console.log('\n📋 Creating attendance records...');
    let totalAttendance = 0;
    
    for (const cls of classes) {
      const classStudents = students.filter(s => s.classId?.toString() === cls._id.toString());
      
      if (classStudents.length === 0) continue;
      
      const attendanceRecords = generateAttendance(
        classStudents.map(s => ({ _id: s._id, fullName: s.fullName })),
        cls._id,
        academicYear._id
      );
      
      // Process in chunks
      const attChunkSize = 100;
      for (let i = 0; i < attendanceRecords.length; i += attChunkSize) {
        const chunk = attendanceRecords.slice(i, i + attChunkSize);
        await Attendance.insertMany(chunk);
        totalAttendance += chunk.length;
      }
      console.log(`   Created attendance for class ${cls.name}${cls.section ? '-' + cls.section : ''}: ${classStudents.length} students`);
    }
    console.log(`   ✅ Created ${totalAttendance} attendance records`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 SEEDING COMPLETE! Summary:');
    console.log('='.repeat(60));
    console.log(`   👤 Users: ${users.length}`);
    console.log(`   👨‍🏫 Staff: ${staff.length}`);
    console.log(`   👨‍🎓 Students: ${students.length}`);
    console.log(`   📚 Classes: ${classes.length}`);
    console.log(`   📖 Subjects: ${subjects.length}`);
    console.log(`   📝 Exams: ${exams.length}`);
    console.log(`   📊 Marks: ${marksCreated}`);
    console.log(`   📋 Attendance Records: ${totalAttendance}`);
    console.log('='.repeat(60));
    
    console.log('\n📧 Test Login Credentials:');
    console.log('   Admin: admin@ksmschool.edu / Admin@123');
    console.log('   Principal: principal@ksmschool.edu / Staff@123');
    console.log('   Vice Principal: viceprincipal@ksmschool.edu / Staff@123');
    console.log('   Teacher: mary.joseph@ksmschool.edu / Staff@123');
    console.log('='.repeat(60));

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Seeding error:', error.message);
    console.error('\nStack trace:', error.stack);
    
    // Close mongoose connection if it exists
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    
    process.exit(1);
  }
};

// Run the seed function
seedDatabase();