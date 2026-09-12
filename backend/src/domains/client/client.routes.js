const express      = require('express');
const router       = express.Router();
const controller   = require('./client.controller');
const authenticate = require('../../core/middleware/auth.middleware');
const authorize    = require('../../core/middleware/role.middleware');

router.use(authenticate);

// Read — any authenticated role (needed so the client dropdown works everywhere).
router.get('/',    controller.getClients);
router.get('/:id', controller.getClientById);

// Mutations — admin + project managers (mirrors projects/pipeline authoring rights).
router.post('/',       authorize('admin', 'project_manager'), controller.createClient);
router.put('/:id',     authorize('admin', 'project_manager'), controller.updateClient);
router.delete('/:id',  authorize('admin'),                    controller.deleteClient);

module.exports = router;
