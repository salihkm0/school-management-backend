// routes/promotionListRoutes.js
const express = require('express');
const router = express.Router();
const promotionListController = require('../../controllers/pdf/promotionListController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// View/Print PDF
router.get('/view/:classId?/:examId?', promotionListController.generatePromotionListPDF);

// Download PDF
router.get('/download/:classId?/:examId?', promotionListController.downloadPromotionListPDF);

module.exports = router;