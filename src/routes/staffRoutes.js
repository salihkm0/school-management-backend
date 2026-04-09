const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, idParam, paginationQuery, staffValidation } = require('../middleware/validation');
const {
  getStaff,
  getStaffMember,
  createStaff,
  updateStaff,
  deleteStaff,
  assignSubjects,
  getStaffByClass,
  getStaffSchedule
} = require('../controllers/staffController');

router.use(protect);
router.use(authorize('admin'));

router.get('/', validate(paginationQuery), getStaff);
router.post('/', validate(staffValidation), createStaff);
router.post('/:id/assign-subjects', validate([idParam]), assignSubjects);
router.get('/class/:classId', validate([idParam]), getStaffByClass);
router.get('/:id/schedule', validate([idParam]), getStaffSchedule);
router.get('/:id', validate([idParam]), getStaffMember);
router.put('/:id', validate([idParam]), updateStaff);
router.delete('/:id', validate([idParam]), deleteStaff);

module.exports = router;