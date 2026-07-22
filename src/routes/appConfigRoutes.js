// src/routes/appConfigRoutes.js
const express = require('express');
const router = express.Router();
const { getAppVersion, updateAppVersion, getAppUpdateHistory } = require('../controllers/appConfigController');
const { protect, authorize } = require('../middleware/auth');

// Public — no auth needed (called before login)
router.get('/version', getAppVersion);

// Admin only — update version config at runtime
router.put('/version', protect, authorize('admin'), updateAppVersion);
router.get('/history', protect, authorize('admin'), getAppUpdateHistory);

module.exports = router;
