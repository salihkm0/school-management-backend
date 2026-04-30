// routes/abstractRoutes.js
const express = require('express');
const router = express.Router();
const abstractController = require('../../controllers/pdf/abstractController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// View/Print PDF
router.get('/view/:studentId?', abstractController.generateAbstractPDF);

// Download PDF
router.get('/download/:studentId?', abstractController.downloadAbstractPDF);

module.exports = router;