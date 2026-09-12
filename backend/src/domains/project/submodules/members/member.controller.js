const service = require('./member.service');
const { success } = require('../../../../core/utils/response');

exports.addMember = async (req, res, next) => {
  try {
    const data = await service.addMember(req.params.id, req.body);
    res.status(201).json(success(data, 'Member added to project', 201));
  } catch (err) { next(err); }
};

exports.getMembers = async (req, res, next) => {
  try {
    const data = await service.getMembers(req.params.id);
    res.json(success(data));
  } catch (err) { next(err); }
};

exports.updateMember = async (req, res, next) => {
  try {
    const data = await service.updateMember(req.params.id, req.params.userId, req.body);
    res.json(success(data, 'Member role updated'));
  } catch (err) { next(err); }
};

exports.removeMember = async (req, res, next) => {
  try {
    await service.removeMember(req.params.id, req.params.userId);
    res.json(success(null, 'Member removed from project'));
  } catch (err) { next(err); }
};
