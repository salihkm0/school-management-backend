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
  getMyParentProfile,
  updateParent,
  deleteParent
} = require('../controllers/parentController');

// Public route - Parent registration (no authentication required)
router.post('/register', validate(parentRegisterValidation), registerParent);

// Protected routes
router.use(protect);

// Parent self-service routes
router.get('/me', getMyParentProfile);
// Parent & Admin student connection routes
router.get('/my-children', authorize('parent'), getMyChildren);
router.post('/connect-student/:id', authorize('parent', 'admin'), connectStudent);
router.delete('/student/:studentCode', authorize('parent', 'admin'), removeStudentConnection);
router.get('/me', getParentByUserId);

// Admin routes
router.get('/', authorize('admin'), validate(paginationQuery), getParents);
router.get('/:id', authorize('admin'), validate([idParam]), getParentProfile);
router.put('/:id', authorize('admin'), validate([idParam]), updateParent);
router.delete('/:id', authorize('admin'), validate([idParam]), deleteParent);
router.get('/:parentId/students', authorize('admin'), getParentStudents);
router.post('/:parentId/connect-student', authorize('admin'), connectStudent);
router.delete('/:parentId/student/:studentCode', authorize('admin'), removeStudentConnection);
router.put('/:parentId/student/:studentCode/relation', authorize('admin'), updateParent);

module.exports = router;