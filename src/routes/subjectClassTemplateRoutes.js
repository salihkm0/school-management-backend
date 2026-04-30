// routes/subjectClassTemplateRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { validate, idParam, paginationQuery } = require('../middleware/validation');
const {
  getTemplates,
  getTemplate,
  getTemplateByClassName,
  createTemplate,
  updateTemplate,
  upsertTemplateByClassName,
  deleteTemplate,
  applyTemplateToClasses,
  getClassNames
} = require('../controllers/subjectClassTemplateController');

router.use(protect);

router.get('/', validate(paginationQuery), getTemplates);
router.get('/class-names', getClassNames);
router.get('/class/:className', getTemplateByClassName);
router.get('/:id', validate([idParam]), getTemplate);

router.post('/', authorize('admin'), createTemplate);
router.put('/:id', authorize('admin'), validate([idParam]), updateTemplate);
router.put('/class/:className', authorize('admin'), upsertTemplateByClassName);
router.delete('/:id', authorize('admin'), validate([idParam]), deleteTemplate);

router.post('/:id/apply', authorize('admin'), validate([idParam]), applyTemplateToClasses);

module.exports = router;