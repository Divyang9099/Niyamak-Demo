const service = require('./system.service');
const { success } = require('../../core/utils/response');

exports.getConfig = async (req, res, next) => {
  try {
    const data = await service.getConfig();
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.updateConfig = async (req, res, next) => {
  try {
    const data = await service.updateConfig(req.body);
    res.json(success(data, 'Settings saved'));
  } catch (err) {
    next(err);
  }
};

exports.uploadLogo = async (req, res, next) => {
  try {
    if (!req.file) throw Object.assign(new Error('No file provided'), { statusCode: 400 });
    const key = await service.uploadLogo(req.file);
    res.json(success({ logo_key: key }, 'Logo uploaded'));
  } catch (err) {
    next(err);
  }
};

exports.getLogo = async (req, res, next) => {
  try {
    const { stream, contentType } = await service.getLogoStream();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Neutralise any script in a directly-opened SVG logo (no effect on <img>).
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    stream.pipe(res);
  } catch (err) {
    // No logo configured (404) or R2 error — return empty response so the
    // browser doesn't hit ERR_BLOCKED_BY_RESPONSE.NotSameOrigin on the error body.
    if (!err.statusCode || err.statusCode === 404) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      return res.status(204).end();
    }
    next(err);
  }
};
