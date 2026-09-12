const express = require('express');
const router  = express.Router({ mergeParams: true });
const svc     = require('./teamDrones.service');
const { success } = require('../../../../core/utils/response');
const requireProjectRole = require('../../../../core/middleware/projectRole.middleware');

router.get('/', async (req, res, next) => {
  try {
    const data = await svc.getTeamDrones(req.params.id);
    res.json(success(data));
  } catch (err) { next(err); }
});

router.post('/', requireProjectRole('project_manager'), async (req, res, next) => {
  try {
    const data = await svc.addTeamDrone(req.params.id, req.body.drone_id, req.user?.id);
    res.status(201).json(success(data, 'Drone added to project team', 201));
  } catch (err) { next(err); }
});

router.delete('/:droneId', requireProjectRole('project_manager'), async (req, res, next) => {
  try {
    await svc.removeTeamDrone(req.params.id, req.params.droneId);
    res.json(success(null, 'Team drone removed'));
  } catch (err) { next(err); }
});

module.exports = router;
