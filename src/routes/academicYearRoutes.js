// routes/academicYearRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, idParam, paginationQuery } = require('../middleware/validation');
const {
  getAcademicYears,
  getAcademicYear,
  getCurrentAcademicYear,
  createAcademicYear,
  updateAcademicYear,
  setCurrentAcademicYear,
  deleteAcademicYear
} = require('../controllers/academicYearController');

router.use(protect);

router.get('/', validate(paginationQuery), getAcademicYears);
router.get('/current', getCurrentAcademicYear);
router.get('/:id', validate([idParam]), getAcademicYear);
router.post('/', authorize('admin'), createAcademicYear);
router.put('/:id', authorize('admin'), validate([idParam]), updateAcademicYear);
router.patch('/:id/current', authorize('admin'), validate([idParam]), setCurrentAcademicYear);
router.delete('/:id', authorize('admin'), validate([idParam]), deleteAcademicYear);

module.exports = router;