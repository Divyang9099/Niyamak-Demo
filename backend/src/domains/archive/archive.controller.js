const service = require('./archive.service');
const { success, error } = require('../../core/utils/response');

exports.getArchived = async (req, res, next) => {
  try {
    const { search, type, page, limit } = req.query;
    const data = await service.getArchived({ search, type, page, limit });
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.restore = async (req, res, next) => {
  try {
    const { entityType, entityId } = req.params;
    const data = await service.restore(entityType, entityId, req.user.id);
    res.json(success(data, `${entityType.replace('_', ' ')} restored`));
  } catch (err) { next(err); }
};

exports.permanentDelete = async (req, res, next) => {
  try {
    const { entityType, entityId } = req.params;
    await service.permanentDelete(entityType, entityId);
    res.json(success(null, 'Permanently deleted'));
  } catch (err) { next(err); }
};
