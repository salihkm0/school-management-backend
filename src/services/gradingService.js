/**
 * Grading Service
 * 
 * Provides a flexible percentage-based grading system that scales dynamically
 * for any maximum marks.
 */

const GRADING_SCALE = [
  { grade: "A+", minPercentage: 90 },
  { grade: "A",  minPercentage: 80 },
  { grade: "B+", minPercentage: 70 },
  { grade: "B",  minPercentage: 60 },
  { grade: "C+", minPercentage: 50 },
  { grade: "C",  minPercentage: 40 },
  { grade: "D+", minPercentage: 30 },
  { grade: "D",  minPercentage: 20 },
  { grade: "E",  minPercentage: 0 }
];

/**
 * Get the grade based directly on a calculated percentage.
 * @param {number} percentage 
 * @returns {string} Grade (e.g. 'A+', 'B')
 */
function calculateGradeFromPercentage(percentage) {
  if (percentage === null || percentage === undefined || isNaN(percentage)) {
    return "-"; // or null
  }
  
  // Find the first matching grade (since array is ordered descending)
  for (const scale of GRADING_SCALE) {
    if (percentage >= scale.minPercentage) {
      return scale.grade;
    }
  }
  
  return "E"; // Fallback for 0 or negative
}

/**
 * Get the grade based on obtained marks and maximum marks.
 * @param {number} obtainedMarks 
 * @param {number} maximumMarks 
 * @returns {string} Grade (e.g. 'A+', 'B')
 */
function calculateGrade(obtainedMarks, maximumMarks) {
  if (
    obtainedMarks === null || 
    obtainedMarks === undefined || 
    isNaN(obtainedMarks) ||
    maximumMarks === null ||
    maximumMarks === undefined ||
    isNaN(maximumMarks) ||
    maximumMarks <= 0
  ) {
    return "-";
  }

  const percentage = (Number(obtainedMarks) / Number(maximumMarks)) * 100;
  return calculateGradeFromPercentage(percentage);
}

/**
 * Optional utility: Get exact mark ranges for a given maximum mark.
 * Useful for displaying the grading scale rubric on reports.
 * Example for max=50: A+ (45-50), A (40-44)
 * @param {number} maximumMarks 
 * @returns {Array} Array of objects with { grade, minMark, maxMark }
 */
function getMarkRangesForMax(maximumMarks) {
  if (!maximumMarks || maximumMarks <= 0) return [];

  const ranges = [];
  
  for (let i = 0; i < GRADING_SCALE.length; i++) {
    const scale = GRADING_SCALE[i];
    
    // Calculate the mathematical minimum mark for this grade's minPercentage
    const calculatedMin = (scale.minPercentage / 100) * maximumMarks;
    
    // Round logically based on typical grading logic:
    // We assume marks are integers. The minimum mark is rounded up if necessary.
    let minMark = Math.ceil(calculatedMin);
    
    // The maximum mark is 1 less than the next grade's min mark,
    // or the absolute maximum marks if it's the highest grade (A+)
    let maxMark;
    if (i === 0) {
      maxMark = maximumMarks;
    } else {
      maxMark = ranges[i - 1].minMark - 1;
    }
    
    // In edge cases (e.g., small maxMarks), multiple grades might mathematically
    // collapse into non-existent ranges (min > max). Handle that gracefully.
    if (minMark > maxMark) {
       // Range doesn't exist for this max mark resolution
       // e.g. if max marks = 5, we can't cleanly have 9 distinct integer ranges
       minMark = maxMark + 1; // This marks it as invalid
    }

    ranges.push({
      grade: scale.grade,
      minMark: minMark,
      maxMark: maxMark,
      minPercentage: scale.minPercentage
    });
  }

  // Filter out any collapsed/invalid ranges
  return ranges.filter(r => r.minMark <= r.maxMark);
}

module.exports = {
  GRADING_SCALE,
  calculateGrade,
  calculateGradeFromPercentage,
  getMarkRangesForMax
};
