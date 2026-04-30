// routes/staffListRoutes.js
const express = require('express');
const router = express.Router();
const staffListController = require('../../controllers/pdf/staffListController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// Get staff list (JSON)
router.get('/data/:status?', staffListController.getStaffListData);

// View/Print PDF
router.get('/view/:status?', staffListController.generateStaffListPDF);

// Download PDF
router.get('/download/:status?', staffListController.downloadStaffListPDF);

module.exports = router;