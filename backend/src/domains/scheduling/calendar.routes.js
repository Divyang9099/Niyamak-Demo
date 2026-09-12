const express = require('express');
const router = express.Router();

const controller = require('./calendar.controller');
const authenticate = require('../../core/middleware/auth.middleware');
const authorize = require('../../core/middleware/role.middleware');

router.use(authenticate);

const validate = require('../../core/middleware/validate.middleware');
const { createEventSchema, updateEventSchema } = require('./calendar.validation');

// Calendar reads return org-wide allocations AND the confidential BD pipeline
// (deal names, windows, tentative resources). That is admin/PM data — the pipeline
// module itself is admin/PM-only and the frontend hides Calendar from pilots — so
// gate the read endpoints to match instead of leaking it to any authenticated user.
// calendar view
router.get('/', authorize('admin', 'project_manager'), controller.getCalendar);

// events
router.get('/events', authorize('admin', 'project_manager'), controller.getEvents);
router.post('/events',       authorize('admin', 'project_manager'), validate(createEventSchema, { stripUnknown: false }), controller.createEvent);
router.put('/events/:id',    authorize('admin', 'project_manager'), validate(updateEventSchema, { stripUnknown: false }), controller.updateEvent);
router.delete('/events/:id', authorize('admin', 'project_manager'), controller.deleteEvent);

// conflicts
router.get('/conflicts', authorize('admin', 'project_manager'), controller.getConflicts);
router.put('/conflicts/:id/resolve', authorize('admin', 'project_manager'), controller.resolveConflict);

module.exports = router;
