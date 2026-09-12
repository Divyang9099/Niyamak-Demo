const express = require('express');
const router = express.Router();
const controller = require('./dashboard.controller');
const authenticate = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/role.middleware');

router.use(authenticate); // 🔐 Secure dashboard

router.get('/summary',     controller.getSummary);
router.get('/projects',    controller.getProjects);
router.get('/project/:id', controller.getProjectDetails);
router.get('/activity',    controller.getActivity);
router.get('/utilization', authorize('admin', 'project_manager'), controller.getUtilization);
router.get('/upcoming',    controller.getUpcoming);
router.get('/alerts',      controller.getAlerts);
router.get('/reminders',   controller.getReminders);
router.get('/drone-utilization', authorize('admin', 'project_manager'), controller.getDroneUtilization);
router.get('/pilot-gantt',       authorize('admin', 'project_manager'), controller.getPilotGantt);
router.get('/drone-gantt',       authorize('admin', 'project_manager'), controller.getDroneGantt);
router.get('/export',      authorize('admin'), controller.exportData);

module.exports = router;
