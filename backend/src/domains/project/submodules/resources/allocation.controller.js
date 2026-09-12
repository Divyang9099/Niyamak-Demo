const service = require('./allocation.service');
const { success } = require('../../../../core/utils/response');

exports.createAllocation = async (req, res, next) => {
  try {
    const data = await service.createAllocation(req.params.id, req.body, req.user.id);
    res.status(201).json(success(data, 'Resource allocated', 201));
  } catch (err) {
    if (err.statusCode === 409 && err.conflictPayload) {
      return res.status(409).json({ success: false, message: err.message, conflict: err.conflictPayload });
    }
    next(err);
  }
};

exports.getAllocations = async (req, res, next) => {
  try {
    const data = await service.getAllocations(req.params.id);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.updateAllocation = async (req, res, next) => {
  try {
    // Pass the URL project id so the allocation is scoped to it (prevents editing
    // another project's allocation via a project the caller happens to manage).
    const data = await service.updateAllocation(req.params.allocationId, req.params.id, req.body, req.user.id);
    res.json(success(data, 'Allocation updated'));
  } catch (err) {
    if (err.statusCode === 409 && err.conflictPayload) {
      return res.status(409).json({ success: false, message: err.message, conflict: err.conflictPayload });
    }
    next(err);
  }
};

exports.deleteAllocation = async (req, res, next) => {
  try {
    await service.deleteAllocation(req.params.allocationId, req.params.id, req.user.id);
    res.json(success(null, 'Allocation deleted'));
  } catch (err) {
    next(err);
  }
};
