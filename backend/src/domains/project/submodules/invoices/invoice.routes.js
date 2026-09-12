const express    = require('express');
const router     = express.Router({ mergeParams: true });
const ctrl       = require('./invoice.controller');
const upload     = require('../../../../core/middleware/upload.middleware');
const requireProjectRole = require('../../../../core/middleware/projectRole.middleware');

// Extract text + fields from a PDF — returns data but does NOT save anything.
// PM-only: it accepts an uploaded file and is part of the invoice-authoring flow.
router.post('/extract', requireProjectRole('project_manager'), upload.single('file'), ctrl.extractInvoice);

// Reads — any project member (parent mount already enforces membership).
router.get('/',                        ctrl.listInvoices);
router.get('/:invoiceId',              ctrl.getInvoice);
router.get('/:invoiceId/download',     ctrl.downloadInvoice);

// Writes — project managers (or admins) only. Invoices are financial records;
// a read-only pilot assigned to the project must not create/alter/delete them.
router.post('/', requireProjectRole('project_manager'), upload.single('file'), ctrl.createInvoice);
router.put('/:invoiceId',    requireProjectRole('project_manager'), ctrl.updateInvoice);
router.delete('/:invoiceId', requireProjectRole('project_manager'), ctrl.deleteInvoice);

module.exports = router;
