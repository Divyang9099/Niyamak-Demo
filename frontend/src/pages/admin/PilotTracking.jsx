import React, { useState, useEffect, useMemo, useRef } from 'react';
import { pilotTrackingApi } from '../../api/pilotTrackingApi';
import { useToast } from '../../context/ToastContext';
import clsx from 'clsx';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

const STATUS_CONFIG = {
  present: { label: 'Present', short: 'P', bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  on_field: { label: 'On Field', short: 'F', bg: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  on_leave: { label: 'On Leave', short: 'L', bg: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  wfh: { label: 'WFH', short: 'WFH', bg: 'bg-pink-500/10 text-pink-600 border-pink-500/30' },
  half_day: { label: 'Half Day', short: 'HD', bg: 'bg-purple-500/10 text-purple-600 border-purple-500/30' },
  holiday: { label: 'Holiday', short: 'H', bg: 'bg-slate-500/10 text-slate-600 border-slate-500/30' },
  off: { label: 'Weekly Off', short: 'OFF', bg: 'bg-gray-200 text-gray-500 border-gray-300' },
  ot: { label: 'Overtime', short: 'OT', bg: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30' },
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function PilotTracking() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('attendance'); // attendance | leaves | settings | payroll
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedPilotId, setSelectedPilotId] = useState('all'); // 'all' or pilot_id

  // Data states
  const [attendanceData, setAttendanceData] = useState({ pilots: [], totalDays: 30 });
  const [leaveData, setLeaveData] = useState([]);
  const [holidaysData, setHolidaysData] = useState([]);
  const [settingsData, setSettingsData] = useState([]);
  const [payrollData, setPayrollData] = useState({ records: [], workingDays: 30 });

  // Modals & Single Edit States
  const [singleModal, setSingleModal] = useState(null); // { pilot, date, status, notes }
  const [bulkModal, setBulkModal] = useState(null); // { date, status, pilot_ids, notes }
  const [dateRangeModal, setDateRangeModal] = useState(null); // { pilot_id, start_date, end_date, status, notes }
  const [pilotDetailsModal, setPilotDetailsModal] = useState(null); // { pilot_id, joining_date, employment_type, designation }
  const [holidayModal, setHolidayModal] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '', is_optional: false });
  const [leaveModal, setLeaveModal] = useState(null); // pilot leave balance edit
  const [editingSettings, setEditingSettings] = useState(null);

  // Load active tab data
  useEffect(() => {
    fetchTabData();
  }, [activeTab, selectedMonth, selectedYear, search]);

  const fetchTabData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'attendance' || activeTab === 'calendar') {
        const res = await pilotTrackingApi.getAttendanceMatrix({ month: selectedMonth, year: selectedYear, search });
        setAttendanceData(res.data || { pilots: [], totalDays: 30 });
        const resLeaves = await pilotTrackingApi.getLeaveBalances({ year: selectedYear, search });
        setLeaveData(resLeaves.data || []);
        const resSettings = await pilotTrackingApi.getPayrollSettings();
        setSettingsData(resSettings.data || []);
      } else if (activeTab === 'leaves') {
        const resLeaves = await pilotTrackingApi.getLeaveBalances({ year: selectedYear, search });
        const resHolidays = await pilotTrackingApi.getCompanyHolidays({ year: selectedYear });
        setLeaveData(resLeaves.data || []);
        setHolidaysData(resHolidays.data || []);
      } else if (activeTab === 'settings') {
        const res = await pilotTrackingApi.getPayrollSettings();
        setSettingsData(res.data || []);
      } else if (activeTab === 'payroll') {
        const res = await pilotTrackingApi.getMonthlyPayroll({ month: selectedMonth, year: selectedYear, search });
        setPayrollData(res.data || { records: [], workingDays: 30 });
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filtered pilots list based on dropdown selection
  const filteredPilots = useMemo(() => {
    if (!selectedPilotId || selectedPilotId === 'all') return attendanceData.pilots;
    return attendanceData.pilots.filter(p => p.pilot_id === selectedPilotId);
  }, [attendanceData.pilots, selectedPilotId]);

  const selectedPilotObject = useMemo(() => {
    if (!selectedPilotId || selectedPilotId === 'all') return null;
    return attendanceData.pilots.find(p => p.pilot_id === selectedPilotId);
  }, [attendanceData.pilots, selectedPilotId]);

  // Attendance Calendar Events Memo
  const calendarEvents = useMemo(() => {
    const evs = [];
    const targetPilots = selectedPilotId === 'all'
      ? attendanceData.pilots
      : attendanceData.pilots.filter(p => p.pilot_id === selectedPilotId);

    targetPilots.forEach(pilot => {
      if (!pilot.attendance) return;
      Object.entries(pilot.attendance).forEach(([dateStr, record]) => {
        const status = record?.status || 'present';
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.present;
        const title = selectedPilotId === 'all'
          ? `${pilot.name}: ${cfg.label}`
          : `${cfg.label}`;
        
        evs.push({
          id: `${pilot.pilot_id}-${dateStr}`,
          title,
          start: dateStr,
          allDay: true,
          className: `fc-event-${status}`,
          extendedProps: {
            pilot_id: pilot.pilot_id,
            pilot_name: pilot.name,
            date: dateStr,
            status,
            notes: record?.notes || ''
          }
        });
      });
    });
    return evs;
  }, [attendanceData.pilots, selectedPilotId]);

  const handleCalendarDateClick = (info) => {
    const dateStr = info.dateStr;
    const parts = dateStr.split('-');
    const dayOfWeek = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getDay();
    if (selectedPilotId !== 'all') {
      const pilot = attendanceData.pilots.find(p => p.pilot_id === selectedPilotId);
      if (!pilot) return;
      const record = pilot.attendance?.[dateStr];
      setSingleModal({
        pilot,
        date: dateStr,
        status: record?.status || (dayOfWeek === 0 ? 'off' : 'present'),
        check_in: record?.check_in || '',
        check_out: record?.check_out || '',
        notes: record?.notes || ''
      });
    } else {
      setBulkModal({
        date: dateStr,
        status: dayOfWeek === 0 ? 'off' : 'present',
        pilot_ids: attendanceData.pilots.map(p => p.pilot_id),
        notes: ''
      });
    }
  };

  const handleCalendarEventClick = (info) => {
    const p = info.event.extendedProps;
    const pilot = attendanceData.pilots.find(pt => pt.pilot_id === p.pilot_id);
    if (!pilot) return;
    const record = pilot.attendance?.[p.date];
    setSingleModal({
      pilot,
      date: p.date,
      status: p.status,
      check_in: record?.check_in || '',
      check_out: record?.check_out || '',
      notes: p.notes
    });
  };

  const handleSaveBulkAttendance = async (e) => {
    e.preventDefault();
    if (!bulkModal) return;
    try {
      const payload = {
        date: bulkModal.date,
        records: bulkModal.pilot_ids.map(pid => ({
          pilot_id: pid,
          status: bulkModal.status,
          notes: bulkModal.notes
        }))
      };
      await pilotTrackingApi.bulkSaveAttendance(payload);
      showToast('Bulk attendance logged successfully', 'success');
      setBulkModal(null);
      fetchTabData();
    } catch (err) {
      showToast('Failed to save bulk attendance: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  // ── Handlers for Attendance ─────────────────────────────────────
  const handleSaveSingleAttendance = async () => {
    if (!singleModal) return;
    try {
      const payload = {
        pilot_id: singleModal.pilot.pilot_id,
        date: singleModal.date,
        status: singleModal.status,
        check_in: singleModal.check_in,
        check_out: singleModal.check_out,
        notes: singleModal.notes
      };
      await pilotTrackingApi.saveDailyAttendance(payload);
      showToast('Attendance logged successfully', 'success');
      setSingleModal(null);
      fetchTabData();
    } catch (err) {
      showToast('Failed to save attendance: ' + (err.response?.data?.message || err.message), 'error');
    }
  };

  const handleSaveDateRangeAttendance = async (e) => {
    e.preventDefault();
    if (!dateRangeModal || !dateRangeModal.start_date || !dateRangeModal.end_date) return;
    try {
      const payload = {
        pilot_id: dateRangeModal.pilot_id === 'all' ? null : dateRangeModal.pilot_id,
        pilot_ids: dateRangeModal.pilot_id === 'all' ? attendanceData.pilots.map(p => p.pilot_id) : [dateRangeModal.pilot_id],
        start_date: dateRangeModal.start_date,
        end_date: dateRangeModal.end_date,
        status: dateRangeModal.status,
        notes: dateRangeModal.notes
      };
      await pilotTrackingApi.dateRangeSaveAttendance(payload);
      showToast('Multi-day attendance applied successfully', 'success');
      setDateRangeModal(null);
      fetchTabData();
    } catch (err) {
      showToast('Failed to apply multi-day attendance', 'error');
    }
  };

  const handleSavePilotDetails = async (e) => {
    e.preventDefault();
    if (!pilotDetailsModal) return;
    try {
      await pilotTrackingApi.updatePilotDetails(pilotDetailsModal);
      showToast('Pilot information & Joining Date updated', 'success');
      setPilotDetailsModal(null);
      fetchTabData();
    } catch (err) {
      showToast('Failed to update pilot details', 'error');
    }
  };

  // ── Handlers for Holidays & Leaves ─────────────────────────────
  const handleAddHoliday = async (e) => {
    e.preventDefault();
    if (!newHoliday.date || !newHoliday.name) return;
    try {
      await pilotTrackingApi.addCompanyHoliday(newHoliday);
      showToast('Company holiday added', 'success');
      setHolidayModal(false);
      setNewHoliday({ date: '', name: '', is_optional: false });
      fetchTabData();
    } catch (err) {
      showToast('Failed to add holiday', 'error');
    }
  };

  const handleDeleteHoliday = async (id) => {
    if (!window.confirm('Are you sure you want to delete this holiday?')) return;
    try {
      await pilotTrackingApi.deleteCompanyHoliday(id);
      showToast('Holiday removed', 'success');
      fetchTabData();
    } catch (err) {
      showToast('Failed to delete holiday', 'error');
    }
  };

  const handleSaveLeaveBalance = async () => {
    if (!leaveModal) return;
    try {
      await pilotTrackingApi.updateLeaveBalance({ ...leaveModal, year: selectedYear });
      showToast('Leave quota updated', 'success');
      setLeaveModal(null);
      fetchTabData();
    } catch (err) {
      showToast('Failed to update leave balance', 'error');
    }
  };

  // ── Handlers for Salary Settings ──────────────────────────────
  const handleSaveSettings = async (setting) => {
    try {
      await pilotTrackingApi.updatePayrollSettings(setting);
      showToast('Payroll settings saved', 'success');
      setEditingSettings(null);
      fetchTabData();
    } catch (err) {
      showToast('Failed to update settings', 'error');
    }
  };

  // ── Handlers for Payroll Calculation ───────────────────────────
  const handleSavePayrollRow = async (row) => {
    try {
      await pilotTrackingApi.savePayrollRecord({
        ...row,
        month: selectedMonth,
        year: selectedYear
      });
      showToast(`Payroll saved for ${row.name}`, 'success');
      fetchTabData();
    } catch (err) {
      showToast('Failed to save payroll record', 'error');
    }
  };

  const handleBulkSavePayroll = async (statusOverride = null) => {
    try {
      const recordsToSave = payrollData.records.map(r => ({
        ...r,
        status: statusOverride || r.status
      }));
      await pilotTrackingApi.saveBulkPayrollRecords({
        month: selectedMonth,
        year: selectedYear,
        records: recordsToSave
      });
      showToast('Monthly payroll locked & saved for all pilots', 'success');
      fetchTabData();
    } catch (err) {
      showToast('Failed to save bulk payroll', 'error');
    }
  };

  const exportPayrollCSV = () => {
    if (!payrollData.records || !payrollData.records.length) return;
    const headers = [
      'Employee ID', 'Pilot Name', 'Working Days', 'Present', 'On Field', 'Leave', 'WFH', 'Overtime',
      'Base Salary (INR)', 'Field Bonus (INR)', 'Custom Bonus (INR)', 'Unpaid Absent Cut (INR)',
      'Custom Deduction (INR)', 'Net Payout (INR)', 'Status'
    ];
    const rows = payrollData.records.map(r => [
      `"${r.employee_id || ''}"`,
      `"${r.name || ''}"`,
      r.working_days,
      r.days_present,
      r.days_on_field,
      r.days_leave,
      r.days_wfh || 0,
      r.days_ot || 0,
      r.base_salary,
      r.field_bonus_total,
      r.custom_bonus,
      r.unpaid_absent_cut,
      r.custom_deduction,
      r.net_salary,
      r.status
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Pilot_Payroll_${selectedYear}_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto text-slate-800 dark:text-slate-100">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-2xl">badge</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pilot Tracking & Payroll</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Admin Management: Pilot Attendance, Joining Info, Leaves, Holidays & Salary/Bonus Calculations
              </p>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          {[
            { id: 'attendance', label: 'Attendance Matrix', icon: 'calendar_view_month' },
            { id: 'calendar', label: 'Attendance Calendar', icon: 'calendar_month' },
            { id: 'leaves', label: 'Leaves & Holidays', icon: 'flight_takeoff' },
            { id: 'settings', label: 'Salary Settings', icon: 'settings_account_box' },
            { id: 'payroll', label: 'Payroll & Bonus', icon: 'payments' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200",
                activeTab === tab.id
                  ? "bg-white dark:bg-slate-900 text-primary shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-200/50"
              )}
            >
              <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Global Controls & Filters (Pilot Selector, Month/Year, Search) */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Pilot Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400 text-sm">person</span>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Pilot Focus:</label>
            <select
              value={selectedPilotId}
              onChange={(e) => setSelectedPilotId(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-primary focus:ring-2 focus:ring-primary/20 outline-none min-w-[180px]"
            >
              <option value="all"> All Pilots ({attendanceData.pilots.length})</option>
              {attendanceData.pilots.map(p => (
                <option key={p.pilot_id} value={p.pilot_id}>{p.name} ({p.employee_id || 'ID N/A'})</option>
              ))}
            </select>
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

          {/* Month / Year selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Period:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
            >
              {[2024, 2025, 2026, 2027].map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Date Range Logger Trigger */}
          {activeTab === 'attendance' && (
            <button
              onClick={() => setDateRangeModal({
                pilot_id: selectedPilotId === 'all' ? (attendanceData.pilots[0]?.pilot_id || 'all') : selectedPilotId,
                start_date: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`,
                end_date: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-05`,
                status: 'on_leave',
                notes: ''
              })}
              className="px-3.5 py-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-500/20 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-base">date_range</span>
              Apply Multi-Day Leave / Status
            </button>
          )}

          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400 text-sm">search</span>
            <input
              type="text"
              placeholder="Search pilot name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 outline-none w-56"
            />
          </div>
        </div>
      </div>

      {/* ── PILOT PROFILE CARD (WHEN A SPECIFIC PILOT IS SELECTED) ────────── */}
      {selectedPilotObject && (() => {
        const pilotSettings = settingsData.find(s => s.pilot_id === selectedPilotObject.pilot_id);
        const pilotLeave = leaveData.find(l => l.pilot_id === selectedPilotObject.pilot_id);
        
        const baseSalary = Number(pilotSettings?.base_monthly_salary || 0);
        const fieldBonusRate = Number(pilotSettings?.field_per_diem_bonus || 0);
        const daysField = selectedPilotObject.summary.daysField || 0;
        const estimatedEarnings = baseSalary + (daysField * fieldBonusRate);

        const allowedLeaves = Number(pilotLeave?.total_allowed_leaves || 18);
        const leavesTaken = Number(pilotLeave?.leaves_taken || 0);
        const leavesRemaining = Number(pilotLeave?.leaves_remaining || 18);

        const totalMonthDays = attendanceData.totalDays || 30;
        const totalWorked = (selectedPilotObject.summary.daysPresent || 0) + 
                            (selectedPilotObject.summary.daysField || 0) + 
                            (selectedPilotObject.summary.daysWfh || 0) + 
                            (selectedPilotObject.summary.daysOt || 0) +
                            ((selectedPilotObject.summary.daysHalf || 0) * 0.5);
        const attendanceRate = totalMonthDays > 0 ? Math.min(100, Math.round((totalWorked / totalMonthDays) * 100)) : 0;

        // License expiry checking
        let licenseStatus = 'Valid';
        let licenseColor = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30';
        if (selectedPilotObject.license_expiry) {
          const exp = new Date(selectedPilotObject.license_expiry);
          const diff = exp - new Date();
          const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
          if (diffDays < 0) {
            licenseStatus = 'Expired';
            licenseColor = 'bg-rose-500/10 text-rose-600 border-rose-500/30';
          } else if (diffDays <= 30) {
            licenseStatus = `Expiring soon (${diffDays}d)`;
            licenseColor = 'bg-amber-500/10 text-amber-600 border-amber-500/30';
          }
        }

        return (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-md overflow-hidden transition-all duration-300 hover:shadow-lg">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent dark:from-slate-800/50 dark:to-transparent px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-bold shadow-md">
                  {selectedPilotObject.name ? selectedPilotObject.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'P'}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    {selectedPilotObject.name}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary border border-primary/30 capitalize">
                      {selectedPilotObject.employment_type?.replace('_', ' ') || 'Full Time'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">{selectedPilotObject.designation || 'Drone Pilot'}</p>
                </div>
              </div>
              <button
                onClick={() => setPilotDetailsModal({
                  pilot_id: selectedPilotObject.pilot_id,
                  joining_date: selectedPilotObject.joining_date || '',
                  employment_type: selectedPilotObject.employment_type || 'full_time',
                  designation: selectedPilotObject.designation || 'Drone Pilot'
                })}
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 hover:border-primary dark:hover:border-primary text-slate-700 dark:text-slate-300 hover:text-primary dark:hover:text-primary rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-[14px]">edit_calendar</span>
                Edit Profile Info
              </button>
            </div>

            {/* Content Details Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
              {/* Profile Details */}
              <div className="space-y-3 border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-slate-800 pb-5 lg:pb-0 lg:pr-6 text-xs">
                <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1">Pilot Information</div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="material-symbols-outlined text-[16px] text-slate-400">badge</span>
                  <span>Employee ID: <strong>{selectedPilotObject.employee_id || 'N/A'}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="material-symbols-outlined text-[16px] text-slate-400">mail</span>
                  <a href={`mailto:${selectedPilotObject.email}`} className="hover:underline hover:text-primary">{selectedPilotObject.email}</a>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="material-symbols-outlined text-[16px] text-slate-400">call</span>
                  <span>{selectedPilotObject.phone || 'No phone set'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="material-symbols-outlined text-[16px] text-slate-400">pin_drop</span>
                  <span>Base Location: <strong>{selectedPilotObject.base_location || 'Not configured'}</strong></span>
                </div>
              </div>

              {/* Credentials & Governance */}
              <div className="space-y-3 border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-slate-800 pb-5 lg:pb-0 lg:pr-6 text-xs">
                <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1">Credentials & Contract</div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="material-symbols-outlined text-[16px] text-slate-400">calendar_today</span>
                  <span>Joining Date: <strong>{selectedPilotObject.joining_date ? new Date(selectedPilotObject.joining_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="material-symbols-outlined text-[16px] text-slate-400">file_present</span>
                  <span>License: <strong>{selectedPilotObject.license_number || 'N/A'}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="material-symbols-outlined text-[16px] text-slate-400">event_busy</span>
                  <span>License Expiry: <strong>{selectedPilotObject.license_expiry ? new Date(selectedPilotObject.license_expiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <span className="material-symbols-outlined text-[16px] text-slate-400">verified</span>
                  <span className="flex items-center gap-1.5">
                    License Status: 
                    <span className={clsx("px-2 py-0.5 rounded font-bold text-[10px] border", licenseColor)}>
                      {licenseStatus}
                    </span>
                  </span>
                </div>
              </div>

              {/* KPI Performance Cards */}
              <div className="space-y-3">
                <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-1">KPIs & Performance ({MONTH_NAMES[selectedMonth - 1]})</div>
                <div className="grid grid-cols-2 gap-3">
                  {/* KPI 1: Attendance Rate */}
                  <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <div className="text-[10px] text-slate-400 font-semibold mb-1">Attendance Rate</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-slate-800 dark:text-white">{attendanceRate}%</span>
                      <span className="text-[9px] text-slate-400 font-medium">({totalWorked}/{totalMonthDays}d)</span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full mt-1.5 overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${attendanceRate}%` }} />
                    </div>
                  </div>

                  {/* KPI 2: Overtime Days */}
                  <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <div className="text-[10px] text-slate-400 font-semibold mb-1">Overtime (OT)</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{selectedPilotObject.summary.daysOt || 0} Days</span>
                    </div>
                    <div className="text-[9px] text-slate-400 font-medium mt-1">Extra Sunday duty</div>
                  </div>

                  {/* KPI 3: Leaves Utilized */}
                  <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <div className="text-[10px] text-slate-400 font-semibold mb-1">Annual Leaves</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{leavesTaken}/{allowedLeaves}</span>
                      <span className="text-[9px] text-slate-400 font-medium">({leavesRemaining} left)</span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-1 rounded-full mt-1.5 overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: `${allowedLeaves > 0 ? (leavesTaken / allowedLeaves) * 100 : 0}%` }} />
                    </div>
                  </div>

                  {/* KPI 4: Estimated Payout */}
                  <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80">
                    <div className="text-[10px] text-slate-400 font-semibold mb-1">Est. Salary Payout</div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">₹{estimatedEarnings.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 font-medium mt-1">₹{baseSalary.toLocaleString('en-IN')} base + {daysField}d field</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── TAB 1: ATTENDANCE MATRIX ────────────────────────────────────── */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          {/* Status Legend & Quick Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-3 font-medium">
              <span className="text-slate-500 font-bold uppercase tracking-wider">Status Legend:</span>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className={clsx("px-2 py-0.5 rounded border text-[11px] font-bold", cfg.bg)}>
                    {cfg.short}
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">{cfg.label}</span>
                </div>
              ))}
            </div>
            <p className="text-slate-400 italic">Click any cell to log or edit individual daily attendance</p>
          </div>

          {/* Matrix Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                  <th className="p-3 sticky left-0 z-10 bg-slate-100 dark:bg-slate-800 font-bold min-w-[220px]">Pilot</th>
                  {Array.from({ length: attendanceData.totalDays }).map((_, i) => {
                    const dayNum = i + 1;
                    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    const dayOfWeek = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
                    const isSunday = dayOfWeek === 'Sun';
                    return (
                      <th
                        key={dayNum}
                        className={clsx(
                          "p-2 text-center border-l border-slate-200 dark:border-slate-700 font-semibold min-w-[38px]",
                          isSunday && "bg-rose-500/10 text-rose-600"
                        )}
                      >
                        <div>{dayNum}</div>
                        <div className="text-[10px] text-slate-400 font-normal">{dayOfWeek[0]}</div>
                      </th>
                    );
                  })}
                  <th className="p-3 text-center border-l border-slate-200 font-bold bg-slate-100 dark:bg-slate-800">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPilots.length === 0 ? (
                  <tr>
                    <td colSpan={attendanceData.totalDays + 2} className="p-8 text-center text-slate-400">
                      No pilots found matching filter.
                    </td>
                  </tr>
                ) : (
                  filteredPilots.map(pilot => (
                    <tr key={pilot.pilot_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                      <td className="p-3 sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">{pilot.name}</div>
                            <div className="text-[11px] text-slate-400">
                              ID: {pilot.employee_id || 'N/A'} {pilot.joining_date ? `• Joined: ${new Date(pilot.joining_date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}` : ''}
                            </div>
                          </div>
                          <button
                            onClick={() => setPilotDetailsModal({
                              pilot_id: pilot.pilot_id,
                              joining_date: pilot.joining_date || '',
                              employment_type: pilot.employment_type || 'full_time',
                              designation: pilot.designation || 'Drone Pilot'
                            })}
                            title="Edit Joining Date & Pilot Info"
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-primary rounded"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                          </button>
                        </div>
                      </td>
                      {Array.from({ length: attendanceData.totalDays }).map((_, i) => {
                        const dayNum = i + 1;
                        const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const record = pilot.attendance?.[dateStr];
                        const dayOfWeek = new Date(selectedYear, selectedMonth - 1, dayNum).getDay();
                        const status = record?.status || (dayOfWeek === 0 ? 'off' : 'present');
                        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.present;

                        return (
                          <td
                            key={dayNum}
                            onClick={() => setSingleModal({
                              pilot,
                              date: dateStr,
                              status,
                              check_in: record?.check_in || '',
                              check_out: record?.check_out || '',
                              notes: record?.notes || ''
                            })}
                            className="p-1 border-l border-slate-100 dark:border-slate-800 text-center cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            <span className={clsx("inline-block w-7 h-7 leading-7 text-center rounded border font-bold text-[10px]", cfg.bg)}>
                              {cfg.short}
                            </span>
                          </td>
                        );
                      })}
                      <td className="p-3 border-l border-slate-200 dark:border-slate-800 text-center font-medium text-[11px]">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap min-w-[120px]">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">P:{pilot.summary.daysPresent}</span>
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">F:{pilot.summary.daysField}</span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">L:{pilot.summary.daysLeave}</span>
                          <span className="px-1.5 py-0.5 rounded bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300">WFH:{pilot.summary.daysWfh}</span>
                          <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">OT:{pilot.summary.daysOt}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: ATTENDANCE CALENDAR ────────────────────────────────────── */}
      {activeTab === 'calendar' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <style>{`
            .fc { font-family: inherit; }
            .fc-toolbar { margin-bottom: 1.5rem !important; }
            .fc-toolbar-title { font-size: 1.125rem !important; font-weight: 700 !important; color: #0f172a; }
            .dark .fc-toolbar-title { color: #f8fafc; }
            .fc-button { background-color: #f1f5f9 !important; border: 1px solid #e2e8f0 !important; color: #334155 !important; font-size: 0.75rem !important; font-weight: 600 !important; padding: 0.5rem 0.75rem !important; text-transform: capitalize !important; }
            .dark .fc-button { background-color: #1e293b !important; border: 1px solid #334155 !important; color: #cbd5e1 !important; }
            .fc-button:hover { background-color: #e2e8f0 !important; }
            .dark .fc-button:hover { background-color: #334155 !important; }
            .fc-button-active { background-color: #3b82f6 !important; color: #ffffff !important; border-color: #3b82f6 !important; }
            .fc-daygrid-day { border-color: #e2e8f0 !important; }
            .dark .fc-daygrid-day { border-color: #334155 !important; }
            .fc-daygrid-day-number { font-size: 0.75rem !important; font-weight: 600 !important; color: #64748b !important; padding: 4px 8px !important; }
            .dark .fc-daygrid-day-number { color: #94a3b8 !important; }
            .fc-col-header-cell { background-color: #f8fafc !important; border-color: #e2e8f0 !important; padding: 8px 0 !important; font-size: 11px !important; font-weight: 700 !important; text-transform: uppercase; color: #475569 !important; }
            .dark .fc-col-header-cell { background-color: #0f172a !important; border-color: #334155 !important; color: #94a3b8 !important; }
            .fc-event { border: none !important; border-radius: 6px !important; font-size: 10px !important; font-weight: 700 !important; padding: 2px 6px !important; margin: 1px 2px !important; cursor: pointer; transition: transform 0.1s ease; }
            .fc-event:hover { transform: scale(1.02); }
            .fc-event-present { background-color: rgba(16, 185, 129, 0.15) !important; color: #10b981 !important; border: 1px solid rgba(16, 185, 129, 0.3) !important; }
            .fc-event-on_field { background-color: rgba(59, 130, 246, 0.15) !important; color: #3b82f6 !important; border: 1px solid rgba(59, 130, 246, 0.3) !important; }
            .fc-event-on_leave { background-color: rgba(245, 158, 11, 0.15) !important; color: #f59e0b !important; border: 1px solid rgba(245, 158, 11, 0.3) !important; }
            .fc-event-absent { background-color: rgba(239, 68, 68, 0.15) !important; color: #ef4444 !important; border: 1px solid rgba(239, 68, 68, 0.3) !important; }
            .fc-event-half_day { background-color: rgba(168, 85, 247, 0.15) !important; color: #a855f7 !important; border: 1px solid rgba(168, 85, 247, 0.3) !important; }
            .fc-event-holiday { background-color: rgba(100, 116, 139, 0.15) !important; color: #64748b !important; border: 1px solid rgba(100, 116, 139, 0.3) !important; }
            .fc-event-off { background-color: rgba(148, 163, 184, 0.15) !important; color: #475569 !important; border: 1px solid rgba(148, 163, 184, 0.3) !important; }
            .fc-day-today { background-color: rgba(59, 130, 246, 0.08) !important; }
          `}</style>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">calendar_month</span>
                Attendance Calendar
              </h2>
              <p className="text-xs text-slate-500">Visual calendar view of pilot daily attendance records</p>
            </div>
            <div className="text-xs text-slate-400 font-medium">
              Click a cell to log/edit attendance (bulk options enabled when filtered to "All Pilots")
            </div>
          </div>
          <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
            <FullCalendar
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              events={calendarEvents}
              dateClick={handleCalendarDateClick}
              eventClick={handleCalendarEventClick}
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: ''
              }}
              height="auto"
              dayMaxEvents={3}
            />
          </div>
        </div>
      )}

      {/* ── TAB 2: LEAVES & HOLIDAYS ────────────────────────────────────── */}
      {activeTab === 'leaves' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Holidays Section (Left Column) */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500">event</span>
                  Company Holidays ({selectedYear})
                </h2>
                <p className="text-xs text-slate-500">Annual holiday calendar for pilots</p>
              </div>
              <button
                onClick={() => setHolidayModal(true)}
                className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">add</span> Add
              </button>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {holidaysData.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">No holidays configured for {selectedYear}</div>
              ) : (
                holidaysData.map(h => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{h.name}</div>
                      <div className="text-[11px] text-slate-400">{new Date(h.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {h.is_optional && <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-[10px]">Optional</span>}
                      <button onClick={() => handleDeleteHoliday(h.id)} className="text-rose-500 hover:text-rose-700 p-1">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Leave Allowances & Balances (Right Column) */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">nature_people</span>
                Pilot Leave Allowances & Balances ({selectedYear})
              </h2>
              <p className="text-xs text-slate-500">Configure annual paid leave quotas and review leaves taken</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300">
                    <th className="p-3">Pilot</th>
                    <th className="p-3 text-center">Allowed Leaves</th>
                    <th className="p-3 text-center">Casual</th>
                    <th className="p-3 text-center">Sick</th>
                    <th className="p-3 text-center">Earned</th>
                    <th className="p-3 text-center">Taken</th>
                    <th className="p-3 text-center">Remaining</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {leaveData.length === 0 ? (
                    <tr><td colSpan={8} className="p-6 text-center text-slate-400">No pilot records found</td></tr>
                  ) : (
                    leaveData.map(item => (
                      <tr key={item.pilot_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{item.name}</div>
                          <div className="text-[11px] text-slate-400">ID: {item.employee_id || 'N/A'}</div>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-800 dark:text-slate-200">{item.total_allowed_leaves}</td>
                        <td className="p-3 text-center text-slate-600">{item.casual_leave}</td>
                        <td className="p-3 text-center text-slate-600">{item.sick_leave}</td>
                        <td className="p-3 text-center text-slate-600">{item.earned_leave}</td>
                        <td className="p-3 text-center text-amber-600 font-semibold">{item.leaves_taken}</td>
                        <td className="p-3 text-center">
                          <span className={clsx(
                            "px-2.5 py-1 rounded-full font-bold text-[11px]",
                            item.leaves_remaining > 5 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          )}>
                            {item.leaves_remaining} days
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setLeaveModal(item)}
                            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-primary hover:text-white text-slate-700 dark:text-slate-300 rounded font-semibold transition-colors"
                          >
                            Edit Quota
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: SALARY & BONUS SETTINGS ──────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
          <div>
            <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">tune</span>
              Admin Salary, Bonus & Deduction Settings
            </h2>
            <p className="text-xs text-slate-500">Set base salary rates, daily field allowances (per diem), and daily salary cut rules for each pilot</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300">
                  <th className="p-3">Pilot</th>
                  <th className="p-3">Base Monthly Salary (₹)</th>
                  <th className="p-3">Field Per-Diem Bonus (₹/day)</th>
                  <th className="p-3">Unapproved Absent Cut (₹/day)</th>
                  <th className="p-3">Per Flight Bonus (₹)</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {settingsData.map(item => {
                  const isEditing = editingSettings?.pilot_id === item.pilot_id;
                  const rowData = isEditing ? editingSettings : item;

                  return (
                    <tr key={item.pilot_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{item.name}</div>
                        <div className="text-[11px] text-slate-400">ID: {item.employee_id || 'N/A'}</div>
                      </td>
                      <td className="p-3">
                        {isEditing ? (
                          <input
                            type="number"
                            value={rowData.base_monthly_salary}
                            onChange={(e) => setEditingSettings({ ...rowData, base_monthly_salary: Number(e.target.value) })}
                            className="w-28 px-2 py-1 border rounded bg-white dark:bg-slate-800 font-medium"
                          />
                        ) : (
                          <span className="font-semibold text-slate-800 dark:text-slate-200">₹{item.base_monthly_salary.toLocaleString('en-IN')}</span>
                        )}
                      </td>
                      <td className="p-3">
                        {isEditing ? (
                          <input
                            type="number"
                            value={rowData.field_per_diem_bonus}
                            onChange={(e) => setEditingSettings({ ...rowData, field_per_diem_bonus: Number(e.target.value) })}
                            className="w-24 px-2 py-1 border rounded bg-white dark:bg-slate-800 font-medium"
                          />
                        ) : (
                          <span className="text-emerald-600 font-semibold">+₹{item.field_per_diem_bonus.toLocaleString('en-IN')}</span>
                        )}
                      </td>
                      <td className="p-3">
                        {isEditing ? (
                          <input
                            type="number"
                            value={rowData.unapproved_absent_deduction}
                            onChange={(e) => setEditingSettings({ ...rowData, unapproved_absent_deduction: Number(e.target.value) })}
                            className="w-24 px-2 py-1 border rounded bg-white dark:bg-slate-800 font-medium"
                          />
                        ) : (
                          <span className="text-rose-600 font-semibold">-₹{item.unapproved_absent_deduction.toLocaleString('en-IN')}</span>
                        )}
                      </td>
                      <td className="p-3">
                        {isEditing ? (
                          <input
                            type="number"
                            value={rowData.per_flight_bonus}
                            onChange={(e) => setEditingSettings({ ...rowData, per_flight_bonus: Number(e.target.value) })}
                            className="w-24 px-2 py-1 border rounded bg-white dark:bg-slate-800 font-medium"
                          />
                        ) : (
                          <span className="text-slate-600">₹{item.per_flight_bonus.toLocaleString('en-IN')}</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleSaveSettings(editingSettings)}
                              className="px-3 py-1 bg-emerald-600 text-white rounded font-semibold hover:bg-emerald-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingSettings(null)}
                              className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingSettings({ ...item })}
                            className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-primary hover:text-white rounded font-semibold transition-colors"
                          >
                            Configure
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: MONTHLY PAYROLL & BONUS CALCULATOR ────────────────────── */}
      {activeTab === 'payroll' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-500">account_balance_wallet</span>
                Monthly Payroll Breakdown ({MONTH_NAMES[selectedMonth - 1]} {selectedYear})
              </h2>
              <p className="text-xs text-slate-500">Automatic Net Salary calculation: Base + Field Bonus + Adjustments - Absence Cut</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportPayrollCSV}
                className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">download</span> Export CSV
              </button>
              <button
                onClick={() => handleBulkSavePayroll('processed')}
                className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">check_circle</span> Process & Lock Payroll
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300">
                  <th className="p-3">Pilot</th>
                  <th className="p-3 text-center">Att. Breakdown</th>
                  <th className="p-3 text-right">Base Salary</th>
                  <th className="p-3 text-right">Field Bonus</th>
                  <th className="p-3 text-right">Custom Bonus</th>
                  <th className="p-3 text-right">Absence Cut</th>
                  <th className="p-3 text-right">Custom Cut</th>
                  <th className="p-3 text-right font-bold">Net Payout</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payrollData.records.length === 0 ? (
                  <tr><td colSpan={10} className="p-8 text-center text-slate-400">No payroll records found for this period</td></tr>
                ) : (
                  payrollData.records.map(row => {
                    const netSalary = Math.max(
                      0,
                      (Number(row.base_salary) || 0) +
                      (Number(row.field_bonus_total) || 0) +
                      (Number(row.custom_bonus) || 0) -
                      (Number(row.unpaid_absent_cut) || 0) -
                      (Number(row.custom_deduction) || 0)
                    );

                    return (
                      <tr key={row.pilot_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-3">
                          <div className="font-semibold text-slate-900 dark:text-white">{row.name}</div>
                          <div className="text-[11px] text-slate-400">ID: {row.employee_id || 'N/A'}</div>
                        </td>
                        <td className="p-3 text-center text-[11px]">
                          <div className="flex items-center justify-center gap-1 font-mono">
                            <span title="Present" className="text-emerald-600">{row.days_present}P</span> /
                            <span title="On Field" className="text-blue-600 font-bold">{row.days_on_field}F</span> /
                            <span title="On Leave" className="text-amber-600">{row.days_leave}L</span> /
                            <span title="WFH" className="text-pink-600 font-bold">{row.days_wfh || 0}WFH</span> /
                            <span title="Overtime" className="text-indigo-600 font-bold">{row.days_ot || 0}OT</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-medium">₹{row.base_salary.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-right text-blue-600 font-semibold">+₹{row.field_bonus_total.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-right text-emerald-600">
                          <input
                            type="number"
                            value={row.custom_bonus}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setPayrollData(prev => ({
                                ...prev,
                                records: prev.records.map(r => r.pilot_id === row.pilot_id ? { ...r, custom_bonus: val } : r)
                              }));
                            }}
                            className="w-20 px-1.5 py-0.5 text-right border rounded bg-white dark:bg-slate-800 text-xs font-semibold"
                          />
                        </td>
                        <td className="p-3 text-right text-rose-600 font-semibold">-₹{row.unpaid_absent_cut.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-right text-rose-600">
                          <input
                            type="number"
                            value={row.custom_deduction}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setPayrollData(prev => ({
                                ...prev,
                                records: prev.records.map(r => r.pilot_id === row.pilot_id ? { ...r, custom_deduction: val } : r)
                              }));
                            }}
                            className="w-20 px-1.5 py-0.5 text-right border rounded bg-white dark:bg-slate-800 text-xs font-semibold"
                          />
                        </td>
                        <td className="p-3 text-right font-bold text-sm text-slate-900 dark:text-emerald-400">
                          ₹{netSalary.toLocaleString('en-IN')}
                        </td>
                        <td className="p-3 text-center">
                          <span className={clsx(
                            "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            row.status === 'paid' && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
                            row.status === 'processed' && "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
                            row.status === 'draft' && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          )}>
                            {row.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleSavePayrollRow(row)}
                            className="px-3 py-1 bg-primary text-white rounded text-xs font-semibold hover:bg-primary/90"
                          >
                            Save
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL 1: SINGLE ATTENDANCE LOGGER ───────────────────────────── */}
      {singleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white">
                Log Single Attendance: {singleModal.pilot.name}
              </h3>
              <button onClick={() => setSingleModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Date:</label>
                <input type="text" disabled value={singleModal.date} className="w-full px-3 py-1.5 rounded border bg-slate-100 dark:bg-slate-800 font-mono" />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Attendance Status:</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSingleModal({ ...singleModal, status: key })}
                      className={clsx(
                        "p-2 rounded-lg border text-left font-semibold flex items-center justify-between transition-all",
                        singleModal.status === key
                          ? "ring-2 ring-primary border-primary bg-primary/5"
                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                    >
                      <span>{cfg.label}</span>
                      <span className={clsx("px-1.5 py-0.5 rounded text-[10px]", cfg.bg)}>{cfg.short}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Notes / Field Location:</label>
                <textarea
                  rows={2}
                  value={singleModal.notes}
                  onChange={(e) => setSingleModal({ ...singleModal, notes: e.target.value })}
                  placeholder="Optional site name or leave details..."
                  className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setSingleModal(null)} className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-semibold">Cancel</button>
              <button onClick={handleSaveSingleAttendance} className="px-4 py-1.5 bg-primary text-white rounded text-xs font-semibold hover:bg-primary/90">Save Attendance</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: MULTI-DAY DATE RANGE ATTENDANCE/LEAVE LOGGER ───────── */}
      {dateRangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleSaveDateRangeAttendance} className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500">date_range</span>
                Apply Multi-Day Attendance / Leave
              </h3>
              <button type="button" onClick={() => setDateRangeModal(null)} className="text-slate-400">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Select Pilot:</label>
                <select
                  value={dateRangeModal.pilot_id}
                  onChange={(e) => setDateRangeModal({ ...dateRangeModal, pilot_id: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-slate-800 font-medium"
                >
                  <option value="all"> All Pilots</option>
                  {attendanceData.pilots.map(p => (
                    <option key={p.pilot_id} value={p.pilot_id}>{p.name} ({p.employee_id || 'ID N/A'})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">Start Date:</label>
                  <input
                    type="date"
                    required
                    value={dateRangeModal.start_date}
                    onChange={(e) => setDateRangeModal({ ...dateRangeModal, start_date: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-500 mb-1">End Date:</label>
                  <input
                    type="date"
                    required
                    value={dateRangeModal.end_date}
                    onChange={(e) => setDateRangeModal({ ...dateRangeModal, end_date: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-500 mb-1">Status to Apply:</label>
                <select
                  value={dateRangeModal.status}
                  onChange={(e) => setDateRangeModal({ ...dateRangeModal, status: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-slate-800 font-bold"
                >
                  <option value="on_leave">On Leave (L)</option>
                  <option value="on_field">On Field (F)</option>
                  <option value="present">Present (P)</option>
                  <option value="wfh">WFH (WFH)</option>
                  <option value="half_day">Half Day (HD)</option>
                  <option value="holiday">Holiday (H)</option>
                  <option value="off">Weekly Off (OFF)</option>
                  <option value="ot">Overtime (OT)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-500 mb-1">Notes / Reason:</label>
                <textarea
                  rows={2}
                  value={dateRangeModal.notes}
                  onChange={(e) => setDateRangeModal({ ...dateRangeModal, notes: e.target.value })}
                  placeholder="e.g. Approved Annual Sick Leave, Site Survey Deployment"
                  className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDateRangeModal(null)} className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-semibold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 bg-primary text-white rounded text-xs font-semibold hover:bg-primary/90">Apply to Date Range</button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL 3: EDIT PILOT JOINING DATE & DETAILS ───────────────────── */}
      {pilotDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleSavePilotDetails} className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">badge</span>
                Edit Pilot Details & Joining Date
              </h3>
              <button type="button" onClick={() => setPilotDetailsModal(null)} className="text-slate-400">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Date of Joining:</label>
                <input
                  type="date"
                  value={pilotDetailsModal.joining_date}
                  onChange={(e) => setPilotDetailsModal({ ...pilotDetailsModal, joining_date: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-slate-800 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-500 mb-1">Employment Type:</label>
                <select
                  value={pilotDetailsModal.employment_type}
                  onChange={(e) => setPilotDetailsModal({ ...pilotDetailsModal, employment_type: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-slate-800"
                >
                  <option value="full_time">Full Time</option>
                  <option value="contract">Contractual</option>
                  <option value="freelance">Freelance</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-500 mb-1">Designation / Title:</label>
                <input
                  type="text"
                  placeholder="e.g. Senior Remote Pilot"
                  value={pilotDetailsModal.designation}
                  onChange={(e) => setPilotDetailsModal({ ...pilotDetailsModal, designation: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setPilotDetailsModal(null)} className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-semibold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 bg-primary text-white rounded text-xs font-semibold hover:bg-primary/90">Save Information</button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL 4: ADD HOLIDAY ────────────────────────────────────────── */}
      {holidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleAddHoliday} className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white">Add Company Holiday</h3>
              <button type="button" onClick={() => setHolidayModal(false)} className="text-slate-400">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Holiday Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Independence Day"
                  value={newHoliday.name}
                  onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-500 mb-1">Date:</label>
                <input
                  type="date"
                  required
                  value={newHoliday.date}
                  onChange={(e) => setNewHoliday({ ...newHoliday, date: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded-lg bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="optHoliday"
                  checked={newHoliday.is_optional}
                  onChange={(e) => setNewHoliday({ ...newHoliday, is_optional: e.target.checked })}
                />
                <label htmlFor="optHoliday" className="font-medium text-slate-600 dark:text-slate-300">Optional / Restricted Holiday</label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setHolidayModal(false)} className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-semibold">Cancel</button>
              <button type="submit" className="px-4 py-1.5 bg-primary text-white rounded text-xs font-semibold hover:bg-primary/90">Add Holiday</button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL 5: EDIT LEAVE QUOTA ───────────────────────────────────── */}
      {leaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white">Edit Leave Quota: {leaveModal.name}</h3>
              <button onClick={() => setLeaveModal(null)} className="text-slate-400">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-500 mb-1">Total Annual Allowed Leaves:</label>
                <input
                  type="number"
                  value={leaveModal.total_allowed_leaves}
                  onChange={(e) => setLeaveModal({ ...leaveModal, total_allowed_leaves: Number(e.target.value) })}
                  className="w-full px-3 py-1.5 border rounded-lg font-bold"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Casual</label>
                  <input
                    type="number"
                    value={leaveModal.casual_leave}
                    onChange={(e) => setLeaveModal({ ...leaveModal, casual_leave: Number(e.target.value) })}
                    className="w-full px-2 py-1 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Sick</label>
                  <input
                    type="number"
                    value={leaveModal.sick_leave}
                    onChange={(e) => setLeaveModal({ ...leaveModal, sick_leave: Number(e.target.value) })}
                    className="w-full px-2 py-1 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Earned</label>
                  <input
                    type="number"
                    value={leaveModal.earned_leave}
                    onChange={(e) => setLeaveModal({ ...leaveModal, earned_leave: Number(e.target.value) })}
                    className="w-full px-2 py-1 border rounded"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setLeaveModal(null)} className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-semibold">Cancel</button>
              <button onClick={handleSaveLeaveBalance} className="px-4 py-1.5 bg-primary text-white rounded text-xs font-semibold">Save Quota</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: BULK ATTENDANCE LOGGER ───────────────────────────── */}
      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleSaveBulkAttendance} className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">fact_check</span>
                Bulk Attendance Logger
              </h3>
              <button type="button" onClick={() => setBulkModal(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 font-semibold mb-1">Date:</label>
                <input type="text" disabled value={bulkModal.date} className="w-full px-3 py-1.5 rounded border bg-slate-100 dark:bg-slate-800 font-mono" />
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Attendance Status to Apply:</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setBulkModal({ ...bulkModal, status: key })}
                      className={clsx(
                        "p-2 rounded-lg border text-left font-semibold flex items-center justify-between transition-all",
                        bulkModal.status === key
                          ? "ring-2 ring-primary border-primary bg-primary/5"
                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      )}
                    >
                      <span>{cfg.label}</span>
                      <span className={clsx("px-1.5 py-0.5 rounded text-[10px]", cfg.bg)}>{cfg.short}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Apply to Pilots:</label>
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-2 max-h-32 overflow-y-auto space-y-1.5 bg-slate-50 dark:bg-slate-900/50">
                  {attendanceData.pilots.map(p => {
                    const isChecked = bulkModal.pilot_ids.includes(p.pilot_id);
                    return (
                      <label key={p.pilot_id} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const newIds = isChecked
                              ? bulkModal.pilot_ids.filter(id => id !== p.pilot_id)
                              : [...bulkModal.pilot_ids, p.pilot_id];
                            setBulkModal({ ...bulkModal, pilot_ids: newIds });
                          }}
                          className="rounded border-slate-300 text-primary focus:ring-primary/30"
                        />
                        <span className="font-medium text-slate-700 dark:text-slate-300">{p.name} ({p.employee_id || 'ID N/A'})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-semibold mb-1">Notes / Site Location:</label>
                <textarea
                  rows={2}
                  value={bulkModal.notes}
                  onChange={(e) => setBulkModal({ ...bulkModal, notes: e.target.value })}
                  placeholder="Optional site name or leave details..."
                  className="w-full p-2 border rounded-lg bg-white dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setBulkModal(null)} className="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-semibold">Cancel</button>
              <button type="submit" disabled={bulkModal.pilot_ids.length === 0} className="px-4 py-1.5 bg-primary text-white rounded text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">Apply Attendance</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
