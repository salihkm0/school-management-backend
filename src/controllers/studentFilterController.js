// controllers/studentFilterController.js
const Student = require('../models/Student');
const Mark = require('../models/Mark');
const Exam = require('../models/Exam');
const ExamResult = require('../models/ExamResult');
const Class = require('../models/Class');

// Grade order for comparison
const GRADE_ORDER = {
  'A+': 10, 'A': 9, 'B+': 8, 'B': 7, 'C+': 6, 
  'C': 5, 'D': 4, 'F': 3, 'ABSENT': 2, 'FAIL': 1
};

// Helper: Compare grades
function isGradeBetterOrEqual(grade1, grade2) {
  return GRADE_ORDER[grade1] >= GRADE_ORDER[grade2];
}

// Helper: Get filter conditions based on criteria
function buildFilterCriteria(filterType, conditions) {
  switch (filterType) {
    case 'all_subjects_grade':
      // Students with specific grade in ALL subjects
      return {
        type: 'all',
        grade: conditions.grade,
        operator: '>='
      };
      
    case 'any_subject_grade':
      // Students with specific grade in ANY subject
      return {
        type: 'any',
        grade: conditions.grade,
        operator: '>='
      };
      
    case 'specific_subjects_grade':
      // Students with specific grade in SPECIFIC subjects
      return {
        type: 'specific',
        subjects: conditions.subjects,
        grade: conditions.grade,
        operator: conditions.operator || '>='
      };
      
    case 'mixed_grades':
      // Students with mixed grade conditions across different subjects
      // Example: A+ in Math AND B+ in Science
      return {
        type: 'mixed',
        conditions: conditions.subjectGrades,
        operator: conditions.matchOperator || 'AND' // AND or OR
      };
      
    case 'percentage_range':
      // Students within percentage range
      return {
        type: 'percentage',
        minPercentage: conditions.minPercentage,
        maxPercentage: conditions.maxPercentage
      };
      
    case 'marks_range':
      // Students within marks range for specific subject
      return {
        type: 'marks',
        subjectId: conditions.subjectId,
        minMarks: conditions.minMarks,
        maxMarks: conditions.maxMarks
      };
      
    case 'rank_range':
      // Students within rank range
      return {
        type: 'rank',
        minRank: conditions.minRank,
        maxRank: conditions.maxRank
      };
      
    case 'combination':
      // Combine multiple filters
      return {
        type: 'combination',
        filters: conditions.filters,
        matchOperator: conditions.matchOperator || 'AND'
      };
      
    default:
      return null;
  }
}

// Main filter function
exports.filterStudents = async (req, res) => {
  try {
    const {
      examId,
      classId,
      filterType,
      conditions,
      page = 1,
      limit = 50,
      sortBy = 'percentage',
      sortOrder = 'desc'
    } = req.body;
    
    // Get all results for the exam and class
    let query = { examId, isPublished: true };
    if (classId) query.classId = classId;
    
    let results = await ExamResult.find(query)
      .populate('studentId', 'name admissionNumber rollNumber photoUrl')
      .populate('subjectResults.subjectId', 'name code');
    
    // Apply filters
    const filteredResults = await applyFilters(results, filterType, conditions);
    
    // Sort results
    const sortedResults = sortResults(filteredResults, sortBy, sortOrder);
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const paginatedResults = sortedResults.slice(startIndex, startIndex + limit);
    
    // Get statistics
    const statistics = calculateStatistics(filteredResults);
    
    res.json({
      success: true,
      data: paginatedResults,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredResults.length,
        pages: Math.ceil(filteredResults.length / limit)
      },
      statistics
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Apply filters based on criteria
async function applyFilters(results, filterType, conditions) {
  const filter = buildFilterCriteria(filterType, conditions);
  if (!filter) return results;
  
  switch (filter.type) {
    case 'all':
      return results.filter(result => {
        const subjectResults = result.subjectResults || [];
        return subjectResults.every(subject => 
          isGradeBetterOrEqual(subject.grade, filter.grade)
        );
      });
      
    case 'any':
      return results.filter(result => {
        const subjectResults = result.subjectResults || [];
        return subjectResults.some(subject => 
          isGradeBetterOrEqual(subject.grade, filter.grade)
        );
      });
      
    case 'specific':
      return results.filter(result => {
        const subjectResults = result.subjectResults || [];
        const targetSubjects = filter.subjects;
        
        if (filter.operator === '>=') {
          return targetSubjects.every(targetSub => {
            const subject = subjectResults.find(s => 
              s.subjectId.toString() === targetSub.subjectId
            );
            return subject && isGradeBetterOrEqual(subject.grade, filter.grade);
          });
        } else {
          return targetSubjects.some(targetSub => {
            const subject = subjectResults.find(s => 
              s.subjectId.toString() === targetSub.subjectId
            );
            return subject && subject.grade === filter.grade;
          });
        }
      });
      
    case 'mixed':
      return results.filter(result => {
        const subjectResults = result.subjectResults || [];
        const conditions = filter.conditions;
        
        const conditionResults = conditions.map(condition => {
          const subject = subjectResults.find(s => 
            s.subjectId.toString() === condition.subjectId
          );
          if (!subject) return false;
          
          if (condition.operator === '>=') {
            return isGradeBetterOrEqual(subject.grade, condition.grade);
          } else if (condition.operator === '<=') {
            return isGradeBetterOrEqual(condition.grade, subject.grade);
          } else if (condition.operator === '==') {
            return subject.grade === condition.grade;
          }
          return false;
        });
        
        if (filter.matchOperator === 'AND') {
          return conditionResults.every(r => r === true);
        } else {
          return conditionResults.some(r => r === true);
        }
      });
      
    case 'percentage':
      return results.filter(result => 
        result.percentage >= filter.minPercentage && 
        result.percentage <= filter.maxPercentage
      );
      
    case 'marks':
      return results.filter(result => {
        const subject = result.subjectResults.find(s => 
          s.subjectId.toString() === filter.subjectId
        );
        if (!subject) return false;
        return subject.obtainedMarks >= filter.minMarks && 
               subject.obtainedMarks <= filter.maxMarks;
      });
      
    case 'rank':
      return results.filter(result => 
        result.rank >= filter.minRank && result.rank <= filter.maxRank
      );
      
    case 'combination':
      let combinedResults = results;
      for (const subFilter of filter.filters) {
        combinedResults = await applyFilters(combinedResults, subFilter.type, subFilter.conditions);
      }
      return combinedResults;
      
    default:
      return results;
  }
}

// Sort results
function sortResults(results, sortBy, sortOrder) {
  const sorted = [...results];
  const order = sortOrder === 'desc' ? -1 : 1;
  
  switch (sortBy) {
    case 'percentage':
      sorted.sort((a, b) => order * (a.percentage - b.percentage));
      break;
    case 'rank':
      sorted.sort((a, b) => order * (a.rank - b.rank));
      break;
    case 'name':
      sorted.sort((a, b) => order * (a.studentName.localeCompare(b.studentName)));
      break;
    case 'totalMarks':
      sorted.sort((a, b) => order * (a.totalMarks - b.totalMarks));
      break;
    default:
      sorted.sort((a, b) => order * (a.percentage - b.percentage));
  }
  
  return sorted;
}

// Calculate statistics
function calculateStatistics(results) {
  if (results.length === 0) {
    return {
      totalStudents: 0,
      averagePercentage: 0,
      highestPercentage: 0,
      lowestPercentage: 0,
      gradeDistribution: {},
      passCount: 0,
      failCount: 0,
      passPercentage: 0
    };
  }
  
  const totalStudents = results.length;
  const totalPercentage = results.reduce((sum, r) => sum + r.percentage, 0);
  const averagePercentage = totalPercentage / totalStudents;
  const highestPercentage = Math.max(...results.map(r => r.percentage));
  const lowestPercentage = Math.min(...results.map(r => r.percentage));
  
  const gradeDistribution = {
    'A+': 0, 'A': 0, 'B+': 0, 'B': 0, 'C+': 0, 'C': 0, 'D': 0, 'F': 0
  };
  
  results.forEach(result => {
    if (gradeDistribution[result.grade] !== undefined) {
      gradeDistribution[result.grade]++;
    }
  });
  
  const passCount = results.filter(r => r.percentage >= 40).length;
  const failCount = totalStudents - passCount;
  const passPercentage = (passCount / totalStudents) * 100;
  
  return {
    totalStudents,
    averagePercentage: averagePercentage.toFixed(2),
    highestPercentage: highestPercentage.toFixed(2),
    lowestPercentage: lowestPercentage.toFixed(2),
    gradeDistribution,
    passCount,
    failCount,
    passPercentage: passPercentage.toFixed(2)
  };
}

// Get students with A+ in all subjects
exports.getTopPerformers = async (req, res) => {
  try {
    const { examId, classId, grade = 'A+', limit = 20 } = req.query;
    
    const query = { examId, isPublished: true };
    if (classId) query.classId = classId;
    
    let results = await ExamResult.find(query)
      .populate('studentId', 'name admissionNumber rollNumber photoUrl');
    
    // Filter students with all subjects grade >= specified grade
    const filtered = results.filter(result => {
      const subjectResults = result.subjectResults || [];
      return subjectResults.every(subject => 
        isGradeBetterOrEqual(subject.grade, grade)
      );
    });
    
    // Sort by percentage
    filtered.sort((a, b) => b.percentage - a.percentage);
    
    res.json({
      success: true,
      data: filtered.slice(0, parseInt(limit)),
      total: filtered.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get students with specific grade in specific subject
exports.getStudentsBySubjectGrade = async (req, res) => {
  try {
    const { examId, classId, subjectId, grade, operator = '>=' } = req.query;
    
    const query = { examId, isPublished: true };
    if (classId) query.classId = classId;
    
    let results = await ExamResult.find(query)
      .populate('studentId', 'name admissionNumber rollNumber');
    
    const filtered = results.filter(result => {
      const subject = result.subjectResults.find(s => 
        s.subjectId.toString() === subjectId
      );
      if (!subject) return false;
      
      if (operator === '>=') {
        return isGradeBetterOrEqual(subject.grade, grade);
      } else if (operator === '<=') {
        return isGradeBetterOrEqual(grade, subject.grade);
      } else {
        return subject.grade === grade;
      }
    });
    
    res.json({
      success: true,
      data: filtered,
      total: filtered.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get students with mixed grade conditions
exports.getStudentsByMixedGrades = async (req, res) => {
  try {
    const { examId, classId, conditions, matchOperator = 'AND' } = req.body;
    
    const query = { examId, isPublished: true };
    if (classId) query.classId = classId;
    
    let results = await ExamResult.find(query)
      .populate('studentId', 'name admissionNumber rollNumber');
    
    const filtered = results.filter(result => {
      const subjectResults = result.subjectResults || [];
      const conditionResults = conditions.map(cond => {
        const subject = subjectResults.find(s => 
          s.subjectId.toString() === cond.subjectId
        );
        if (!subject) return false;
        
        if (cond.operator === '>=') {
          return isGradeBetterOrEqual(subject.grade, cond.grade);
        } else if (cond.operator === '<=') {
          return isGradeBetterOrEqual(cond.grade, subject.grade);
        } else {
          return subject.grade === cond.grade;
        }
      });
      
      if (matchOperator === 'AND') {
        return conditionResults.every(r => r === true);
      } else {
        return conditionResults.some(r => r === true);
      }
    });
    
    res.json({
      success: true,
      data: filtered,
      total: filtered.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get rank-wise students
exports.getStudentsByRank = async (req, res) => {
  try {
    const { examId, classId, minRank, maxRank } = req.query;
    
    const query = { examId, isPublished: true };
    if (classId) query.classId = classId;
    
    const results = await ExamResult.find(query)
      .populate('studentId', 'name admissionNumber rollNumber')
      .sort({ rank: 1 });
    
    const filtered = results.filter(r => 
      r.rank >= parseInt(minRank) && r.rank <= parseInt(maxRank)
    );
    
    res.json({
      success: true,
      data: filtered,
      total: filtered.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get percentage range students
exports.getStudentsByPercentage = async (req, res) => {
  try {
    const { examId, classId, minPercentage, maxPercentage } = req.query;
    
    const query = { examId, isPublished: true };
    if (classId) query.classId = classId;
    
    const results = await ExamResult.find(query)
      .populate('studentId', 'name admissionNumber rollNumber');
    
    const filtered = results.filter(r => 
      r.percentage >= parseFloat(minPercentage) && 
      r.percentage <= parseFloat(maxPercentage)
    );
    
    res.json({
      success: true,
      data: filtered,
      total: filtered.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Export to CSV
exports.exportFilteredStudents = async (req, res) => {
  try {
    const { examId, classId, filterType, conditions } = req.body;
    
    let query = { examId, isPublished: true };
    if (classId) query.classId = classId;
    
    let results = await ExamResult.find(query)
      .populate('studentId', 'name admissionNumber rollNumber');
    
    const filteredResults = await applyFilters(results, filterType, conditions);
    
    // Generate CSV
    const csvRows = [];
    
    // Headers
    csvRows.push([
      'Rank', 'Student Name', 'Admission Number', 'Roll Number',
      'Total Marks', 'Max Marks', 'Percentage', 'Grade',
      ...(filteredResults[0]?.subjectResults || []).map(s => `${s.subjectName} (${s.obtainedMarks}/${s.maxMarks}) - ${s.grade}`)
    ].join(','));
    
    // Data rows
    filteredResults.forEach(result => {
      const row = [
        result.rank,
        `"${result.studentName}"`,
        result.studentId?.admissionNumber || '',
        result.studentId?.rollNumber || '',
        result.totalMarks,
        result.totalMaxMarks,
        result.percentage.toFixed(2),
        result.grade,
        ...result.subjectResults.map(s => `${s.grade}`)
      ];
      csvRows.push(row.join(','));
    });
    
    const csv = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=students_${examId}_${Date.now()}.csv`);
    res.send(csv);
    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get filter options (available grades, subjects, etc.)
exports.getFilterOptions = async (req, res) => {
  try {
    const { examId } = req.params;
    
    const exam = await Exam.findById(examId).populate('subjects.subjectId', 'name code');
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const grades = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'];
    
    const subjects = exam.subjects.map(s => ({
      id: s.subjectId._id,
      name: s.subjectName,
      code: s.subjectCode,
      maxMarks: s.maxMarks
    }));
    
    res.json({
      success: true,
      data: {
        grades,
        subjects,
        filterTypes: [
          { value: 'all_subjects_grade', label: 'All Subjects Grade' },
          { value: 'any_subject_grade', label: 'Any Subject Grade' },
          { value: 'specific_subjects_grade', label: 'Specific Subjects Grade' },
          { value: 'mixed_grades', label: 'Mixed Grades' },
          { value: 'percentage_range', label: 'Percentage Range' },
          { value: 'marks_range', label: 'Marks Range' },
          { value: 'rank_range', label: 'Rank Range' },
          { value: 'combination', label: 'Combination Filter' }
        ],
        operators: [
          { value: '>=', label: 'Greater than or equal to' },
          { value: '<=', label: 'Less than or equal to' },
          { value: '==', label: 'Equal to' }
        ],
        matchOperators: [
          { value: 'AND', label: 'Match ALL conditions' },
          { value: 'OR', label: 'Match ANY condition' }
        ]
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};