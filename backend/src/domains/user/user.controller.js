const userService = require('./user.service');
const { success, error } = require('../../core/utils/response');

const getAll = async (_req, res, next) => {
  try {
    const users = await userService.getAllUsers();
    res.json(success(users));
  } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    res.json(success(user));
  } catch (err) { next(err); }
};

const update = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    res.json(success(user, 'User updated'));
  } catch (err) { next(err); }
};

const remove = async (req, res, next) => {
  try {
    await userService.deleteUser(req.params.id, req.user.id); // ← pass req.user.id
    res.json(success(null, 'User deleted'));
  } catch (err) { next(err); }
};

// ── Profile picture (avatar) ────────────────────────────────────────────────
const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) throw Object.assign(new Error('No image provided'), { statusCode: 400 });
    if (!/^image\//.test(req.file.mimetype || '')) {
      throw Object.assign(new Error('Profile picture must be an image (JPG, PNG, WEBP)'), { statusCode: 400 });
    }
    const key = await userService.setAvatar(req.params.id, req.file);
    res.json(success({ avatar_url: key }, 'Profile picture updated'));
  } catch (err) { next(err); }
};

const getAvatar = async (req, res, next) => {
  try {
    const { stream, contentType } = await userService.getAvatarStream(req.params.id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Any user can set their own avatar; an uploaded SVG can carry <script>.
    // nosniff + a sandboxing CSP neutralise it if the URL is opened directly
    // (no effect on normal <img> rendering).
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    stream.pipe(res);
  } catch (err) {
    // No avatar (404) or R2 miss — end with a bare 404 so <img> onError fires cleanly
    // instead of the browser choking on a JSON error body.
    if (!err.statusCode || err.statusCode === 404) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      return res.status(404).end();
    }
    next(err);
  }
};

const removeAvatar = async (req, res, next) => {
  try {
    await userService.removeAvatar(req.params.id);
    res.json(success(null, 'Profile picture removed'));
  } catch (err) { next(err); }
};

module.exports = { getAll, getById, update, remove, uploadAvatar, getAvatar, removeAvatar };
