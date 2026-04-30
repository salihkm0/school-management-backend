// routes/noonFeedingRegisterRoutes.js
const express = require('express');
const router = express.Router();
const noonFeedingRegisterController = require('../../controllers/pdf/noonFeedingRegisterController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// Generate PDF for noon feeding register
router.get('/pdf/:classId/:month?/:year?', noonFeedingRegisterController.generateNoonFeedingRegisterPDF);

module.exports = router;