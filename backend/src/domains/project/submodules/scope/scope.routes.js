const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('./scope.controller');
const requireProjectRole = require('../../../../core/middleware/projectRole.middleware');

// POST /api/v1/projects/:id/scope
router.post('/', requireProjectRole('project_manager'), controller.createScope);

// GET /api/v1/projects/:id/scope
router.get('/', controller.getScope);

// PUT /api/v1/projects/:id/scope
router.put('/', requireProjectRole('project_manager'), controller.updateScope);

module.exports = router;
