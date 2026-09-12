const express = require('express');
const router = express.Router();
const authenticate = require('../../core/middleware/auth.middleware');
const authorize    = require('../../core/middleware/role.middleware');
const controller   = require('./pilot_tracking.controller');

// Strictly guard ALL routes in this domain to admin / super_admin only
router.use(authenticate, authorize('admin', 'super_admin'));

// Attendance Routes
router.get('/attendance', controller.getAttendanceMatrix);
router.post('/attendance', controller.saveDailyAttendance);
router.post('/attendance/bulk', controller.bulkSaveAttendance);
router.post('/attendance/date-range', controller.dateRangeSaveAttendance);
router.put('/pilot-details', controller.updatePilotDetails);

// Leave Balances & Company Holidays Routes
router.get('/leaves', controller.getLeaveBalances);
router.put('/leaves', controller.updatePilotLeaveBalance);
router.get('/holidays', controller.getCompanyHolidays);
router.post('/holidays', controller.addCompanyHoliday);
router.delete('/holidays/:id', controller.deleteCompanyHoliday);

// Payroll & Salary Settings Routes
router.get('/settings', controller.getPayrollSettings);
router.put('/settings', controller.updatePayrollSettings);

// Monthly Payroll Calculator & Snapshot Routes
router.get('/payroll', controller.calculateMonthlyPayroll);
router.post('/payroll/record', controller.savePayrollRecord);
router.post('/payroll/bulk', controller.saveBulkPayrollRecords);

module.exports = router;
