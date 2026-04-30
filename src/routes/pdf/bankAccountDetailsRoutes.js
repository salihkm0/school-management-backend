// routes/bankAccountDetailsRoutes.js
const express = require('express');
const router = express.Router();
const bankAccountDetailsController = require('../../controllers/pdf/bankAccountDetailsController');
const { protect } = require('../../middleware/auth');

router.use(protect);

// View/Print PDF - with query params for category
// Example: /api/bank-account-details/view/CLASS_ID?category=SC
// Example: /api/bank-account-details/view?category=ST (all classes)
// Example: /api/bank-account-details/view (all students)
router.get('/view/:classId?', bankAccountDetailsController.generateBankAccountDetailsPDF);

// Download PDF - with query params for category
router.get('/download/:classId?', bankAccountDetailsController.downloadBankAccountDetailsPDF);

module.exports = router;