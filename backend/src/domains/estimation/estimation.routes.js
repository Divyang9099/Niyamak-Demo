const express = require('express');
const router = express.Router();
const controller = require('./estimation.controller');
const itemsController = require('./estimation.items.controller');
const authenticate = require('../../core/middleware/auth.middleware');

router.use(authenticate);
const authorize = require('../../core/middleware/role.middleware');

// Rate cards — DB-backed, available to all authenticated roles for read
router.get('/rate-cards', controller.getRateCards);

// Admin-only rate card management
router.get   ('/rate-cards/list', authorize('admin'), controller.listRateCards);
router.post  ('/rate-cards',      authorize('admin'), controller.createRateCard);
router.put   ('/rate-cards/:id',  authorize('admin'), controller.updateRateCard);
router.delete('/rate-cards/:id',  authorize('admin'), controller.deleteRateCard);

// PRD §9.2 — Estimation is Admin-only. Project Managers and Pilots must NOT be
// able to read or mutate estimations (they expose cost margins, overhead, and
// profit structure). The frontend already hides /estimations from non-admins;
// this guard closes the backend hole so a PM token cannot hit the API directly.
router.use(authorize('admin'));

router.post('/', controller.createEstimation);
router.get('/', controller.getEstimations);
router.get('/:id', controller.getEstimationById);
router.put('/:id', controller.updateEstimation);
router.delete('/:id', controller.deleteEstimation);
router.patch('/:id/rename', controller.renameEstimation);

router.post('/:id/clone', controller.cloneEstimation);
router.get('/:id/export/excel', controller.exportExcel);
router.get('/:id/export/pdf', controller.exportPDF);

// ── Estimation Line Items ─────────────────────
router.post('/:id/items', itemsController.addItem);
router.get('/:id/items', itemsController.getItems);
router.put('/:id/items/:itemId', itemsController.updateItem);
router.delete('/:id/items/:itemId', itemsController.deleteItem);

module.exports = router;

