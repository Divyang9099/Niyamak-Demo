const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('./member.controller');
const requireProjectRole = require('../../../../core/middleware/projectRole.middleware');

// Only admin and local project managers can manage project members
router.post('/', requireProjectRole('project_manager'), controller.addMember);
router.get('/', controller.getMembers);
router.put('/:userId', requireProjectRole('project_manager'), controller.updateMember);
router.delete('/:userId', requireProjectRole('project_manager'), controller.removeMember);

module.exports = router;
