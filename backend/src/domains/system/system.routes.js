const router      = require('express').Router();
const rateLimit   = require('express-rate-limit');
const ctrl        = require('./system.controller');
const ptCtrl      = require('./projectType.controller');
const rcCtrl      = require('../estimation/estimation.controller');
const saCtrl      = require('./superadmin.controller');
const authenticate = require('../../core/middleware/auth.middleware');
const authorize   = require('../../core/middleware/role.middleware');
const upload      = require('../../core/middleware/upload.middleware');
const env         = require('../../core/config/env');

// Public: no auth required
router.get('/config/logo', ctrl.getLogo);

// Super Admin — secret-hash gated, no JWT required (standalone dev console).
// Rate-limited so the single shared secret can't be brute-forced over the network.
const superAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: () => env.nodeEnv === 'development',
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, statusCode: 429, message: 'Too many attempts. Please try again later.' },
});
router.post('/super-admin/metrics', superAdminLimiter, saCtrl.getMetrics);

router.use(authenticate);

router.get('/config',  ctrl.getConfig);
router.put('/config',  authorize('admin'), ctrl.updateConfig);
router.post('/config/logo', authorize('admin'), upload.single('logo'), ctrl.uploadLogo);

// Project Type configuration (PRD §10.4) — all roles can read for dropdowns; admin only mutates
router.get   ('/project-types',     ptCtrl.list);
router.post  ('/project-types',     authorize('admin'), ptCtrl.create);
router.put   ('/project-types/:id', authorize('admin'), ptCtrl.update);
router.delete('/project-types/:id', authorize('admin'), ptCtrl.remove);

// Rate Card management (admin Settings page calls /system/rate-cards/*)
// The service lives in the estimation domain; routes are aliased here.
router.get   ('/rate-cards/list', authorize('admin'), rcCtrl.listRateCards);
router.post  ('/rate-cards',      authorize('admin'), rcCtrl.createRateCard);
router.put   ('/rate-cards/:id',  authorize('admin'), rcCtrl.updateRateCard);
router.delete('/rate-cards/:id',  authorize('admin'), rcCtrl.deleteRateCard);

module.exports = router;
