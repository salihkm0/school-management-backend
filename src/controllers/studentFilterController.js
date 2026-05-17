// controllers/studentFilterController.js
const Student = require('../models/Student');
const Mark = require('../models/Mark');
const { Exam } = require('../models/Exam');
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

// Helper: Calculate grade based on percentage
function calculateGrade(percentage) {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C+';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
}

// Helper: Get filter conditions based on criteria
function buildFilterCriteria(filterType, conditions) {
  switch (filterType) {
    case 'all_subjects_grade':
      return {
        type: 'all',
        grade: conditions.grade,
        operator: '>=',
        includeCE: conditions.includeCE !== false
      };
      
    case 'any_subject_grade':
      return {
        type: 'any',
        grade: conditions.grade,
        operator: '>=',
        includeCE: conditions.includeCE !== false
      };
      
    case 'specific_subjects_grade':
      return {
        type: 'specific',
        subjects: conditions.subjects,
        grade: conditions.grade,
        operator: conditions.operator || '>=',
        includeCE: conditions.includeCE !== false
      };
      
    case 'mixed_grades':
      return {
        type: 'mixed',
        conditions: conditions.subjectGrades,
        operator: conditions.matchOperator || 'AND',
        includeCE: conditions.includeCE !== false
      };
      
    case 'percentage_range':
      return {
        type: 'percentage',
        minPercentage: conditions.minPercentage,
        maxPercentage: conditions.maxPercentage,
        includeCE: conditions.includeCE !== false
      };
      
    case 'marks_range':
      return {
        type: 'marks',
        subjectId: conditions.subjectId,
        minMarks: conditions.minMarks,
        maxMarks: conditions.maxMarks,
        includeCE: conditions.includeCE !== false
      };
      
    case 'rank_range':
      return {
        type: 'rank',
        minRank: conditions.minRank,
        maxRank: conditions.maxRank
      };
      
    case 'combination':
      return {
        type: 'combination',
        filters: conditions.filters,
        matchOperator: conditions.matchOperator || 'AND'
      };

    case 'theory_only_grade':
      return {
        type: 'theory_only',
        grade: conditions.grade,
        operator: conditions.operator || '>='
      };
      
    case 'ce_only_grade':
      return {
        type: 'ce_only',
        grade: conditions.grade,
        operator: conditions.operator || '>='
      };
      
    case 'theory_marks_range':
      return {
        type: 'theory_marks',
        subjectId: conditions.subjectId,
        minMarks: conditions.minMarks,
        maxMarks: conditions.maxMarks
      };
      
    case 'ce_marks_range':
      return {
        type: 'ce_marks',
        subjectId: conditions.subjectId,
        minMarks: conditions.minMarks,
        maxMarks: conditions.maxMarks
      };
      
    case 'grade_difference':
      return {
        type: 'grade_difference',
        subjectId: conditions.subjectId,
        comparison: conditions.comparison,
        threshold: conditions.threshold || 0
      };
      
    case 'ce_component_performance':
      return {
        type: 'ce_component',
        subjectId: conditions.subjectId,
        componentName: conditions.componentName,
        minScore: conditions.minScore,
        maxScore: conditions.maxScore
      };
      
    case 'subject_wise_breakdown':
      return {
        type: 'subject_breakdown',
        subjectId: conditions.subjectId,
        theoryMin: conditions.theoryMin,
        theoryMax: conditions.theoryMax,
        ceMin: conditions.ceMin,
        ceMax: conditions.ceMax
      };
      
    default:
      return null;
  }
}

// Fix the transformMarksToResults function in studentFilterController.js
function transformMarksToResults(marksData, exam) {
  const results = [];
  
  for (const mark of marksData) {
    const student = mark.studentId;
    const subjectResults = [];
    let totalMarks = 0;
    let totalMaxMarks = 0;
    let theoryTotal = 0;
    let theoryMaxTotal = 0;
    let ceTotal = 0;
    let ceMaxTotal = 0;
    
    // Create a map of exam subjects for quick lookup
    const examSubjectMap = new Map();
    exam.subjects.forEach(subject => {
      const subjectId = subject.subjectId?._id?.toString() || subject.subjectId?.toString();
      // Calculate max marks properly
      const theoryMax = subject.theoryMaxMarks || subject.termMaxMarks || subject.maxMarks || 0;
      const practicalMax = subject.practicalMaxMarks || 0;
      const ceMax = subject.ceMaxMarks || 0;
      const totalSubjectMax = theoryMax + practicalMax + ceMax;
      
      examSubjectMap.set(subjectId, {
        ...subject.toObject(),
        subjectId: subjectId,
        theoryMaxMarks: theoryMax,
        practicalMaxMarks: practicalMax,
        ceMaxMarks: ceMax,
        totalMaxMarks: totalSubjectMax,
        hasCE: ceMax > 0  // Add flag to check if CE exists
      });
    });
    
    for (const subjectMark of mark.subjects) {
      const markSubjectId = subjectMark.subjectId?.toString();
      const examSubject = examSubjectMap.get(markSubjectId);
      
      if (examSubject) {
        // Calculate max marks using the exam subject config
        const theoryMax = examSubject.theoryMaxMarks || examSubject.maxMarks || 100;
        const practicalMax = examSubject.practicalMaxMarks || 0;
        const ceMax = examSubject.ceMaxMarks || 0;
        const maxMarks = theoryMax + practicalMax + ceMax;
        
        // Get scores from the mark
        const theoryScore = subjectMark.theoryScore || 0;
        const practicalScore = subjectMark.practicalScore || 0;
        const ceScore = subjectMark.ceScore || 0;
        const obtainedMarks = theoryScore + practicalScore + ceScore;
        
        // Calculate percentages
        const percentage = maxMarks > 0 ? (obtainedMarks / maxMarks) * 100 : 0;
        const theoryPercentage = theoryMax > 0 ? (theoryScore / theoryMax) * 100 : 0;
        
        // Only calculate CE percentage if CE exists (max > 0)
        let cePercentage = null;
        let ceGrade = null;
        if (ceMax > 0) {
          cePercentage = (ceScore / ceMax) * 100;
          ceGrade = calculateGrade(cePercentage);
        }
        
        // Calculate grades
        const grade = calculateGrade(percentage);
        const theoryGrade = calculateGrade(theoryPercentage);
        
        subjectResults.push({
          subjectId: subjectMark.subjectId,
          subjectName: examSubject.subjectName,
          subjectCode: examSubject.subjectCode,
          obtainedMarks,
          maxMarks,
          theoryScore,
          practicalScore,
          ceScore,
          theoryMax,
          practicalMax,
          ceMax,
          percentage,
          theoryPercentage,
          cePercentage,
          grade,
          theoryGrade,
          ceGrade,  // Will be null if no CE
          hasCE: examSubject.hasCE
        });
        
        totalMarks += obtainedMarks;
        totalMaxMarks += maxMarks;
        theoryTotal += theoryScore;
        theoryMaxTotal += theoryMax;
        if (ceMax > 0) {
          ceTotal += ceScore;
          ceMaxTotal += ceMax;
        }
      } else {
        console.log(`Subject mismatch: Mark subject ${markSubjectId} not found in exam`);
      }
    }
    
    const overallPercentage = totalMaxMarks > 0 ? (totalMarks / totalMaxMarks) * 100 : 0;
    const overallGrade = calculateGrade(overallPercentage);
    const theoryOverallPercentage = theoryMaxTotal > 0 ? (theoryTotal / theoryMaxTotal) * 100 : 0;
    
    // Only calculate CE overall percentage if there are CE subjects
    const ceOverallPercentage = ceMaxTotal > 0 ? (ceTotal / ceMaxTotal) * 100 : null;
    const ceOverallGrade = ceOverallPercentage !== null ? calculateGrade(ceOverallPercentage) : null;
    
    results.push({
      _id: mark._id,
      studentId: student,
      studentName: student?.fullName || 'Unknown',
      studentCode: student?.studentCode,
      rollNumber: student?.rollNumber,
      admissionNo: student?.admissionNo,
      examId: exam._id,
      examName: exam.displayName || exam.name,
      classId: mark.classId,
      subjectResults,
      totalMarks,
      totalMaxMarks,
      percentage: overallPercentage,
      grade: overallGrade,
      theoryOnlyPercentage: theoryOverallPercentage,
      theoryGrade: calculateGrade(theoryOverallPercentage),
      ceOnlyPercentage: ceOverallPercentage,
      ceGrade: ceOverallGrade,
      rank: 0,
      status: mark.status,
      isFinalized: mark.isFinalized,
      hasCE: ceMaxTotal > 0
    });
  }
  
  // Calculate ranks
  results.sort((a, b) => b.percentage - a.percentage);
  let rank = 1;
  let prevPercentage = -1;
  
  for (let i = 0; i < results.length; i++) {
    if (results[i].percentage !== prevPercentage) {
      rank = i + 1;
    }
    results[i].rank = rank;
    prevPercentage = results[i].percentage;
  }
  
  return results;
}

// Apply filters based on criteria
async function applyFilters(results, filterType, conditions) {
  const filter = buildFilterCriteria(filterType, conditions);
  if (!filter) return results;
  
  switch (filter.type) {
    case 'all':
      return results.filter(result => {
        const subjects = result.subjectResults;
        return subjects.every(subject => {
          const gradeToCheck = filter.includeCE ? subject.grade : subject.theoryGrade;
          return isGradeBetterOrEqual(gradeToCheck, filter.grade);
        });
      });
      
    case 'any':
      return results.filter(result => {
        const subjects = result.subjectResults;
        return subjects.some(subject => {
          const gradeToCheck = filter.includeCE ? subject.grade : subject.theoryGrade;
          return isGradeBetterOrEqual(gradeToCheck, filter.grade);
        });
      });
      
    case 'specific':
      return results.filter(result => {
        const subjects = result.subjectResults;
        const targetSubjects = filter.subjects;
        
        if (filter.operator === '>=') {
          return targetSubjects.every(targetSub => {
            const subject = subjects.find(s => 
              s.subjectId.toString() === targetSub.subjectId
            );
            if (!subject) return false;
            const gradeToCheck = filter.includeCE ? subject.grade : subject.theoryGrade;
            return isGradeBetterOrEqual(gradeToCheck, filter.grade);
          });
        } else {
          return targetSubjects.some(targetSub => {
            const subject = subjects.find(s => 
              s.subjectId.toString() === targetSub.subjectId
            );
            if (!subject) return false;
            const gradeToCheck = filter.includeCE ? subject.grade : subject.theoryGrade;
            return gradeToCheck === filter.grade;
          });
        }
      });
      
    case 'mixed':
      return results.filter(result => {
        const subjects = result.subjectResults;
        const conditions = filter.conditions;
        
        const conditionResults = conditions.map(condition => {
          const subject = subjects.find(s => 
            s.subjectId.toString() === condition.subjectId
          );
          if (!subject) return false;
          
          const gradeToCheck = filter.includeCE ? subject.grade : subject.theoryGrade;
          
          if (condition.operator === '>=') {
            return isGradeBetterOrEqual(gradeToCheck, condition.grade);
          } else if (condition.operator === '<=') {
            return isGradeBetterOrEqual(condition.grade, gradeToCheck);
          } else if (condition.operator === '==') {
            return gradeToCheck === condition.grade;
          }
          return false;
        });
        
        if (filter.operator === 'AND') {
          return conditionResults.every(r => r === true);
        } else {
          return conditionResults.some(r => r === true);
        }
      });
      
    case 'percentage':
      return results.filter(result => {
        const percentage = filter.includeCE ? result.percentage : result.theoryOnlyPercentage;
        return percentage >= filter.minPercentage && percentage <= filter.maxPercentage;
      });
      
    case 'marks':
      return results.filter(result => {
        const subject = result.subjectResults.find(s => 
          s.subjectId.toString() === filter.subjectId
        );
        if (!subject) return false;
        
        const marks = filter.includeCE ? subject.obtainedMarks : subject.theoryScore;
        return marks >= filter.minMarks && marks <= filter.maxMarks;
      });
      
    case 'rank':
      return results.filter(result => 
        result.rank >= filter.minRank && result.rank <= filter.maxRank
      );
      
    case 'combination':
      let combinedResults = results;
      for (const subFilter of filter.filters) {
        combinedResults = await applyFilters(combinedResults, subFilter.filterType, subFilter.conditions);
      }
      return combinedResults;

    case 'theory_only':
      return results.filter(result => {
        const subjects = result.subjectResults;
        return subjects.every(subject => {
          return isGradeBetterOrEqual(subject.theoryGrade, filter.grade);
        });
      });
      
    case 'ce_only':
      return results.filter(result => {
        const subjects = result.subjectResults;
        return subjects.every(subject => {
          return isGradeBetterOrEqual(subject.ceGrade, filter.grade);
        });
      });
      
    case 'theory_marks':
      return results.filter(result => {
        const subject = result.subjectResults.find(s => 
          s.subjectId.toString() === filter.subjectId
        );
        if (!subject) return false;
        return subject.theoryScore >= filter.minMarks && subject.theoryScore <= filter.maxMarks;
      });
      
    case 'ce_marks':
      return results.filter(result => {
        const subject = result.subjectResults.find(s => 
          s.subjectId.toString() === filter.subjectId
        );
        if (!subject) return false;
        return subject.ceScore >= filter.minMarks && subject.ceScore <= filter.maxMarks;
      });
      
    case 'grade_difference':
      return results.filter(result => {
        const subject = result.subjectResults.find(s => 
          s.subjectId.toString() === filter.subjectId
        );
        if (!subject) return false;
        
        const theoryGradeValue = GRADE_ORDER[subject.theoryGrade] || 0;
        const overallGradeValue = GRADE_ORDER[subject.grade] || 0;
        const difference = Math.abs(theoryGradeValue - overallGradeValue);
        
        switch (filter.comparison) {
          case 'theory_better':
            return theoryGradeValue > overallGradeValue;
          case 'theory_worse':
            return theoryGradeValue < overallGradeValue;
          case 'ce_better':
            return (subject.ceGrade ? GRADE_ORDER[subject.ceGrade] : 0) > overallGradeValue;
          case 'ce_worse':
            return (subject.ceGrade ? GRADE_ORDER[subject.ceGrade] : 0) < overallGradeValue;
          case 'theory_ce_match':
            return subject.theoryGrade === subject.ceGrade;
          case 'significant_gap':
            return difference >= filter.threshold;
          default:
            return true;
        }
      });
      
    case 'subject_breakdown':
      return results.filter(result => {
        const subject = result.subjectResults.find(s => 
          s.subjectId.toString() === filter.subjectId
        );
        if (!subject) return false;
        
        const theoryOk = (!filter.theoryMin || subject.theoryScore >= filter.theoryMin) &&
                         (!filter.theoryMax || subject.theoryScore <= filter.theoryMax);
        const ceOk = (!filter.ceMin || subject.ceScore >= filter.ceMin) &&
                     (!filter.ceMax || subject.ceScore <= filter.ceMax);
        
        return theoryOk && ceOk;
      });
      
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
    case 'theory_percentage':
      sorted.sort((a, b) => order * ((a.theoryOnlyPercentage || 0) - (b.theoryOnlyPercentage || 0)));
      break;
    case 'ce_percentage':
      sorted.sort((a, b) => order * ((a.ceOnlyPercentage || 0) - (b.ceOnlyPercentage || 0)));
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
      averageTheoryPercentage: 0,
      averageCEPercentage: 0,
      gradeDistribution: {},
      theoryGradeDistribution: {},
      ceGradeDistribution: {},
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
  
  let totalTheoryPercentage = 0;
  let totalCEPercentage = 0;
  let theoryCount = 0;
  let ceCount = 0;
  
  results.forEach(result => {
    if (result.theoryOnlyPercentage) {
      totalTheoryPercentage += result.theoryOnlyPercentage;
      theoryCount++;
    }
    if (result.ceOnlyPercentage) {
      totalCEPercentage += result.ceOnlyPercentage;
      ceCount++;
    }
  });
  
  const gradeDistribution = {
    'A+': 0, 'A': 0, 'B+': 0, 'B': 0, 'C+': 0, 'C': 0, 'D': 0, 'F': 0
  };
  
  const theoryGradeDistribution = { ...gradeDistribution };
  const ceGradeDistribution = { ...gradeDistribution };
  
  results.forEach(result => {
    if (gradeDistribution[result.grade] !== undefined) {
      gradeDistribution[result.grade]++;
    }
    
    if (result.theoryGrade && theoryGradeDistribution[result.theoryGrade] !== undefined) {
      theoryGradeDistribution[result.theoryGrade]++;
    }
    
    if (result.ceGrade && ceGradeDistribution[result.ceGrade] !== undefined) {
      ceGradeDistribution[result.ceGrade]++;
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
    averageTheoryPercentage: theoryCount > 0 ? (totalTheoryPercentage / theoryCount).toFixed(2) : 0,
    averageCEPercentage: ceCount > 0 ? (totalCEPercentage / ceCount).toFixed(2) : 0,
    gradeDistribution,
    theoryGradeDistribution,
    ceGradeDistribution,
    passCount,
    failCount,
    passPercentage: passPercentage.toFixed(2)
  };
}

// ============================================================
// MAIN FILTER ENDPOINTS
// ============================================================

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
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const marksQuery = { examId };
    if (classId) marksQuery.classId = classId;
    
    const marksData = await Mark.find(marksQuery)
      .populate('studentId', 'fullName studentCode admissionNo rollNumber photoUrl');
    
    if (marksData.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: { page: 1, limit: 50, total: 0, pages: 0 },
        statistics: {
          totalStudents: 0,
          averagePercentage: 0,
          highestPercentage: 0,
          lowestPercentage: 0,
          averageTheoryPercentage: 0,
          averageCEPercentage: 0,
          gradeDistribution: {},
          theoryGradeDistribution: {},
          ceGradeDistribution: {},
          passCount: 0,
          failCount: 0,
          passPercentage: 0
        }
      });
    }
    
    const results = transformMarksToResults(marksData, exam);
    const filteredResults = await applyFilters(results, filterType, conditions);
    const sortedResults = sortResults(filteredResults, sortBy, sortOrder);
    
    const startIndex = (page - 1) * limit;
    const paginatedResults = sortedResults.slice(startIndex, startIndex + limit);
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
    console.error('Filter students error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getFilterOptions = async (req, res) => {
  try {
    const { examId } = req.params;
    
    const exam = await Exam.findById(examId).populate('subjects.subjectId', 'name code');
    
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const grades = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'];
    const gradeTypes = [
      { value: 'overall', label: 'Overall Grade (with CE)' },
      { value: 'theory', label: 'Theory Only Grade (without CE)' },
      { value: 'ce', label: 'CE Only Grade' }
    ];
    
    const subjects = exam.subjects.map(s => ({
      id: s.subjectId._id,
      name: s.subjectName,
      code: s.subjectCode,
      maxMarks: s.maxMarks,
      theoryMaxMarks: s.theoryMaxMarks || s.maxMarks,
      ceMaxMarks: s.ceMaxMarks || 0,
      hasCE: (s.ceMaxMarks || 0) > 0
    }));
    
    const ceComponents = [];
    exam.subjects.forEach(s => {
      if (s.ceComponents && s.ceComponents.length > 0) {
        s.ceComponents.forEach(comp => {
          if (!ceComponents.find(c => c.name === comp.name)) {
            ceComponents.push({
              name: comp.name,
              maxMarks: comp.maxMarks
            });
          }
        });
      }
    });
    
    res.json({
      success: true,
      data: {
        grades,
        gradeTypes,
        subjects,
        ceComponents,
        filterTypes: [
          { value: 'all_subjects_grade', label: 'All Subjects Grade' },
          { value: 'any_subject_grade', label: 'Any Subject Grade' },
          { value: 'specific_subjects_grade', label: 'Specific Subjects Grade' },
          { value: 'mixed_grades', label: 'Mixed Grades' },
          { value: 'percentage_range', label: 'Percentage Range' },
          { value: 'marks_range', label: 'Marks Range' },
          { value: 'rank_range', label: 'Rank Range' },
          { value: 'combination', label: 'Combination Filter' },
          { value: 'theory_only_grade', label: 'Theory Only Grade (without CE)' },
          { value: 'ce_only_grade', label: 'CE Only Grade' },
          { value: 'theory_marks_range', label: 'Theory Marks Range' },
          { value: 'ce_marks_range', label: 'CE Marks Range' },
          { value: 'grade_difference', label: 'Grade Difference (Theory vs Overall)' },
          { value: 'subject_wise_breakdown', label: 'Subject-wise Theory/CE Breakdown' }
        ],
        operators: [
          { value: '>=', label: 'Greater than or equal to' },
          { value: '<=', label: 'Less than or equal to' },
          { value: '==', label: 'Equal to' }
        ],
        matchOperators: [
          { value: 'AND', label: 'Match ALL conditions' },
          { value: 'OR', label: 'Match ANY condition' }
        ],
        gradeComparisons: [
          { value: 'theory_better', label: 'Theory grade is better than overall' },
          { value: 'theory_worse', label: 'Theory grade is worse than overall' },
          { value: 'ce_better', label: 'CE grade is better than overall' },
          { value: 'ce_worse', label: 'CE grade is worse than overall' },
          { value: 'theory_ce_match', label: 'Theory and CE grades match' },
          { value: 'significant_gap', label: 'Significant gap between Theory and Overall' }
        ]
      }
    });
  } catch (error) {
    console.error('Error in getFilterOptions:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.exportFilteredStudents = async (req, res) => {
  try {
    const { examId, classId, filterType, conditions, includeCE = 'true' } = req.body;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const marksQuery = { examId };
    if (classId) marksQuery.classId = classId;
    
    const marksData = await Mark.find(marksQuery)
      .populate('studentId', 'fullName studentCode admissionNo rollNumber');
    
    if (marksData.length === 0) {
      return res.status(404).json({ message: 'No marks data available' });
    }
    
    let results = transformMarksToResults(marksData, exam);
    conditions.includeCE = includeCE === 'true';
    results = await applyFilters(results, filterType, conditions);
    
    const csvRows = [];
    
    const headers = [
      'Rank', 'Student Name', 'Admission Number', 'Roll Number',
      'Total Marks', 'Max Marks', 'Percentage', 'Grade',
      'Theory Percentage', 'CE Percentage'
    ];
    
    if (results[0]?.subjectResults) {
      results[0].subjectResults.forEach(s => {
        headers.push(`${s.subjectName} (Overall)`);
        headers.push(`${s.subjectName} (Theory)`);
        headers.push(`${s.subjectName} (CE)`);
      });
    }
    
    csvRows.push(headers.join(','));
    
    results.forEach(result => {
      const row = [
        result.rank,
        `"${result.studentName}"`,
        result.admissionNo || '',
        result.rollNumber || '',
        result.totalMarks,
        result.totalMaxMarks,
        result.percentage.toFixed(2),
        result.grade,
        (result.theoryOnlyPercentage || 0).toFixed(2),
        (result.ceOnlyPercentage || 0).toFixed(2)
      ];
      
      if (result.subjectResults) {
        result.subjectResults.forEach(s => {
          row.push(s.grade);
          row.push(s.theoryGrade);
          row.push(s.ceGrade);
        });
      }
      
      csvRows.push(row.join(','));
    });
    
    const csv = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=students_${examId}_${Date.now()}.csv`);
    res.send(csv);
    
  } catch (error) {
    console.error('Error in exportFilteredStudents:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.bulkFilterStudents = async (req, res) => {
  try {
    const { examId, classId, filters, matchOperator = 'AND', page = 1, limit = 50 } = req.body;
    
    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      return res.status(400).json({ message: 'At least one filter is required' });
    }
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const marksQuery = { examId };
    if (classId) marksQuery.classId = classId;
    
    const marksData = await Mark.find(marksQuery)
      .populate('studentId', 'fullName studentCode admissionNo rollNumber photoUrl');
    
    if (marksData.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: { page: 1, limit: 50, total: 0, pages: 0 },
        statistics: {
          totalStudents: 0,
          averagePercentage: 0,
          highestPercentage: 0,
          lowestPercentage: 0,
          averageTheoryPercentage: 0,
          averageCEPercentage: 0,
          gradeDistribution: {},
          theoryGradeDistribution: {},
          ceGradeDistribution: {},
          passCount: 0,
          failCount: 0,
          passPercentage: 0
        }
      });
    }
    
    let results = transformMarksToResults(marksData, exam);
    let filteredResults = results;
    
    if (matchOperator === 'AND') {
      for (const filter of filters) {
        filteredResults = await applyFilters(filteredResults, filter.filterType, filter.conditions);
      }
    } else {
      const allFilteredSets = await Promise.all(filters.map(async filter => {
        return await applyFilters(results, filter.filterType, filter.conditions);
      }));
      
      const studentIds = new Set();
      allFilteredSets.forEach(set => {
        set.forEach(result => studentIds.add(result.studentId._id.toString()));
      });
      
      filteredResults = results.filter(result => 
        studentIds.has(result.studentId._id.toString())
      );
    }
    
    filteredResults.sort((a, b) => b.percentage - a.percentage);
    
    const startIndex = (page - 1) * limit;
    const paginatedResults = filteredResults.slice(startIndex, startIndex + limit);
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
      statistics,
      appliedFilters: filters.length
    });
  } catch (error) {
    console.error('Error in bulkFilterStudents:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// BASIC FILTERS
// ============================================================

exports.getTopPerformers = async (req, res) => {
  try {
    const { examId, classId, grade = 'A+', includeCE = 'true', limit = 20 } = req.query;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const marksQuery = { examId };
    if (classId) marksQuery.classId = classId;
    
    const marksData = await Mark.find(marksQuery)
      .populate('studentId', 'fullName studentCode admissionNo rollNumber photoUrl');
    
    if (marksData.length === 0) {
      return res.json({ success: true, data: [], total: 0 });
    }
    
    const results = transformMarksToResults(marksData, exam);
    const includeCEBool = includeCE === 'true';
    
    const filtered = results.filter(result => {
      const subjects = result.subjectResults;
      return subjects.every(subject => {
        const gradeToCheck = includeCEBool ? subject.grade : subject.theoryGrade;
        return isGradeBetterOrEqual(gradeToCheck, grade);
      });
    });
    
    filtered.sort((a, b) => b.percentage - a.percentage);
    
    res.json({
      success: true,
      data: filtered.slice(0, parseInt(limit)),
      total: filtered.length,
      includeCE: includeCEBool
    });
  } catch (error) {
    console.error('Error in getTopPerformers:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getStudentsBySubjectGrade = async (req, res) => {
  try {
    const { examId, classId, subjectId, grade, operator = '>=', gradeType = 'overall' } = req.query;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const marksQuery = { examId };
    if (classId) marksQuery.classId = classId;
    
    const marksData = await Mark.find(marksQuery)
      .populate('studentId', 'fullName studentCode admissionNo rollNumber');
    
    if (marksData.length === 0) {
      return res.json({ success: true, data: [], total: 0 });
    }
    
    const results = transformMarksToResults(marksData, exam);
    
    const filtered = results.filter(result => {
      const subject = result.subjectResults.find(s => 
        s.subjectId.toString() === subjectId
      );
      if (!subject) return false;
      
      let gradeToCheck;
      switch (gradeType) {
        case 'theory':
          gradeToCheck = subject.theoryGrade;
          break;
        case 'ce':
          gradeToCheck = subject.ceGrade;
          break;
        default:
          gradeToCheck = subject.grade;
      }
      
      if (operator === '>=') {
        return isGradeBetterOrEqual(gradeToCheck, grade);
      } else if (operator === '<=') {
        return isGradeBetterOrEqual(grade, gradeToCheck);
      } else {
        return gradeToCheck === grade;
      }
    });
    
    res.json({
      success: true,
      data: filtered,
      total: filtered.length,
      gradeType
    });
  } catch (error) {
    console.error('Error in getStudentsBySubjectGrade:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getStudentsByMixedGrades = async (req, res) => {
  try {
    const { examId, classId, conditions, matchOperator = 'AND', gradeType = 'overall' } = req.body;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const marksQuery = { examId };
    if (classId) marksQuery.classId = classId;
    
    const marksData = await Mark.find(marksQuery)
      .populate('studentId', 'fullName studentCode admissionNo rollNumber');
    
    if (marksData.length === 0) {
      return res.json({ success: true, data: [], total: 0 });
    }
    
    const results = transformMarksToResults(marksData, exam);
    
    const filtered = results.filter(result => {
      const conditionResults = conditions.map(cond => {
        const subject = result.subjectResults.find(s => 
          s.subjectId.toString() === cond.subjectId
        );
        if (!subject) return false;
        
        let gradeToCheck;
        switch (gradeType) {
          case 'theory':
            gradeToCheck = subject.theoryGrade;
            break;
          case 'ce':
            gradeToCheck = subject.ceGrade;
            break;
          default:
            gradeToCheck = subject.grade;
        }
        
        if (cond.operator === '>=') {
          return isGradeBetterOrEqual(gradeToCheck, cond.grade);
        } else if (cond.operator === '<=') {
          return isGradeBetterOrEqual(cond.grade, gradeToCheck);
        } else {
          return gradeToCheck === cond.grade;
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
      total: filtered.length,
      gradeType
    });
  } catch (error) {
    console.error('Error in getStudentsByMixedGrades:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getStudentsByRank = async (req, res) => {
  try {
    const { examId, classId, minRank, maxRank } = req.query;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const marksQuery = { examId };
    if (classId) marksQuery.classId = classId;
    
    const marksData = await Mark.find(marksQuery)
      .populate('studentId', 'fullName studentCode admissionNo rollNumber');
    
    if (marksData.length === 0) {
      return res.json({ success: true, data: [], total: 0 });
    }
    
    const results = transformMarksToResults(marksData, exam);
    
    const filtered = results.filter(r => 
      r.rank >= parseInt(minRank) && r.rank <= parseInt(maxRank)
    );
    
    res.json({
      success: true,
      data: filtered,
      total: filtered.length
    });
  } catch (error) {
    console.error('Error in getStudentsByRank:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getStudentsByPercentage = async (req, res) => {
  try {
    const { examId, classId, minPercentage, maxPercentage, includeCE = 'true' } = req.query;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const marksQuery = { examId };
    if (classId) marksQuery.classId = classId;
    
    const marksData = await Mark.find(marksQuery)
      .populate('studentId', 'fullName studentCode admissionNo rollNumber');
    
    if (marksData.length === 0) {
      return res.json({ success: true, data: [], total: 0 });
    }
    
    const results = transformMarksToResults(marksData, exam);
    const includeCEBool = includeCE === 'true';
    
    const filtered = results.filter(r => {
      const percentage = includeCEBool ? r.percentage : r.theoryOnlyPercentage;
      return percentage >= parseFloat(minPercentage) && percentage <= parseFloat(maxPercentage);
    });
    
    res.json({
      success: true,
      data: filtered,
      total: filtered.length,
      includeCE: includeCEBool
    });
  } catch (error) {
    console.error('Error in getStudentsByPercentage:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// ADVANCED ANALYSIS ENDPOINTS
// ============================================================

exports.getGradeDifferenceAnalysis = async (req, res) => {
  try {
    const { examId, classId, subjectId } = req.query;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const marksQuery = { examId };
    if (classId) marksQuery.classId = classId;
    
    const marksData = await Mark.find(marksQuery)
      .populate('studentId', 'fullName studentCode admissionNo rollNumber');
    
    if (marksData.length === 0) {
      return res.json({ success: true, data: [], summary: {} });
    }
    
    const results = transformMarksToResults(marksData, exam);
    
    const analysis = results.map(result => {
      const subject = result.subjectResults.find(s => 
        s.subjectId.toString() === subjectId
      );
      
      if (!subject) return null;
      
      const theoryGradeValue = GRADE_ORDER[subject.theoryGrade] || 0;
      const overallGradeValue = GRADE_ORDER[subject.grade] || 0;
      const difference = theoryGradeValue - overallGradeValue;
      
      return {
        studentId: result.studentId._id,
        studentName: result.studentName,
        rollNumber: result.rollNumber,
        theoryGrade: subject.theoryGrade,
        overallGrade: subject.grade,
        theoryScore: subject.theoryScore,
        ceScore: subject.ceScore,
        totalScore: subject.obtainedMarks,
        difference: difference,
        differenceType: difference > 0 ? 'Theory Better' : difference < 0 ? 'Overall Better' : 'Equal',
        impact: Math.abs(difference) >= 2 ? 'Significant' : Math.abs(difference) >= 1 ? 'Moderate' : 'Minimal'
      };
    }).filter(Boolean);
    
    analysis.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
    
    const summary = {
      totalStudents: analysis.length,
      theoryBetterCount: analysis.filter(a => a.difference > 0).length,
      overallBetterCount: analysis.filter(a => a.difference < 0).length,
      equalCount: analysis.filter(a => a.difference === 0).length,
      significantGapCount: analysis.filter(a => a.impact === 'Significant').length,
      averageDifference: analysis.length > 0 ? analysis.reduce((sum, a) => sum + a.difference, 0) / analysis.length : 0
    };
    
    res.json({
      success: true,
      data: analysis,
      summary,
      subjectId
    });
  } catch (error) {
    console.error('Error in getGradeDifferenceAnalysis:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getCEComponentAnalysis = async (req, res) => {
  try {
    const { examId, classId, subjectId, componentName } = req.query;
    
    const marksData = await Mark.find({ examId, classId, isFinalized: true })
      .populate('studentId', 'fullName studentCode admissionNo rollNumber');
    
    const analysis = [];
    
    for (const mark of marksData) {
      const subjectMark = mark.subjects.find(s => 
        s.subjectId.toString() === subjectId
      );
      
      if (!subjectMark || !subjectMark.ceComponents) continue;
      
      const component = subjectMark.ceComponents.find(c => c.name === componentName);
      if (!component) continue;
      
      analysis.push({
        studentId: mark.studentId._id,
        studentName: mark.studentName,
        rollNumber: mark.studentId?.rollNumber,
        componentScore: component.score,
        maxMarks: component.maxMarks,
        percentage: (component.score / component.maxMarks) * 100,
        status: component.score >= component.maxMarks * 0.8 ? 'Excellent' :
                component.score >= component.maxMarks * 0.6 ? 'Good' :
                component.score >= component.maxMarks * 0.4 ? 'Average' : 'Needs Improvement'
      });
    }
    
    analysis.sort((a, b) => b.percentage - a.percentage);
    
    const summary = {
      totalStudents: analysis.length,
      averageScore: analysis.length > 0 ? analysis.reduce((sum, a) => sum + a.componentScore, 0) / analysis.length : 0,
      excellentCount: analysis.filter(a => a.status === 'Excellent').length,
      goodCount: analysis.filter(a => a.status === 'Good').length,
      averageCount: analysis.filter(a => a.status === 'Average').length,
      needsImprovementCount: analysis.filter(a => a.status === 'Needs Improvement').length
    };
    
    res.json({
      success: true,
      data: analysis,
      summary,
      subjectId,
      componentName
    });
  } catch (error) {
    console.error('Error in getCEComponentAnalysis:', error);
    res.status(500).json({ message: error.message });
  }
};

// Add to studentFilterController.js
exports.createSampleMarks = async (req, res) => {
  try {
    const { examId, classId } = req.body;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const students = await Student.find({ classId, status: 'active' });
    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found in class' });
    }
    
    const results = [];
    
    for (const student of students) {
      // Check if marks already exist
      let marksheet = await Mark.findOne({ studentId: student._id, examId, classId });
      
      if (!marksheet) {
        // Create subjects array based on exam subjects
        const subjects = exam.subjects.map(subject => ({
          subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          subjectCode: subject.subjectCode,
          maxMarks: (subject.maxMarks || 0) + (subject.ceMaxMarks || 0),
          termMaxMarks: subject.maxMarks || 100,
          ceMaxMarks: subject.ceMaxMarks || 0,
          ceEnabled: subject.ceEnabled || false,
          passingMarks: subject.passingMarks || 40,
          theoryScore: Math.floor(Math.random() * (subject.maxMarks || 80)) + 20,
          practicalScore: subject.practicalMaxMarks ? Math.floor(Math.random() * subject.practicalMaxMarks) : 0,
          ceScore: subject.ceMaxMarks ? Math.floor(Math.random() * subject.ceMaxMarks) : 0,
          totalScore: 0,
          percentage: 0,
          grade: 'F',
          remarks: '',
          isAbsent: false
        }));
        
        marksheet = new Mark({
          studentId: student._id,
          studentName: student.fullName,
          studentCode: student.studentCode,
          rollNumber: student.rollNumber,
          admissionNo: student.admissionNo,
          examId,
          examName: exam.displayName || exam.name,
          examType: exam.examType,
          term: exam.term,
          classId,
          className: student.className,
          academicYearId: exam.academicYearId,
          academicYear: exam.academicYear,
          subjects,
          status: 'draft'
        });
        
        await marksheet.save();
        results.push({ studentName: student.fullName, status: 'created' });
      } else {
        results.push({ studentName: student.fullName, status: 'already exists' });
      }
    }
    
    res.json({
      success: true,
      message: `Processed ${results.length} students`,
      results
    });
  } catch (error) {
    console.error('Error creating sample marks:', error);
    res.status(500).json({ message: error.message });
  }
};

// Add this debug endpoint to studentFilterController.js
exports.debugTransform = async (req, res) => {
  try {
    const { examId, classId } = req.query;
    
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    
    const marksData = await Mark.find({ examId, classId })
      .populate('studentId', 'fullName studentCode');
    
    if (marksData.length === 0) {
      return res.json({ message: 'No marks found', marksCount: 0 });
    }
    
    // Log exam subjects
    const examSubjects = exam.subjects.map(s => ({
      id: s.subjectId.toString(),
      name: s.subjectName,
      maxMarks: s.maxMarks,
      ceMaxMarks: s.ceMaxMarks
    }));
    
    // Log first student's marks subjects
    const firstMark = marksData[0];
    const markSubjects = firstMark.subjects.map(s => ({
      id: s.subjectId.toString(),
      theoryScore: s.theoryScore,
      practicalScore: s.practicalScore,
      ceScore: s.ceScore
    }));
    
    // Transform and check results
    const transformed = transformMarksToResults(marksData, exam);
    
    res.json({
      examSubjects,
      markSubjects,
      transformedCount: transformed.length,
      firstTransformed: transformed[0] ? {
        studentName: transformed[0].studentName,
        totalMarks: transformed[0].totalMarks,
        totalMaxMarks: transformed[0].totalMaxMarks,
        percentage: transformed[0].percentage,
        subjectResultsCount: transformed[0].subjectResults?.length
      } : null,
      rawMarksCount: marksData.length
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
};