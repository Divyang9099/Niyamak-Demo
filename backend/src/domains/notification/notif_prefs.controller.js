const service = require('./notif_prefs.service');
const { success } = require('../../core/utils/response');

exports.getPrefs = async (req, res, next) => {
  try {
    const data = await service.getPrefs(req.user.id);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.updatePrefs = async (req, res, next) => {
  try {
    // Accept either { prefs: [...] } or a top-level array
    const prefs = Array.isArray(req.body) ? req.body : req.body.prefs;
    const data = await service.updatePrefs(req.user.id, prefs);
    res.json(success(data, 'Preferences saved'));
  } catch (err) { next(err); }
};
