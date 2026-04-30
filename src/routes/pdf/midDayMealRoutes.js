// routes/midDayMealRoutes.js
const express = require('express');
const router = express.Router();
const midDayMealController = require('../../controllers/pdf/midDayMealController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// Get mid day meal list (JSON)
router.get('/list/:classId/:academicYearId?', midDayMealController.getMidDayMealList);

// Generate PDF for mid day meal
router.get('/pdf/:classId/:academicYearId?', midDayMealController.generateMidDayMealPDF);

module.exports = router;