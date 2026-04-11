// Kerala style names with proper Malayali naming conventions
const malayalamFirstNames = {
  male: [
    'Aditya', 'Akhil', 'Anand', 'Arjun', 'Arun', 'Ashwin', 'Devan', 'Gokul', 'Hari', 'Jithin',
    'Krishna', 'Manu', 'Nikhil', 'Niranjan', 'Rahul', 'Rajeev', 'Rohit', 'Sanjay', 'Sreejith', 'Suresh',
    'Vishnu', 'Yadhu', 'Abhinav', 'Adarsh', 'Akshay', 'Alwin', 'Amal', 'Anoop', 'Anurag', 'Aravind',
    'Deepak', 'Dhanush', 'Gautham', 'Govind', 'Hrithik', 'Jeevan', 'Karthik', 'Kiran', 'Madhav', 'Mithun'
  ],
  female: [
    'Aishwarya', 'Anjali', 'Anjana', 'Anju', 'Archana', 'Athira', 'Devi', 'Gayathri', 'Gopika', 'Hridya',
    'Kalyani', 'Kavya', 'Lakshmi', 'Malavika', 'Meera', 'Nandana', 'Neethu', 'Nimisha', 'Parvathy', 'Radhika',
    'Reshma', 'Revathy', 'Sandra', 'Sneha', 'Sreelakshmi', 'Sruthi', 'Swathy', 'Varsha', 'Vismaya', 'Vrinda',
    'Adithi', 'Aleena', 'Amrita', 'Ann', 'Arya', 'Bhavya', 'Chithra', 'Devika', 'Divya', 'Fathima'
  ]
};

const houseNames = ['Nalanda', 'Takshashila', 'Vikramashila', 'Ujjaini'];

const generateAdmissionNumber = (classNum, section, index) => {
  const year = '24';
  const classCode = classNum.toString().padStart(2, '0');
  const secCode = section === 'Science' ? 'S' : section === 'Commerce' ? 'C' : 'A';
  const num = index.toString().padStart(3, '0');
  return `KSM${year}${classCode}${secCode}${num}`;
};

const generatePhoneNumber = () => {
  const prefixes = ['98', '97', '94', '95', '99', '89', '85'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const rest = Math.floor(10000000 + Math.random() * 90000000).toString();
  return prefix + rest.slice(0, 8);
};

const generateStudentsForClass = (className, section, count = 30) => {
  const students = [];
  const classNum = className;
  
  for (let i = 1; i <= count; i++) {
    const gender = Math.random() > 0.5 ? 'male' : 'female';
    const firstName = malayalamFirstNames[gender][Math.floor(Math.random() * malayalamFirstNames[gender].length)];
    const lastName = gender === 'male' ? 
      ['Nair', 'Menon', 'Pillai', 'Kumar', 'Krishnan', 'Rajan', 'Varma'][Math.floor(Math.random() * 7)] :
      ['Nair', 'Menon', 'Kumari', 'Devi', 'Lakshmi', 'Priya'][Math.floor(Math.random() * 6)];
    
    const name = `${firstName} ${lastName}`;
    const fatherName = `Shri. ${['Suresh', 'Rajesh', 'Mahesh', 'Ramesh', 'Dinesh', 'Vijayan', 'Mohanan'][Math.floor(Math.random() * 7)]} ${lastName}`;
    const motherName = `Smt. ${['Latha', 'Geetha', 'Sudha', 'Rema', 'Sheela', 'Usha', 'Vimala'][Math.floor(Math.random() * 7)]}`;
    
    const house = houseNames[i % houseNames.length];
    const dob = new Date(2015 - parseInt(classNum), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
    
    students.push({
      admissionNumber: generateAdmissionNumber(classNum, section, i),
      name,
      fatherName,
      motherName,
      guardianPhone: generatePhoneNumber(),
      guardianEmail: `${firstName.toLowerCase()}.parent@gmail.com`,
      address: `${['Kaloor', 'Palarivattom', 'Edappally', 'Vytilla', 'Kadavanthra', 'Panampilly Nagar'][i % 6]}, Kochi, Kerala - 6820${10 + (i % 20)}`,
      dateOfBirth: dob,
      dateOfAdmission: new Date('2024-06-01'),
      rollNumber: i.toString().padStart(2, '0'),
      status: 'active',
      additionalInfo: {
        bloodGroup: ['A+', 'B+', 'O+', 'AB+', 'A-', 'B-'][i % 6],
        house,
        aadhaarNumber: `${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`,
        religion: ['Hindu', 'Christian', 'Muslim'][i % 3],
        caste: i % 3 === 0 ? 'General' : i % 3 === 1 ? 'OBC' : 'SC/ST'
      }
    });
  }
  
  return students;
};

// Generate all students for all classes
const allStudents = [
  ...generateStudentsForClass('1', null, 30),
  ...generateStudentsForClass('2', null, 30),
  ...generateStudentsForClass('3', null, 30),
  ...generateStudentsForClass('4', null, 30),
  ...generateStudentsForClass('5', null, 30),
  ...generateStudentsForClass('6', null, 30),
  ...generateStudentsForClass('7', null, 30),
  ...generateStudentsForClass('8', null, 30),
  ...generateStudentsForClass('9', null, 30),
  ...generateStudentsForClass('10', null, 30),
  ...generateStudentsForClass('11', 'Science', 30),
  ...generateStudentsForClass('11', 'Commerce', 30),
  ...generateStudentsForClass('12', 'Science', 30),
  ...generateStudentsForClass('12', 'Commerce', 30)
];

module.exports = allStudents;