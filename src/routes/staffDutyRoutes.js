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

// ==================== STAFF ACCESSIBLE ROUTES ====================
// Staff can view their own duties
router.get('/', getDuties);
router.get('/:id', getDutyById);
router.get('/count/:staffId', getStaffDutyCount);
router.get('/stats', getStaffDutyStats);
router.get('/summary', getStaffDutySummary);
router.get('/available-dates', getAvailableDates);
router.put('/:id', updateDuty);

// ==================== ADMIN ONLY ROUTES ====================
// These routes require admin privileges
router.use(authorize('admin'));

// Bulk operations
router.delete('/bulk', bulkDeleteDuties);

// Assignment routes (only admin can assign duties)
router.post('/auto-assign', autoAssignDuties);
router.post('/multi-type-assign', multiTypeAssign);
router.post('/manual', assignManualDuty);

// Update and delete (admin only)
router.delete('/:id', deleteDuty);

module.exports = router;