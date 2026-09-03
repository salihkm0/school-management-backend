// src/routes/appConfigRoutes.js
const express = require('express');
const router = express.Router();
const { getAppVersion, updateAppVersion, getAppUpdateHistory, getSchoolContacts, updateSchoolContacts } = require('../controllers/appConfigController');
const { protect, authorize } = require('../middleware/auth');

// Public / Authenticated — version check and key contacts
router.get('/version', getAppVersion);
router.get('/school-contacts', getSchoolContacts);

// Admin only — update version config & school contacts at runtime
router.put('/version', protect, authorize('admin'), updateAppVersion);
router.get('/history', protect, authorize('admin'), getAppUpdateHistory);
router.put('/school-contacts', protect, authorize('admin'), updateSchoolContacts);

module.exports = router;
