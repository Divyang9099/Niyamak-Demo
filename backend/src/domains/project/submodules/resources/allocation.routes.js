const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('./allocation.controller');

const requireProjectRole = require('../../../../core/middleware/projectRole.middleware');

router.post('/', requireProjectRole('project_manager'), controller.createAllocation);
router.get('/', controller.getAllocations);
router.put('/:allocationId', requireProjectRole('project_manager'), controller.updateAllocation);
router.delete('/:allocationId', requireProjectRole('project_manager'), controller.deleteAllocation);

module.exports = router;
