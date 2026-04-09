// src/routes/staffDutyRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getDuties,
  getDutyById,
  autoAssignDuties,
  multiTypeAssign,
  assignManualDuty,
  updateDuty,
  deleteDuty,
  getStaffDutyStats,
  getStaffDutyCount,
  getAvailableDates,
  bulkDeleteDuties,
  getStaffDutySummary
} = require('../controllers/staffDutyController');

router.use(protect);
router.use(authorize('admin'));

// Stats and utility routes
router.get('/stats', getStaffDutyStats);
router.get('/available-dates', getAvailableDates);
router.get('/summary', getStaffDutySummary);
router.get('/count/:staffId', getStaffDutyCount);

// Bulk operations
router.delete('/bulk', bulkDeleteDuties);

// Assignment routes
router.post('/auto-assign', autoAssignDuties);
router.post('/multi-type-assign', multiTypeAssign);
router.post('/manual', assignManualDuty);

// CRUD operations
router.get('/', getDuties);
router.get('/:id', getDutyById);
router.put('/:id', updateDuty);
router.delete('/:id', deleteDuty);

module.exports = router;