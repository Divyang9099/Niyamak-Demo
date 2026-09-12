const router = require('express').Router();
const userCtrl = require('./user.controller');
const authenticate = require('../../core/middleware/auth.middleware');
const authorize    = require('../../core/middleware/role.middleware');
const upload       = require('../../core/middleware/upload.middleware');
const { error }    = require('../../core/utils/response');

// All user routes require authentication
router.use(authenticate);

// Allow the account owner OR an admin. Used for profile-picture mutations so a
// pilot/PM can set their own picture and an admin can set it for a new member.
const selfOrAdmin = (req, res, next) => {
  if (req.user.role === 'admin' || req.user.id === req.params.id) return next();
  return res.status(403).json(error("Not authorized to change this user's profile picture", 403));
};

// ── Profile picture (avatar) ────────────────────────────────────────────────
// VIEW: any authenticated user (rendered in <img> tags across the app).
// CHANGE/REMOVE: the owner or an admin only.
router.get   ('/:id/avatar', userCtrl.getAvatar);
router.post  ('/:id/avatar', selfOrAdmin, upload.uploadTiny.single('avatar'), userCtrl.uploadAvatar);
router.delete('/:id/avatar', selfOrAdmin, userCtrl.removeAvatar);

// Admin-only routes
router.get('/',       authorize('admin'), userCtrl.getAll);
router.get('/:id',    authorize('admin', 'project_manager'), userCtrl.getById);
router.put('/:id',    authorize('admin'), userCtrl.update);
router.delete('/:id', authorize('admin'), userCtrl.remove);

module.exports = router;
