require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Staff = require('../models/Staff');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const AcademicYear = require('../models/AcademicYear');

const seedMassiveData = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    console.log('\n🧹 Clearing existing data...');
    await AcademicYear.deleteMany({});
    await User.deleteMany({});
    await Staff.deleteMany({});
    await Student.deleteMany({});
    await Parent.deleteMany({});
    await Class.deleteMany({});
    await Subject.deleteMany({});
    
    const testUsers = [];

    // Pre-hash passwords for huge speed boost!
    const salt = await bcrypt.genSalt(10);
    console.log('\n🔐 Pre-hashing passwords...');
    const hashAdmin = await bcrypt.hash('123456', salt);
    const hashStaff = await bcrypt.hash('Staff@123', salt);
    const hashParent = await bcrypt.hash('Parent@123', salt);

    // 1. Create Academic Year
    console.log('\n📅 Creating academic year...');
    const academicYear = await AcademicYear.create({
      name: '2023-2024',
      year: '2023-2024',
      startDate: new Date('2023-06-01'),
      endDate: new Date('2024-05-31'),
      isCurrent: true,
      isActive: true
    });
    
    // 2. Create Subjects
    console.log('\n📚 Creating subjects...');
    const subjectNames = ['English', 'Malayalam', 'Hindi', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Social Science', 'IT'];
    const subjects = await Subject.insertMany(
      subjectNames.map((name, index) => ({
        name,
        code: `SUB${index + 1}`,
        type: 'core',
        creditHours: 4,
        isActive: true
      }))
    );
    
    // 3. Create Admin User
    console.log('\n👥 Creating admin user...');
    // We use insertMany here to bypass pre('save') since we already hashed the password
    const adminUserDoc = {
      _id: new mongoose.Types.ObjectId(),
      email: 'salihkm000@gmail.com',
      password: hashAdmin,
      name: 'Salih KM',
      role: 'administration',
      phone: '1234567890',
      isActive: true
    };
    await User.collection.insertOne(adminUserDoc);
    testUsers.push({ email: adminUserDoc.email, password: '123456', role: 'administration' });

    // 4. Create Staff
    console.log('\n👨‍🏫 Creating 150 staff members...');
    const staffUserDocs = [];
    const staffDocs = [];
    for (let i = 1; i <= 150; i++) {
      const email = `staff${i}@ksmschool.edu`;
      const pass = 'Staff@123';
      const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
      const userId = new mongoose.Types.ObjectId();
      
      staffUserDocs.push({
        _id: userId,
        email,
        password: hashStaff,
        name: `Teacher ${i}`,
        role: 'staff',
        phone,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      staffDocs.push({
        userId: userId,
        staffCode: `TCH${i.toString().padStart(3, '0')}`,
        name: `Teacher ${i}`,
        role: 'teacher',
        contact: phone,
        email: email,
        department: 'General',
        designation: 'Teacher',
        qualification: 'B.Ed',
        dateOfJoining: new Date('2020-06-01'),
        specialization: ['General'],
        isActive: true
      });
      
      if (testUsers.length < 500) {
        testUsers.push({ email, password: pass, role: 'staff' });
      }
    }
    await User.collection.insertMany(staffUserDocs);
    await Staff.insertMany(staffDocs);
    console.log(`   ✅ Created 150 staff members`);

    // 5. Create Classes (8, 9, 10 - A to Z)
    console.log('\n🏫 Creating classes...');
    const standards = ['8', '9', '10'];
    const divisions = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const classDocs = [];
    
    standards.forEach(std => {
      divisions.forEach(div => {
        classDocs.push({
          name: std,
          section: div,
          academicYearId: academicYear._id,
          capacity: 60,
          subjects: subjects.map(s => s._id),
          isActive: true
        });
      });
    });
    const classes = await Class.insertMany(classDocs);
    console.log(`   ✅ Created ${classes.length} classes`);

    // 6. Create Students & Parents
    console.log('\n👨‍🎓 Creating 4680 students and parent accounts (60 per class)...');
    let studentCount = 0;
    
    // Process one class at a time to avoid memory overload
    for (const cls of classes) {
      const studentDocs = [];
      const parentUserDocs = [];
      const parentDocs = [];
      
      for (let i = 1; i <= 60; i++) {
        studentCount++;
        const admissionNo = `ADM${studentCount.toString().padStart(4, '0')}`;
        const parentId = new mongoose.Types.ObjectId();
        const studentUserId = new mongoose.Types.ObjectId();
        
        // Parent User
        const parentEmail = `parent${studentCount}@example.com`;
        const parentPass = 'Parent@123';
        const parentPhone = `8${studentCount.toString().padStart(9, '0')}`;
        
        parentUserDocs.push({
          _id: parentId,
          email: parentEmail,
          password: hashParent,
          name: `Parent ${studentCount}`,
          role: 'parent',
          phone: parentPhone,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });

        parentDocs.push({
          userId: parentId,
          fullName: `Parent ${studentCount}`,
          email: parentEmail,
          phone: parentPhone,
          students: [{
            studentCode: admissionNo,
            dateOfBirth: new Date('2010-01-01'),
            relation: 'father',
            studentFullName: `Student ${studentCount}`,
            className: `${cls.name}-${cls.section}`
          }],
          isActive: true
        });

        studentDocs.push({
          parentIds: [parentId],
          classId: cls._id,
          academicYearId: academicYear._id,
          admissionNo: admissionNo,
          studentCode: admissionNo,
          rollNumber: i.toString(),
          firstName: 'Student',
          lastName: studentCount.toString(),
          fullName: `Student ${studentCount}`,
          gender: i % 2 === 0 ? 'F' : 'M',
          dateOfBirth: new Date('2010-01-01'),
          bloodGroup: 'O+',
          contactNumber: parentPhone,
          address: 'Kondotty, Malappuram',
          status: 'active'
        });

        // Collect some users for load testing randomly
        if (Math.random() < 0.2 && testUsers.length < 1500) {
          testUsers.push({ email: parentEmail, password: parentPass, role: 'parent' });
        }
      }
      
      await User.collection.insertMany(parentUserDocs);
      await Parent.insertMany(parentDocs);
      await Student.insertMany(studentDocs);
      process.stdout.write(`\r   Inserted students for class ${cls.name}-${cls.section} (${studentCount}/4680)...`);
    }
    
    console.log(`\n   ✅ Created ${studentCount} students and parent accounts`);

    // Write tests/load/users.csv
    console.log('\n📝 Generating users.csv for load test...');
    const csvPath = path.join(__dirname, '../../tests/load/users.csv');
    const csvContent = 'email,password,role\n' + testUsers.map(u => `${u.email},${u.password},${u.role}`).join('\n');
    fs.writeFileSync(csvPath, csvContent);
    console.log(`   ✅ Wrote ${testUsers.length} user credentials to users.csv`);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 MASSIVE SEEDING COMPLETE!');
    console.log('='.repeat(60));

    await mongoose.connection.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Seeding error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

seedMassiveData();
