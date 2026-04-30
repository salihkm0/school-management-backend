// routes/noonMealRoutes.js
const express = require('express');
const router = express.Router();
const noonMealController = require('../../controllers/pdf/noonMealController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// Get classes for dropdown
router.get('/classes', noonMealController.getClassesForNoonMeal);

// Get noon meal list (JSON)
router.get('/list/:classId', noonMealController.getNoonMealList);

// Generate PDF for noon meal
router.get('/pdf/:classId/:month?/:year?/:workingDays?', noonMealController.generateNoonMealPDF);

module.exports = router;