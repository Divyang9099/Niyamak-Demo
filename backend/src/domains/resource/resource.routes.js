const express = require('express');
const router = express.Router();

const pilotController = require('./pilot.controller');
const droneController = require('./drone.controller');
const authenticate = require('../../core/middleware/auth.middleware');
const { success } = require('../../core/utils/response');
const allocationsService = require('./allocations.service');
const maintenanceService  = require('./maintenance.service');

const authorize = require('../../core/middleware/role.middleware');
const upload    = require('../../core/middleware/upload.middleware');

// Pilot documents (aadhaar, passport, certificate) — no MIME restriction;
// users upload from phone cameras, scanners, or any format they have.
const pilotDocUpload = upload.uploadAny.fields([
  { name: 'aadhaar',      maxCount: 1 },
  { name: 'passport',     maxCount: 1 },
  { name: 'certificate',  maxCount: 1 },
]);

router.use(authenticate); // Require authentication to interact with resources

// ─── ALL RESOURCES OVERVIEW (pilots + drones with allocation status) ─────────
router.get('/allocations', async (req, res, next) => {
  try {
    const data = await allocationsService.getResourcesOverview(req.query);
    data.forEach(r => allocationsService.redactOverviewForViewer(r, req.user));
    res.json(success(data));
  } catch (err) { next(err); }
});

const pilotService = require('./pilot.service');

// ─── PILOT availability endpoint (MISSING) ──────────────────
router.get('/pilots/:id/availability', async (req, res, next) => {
  try {
    const data = await pilotService.getAvailability(
      req.params.id, req.query.start, req.query.end
    );
    res.json(success(data));
  } catch (err) { next(err); }
});

// ─── DEPLOYMENT HISTORY ──────────────────────
router.get('/pilots/:id/history', async (req, res, next) => {
  try {
    const data = await allocationsService.getPilotHistory(req.params.id);
    res.json(success(data));
  } catch (err) { next(err); }
});

router.get('/drones/:id/history', async (req, res, next) => {
  try {
    const data = await allocationsService.getDroneHistory(req.params.id);
    res.json(success(data));
  } catch (err) { next(err); }
});

// ─── PILOTS ──────────────────────────────────
router.post('/pilots',     authorize('admin'), pilotDocUpload, pilotController.createPilot);
router.get('/pilots',      pilotController.getPilots);
router.get('/pilots/:id',  pilotController.getPilotById);
router.put('/pilots/:id',  authorize('admin'), pilotDocUpload, pilotController.updatePilot);
router.delete('/pilots/:id', authorize('admin'), pilotController.deletePilot);

// ─── DRONES ──────────────────────────────────
router.post('/drones', authorize('admin'), droneController.createDrone);
router.get('/drones', droneController.getDrones);
router.get('/drones/:id', droneController.getDroneById);
router.put('/drones/:id', authorize('admin'), droneController.updateDrone);
router.delete('/drones/:id', authorize('admin'), droneController.deleteDrone);

// ─── DRONE MAINTENANCE LOGS ──────────────────
router.post('/drones/:id/maintenance', authorize('admin', 'project_manager'), async (req, res, next) => {
  try {
    const data = await maintenanceService.logMaintenance(req.params.id, req.body);
    res.status(201).json(success(data, 'Maintenance logged', 201));
  } catch (err) { next(err); }
});

router.get('/drones/:id/maintenance', async (req, res, next) => {
  try {
    const data = await maintenanceService.getMaintenanceLogs(req.params.id);
    res.json(success(data));
  } catch (err) { next(err); }
});

module.exports = router;

