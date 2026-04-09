const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, idParam, paginationQuery, markValidation } = require('../middleware/validation');
const {
  getMarks,
  enterMarks,
  updateMarks,
  getExamRankings,
  filterStudentsByMarks
} = require('../controllers/markController');

router.use(protect);

router.get('/', validate(paginationQuery), getMarks);
router.post('/', authorize('staff', 'admin'), enterMarks);
router.post('/filter', authorize('staff', 'admin'), filterStudentsByMarks);
router.get('/exam/:examId/rankings', validate([idParam]), getExamRankings);
router.put('/:id', authorize('staff', 'admin'), validate([idParam]), updateMarks);

module.exports = router;