const router = require('express').Router();
const ctrl   = require('./report.controller');
const authenticate     = require('../../core/middleware/auth.middleware');
const authorize        = require('../../core/middleware/role.middleware');

// All report routes are admin-only
router.use(authenticate, authorize('admin'));

router.get('/weekly-settings',  ctrl.getSettings);
router.put('/weekly-settings',  ctrl.updateSettings);
router.post('/weekly-send-test', ctrl.sendTest);
router.get('/weekly-preview',   ctrl.previewHtml);
router.get('/weekly-preview-data', ctrl.previewData);

module.exports = router;
