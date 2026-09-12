const service   = require('./report.service');
const template  = require('./report.template');
const scheduler = require('../../core/utils/scheduler');
const { success, error } = require('../../core/utils/response');

exports.getSettings = async (req, res, next) => {
  try {
    const settings = await service.getSettings();
    res.json(success(settings));
  } catch (e) { next(e); }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const settings = await service.updateSettings(req.body);
    scheduler.scheduleWeeklyReport().catch(() => {});
    res.json(success(settings, 'Report settings updated'));
  } catch (e) { next(e); }
};

exports.sendTest = async (req, res, next) => {
  try {
    const result = await service.sendReport();
    const msg = result.skipped
      ? 'No recipients configured — test skipped'
      : `Report sent to ${result.sentTo.length} recipient(s)`;
    res.json(success(result, msg));
  } catch (e) { next(e); }
};

exports.previewHtml = async (req, res, next) => {
  try {
    const data = await service.getPreviewData();
    const html = template.build(data);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { next(e); }
};

exports.previewData = async (req, res, next) => {
  try {
    const data = await service.getPreviewData();
    res.json(success(data));
  } catch (e) { next(e); }
};
