const express      = require('express');
const router       = express.Router();
const controller   = require('./pipeline.controller');
const authenticate = require('../../core/middleware/auth.middleware');

router.use(authenticate); // 🔐 All pipeline routes require authentication
const authorize    = require('../../core/middleware/role.middleware');

router.use(authorize('admin', 'project_manager')); // 🚫 Pilots cannot manage pipelines

const validate = require('../../core/middleware/validate.middleware');
const upload   = require('../../core/middleware/upload.middleware');
const { createPipelineSchema, updatePipelineSchema, stageSchema } = require('./pipeline.validation');

router.post('/', validate(createPipelineSchema, { stripUnknown: false }), controller.createPipeline);
router.get('/', controller.getPipelines);
router.get('/history', controller.getPipelineHistory);
router.get('/calendar-view', controller.getCalendarView);
router.get('/:id', controller.getPipelineById);
router.put('/:id', validate(updatePipelineSchema, { stripUnknown: false }), controller.updatePipeline); // 🚩 Note: 'stage' field is ignored here. Use PUT /:id/stage to update status.
router.delete('/:id', authorize('admin'), controller.deletePipeline);

// ── Pipeline documents (checklist with attach/download) ──
router.get('/:id/documents',            controller.getPipelineDocuments);
router.post('/:id/documents',           controller.addPipelineDocument);
router.put('/:id/documents/:docId',           upload.uploadAny.single('file'), controller.updatePipelineDocument);
router.delete('/:id/documents/:docId/file',   controller.revokePipelineDocument);
router.delete('/:id/documents/:docId',        controller.deletePipelineDocument);

// stage update — free movement between stages, no document required.
// upload.none() parses the multipart text fields (stage/reason) the client sends.
router.put('/:id/stage', upload.none(), validate(stageSchema, { stripUnknown: false }), controller.updateStage);

// convert to project
router.post('/:id/convert', controller.convertToProject);

module.exports = router;
