const express    = require('express');
const router     = express.Router();
const controller = require('./archive.controller');
const authenticate = require('../../core/middleware/auth.middleware');
const authorize    = require('../../core/middleware/role.middleware');

router.use(authenticate);

// GET /api/v1/archive?type=all|library_document|project&search=&page=1&limit=50
// Admin-only: the service returns org-wide archived projects, library docs, and
// cancelled/converted pipeline (incl. deal values & client names) with no per-user
// scoping — restore/permanentDelete below are already admin-gated, so this matches.
router.get('/', authorize('admin'), controller.getArchived);

// POST /api/v1/archive/:entityType/:entityId/restore
router.post('/:entityType/:entityId/restore', authorize('admin'), controller.restore);

// DELETE /api/v1/archive/:entityType/:entityId  (permanent delete — admin only)
router.delete('/:entityType/:entityId', authorize('admin'), controller.permanentDelete);

module.exports = router;
