/**
 * Sorts an array of students based on roll number numerically (1, 2, 3... 10, 11...).
 * @param {Array} students - Array of student documents (or objects)
 * @param {String} sortPreference - 'roll_number' or 'alphabetic' (default: 'roll_number')
 * @returns {Array} Sorted array of students
 */
exports.sortStudents = (students = [], sortPreference = 'roll_number') => {
  if (!Array.isArray(students)) return [];
  return [...students].sort((a, b) => {
    // Helper to safely parse roll numbers from any student property format
    const getRoll = (student) => {
      if (!student) return null;
      const raw = student.rollNumber ?? student.rollNo ?? student.slNo ?? student.studentId?.rollNumber ?? student.studentId?.slNo;
      if (raw === null || raw === undefined || raw === '') return null;
      const parsed = parseInt(String(raw).trim(), 10);
      return isNaN(parsed) ? String(raw).trim() : parsed;
    };

    const rollA = getRoll(a);
    const rollB = getRoll(b);

    const hasRollA = rollA !== null && rollA !== '';
    const hasRollB = rollB !== null && rollB !== '';

    // Always sort by roll number first if available
    if (hasRollA || hasRollB) {
      if (hasRollA && hasRollB) {
        if (typeof rollA === 'number' && typeof rollB === 'number') {
          if (rollA !== rollB) return rollA - rollB;
        } else {
          const strA = String(rollA);
          const strB = String(rollB);
          const comp = strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
          if (comp !== 0) return comp;
        }
      } else if (hasRollA && !hasRollB) {
        return -1; // A comes first
      } else if (!hasRollA && hasRollB) {
        return 1; // B comes first
      }
    }

    // Fallback if roll numbers are identical or missing (Gender then Alphabetical)
    const getGenderScore = (gender) => {
      const g = (gender || '').toLowerCase();
      if (g === 'f' || g === 'female' || g === 'girl') return 1;
      if (g === 'm' || g === 'male' || g === 'boy') return 2;
      return 3;
    };

    const genderA = getGenderScore(a.gender || a.studentId?.gender);
    const genderB = getGenderScore(b.gender || b.studentId?.gender);

    if (genderA !== genderB) {
      return genderA - genderB;
    }

    // Alphabetical sort fallback
    const nameA = a.fullName || a.studentName || a.name || a.studentId?.fullName || '';
    const nameB = b.fullName || b.studentName || b.name || b.studentId?.fullName || '';
    return nameA.localeCompare(nameB);
  });
};
