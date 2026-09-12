import axiosInstance from './axios';

const BASE = '/attendance';

export const attendanceApi = {
  // Attendance Matrix
  getMatrix: (params) =>
    axiosInstance.get(`${BASE}/matrix`, { params }).then(r => r.data),

  // Single day logger
  saveDailyAttendance: (payload) =>
    axiosInstance.post(`${BASE}/daily`, payload).then(r => r.data),

  // Bulk (all pilots for one date)
  bulkSaveAttendance: (payload) =>
    axiosInstance.post(`${BASE}/bulk`, payload).then(r => r.data),

  // Multi-day date range
  dateRangeSave: (payload) =>
    axiosInstance.post(`${BASE}/date-range`, payload).then(r => r.data),

  // Pilot profile info (joining date, employment type, designation)
  updatePilotInfo: (payload) =>
    axiosInstance.put(`${BASE}/pilot-info`, payload).then(r => r.data),

  // Leave balances
  getLeaveBalances: (params) =>
    axiosInstance.get(`${BASE}/leaves`, { params }).then(r => r.data),

  updateLeaveBalance: (payload) =>
    axiosInstance.put(`${BASE}/leaves`, payload).then(r => r.data),

  // Company holidays
  getHolidays: (params) =>
    axiosInstance.get(`${BASE}/holidays`, { params }).then(r => r.data),

  addHoliday: (payload) =>
    axiosInstance.post(`${BASE}/holidays`, payload).then(r => r.data),

  deleteHoliday: (id) =>
    axiosInstance.delete(`${BASE}/holidays/${id}`).then(r => r.data),
};
