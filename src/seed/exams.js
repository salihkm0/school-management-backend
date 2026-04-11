const exams = [
  // Term 1 Exams (Onam Exam)
  {
    name: 'First Term Examination 2024',
    description: 'Onam Term Examination',
    startDate: new Date('2024-08-20'),
    endDate: new Date('2024-08-30'),
    term: 'first',
    academicYear: '2024-2025',
    isPublished: true,
    gradingSystem: 'percentage'
  },
  // Term 2 Exams (Christmas Exam)
  {
    name: 'Second Term Examination 2024',
    description: 'Christmas Term Examination',
    startDate: new Date('2024-12-10'),
    endDate: new Date('2024-12-20'),
    term: 'second',
    academicYear: '2024-2025',
    isPublished: false,
    gradingSystem: 'percentage'
  },
  // Term 3 Exams (Annual Exam)
  {
    name: 'Annual Examination 2025',
    description: 'Final Annual Examination',
    startDate: new Date('2025-03-10'),
    endDate: new Date('2025-03-25'),
    term: 'annual',
    academicYear: '2024-2025',
    isPublished: false,
    gradingSystem: 'percentage'
  },
  // Mid Term Exam
  {
    name: 'Mid Term Examination 2024',
    description: 'Mid Term Assessment',
    startDate: new Date('2024-10-15'),
    endDate: new Date('2024-10-22'),
    term: 'mid',
    academicYear: '2024-2025',
    isPublished: true,
    gradingSystem: 'percentage'
  },
  // Model Exam for Class 10 & 12
  {
    name: 'Model Examination 2025',
    description: 'SSLC & HSE Model Exam',
    startDate: new Date('2025-02-01'),
    endDate: new Date('2025-02-15'),
    term: 'final',
    academicYear: '2024-2025',
    isPublished: false,
    gradingSystem: 'percentage'
  }
];

module.exports = exams;