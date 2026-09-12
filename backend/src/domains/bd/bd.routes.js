const express      = require('express');
const router       = express.Router();
const controller    = require('./bd.controller');
const authenticate  = require('../../core/middleware/auth.middleware');
const authorize     = require('../../core/middleware/role.middleware');
const upload        = require('../../core/middleware/upload.middleware');

// BD is a normal admin module — same login as the rest of Niyamak, no second
// gate. Declared once here so no route below can be added unprotected by
// accident. See BD_MODULE_PLAN.md §0.3.
router.use(authenticate, authorize('admin'));

// ── Dashboard & stats ────────────────────────────────────────────────────────
router.get('/dashboard', controller.getDashboard);
router.get('/stats',     controller.getStats);

// ── Clients ──────────────────────────────────────────────────────────────────
router.get('/clients',           controller.getClients);
router.post('/clients',          controller.createClient);
router.get('/clients/export/excel', controller.exportClientsExcel);
router.get('/clients/:id',       controller.getClientById);
router.put('/clients/:id',       controller.updateClient);
router.patch('/clients/:id/status',   controller.updateStatus);
router.patch('/clients/:id/priority', controller.updatePriority);
router.delete('/clients/:id',    controller.deleteClient);

router.post('/clients/:id/logo',   upload.uploadTiny.single('logo'), controller.uploadLogo);
router.get('/clients/:id/logo',    controller.getLogo);
router.delete('/clients/:id/logo', controller.removeLogo);

// ── Contacts ─────────────────────────────────────────────────────────────────
router.get('/clients/:id/contacts',  controller.listContacts);
router.post('/clients/:id/contacts', controller.createContact);
router.put('/contacts/:contactId',    controller.updateContact);
router.delete('/contacts/:contactId', controller.deleteContact);

// ── Channels ─────────────────────────────────────────────────────────────────
router.get('/clients/:id/channels',  controller.listChannels);
router.post('/clients/:id/channels', controller.createChannel);
router.put('/channels/:channelId',    controller.updateChannel);
router.delete('/channels/:channelId', controller.deleteChannel);
router.patch('/channels/reorder',     controller.reorderChannels);

// ── The checkbox action — ticking "Sent" on a channel logs a touchpoint ──────
router.post('/channels/:channelId/log', controller.logOutreach);

// ── Touchpoints (communication log) ───────────────────────────────────────────
router.get('/clients/:id/touchpoints',   controller.listTouchpoints);
router.post('/touchpoints',              controller.createTouchpoint);
router.put('/touchpoints/:id',            controller.correctTouchpoint);
router.patch('/touchpoints/:id/response', controller.logResponse);
router.delete('/touchpoints/:id',         controller.deleteTouchpoint);

// ── Activity (BD's own audit trail) ───────────────────────────────────────────
router.get('/activity', controller.getActivity);

// ── Follow-ups (the inbox) ─────────────────────────────────────────────────────
router.get('/followups',              controller.listFollowups);
router.post('/followups',             controller.createFollowup);
router.patch('/followups/:id/complete', controller.completeFollowup);
router.patch('/followups/:id/snooze',   controller.snoozeFollowup);
router.patch('/followups/:id/cancel',   controller.cancelFollowup);

// ── Sectors (dashboard sections, admin-editable) ──────────────────────────────
router.get('/sectors',        controller.listSectors);
router.post('/sectors',       controller.createSector);
router.put('/sectors/:id',    controller.updateSector);
router.delete('/sectors/:id', controller.deleteSector);

// ── Departments (contact dropdown, admin-editable) ────────────────────────────
router.get('/departments',        controller.listDepartments);
router.post('/departments',       controller.createDepartment);
router.put('/departments/:id',    controller.updateDepartment);
router.delete('/departments/:id', controller.deleteDepartment);

// ── Settings (single row) ─────────────────────────────────────────────────────
router.get('/settings', controller.getSettings);
router.put('/settings', controller.updateSettings);

module.exports = router;
