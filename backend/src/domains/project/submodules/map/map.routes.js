const express  = require('express');
const router   = express.Router({ mergeParams: true });
const controller = require('./map.controller');
const upload     = require('../../../../core/middleware/upload.middleware');
const requireProjectRole = require('../../../../core/middleware/projectRole.middleware');

router.post('/',    requireProjectRole('project_manager'), controller.saveMapData);
router.get('/',     controller.getMapData);
router.delete('/',  requireProjectRole('project_manager'), controller.deleteMapData);

// KML/KMZ upload → parse → auto-update project map
router.post('/kml', requireProjectRole('project_manager'),
  upload.single('kml'), controller.uploadKml);

// Import an existing project_documents KML/KMZ file onto the map
router.post('/import-document', requireProjectRole('project_manager'), controller.importDocumentKml);

// KML history — all uploads for this project
router.get('/kml-history', controller.getKmlHistory);

module.exports = router;
