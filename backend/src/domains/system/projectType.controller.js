const service = require('./projectType.service');
const { success, error } = require('../../core/utils/response');

exports.list = async (req, res, next) => {
  try {
    const activeOnly = req.query.active === 'true';
    res.json(success(await service.list({ activeOnly })));
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    if (!req.body.key || !req.body.label) {
      return res.status(400).json(error('key and label are required', 400));
    }
    if (!/^[a-z0-9_]+$/.test(req.body.key)) {
      return res.status(400).json(error('key must be lowercase letters, digits, underscores', 400));
    }
    res.status(201).json(success(await service.create(req.body), 'Project type created', 201));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json(error('A project type with this key already exists', 409));
    }
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    res.json(success(await service.update(req.params.id, req.body), 'Project type updated'));
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    res.json(success(await service.remove(req.params.id), 'Project type deactivated'));
  } catch (err) { next(err); }
};
