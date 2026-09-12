const express = require('express');
const router = express.Router({ mergeParams: true });
const controller = require('./projectDocs.controller');
const upload = require('../../../../core/middleware/upload.middleware');
const requireProjectRole = require('../../../../core/middleware/projectRole.middleware');

router.post('/', requireProjectRole('project_manager'), upload.single('file'), controller.uploadDocument);
router.get('/', controller.getDocuments);
router.put('/:docId',    requireProjectRole('project_manager'), controller.updateDocument);
router.delete('/:docId', requireProjectRole('project_manager'), controller.deleteDocument);
router.get('/:docId/download', controller.downloadDocument);

module.exports = router;
