/**
 * Sorts an array of students based on the class's sort preference.
 * @param {Array} students - Array of student documents (or objects)
 * @param {String} sortPreference - 'alphabetic' or 'roll_number' (default: 'alphabetic')
 * @returns {Array} Sorted array of students
 */
exports.sortStudents = (students, sortPreference = 'alphabetic') => {
  return [...students].sort((a, b) => {
    // Helper to safely parse roll numbers
    const getRoll = (student) => {
      if (!student.rollNumber) return null;
      const num = parseInt(student.rollNumber, 10);
      return isNaN(num) ? student.rollNumber : num; // fallback to string if not purely numeric
    };

    const rollA = getRoll(a);
    const rollB = getRoll(b);

    const hasRollA = rollA !== null && rollA !== '';
    const hasRollB = rollB !== null && rollB !== '';

    if (sortPreference === 'roll_number') {
      if (hasRollA && hasRollB) {
        if (typeof rollA === 'number' && typeof rollB === 'number') {
          if (rollA !== rollB) return rollA - rollB;
        } else {
          const strA = String(rollA);
          const strB = String(rollB);
          if (strA !== strB) return strA.localeCompare(strB, undefined, { numeric: true });
        }
      } else if (hasRollA && !hasRollB) {
        return -1; // A comes first
      } else if (!hasRollA && hasRollB) {
        return 1; // B comes first
      }
    }

    // Fallback or if sortPreference === 'alphabetic'
    
    // Gender sort (Girls first)
    const getGenderScore = (gender) => {
      const g = (gender || '').toLowerCase();
      if (g === 'f' || g === 'female' || g === 'girl') return 1;
      if (g === 'm' || g === 'male' || g === 'boy') return 2;
      return 3;
    };

    const genderA = getGenderScore(a.gender);
    const genderB = getGenderScore(b.gender);

    if (genderA !== genderB) {
      return genderA - genderB;
    }

    // Alphabetical sort
    const nameA = a.fullName || a.studentName || '';
    const nameB = b.fullName || b.studentName || '';
    return nameA.localeCompare(nameB);
  });
};
