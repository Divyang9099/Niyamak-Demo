const service = require('./attendance.service');

const getAttendanceMatrix = async (req, res, next) => {
  try {
    const { month, year, search } = req.query;
    const now = new Date();
    const m = month || (now.getMonth() + 1);
    const y = year || now.getFullYear();
    const data = await service.getAttendanceMatrix({ month: m, year: y, search });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const saveDailyAttendance = async (req, res, next) => {
  try {
    const { pilot_id, date, status, check_in, check_out, site_location, notes } = req.body;
    if (!pilot_id || !date || !status) {
      return res.status(400).json({ success: false, message: 'pilot_id, date, and status are required' });
    }
    const data = await service.saveDailyAttendance({ pilot_id, date, status, check_in, check_out, site_location, notes });
    res.json({ success: true, message: 'Attendance recorded successfully', data });
  } catch (error) {
    next(error);
  }
};

const bulkSaveAttendance = async (req, res, next) => {
  try {
    const { date, records } = req.body;
    if (!date || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: 'date and records array are required' });
    }
    const data = await service.bulkSaveAttendance({ date, records });
    res.json({ success: true, message: 'Bulk attendance saved successfully', data });
  } catch (error) {
    next(error);
  }
};

const dateRangeSaveAttendance = async (req, res, next) => {
  try {
    const { pilot_id, pilot_ids, start_date, end_date, status, site_location, notes } = req.body;
    if (!start_date || !end_date || !status) {
      return res.status(400).json({ success: false, message: 'start_date, end_date, and status are required' });
    }
    const data = await service.dateRangeSaveAttendance({ pilot_id, pilot_ids, start_date, end_date, status, site_location, notes });
    res.json({ success: true, message: 'Multi-day attendance applied successfully', data });
  } catch (error) {
    next(error);
  }
};

const updatePilotDetails = async (req, res, next) => {
  try {
    const { pilot_id, joining_date, employment_type, designation } = req.body;
    if (!pilot_id) {
      return res.status(400).json({ success: false, message: 'pilot_id is required' });
    }
    const data = await service.updatePilotDetails({ pilot_id, joining_date, employment_type, designation });
    res.json({ success: true, message: 'Pilot information updated successfully', data });
  } catch (error) {
    next(error);
  }
};

const getLeaveBalances = async (req, res, next) => {
  try {
    const { year, search } = req.query;
    const data = await service.getLeaveBalances({ year, search });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const updatePilotLeaveBalance = async (req, res, next) => {
  try {
    const { pilot_id, year, total_allowed_leaves, casual_leave, sick_leave, earned_leave } = req.body;
    if (!pilot_id || !year) {
      return res.status(400).json({ success: false, message: 'pilot_id and year are required' });
    }
    const data = await service.updatePilotLeaveBalance({ pilot_id, year, total_allowed_leaves, casual_leave, sick_leave, earned_leave });
    res.json({ success: true, message: 'Leave balance updated successfully', data });
  } catch (error) {
    next(error);
  }
};

const getCompanyHolidays = async (req, res, next) => {
  try {
    const { year } = req.query;
    const data = await service.getCompanyHolidays({ year });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

const addCompanyHoliday = async (req, res, next) => {
  try {
    const { date, name, is_optional } = req.body;
    if (!date || !name) {
      return res.status(400).json({ success: false, message: 'date and name are required' });
    }
    const data = await service.addCompanyHoliday({ date, name, is_optional });
    res.json({ success: true, message: 'Company holiday saved successfully', data });
  } catch (error) {
    next(error);
  }
};

const deleteCompanyHoliday = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await service.deleteCompanyHoliday(id);
    res.json({ success: true, message: 'Company holiday deleted', data });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAttendanceMatrix,
  saveDailyAttendance,
  bulkSaveAttendance,
  dateRangeSaveAttendance,
  updatePilotDetails,
  getLeaveBalances,
  updatePilotLeaveBalance,
  getCompanyHolidays,
  addCompanyHoliday,
  deleteCompanyHoliday
};
