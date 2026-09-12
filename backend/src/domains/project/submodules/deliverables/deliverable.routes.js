const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('./deliverable.controller');
const upload = require('../../../../core/middleware/upload.middleware');
const requireProjectRole = require('../../../../core/middleware/projectRole.middleware');

router.post('/',      upload.uploadAny.single('file'), controller.createDeliverable);
router.get('/',       controller.getDeliverables);
router.put('/:deliverableId',  requireProjectRole('project_manager'), upload.uploadAny.single('file'), controller.updateDeliverable);
router.delete('/:deliverableId', requireProjectRole('project_manager'), controller.deleteDeliverable);

// Must come before /:deliverableId routes to avoid route conflict
router.post('/bundle',      requireProjectRole('project_manager'), controller.bundleDeliverables);
router.get('/download-all', requireProjectRole('project_manager'), controller.downloadAllDeliverables);

router.get('/:deliverableId/download',  controller.downloadDeliverable);
router.put('/:deliverableId/approve',   requireProjectRole('project_manager'), controller.approveDeliverable);
router.put('/:deliverableId/reject',    requireProjectRole('project_manager'), controller.rejectDeliverable);
// Resubmit: pilots upload a revised file after rejection (PRD §4.4)
router.put('/:deliverableId/resubmit',  upload.uploadAny.single('file'), controller.resubmitDeliverable);
router.get('/:deliverableId/versions',  controller.getDeliverableVersions);

module.exports = router;
