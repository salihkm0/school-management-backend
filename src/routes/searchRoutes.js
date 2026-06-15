const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const searchController = require('../controllers/searchController');

// All search routes are protected
router.use(protect);

router.get('/', searchController.globalSearch);

module.exports = router;
