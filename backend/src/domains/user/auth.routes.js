const router = require('express').Router();
const authCtrl = require('./auth.controller');
const { validateRegister, validateLogin } = require('./auth.validation');
const authenticate = require('../../core/middleware/auth.middleware');
const passwordService = require('./password.service');
const { success } = require('../../core/utils/response');
const authorize = require('../../core/middleware/role.middleware');

// Rate limiter is applied globally in app.js on /api/v1/auth
// Admin-only registration
router.post('/register', authenticate, authorize('admin'), validateRegister, authCtrl.register);

// Public route
router.post('/login', validateLogin, authCtrl.login);
router.post('/logout', authenticate, authCtrl.logout);

// Password reset (public — no auth required, token-gated)
router.post('/forgot-password', async (req, res, next) => {
  try {
    const data = await passwordService.forgotPassword(req.body.email);
    res.json(success(null, data.message));
  } catch (err) { next(err); }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, token, new_password } = req.body;
    const data = await passwordService.resetPassword(email, token, new_password);
    res.json(success(null, data.message));
  } catch (err) { next(err); }
});

// Protected routes
router.get  ('/profile', authenticate, authCtrl.getProfile);
router.patch('/theme',   authenticate, authCtrl.updateTheme);

// Authenticated password change (requires current password)
router.put('/change-password', authenticate, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    const data = await passwordService.changePassword(req.user.id, current_password, new_password);
    res.json(success(null, data.message));
  } catch (err) { next(err); }
});

// ─── 2FA (PRD §9.3) — all require authenticated user ─────────────────────
router.get ('/2fa/status',  authenticate, authCtrl.twoFactorStatus);
router.post('/2fa/setup',   authenticate, authCtrl.twoFactorSetup);
router.post('/2fa/enable',  authenticate, authCtrl.twoFactorEnable);
router.post('/2fa/disable', authenticate, authCtrl.twoFactorDisable);

module.exports = router;

