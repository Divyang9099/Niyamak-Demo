const service = require('./drone.service');
const { success, paginated } = require('../../core/utils/response');

exports.createDrone = async (req, res, next) => {
  try {
    const data = await service.createDrone(req.body);
    res.status(201).json(success(data, 'Drone created', 201));
  } catch (err) { next(err); }
};

exports.getDrones = async (req, res, next) => {
  try {
    const { rows, total, page, limit } = await service.getDrones(req.query);
    rows.forEach(r => service.redactDroneForViewer(r, req.user));
    res.json(paginated(rows, total, page, limit));
  } catch (err) { next(err); }
};

exports.getDroneById = async (req, res, next) => {
  try {
    const drone = await service.getDroneById(req.params.id);
    service.redactDroneForViewer(drone, req.user);
    res.json(success(drone));
  } catch (err) { next(err); }
};

exports.updateDrone = async (req, res, next) => {
  try {
    res.json(success(await service.updateDrone(req.params.id, req.body), 'Drone updated'));
  } catch (err) { next(err); }
};

exports.deleteDrone = async (req, res, next) => {
  try {
    await service.deleteDrone(req.params.id);
    res.json(success(null, 'Drone deleted'));
  } catch (err) { next(err); }
};
