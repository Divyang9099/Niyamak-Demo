import axiosInstance from './axios';

export const pilotTrackingApi = {
  // Attendance
  getAttendanceMatrix: async (params) => {
    const res = await axiosInstance.get('/pilot-tracking/attendance', { params });
    return res.data;
  },
  saveDailyAttendance: async (payload) => {
    const res = await axiosInstance.post('/pilot-tracking/attendance', payload);
    return res.data;
  },
  bulkSaveAttendance: async (payload) => {
    const res = await axiosInstance.post('/pilot-tracking/attendance/bulk', payload);
    return res.data;
  },
  dateRangeSaveAttendance: async (payload) => {
    const res = await axiosInstance.post('/pilot-tracking/attendance/date-range', payload);
    return res.data;
  },
  updatePilotDetails: async (payload) => {
    const res = await axiosInstance.put('/pilot-tracking/pilot-details', payload);
    return res.data;
  },

  // Leave Balances & Holidays
  getLeaveBalances: async (params) => {
    const res = await axiosInstance.get('/pilot-tracking/leaves', { params });
    return res.data;
  },
  updateLeaveBalance: async (payload) => {
    const res = await axiosInstance.put('/pilot-tracking/leaves', payload);
    return res.data;
  },
  getCompanyHolidays: async (params) => {
    const res = await axiosInstance.get('/pilot-tracking/holidays', { params });
    return res.data;
  },
  addCompanyHoliday: async (payload) => {
    const res = await axiosInstance.post('/pilot-tracking/holidays', payload);
    return res.data;
  },
  deleteCompanyHoliday: async (id) => {
    const res = await axiosInstance.delete(`/pilot-tracking/holidays/${id}`);
    return res.data;
  },

  // Salary & Bonus Settings
  getPayrollSettings: async () => {
    const res = await axiosInstance.get('/pilot-tracking/settings');
    return res.data;
  },
  updatePayrollSettings: async (payload) => {
    const res = await axiosInstance.put('/pilot-tracking/settings', payload);
    return res.data;
  },

  // Monthly Payroll Calculation
  getMonthlyPayroll: async (params) => {
    const res = await axiosInstance.get('/pilot-tracking/payroll', { params });
    return res.data;
  },
  savePayrollRecord: async (payload) => {
    const res = await axiosInstance.post('/pilot-tracking/payroll/record', payload);
    return res.data;
  },
  saveBulkPayrollRecords: async (payload) => {
    const res = await axiosInstance.post('/pilot-tracking/payroll/bulk', payload);
    return res.data;
  }
};
