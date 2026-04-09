const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, idParam, paginationQuery, examValidation } = require('../middleware/validation');
const {
  getExams,
  getExam,
  createExam,
  updateExam,
  deleteExam,
  publishExam,
  getExamAnalytics
} = require('../controllers/examController');

router.use(protect);

router.get('/', validate(paginationQuery), getExams);
router.get('/:id', validate([idParam]), getExam);
router.get('/:id/analytics', validate([idParam]), getExamAnalytics);
router.post('/', authorize('admin'), validate(examValidation), createExam);
router.put('/:id', authorize('admin'), validate([idParam]), updateExam);
router.delete('/:id', authorize('admin'), validate([idParam]), deleteExam);
router.post('/:id/publish', authorize('admin'), validate([idParam]), publishExam);

module.exports = router;