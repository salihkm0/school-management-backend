// routes/idCardRoutes.js
const express = require('express');
const router = express.Router();
const idCardController = require('../../controllers/pdf/idCardController');
const { protect, authorize } = require('../../middleware/auth');

// All routes require authentication
router.use(protect);

// Get classes for dropdown
router.get('/classes', idCardController.getClassesForIdCard);

// Get ID card list (JSON)
router.get('/list/:classId/:academicYearId?', idCardController.getIdCardListByClass);

// Generate PDF for ID card list
router.get('/pdf/:classId/:academicYearId?', idCardController.generateIdCardListPDF);

module.exports = router;