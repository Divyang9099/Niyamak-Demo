const service = require('./estimation.items.service');
const { success } = require('../../core/utils/response');

exports.addItem = async (req, res, next) => {
  try {
    const data = await service.addItem(req.params.id, req.body, req.user.id);
    res.status(201).json(success(data, 'Estimation item added', 201));
  } catch (err) { next(err); }
};

exports.getItems = async (req, res, next) => {
  try {
    const data = await service.getItems(req.params.id);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.updateItem = async (req, res, next) => {
  try {
    const data = await service.updateItem(req.params.id, req.params.itemId, req.body);
    res.json(success(data, 'Estimation item updated'));
  } catch (err) { next(err); }
};

exports.deleteItem = async (req, res, next) => {
  try {
    await service.deleteItem(req.params.id, req.params.itemId);
    res.json(success(null, 'Estimation item deleted'));
  } catch (err) { next(err); }
};
