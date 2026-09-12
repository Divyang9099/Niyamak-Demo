const service = require('./scope.service');
const { success, error } = require('../../../../core/utils/response');

exports.createScope = async (req, res, next) => {
  try {
    const projectId = req.params.id; // comes from merged params
    const data = await service.createScope(projectId, req.body);
    res.status(201).json(success(data, 'Scope created', 201));
  } catch (err) {
    next(err);
  }
};

exports.getScope = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const data = await service.getScope(projectId);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.updateScope = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const data = await service.updateScope(projectId, req.body);
    res.json(success(data, 'Scope saved'));
  } catch (err) {
    next(err);
  }
};
