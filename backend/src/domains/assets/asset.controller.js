const service = require('./asset.service');
const { success, paginated } = require('../../core/utils/response');

exports.createAsset = async (req, res, next) => {
  try {
    const data = await service.createAsset(req.body, req.user?.id);
    res.status(201).json(success(data, 'Asset created', 201));
  } catch (err) { next(err); }
};

exports.getAssets = async (req, res, next) => {
  try {
    const { rows, total, page, limit } = await service.getAssets(req.query);
    res.json(paginated(rows, total, page, limit));
  } catch (err) { next(err); }
};

exports.getAssetSummary = async (req, res, next) => {
  try {
    res.json(success(await service.getAssetSummary()));
  } catch (err) { next(err); }
};

exports.getAssetById = async (req, res, next) => {
  try {
    res.json(success(await service.getAssetById(req.params.id)));
  } catch (err) { next(err); }
};

exports.updateAsset = async (req, res, next) => {
  try {
    res.json(success(await service.updateAsset(req.params.id, req.body), 'Asset updated'));
  } catch (err) { next(err); }
};

exports.deleteAsset = async (req, res, next) => {
  try {
    await service.deleteAsset(req.params.id);
    res.json(success(null, 'Asset deleted'));
  } catch (err) { next(err); }
};
