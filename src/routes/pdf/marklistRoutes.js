// routes/marklistRoutes.js
const express = require('express');
const router = express.Router();
const marklistController = require('../../controllers/pdf/marklistController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// View/Print PDF
router.get('/view/:studentId/:examId?', marklistController.generateMarklistPDF);

// Download PDF
router.get('/download/:studentId/:examId?', marklistController.downloadMarklistPDF);

module.exports = router;