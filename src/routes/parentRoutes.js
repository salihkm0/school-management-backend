// routes/parentRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, idParam, paginationQuery, parentRegisterValidation } = require('../middleware/validation');
const {
  registerParent,
  connectStudent,
  getParentProfile,
  getParents,
  getMyChildren,
  removeStudentConnection,
  getParentStudents,
  getParentByUserId,
  getMyParentProfile
} = require('../controllers/parentController');

// Public route - Parent registration (no authentication required)
router.post('/register', validate(parentRegisterValidation), registerParent);

// Protected routes
router.use(protect);

// Parent self-service routes
router.get('/me', getMyParentProfile);
router.get('/my-children', authorize('parent'), getMyChildren);
router.post('/connect-student/:id', authorize('parent'), connectStudent);
router.delete('/student/:studentCode', authorize('parent'), removeStudentConnection);
router.get('/me', getParentByUserId);

// Admin routes
router.get('/', authorize('admin'), validate(paginationQuery), getParents);
router.get('/:id', authorize('admin'), validate([idParam]), getParentProfile);
router.get('/:parentId/students', authorize('admin'), getParentStudents);

module.exports = router;