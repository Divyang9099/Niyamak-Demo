const express      = require('express');
const router       = express.Router();
const controller   = require('./project.controller');
const authenticate = require('../../core/middleware/auth.middleware');
const requireProjectAccess = require('../../core/middleware/projectAccess.middleware');
const requireProjectRole   = require('../../core/middleware/projectRole.middleware');
const authorize            = require('../../core/middleware/role.middleware');

const scopeRoutes       = require('./submodules/scope/scope.routes');
const allocationRoutes  = require('./submodules/resources/allocation.routes');
const teamDroneRoutes   = require('./submodules/resources/teamDrones.routes');
const docRoutes         = require('./submodules/documents/projectDocs.routes');
const deliverableRoutes = require('./submodules/deliverables/deliverable.routes');
const mapRoutes         = require('./submodules/map/map.routes');
const memberRoutes      = require('./submodules/members/member.routes');
const invoiceRoutes     = require('./submodules/invoices/invoice.routes');
const expenseRoutes     = require('./submodules/expenses/expense.routes');

const { createProjectSchema, updateProjectSchema } = require('./project.validation');
const validate = require('../../core/middleware/validate.middleware');
const upload   = require('../../core/middleware/upload.middleware');

router.use(authenticate); // 🔐 All project routes require authentication

router.post('/', validate(createProjectSchema), controller.createProject);
router.get('/', controller.getProjects);

// Bulk status update — admin/PM only. Defined BEFORE the :id middleware so the
// path isn't intercepted as a project UUID.
router.patch('/bulk-status', authorize('admin', 'project_manager'), controller.bulkUpdateStatus);

// 👇 The middleware intercepts anything with :id globally
router.use('/:id', requireProjectAccess);

router.get('/:id', controller.getProjectById);
router.put('/:id', requireProjectRole('project_manager'), controller.updateProject);
// Gated transitions: complete (invoice required) + cancel (reason required, archives)
router.put('/:id/complete', requireProjectRole('project_manager'), upload.single('invoice'), controller.completeProject);
router.put('/:id/cancel',   requireProjectRole('project_manager'), controller.cancelProject);
router.get('/:id/invoice',  controller.downloadInvoice);
router.put('/:id/archive',  requireProjectRole('project_manager'), controller.archiveProject);
router.put('/:id/restore',  requireProjectRole('project_manager'), controller.restoreProject);
router.delete('/:id', requireProjectRole('project_manager'), controller.deleteProject);

// mount submodules
router.use('/:id([0-9a-fA-F-]{36})/scope', scopeRoutes);
router.use('/:id([0-9a-fA-F-]{36})/resources', allocationRoutes);
router.use('/:id([0-9a-fA-F-]{36})/team-drones', teamDroneRoutes);
router.use('/:id([0-9a-fA-F-]{36})/documents', docRoutes);
router.use('/:id([0-9a-fA-F-]{36})/deliverables', deliverableRoutes);
router.use('/:id([0-9a-fA-F-]{36})/map', mapRoutes);
router.use('/:id([0-9a-fA-F-]{36})/members', memberRoutes);
router.use('/:id([0-9a-fA-F-]{36})/invoices', requireProjectAccess, invoiceRoutes);
router.use('/:id([0-9a-fA-F-]{36})/expenses', requireProjectAccess, expenseRoutes);

module.exports = router;
