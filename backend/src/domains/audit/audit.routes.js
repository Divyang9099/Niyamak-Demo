const express      = require('express');
const router       = express.Router();
const controller   = require('./audit.controller');
const authenticate = require('../../core/middleware/auth.middleware');
const authorize    = require('../../core/middleware/role.middleware');

// Admin-only — all logs are immutable and append-only
router.use(authenticate);
router.use(authorize('admin'));

// GET /api/v1/audit?entity_type=project&entity_id=uuid&limit=50
router.get('/', controller.getLogs);

module.exports = router;
