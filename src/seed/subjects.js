// Kerala State Syllabus Subjects (Classes 1-10) and Higher Secondary (11-12)
const subjects = [
  // Primary Classes (1-4)
  { name: 'Malayalam', code: 'MAL', type: 'core', creditHours: 5, department: 'Languages', gradeLevel: 'primary' },
  { name: 'English', code: 'ENG', type: 'core', creditHours: 5, department: 'Languages', gradeLevel: 'all' },
  { name: 'Mathematics', code: 'MAT', type: 'core', creditHours: 5, department: 'Mathematics', gradeLevel: 'all' },
  { name: 'Environmental Studies', code: 'EVS', type: 'core', creditHours: 4, department: 'Science', gradeLevel: 'primary' },
  
  // Upper Primary (5-7)
  { name: 'Basic Science', code: 'BSC', type: 'core', creditHours: 4, department: 'Science', gradeLevel: 'middle' },
  { name: 'Social Science', code: 'SSC', type: 'core', creditHours: 4, department: 'Social Science', gradeLevel: 'middle' },
  { name: 'Hindi', code: 'HIN', type: 'core', creditHours: 4, department: 'Languages', gradeLevel: 'middle' },
  { name: 'Information Technology', code: 'IT', type: 'core', creditHours: 2, department: 'Computer Science', gradeLevel: 'middle' },
  
  // High School (8-10)
  { name: 'Physics', code: 'PHY', type: 'core', creditHours: 4, department: 'Science', gradeLevel: 'high' },
  { name: 'Chemistry', code: 'CHE', type: 'core', creditHours: 4, department: 'Science', gradeLevel: 'high' },
  { name: 'Biology', code: 'BIO', type: 'core', creditHours: 4, department: 'Science', gradeLevel: 'high' },
  
  // Higher Secondary (11-12) - Science Stream
  { name: 'Physics (HS)', code: 'PHY2', type: 'core', creditHours: 5, department: 'Science', gradeLevel: 'high' },
  { name: 'Chemistry (HS)', code: 'CHE2', type: 'core', creditHours: 5, department: 'Science', gradeLevel: 'high' },
  { name: 'Biology (HS)', code: 'BIO2', type: 'core', creditHours: 5, department: 'Science', gradeLevel: 'high' },
  { name: 'Mathematics (HS)', code: 'MAT2', type: 'core', creditHours: 5, department: 'Mathematics', gradeLevel: 'high' },
  
  // Higher Secondary (11-12) - Commerce Stream
  { name: 'Accountancy', code: 'ACC', type: 'core', creditHours: 5, department: 'Commerce', gradeLevel: 'high' },
  { name: 'Business Studies', code: 'BST', type: 'core', creditHours: 5, department: 'Commerce', gradeLevel: 'high' },
  { name: 'Economics', code: 'ECO', type: 'core', creditHours: 5, department: 'Commerce', gradeLevel: 'high' },
  { name: 'Computer Application', code: 'CAP', type: 'core', creditHours: 4, department: 'Computer Science', gradeLevel: 'high' },
  
  // Higher Secondary (11-12) - Humanities Stream
  { name: 'History', code: 'HIS', type: 'core', creditHours: 5, department: 'Humanities', gradeLevel: 'high' },
  { name: 'Political Science', code: 'POL', type: 'core', creditHours: 5, department: 'Humanities', gradeLevel: 'high' },
  { name: 'Sociology', code: 'SOC', type: 'core', creditHours: 5, department: 'Humanities', gradeLevel: 'high' },
  { name: 'Psychology', code: 'PSY', type: 'core', creditHours: 5, department: 'Humanities', gradeLevel: 'high' },
  
  // Common Subjects
  { name: 'Physical Education', code: 'PED', type: 'elective', creditHours: 2, department: 'Physical Education', gradeLevel: 'all' },
  { name: 'Art Education', code: 'ART', type: 'elective', creditHours: 2, department: 'Arts', gradeLevel: 'all' },
  { name: 'Work Experience', code: 'WEX', type: 'elective', creditHours: 2, department: 'Vocational', gradeLevel: 'all' },
  { name: 'Moral Education', code: 'MOR', type: 'elective', creditHours: 1, department: 'General', gradeLevel: 'all' },
  { name: 'Arabic', code: 'ARB', type: 'elective', creditHours: 3, department: 'Languages', gradeLevel: 'middle' },
  { name: 'Sanskrit', code: 'SAN', type: 'elective', creditHours: 3, department: 'Languages', gradeLevel: 'middle' },
  { name: 'Urdu', code: 'URD', type: 'elective', creditHours: 3, department: 'Languages', gradeLevel: 'middle' }
];

module.exports = subjects;