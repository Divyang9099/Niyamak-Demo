const express = require('express');
const router = express.Router();
const authenticate = require('../../core/middleware/auth.middleware');
const authorize    = require('../../core/middleware/role.middleware');
const controller   = require('./attendance.controller');

// Strictly guard ALL routes in this domain to admin / super_admin / manager
router.use(authenticate, authorize('admin', 'super_admin', 'project_manager'));

// Attendance Routes
router.get('/matrix', controller.getAttendanceMatrix);
router.post('/daily', controller.saveDailyAttendance);
router.post('/bulk', controller.bulkSaveAttendance);
router.post('/date-range', controller.dateRangeSaveAttendance);
router.put('/pilot-info', controller.updatePilotDetails);

// Leave Balances & Company Holidays Routes
router.get('/leaves', controller.getLeaveBalances);
router.put('/leaves', controller.updatePilotLeaveBalance);
router.get('/holidays', controller.getCompanyHolidays);
router.post('/holidays', controller.addCompanyHoliday);
router.delete('/holidays/:id', controller.deleteCompanyHoliday);

module.exports = router;
