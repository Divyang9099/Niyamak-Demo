import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import DashboardMap from '../../components/ui/DashboardMap';
import useAuth from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../context/SocketContext';
import { ROLES } from '../../utils/constants';
import { formatDateOnly } from '../../utils/dateUtils';
import { PageHeader } from '../../components/ui/PageHeader';
import { DashboardSkeleton } from '../../components/ui/Skeletons';
import ResourceGantt from '../../components/ui/ResourceGantt';

const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [mapProjects, setMapProjects] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [pilotGantt, setPilotGantt] = useState([]);
  const [droneGantt, setDroneGantt] = useState([]);
  const [ganttDays, setGanttDays] = useState(180);
  const [reminders, setReminders] = useState(null);
  // Dashboard's own inline project list always shows all projects;
  // KPI cards now navigate to /projects with the relevant filter applied.
  const [activeStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [alerts, setAlerts] = useState({ starting_soon: [], unallocated_confirmed: [], expiring_docs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Reminder filters — single active section chip
  const [reminderSection, setReminderSection] = useState('all'); // 'all'|'critical'|'today'|'week'|'thismonth'|'action'
  
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { socket } = useSocket();

  const { user } = useAuth();

  const isAdmin = user?.role === ROLES.ADMIN;
  const isPM = user?.role === ROLES.PROJECT_MANAGER;
  const isPilot = user?.role === ROLES.PILOT;

  const projectSummary = useMemo(() => summary?.projects || {}, [summary]);
  const pipelineSummary = useMemo(() => summary?.pipeline || {}, [summary]);

  const toNumber = (value) => Number(value || 0);

  // Compact ₹ formatter (Cr / Lakh / K) for the per-stage value inside each KPI card
  const formatINR = (value) => {
    const v = Number(value || 0);
    const trim = (n) => n.replace(/\.?0+$/, '');
    if (v >= 1e7) return `₹${trim((v / 1e7).toFixed(2))} Cr`;
    if (v >= 1e5) return `₹${trim((v / 1e5).toFixed(2))} L`;
    if (v >= 1e3) return `₹${trim((v / 1e3).toFixed(1))}K`;
    return `₹${v.toLocaleString('en-IN')}`;
  };

  const loadUtilizationData = useCallback(async (days) => {
    if (isPilot) return;
    const d = days || ganttDays;
    try {
      const [pilotRes, droneRes] = await Promise.all([
        axiosInstance.get(ENDPOINTS.DASHBOARD.PILOT_GANTT, { params: { days: d } }),
        axiosInstance.get(ENDPOINTS.DASHBOARD.DRONE_GANTT, { params: { days: d } }),
      ]);
      setPilotGantt(Array.isArray(pilotRes?.data?.data) ? pilotRes.data.data : []);
      setDroneGantt(Array.isArray(droneRes?.data?.data) ? droneRes.data.data : []);
    } catch (err) {
      console.error('Failed to load gantt data:', err);
    }
  }, [isPilot, ganttDays]);


  const kpiCards = useMemo(() => {
    if (!summary) return [];

    if (isPilot) {
      return [
        { key: 'assigned', label: 'Assigned Projects', value: toNumber(projectSummary.total),    valueAmount: toNumber(projectSummary.total_project_value), action: () => navigate('/projects?include_archived=true'), accent: 'bg-slate-100 text-slate-600', border: 'border-slate-300', icon: 'folder_open' },
        { key: 'on_going', label: 'On Going',          value: toNumber(projectSummary.on_going), valueAmount: toNumber(projectSummary.on_going_value),      action: () => navigate('/projects?status=on_going'),  accent: 'bg-amber-50 text-amber-600',  border: 'border-amber-400', icon: 'construction' },
        { key: 'overdue',  label: 'Overdue',           value: toNumber(projectSummary.overdue),  valueAmount: toNumber(projectSummary.overdue_value),       action: () => navigate('/projects?overdue=true'),     accent: 'bg-red-50 text-red-600',      border: 'border-red-400',   icon: 'warning' },
      ];
    }

    // 6 lifecycle KPIs — each also shows the summed project value for that stage
    return [
      { key: 'total',    label: 'Total Projects', value: toNumber(projectSummary.total),     valueAmount: toNumber(projectSummary.total_project_value), action: () => navigate('/projects?include_archived=true'), accent: 'bg-slate-100 text-slate-600',    border: 'border-slate-300',   icon: 'folder_open' },
      { key: 'initiate', label: 'Initiated',      value: toNumber(projectSummary.initiate),  valueAmount: toNumber(projectSummary.initiate_value),      action: () => navigate('/projects?status=initiate'),  accent: 'bg-slate-100 text-slate-600',    border: 'border-slate-300',   icon: 'flag' },
      { key: 'planned',  label: 'Planned',        value: toNumber(projectSummary.planned),   valueAmount: toNumber(projectSummary.planned_value),       action: () => navigate('/projects?status=planned'),   accent: 'bg-blue-50 text-blue-600',       border: 'border-blue-400',    icon: 'event_note' },
      { key: 'on_going', label: 'On Going',       value: toNumber(projectSummary.on_going),  valueAmount: toNumber(projectSummary.on_going_value),      action: () => navigate('/projects?status=on_going'),  accent: 'bg-amber-50 text-amber-600',     border: 'border-amber-400',   icon: 'construction' },
      { key: 'executed', label: 'Executed',       value: toNumber(projectSummary.executed),  valueAmount: toNumber(projectSummary.executed_value),      action: () => navigate('/projects?status=executed'),  accent: 'bg-violet-50 text-violet-600',   border: 'border-violet-400',  icon: 'flight_takeoff' },
      { key: 'complete', label: 'Complete',       value: toNumber(projectSummary.complete),  valueAmount: toNumber(projectSummary.complete_value),      action: () => navigate('/projects?status=complete&include_archived=true'), accent: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-400', icon: 'task_alt' },
    ];
  }, [summary, isPilot, projectSummary, pipelineSummary, navigate]);

  const loadProjects = useCallback(async (status) => {
    try {
      const params = {
        search: searchQuery,
        sort_by: sortBy,
        sort_dir: sortDir
      };
      if (status && status !== 'all' && status !== 'overdue') params.status = status;
      if (status === 'overdue') params.overdue = 'true';
      if (periodFilter) params.period = periodFilter;

      const res = await axiosInstance.get(ENDPOINTS.DASHBOARD.PROJECTS, { params });
      const list = res?.data?.data || [];
      setProjects(Array.isArray(list) ? list : []);
    } catch {
      setProjects([]);
    }
  }, [periodFilter]);

  // Map data source — independent of the search/sort/period-filtered list above.
  // The map should always plot every project (any stage, including completed and
  // archived ones) regardless of what the "All Projects" widget is currently filtered to.
  const loadMapProjects = useCallback(async () => {
    try {
      const res = await axiosInstance.get(ENDPOINTS.DASHBOARD.PROJECTS, {
        params: { include_archived: 'true', limit: 100 },
      });
      const list = res?.data?.data || [];
      setMapProjects(Array.isArray(list) ? list : []);
    } catch {
      setMapProjects([]);
    }
  }, []);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError('');

      try {
        const requests = [
          axiosInstance.get(ENDPOINTS.DASHBOARD.SUMMARY),
          axiosInstance.get(ENDPOINTS.DASHBOARD.REMINDERS),
          axiosInstance.get(ENDPOINTS.DASHBOARD.UPCOMING),
          axiosInstance.get(ENDPOINTS.DASHBOARD.ALERTS)
        ];

        if (!isPilot) {
          requests.push(axiosInstance.get(ENDPOINTS.DASHBOARD.PILOT_GANTT, { params: { days: ganttDays } }));
          requests.push(axiosInstance.get(ENDPOINTS.DASHBOARD.DRONE_GANTT, { params: { days: ganttDays } }));
        }

        const [summaryRes, remindersRes, upcomingRes, alertsRes, pilotGanttRes, droneGanttRes] = await Promise.all(requests);

        setSummary(summaryRes?.data?.data || null);
        setReminders(remindersRes?.data?.data || null);
        setUpcoming(Array.isArray(upcomingRes?.data?.data) ? upcomingRes.data.data : []);
        setAlerts(alertsRes?.data?.data || { starting_soon: [], unallocated_confirmed: [], expiring_docs: [] });
        setPilotGantt(Array.isArray(pilotGanttRes?.data?.data) ? pilotGanttRes.data.data : []);
        setDroneGantt(Array.isArray(droneGanttRes?.data?.data) ? droneGanttRes.data.data : []);

        // Projects are loaded by the effect below once `summary` is set — calling
        // loadProjects() here too would fetch the list (and its project detail) twice.
      } catch (err) {
        setError(err?.response?.data?.message || 'Unable to load dashboard data right now.');
      } finally {
        setLoading(false);
      }
    };

    if (user?.role) {
      loadDashboard();
    }
  }, [isPilot, user?.role, loadProjects]);

  useEffect(() => {
    if (!summary) return;
    loadProjects(activeStatusFilter);
  }, [activeStatusFilter, periodFilter, summary, loadProjects, searchQuery, sortBy, sortDir]);

  useEffect(() => {
    if (!summary) return;
    loadMapProjects();
  }, [summary, loadMapProjects]);

  // Reload gantt when day-range toggle changes
  useEffect(() => {
    if (!isPilot) loadUtilizationData(ganttDays);
  }, [ganttDays]);

  // Socket: refresh summary + projects whenever a project mutates
  useEffect(() => {
    if (!socket) return;

    const refreshSummary = () => {
      axiosInstance.get(ENDPOINTS.DASHBOARD.SUMMARY)
        .then(r => setSummary(r?.data?.data || null))
        .catch(() => {});
    };
    const refreshAlerts = () => {
      axiosInstance.get(ENDPOINTS.DASHBOARD.ALERTS)
        .then(r => setAlerts(r?.data?.data || { starting_soon: [], unallocated_confirmed: [], expiring_docs: [] }))
        .catch(() => {});
    };
    const refreshReminders = () => {
      axiosInstance.get(ENDPOINTS.DASHBOARD.REMINDERS)
        .then(r => setReminders(r?.data?.data || null))
        .catch(() => {});
    };

    const onProjectMutation = () => {
      refreshSummary();
      loadProjects(activeStatusFilter);
      loadMapProjects();
      refreshAlerts();
      refreshReminders();
      loadUtilizationData();
    };

    socket.on('project:created',        onProjectMutation);
    socket.on('project:updated',        onProjectMutation);
    socket.on('project:status_changed', onProjectMutation);
    socket.on('project:deleted',        onProjectMutation);
    socket.on('allocation:created',     onProjectMutation);
    socket.on('allocation:deleted',     onProjectMutation);

    return () => {
      socket.off('project:created',        onProjectMutation);
      socket.off('project:updated',        onProjectMutation);
      socket.off('project:status_changed', onProjectMutation);
      socket.off('project:deleted',        onProjectMutation);
      socket.off('allocation:created',     onProjectMutation);
      socket.off('allocation:deleted',     onProjectMutation);
    };
  }, [socket, loadProjects, loadMapProjects, activeStatusFilter, loadUtilizationData]);

  const roleSubtitle = isAdmin
    ? 'Operational Command'
    : isPM
      ? 'Project Control'
      : 'Flight Operations';

  const roleTitle = isAdmin
    ? 'Global System Overview'
    : isPM
      ? 'My Team Dashboard'
      : 'My Assignments Dashboard';

  const projectListTitle = isAdmin ? 'All Projects' : isPM ? 'My Projects' : 'Assigned Projects';

  const handleExportData = async () => {
    try {
      const response = await axiosInstance.get(ENDPOINTS.DASHBOARD.EXPORT, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Varuna_Global_Data_Projects_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      showToast("Failed to export global data.", "error");
    }
  };

  // PRD §12.1 — Resource Utilization Report (CSV)
  const handleExportUtilization = () => {
    if (!pilotGantt.length) return showToast('No pilot data to export', 'error');
    const headers = ['Pilot Name', 'Allocations', 'Project Names'];
    const rows = pilotGantt.map(u => [
      `"${(u.pilot_name || 'Unknown').replace(/"/g, '""')}"`,
      u.allocations?.length ?? 0,
      `"${(u.allocations || []).map(a => a.project_name).join('; ').replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Varuna_Pilot_Schedule_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  };

  // PRD §12.1 — Pipeline Value Report (CSV)
  const handleExportPipelineReport = async () => {
    try {
      const r = await axiosInstance.get(ENDPOINTS.PIPELINE.GET_ALL, { params: { limit: 500 } });
      const items = Array.isArray(r.data.data) ? r.data.data : [];
      if (!items.length) return showToast('No pipeline data to export', 'error');
      const headers = ['Name', 'Client', 'Type', 'Stage', 'Win %', 'Est. Value (INR)', 'Est. Start', 'Est. End', 'State'];
      const rows = items.map(p => [
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.client_name || '').replace(/"/g, '""')}"`,
        p.project_type || '',
        p.stage || '',
        p.win_probability ?? '',
        p.estimated_value ?? '',
        p.estimated_start || '',
        p.estimated_end || '',
        `"${(p.state || '').replace(/"/g, '""')}"`,
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Varuna_Pipeline_Report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Failed to export pipeline report', 'error');
    }
  };

  // Helper: status → chip classes (new lifecycle)
  const statusChip = (status = '') => {
    const map = {
      initiate:  'bg-slate-100 text-slate-600 ring-slate-200',
      planned:   'bg-blue-50 text-blue-700 ring-blue-200',
      on_going:  'bg-amber-50 text-amber-700 ring-amber-200',
      executed:  'bg-violet-50 text-violet-700 ring-violet-200',
      complete:  'bg-emerald-50 text-emerald-700 ring-emerald-200',
      cancelled: 'bg-red-50 text-red-700 ring-red-200',
    };
    return `ring-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${map[status] || 'bg-slate-100 text-slate-600 ring-slate-200'}`;
  };

  return (
    <div className="space-y-7 animate-in fade-in duration-300">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow={roleSubtitle}
        title={roleTitle}
        actions={
          <div className="flex flex-wrap gap-2 justify-end">
            {!isPilot && (
              <button
                onClick={() => setPeriodFilter(p => p === '24h' ? '' : '24h')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  periodFilter === '24h'
                    ? 'bg-primary text-on-primary border-primary shadow-sm'
                    : 'bg-surface text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className="material-symbols-outlined text-sm leading-none">schedule</span>
                Last 24 h
              </button>
            )}
            {isAdmin && (
              <>
                <button onClick={handleExportUtilization} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-surface text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all">
                  <span className="material-symbols-outlined text-sm leading-none">person</span>
                  Util CSV
                </button>
                <button onClick={handleExportPipelineReport} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-surface text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all">
                  <span className="material-symbols-outlined text-sm leading-none">bar_chart</span>
                  Pipeline CSV
                </button>
                <button onClick={handleExportData} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-primary text-on-primary border border-primary hover:brightness-105 transition-all shadow-sm">
                  <span className="material-symbols-outlined text-sm leading-none">file_download</span>
                  Export All
                </button>
              </>
            )}
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <span className="material-symbols-outlined text-base shrink-0">error</span>
          {error}
        </div>
      )}

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
        {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {kpiCards.map((card) => (
            <button
              key={card.key}
              onClick={() => card.action?.()}
              className={`group relative text-left bg-surface rounded-xl p-4 md:p-5 border-2 ${card.border || 'border-slate-200'} hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden`}
            >
              <div className={`absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center ${card.accent || 'bg-slate-100 text-slate-500'}`}>
                <span className="material-symbols-outlined text-[18px] leading-none">{card.icon}</span>
              </div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2 pr-10 leading-tight">{card.label}</p>
              <div className="flex items-end justify-between gap-1">
                <p className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-none">{card.value}</p>
                {isAdmin && card.valueAmount != null && (
                  <p className="text-xs md:text-sm font-bold text-emerald-600 leading-none whitespace-nowrap pb-0.5">{formatINR(card.valueAmount)}</p>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* ── Alert Strip ────────────────────────────────────────────────────── */}
        {!isPilot && (alerts.starting_soon?.length > 0 || alerts.unallocated_confirmed?.length > 0 || alerts.expiring_docs?.length > 0) && (
          <div className="flex flex-col gap-2">
            {alerts.starting_soon?.length > 0 && (
              <button
                onClick={() => navigate('/projects')}
                className="w-full flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 hover:bg-blue-100 hover:border-blue-300 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-blue-500 shrink-0">schedule</span>
                  <p className="text-sm text-blue-800">
                    <span className="font-bold">{alerts.starting_soon.length} project{alerts.starting_soon.length > 1 ? 's' : ''}</span> starting within the next 7 days.
                  </p>
                </div>
                <span className="material-symbols-outlined text-blue-400 text-base shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
              </button>
            )}
            {alerts.unallocated_confirmed?.length > 0 && (
              <button
                onClick={() => navigate('/projects?status=planned')}
                className="w-full flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 hover:border-amber-300 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-amber-500 shrink-0">warning</span>
                  <p className="text-sm text-amber-800">
                    <span className="font-bold">{alerts.unallocated_confirmed.length} planned project{alerts.unallocated_confirmed.length > 1 ? 's' : ''}</span> have no resources allocated.
                  </p>
                </div>
                <span className="material-symbols-outlined text-amber-400 text-base shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
              </button>
            )}
            {alerts.expiring_docs?.length > 0 && (
              <button
                onClick={() => navigate('/library')}
                className="w-full flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 hover:bg-red-100 hover:border-red-300 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-red-500 shrink-0">description</span>
                  <p className="text-sm text-red-800">
                    <span className="font-bold">{alerts.expiring_docs.length} library document{alerts.expiring_docs.length > 1 ? 's' : ''}</span> are expiring within 30 days.
                  </p>
                </div>
                <span className="material-symbols-outlined text-red-400 text-base shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
              </button>
            )}
          </div>
        )}

        {/* ── Map + Action Centre — side-by-side on lg+ ──────────────────── */}
        <div className={`grid gap-5 ${!isPilot ? 'lg:grid-cols-[3fr_2fr]' : ''}`}>

          {/* Map — LEFT */}
          <div style={{ isolation: 'isolate' }} className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
            <div className={`w-full relative ${!isPilot ? 'h-[300px] lg:h-[520px]' : 'h-[240px] md:h-[300px]'}`}>
              <DashboardMap projects={mapProjects} />
              <div className="absolute bottom-4 left-4 z-[400] pointer-events-none flex flex-col gap-2 items-start">
                <div className="bg-surface/90 backdrop-blur-sm px-3 py-1.5 border border-slate-200 rounded-full flex items-center gap-2 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <p className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">Live Asset Feed: Connected</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Action Centre — RIGHT (admin/PM only) ──────────────────────── */}
          {!isPilot && reminders && (
            <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:h-[520px]">
              {/* Header — fixed, does not scroll */}
              <div className="px-4 py-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-red-500 text-lg">notifications_active</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Action Centre</p>
                      <h3 className="text-sm font-bold text-slate-900 truncate">Reminders &amp; Conflicts</h3>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${reminders.total > 0 ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                    {reminders.total} item{reminders.total === 1 ? '' : 's'}
                  </span>
                </div>

                {/* Section filter chips — horizontal scroll */}
                <div className="flex items-center gap-1.5 mt-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
                  {[
                    { key: 'all',       label: 'All',        icon: 'list',           active: 'bg-slate-800 text-white border-slate-800',     idle: 'bg-surface text-slate-500 border-slate-200 hover:bg-slate-50' },
                    { key: 'today',     label: 'Today',      icon: 'today',          active: 'bg-amber-500 text-white border-amber-500',     idle: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
                    { key: 'critical',  label: 'Critical',   icon: 'crisis_alert',   active: 'bg-red-500 text-white border-red-500',         idle: 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' },
                    { key: 'week',      label: 'Week',        icon: 'date_range',     active: 'bg-amber-600 text-white border-amber-600',     idle: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
                    { key: 'thismonth', label: 'Month',       icon: 'calendar_month', active: 'bg-blue-500 text-white border-blue-500',       idle: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100' },
                    { key: 'action',    label: 'Action',      icon: 'checklist',      active: 'bg-violet-500 text-white border-violet-500',   idle: 'bg-violet-50 text-violet-600 border-violet-200 hover:bg-violet-100' },
                  ].map(chip => (
                    <button
                      key={chip.key}
                      onClick={() => setReminderSection(chip.key)}
                      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold border transition-all whitespace-nowrap ${
                        reminderSection === chip.key ? chip.active : chip.idle
                      }`}
                    >
                      <span className="material-symbols-outlined text-[12px] leading-none" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400" }}>{chip.icon}</span>
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto">
                {reminders.total === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-300">
                    <span className="material-symbols-outlined text-4xl text-emerald-300">check_circle</span>
                    <p className="text-sm text-slate-400">All clear — nothing needs attention</p>
                  </div>
                ) : (() => {
                  const allSections = [
                    {
                      section: 'Critical',
                      sectionKey: 'critical',
                      sectionIcon: 'crisis_alert',
                      sectionColor: 'text-red-500',
                      groups: [
                        { key: 'overdue',           title: 'Overdue Projects',         icon: 'event_busy',    tone: 'red',   timeScope: 'critical', items: reminders.overdue,              render: (p) => `${p.name} · due ${formatDateOnly(p.end_date)}`,                                      onClick: (p) => navigate(`/projects/${p.id}`) },
                        { key: 'needs_attention',   title: 'Needs Attention',          icon: 'priority_high', tone: 'red',   timeScope: 'critical', items: reminders.needs_attention,      render: (p) => `${p.name} · incomplete details`,                                                    onClick: (p) => navigate(`/projects/${p.id}`) },
                        { key: 'drone_maintenance', title: 'Drone Maintenance Due',    icon: 'build',         tone: 'red',   timeScope: 'critical', items: reminders.drone_maintenance,    render: (d) => `${d.drone_name || d.serial_number} · due ${formatDateOnly(d.next_maintenance)}`,    onClick: () => navigate('/resources/drones') },
                        { key: 'conflicts',         title: 'Allocation Conflicts',     icon: 'warning',       tone: 'red',   timeScope: 'critical', items: reminders.conflicts,            render: (c) => `${c.project_name} · ${(c.conflict_type || '').replace(/_/g,' ')}`,                  onClick: (c) => navigate(`/projects/${c.project_id}`) },
                        { key: 'overscheduled',     title: 'Over-Scheduled Resources', icon: 'group_off',     tone: 'red',   timeScope: 'critical', items: reminders.overscheduled,        render: (o) => `${o.pilot_name || o.drone_serial || 'Resource'} · ${o.project_a} ↔ ${o.project_b}`, onClick: () => navigate('/resources/allocations') },
                        { key: 'pipeline_overdue',  title: 'Pipeline Leads Overdue',   icon: 'trending_up',   tone: 'red',   timeScope: 'critical', items: reminders.pipeline_overdue,     render: (l) => `${l.name} · est. end ${formatDateOnly(l.estimated_end)}`,                          onClick: () => navigate('/pipeline') },
                      ],
                    },
                    {
                      section: 'This Week',
                      sectionKey: 'thisweek',
                      sectionIcon: 'calendar_today',
                      sectionColor: 'text-amber-500',
                      groups: [
                        { key: 'starting_today',      title: 'Starting Today',                 icon: 'today',          tone: 'amber', timeScope: 'today', items: reminders.starting_today,       render: (p) => `${p.name} · ${p.client_name || ''}`,                                               onClick: (p) => navigate(`/projects/${p.id}`) },
                        { key: 'starting_week',       title: 'Starting This Week',             icon: 'date_range',     tone: 'amber', timeScope: 'week',  items: reminders.starting_week,        render: (p) => `${p.name} · ${formatDateOnly(p.start_date)}`,                                       onClick: (p) => navigate(`/projects/${p.id}`) },
                        { key: 'ending_week',         title: 'Deadlines This Week',            icon: 'event_upcoming', tone: 'amber', timeScope: 'week',  items: reminders.ending_week,          render: (p) => `${p.name} · ends ${formatDateOnly(p.end_date)}`,                                    onClick: (p) => navigate(`/projects/${p.id}`) },
                        { key: 'pipeline_this_week',  title: 'Pipeline Starting Soon',         icon: 'trending_up',    tone: 'amber', timeScope: 'week',  items: reminders.pipeline_this_week,   render: (l) => `${l.name} · ${l.stage?.replace(/_/g,' ')} · ${formatDateOnly(l.estimated_start)}`, onClick: () => navigate('/pipeline') },
                        { key: 'deliverables_pending',title: 'Deliverables Awaiting Approval', icon: 'task_alt',       tone: 'amber', timeScope: 'week',  items: reminders.deliverables_pending, render: (d) => `${d.name} · ${d.project_name}`,                                                    onClick: (d) => navigate(`/projects/${d.project_id}`) },
                      ],
                    },
                    {
                      section: 'This Month',
                      sectionKey: 'thismonth',
                      sectionIcon: 'calendar_month',
                      sectionColor: 'text-blue-500',
                      groups: [
                        { key: 'ending_month',           title: 'Deadlines This Month',     icon: 'event',  tone: 'blue', timeScope: 'month', items: reminders.ending_month,           render: (p)  => `${p.name} · ends ${formatDateOnly(p.end_date)}`,                                     onClick: (p)  => navigate(`/projects/${p.id}`) },
                        { key: 'pilot_license_expiry',   title: 'Pilot Licence Expiring',   icon: 'badge',  tone: 'blue', timeScope: 'month', items: reminders.pilot_license_expiry,   render: (pl) => `${pl.name} · expires ${formatDateOnly(pl.license_expiry)}`,                       onClick: ()   => navigate('/resources/pilots') },
                        { key: 'drone_insurance_expiry', title: 'Drone Insurance Expiring', icon: 'shield', tone: 'blue', timeScope: 'month', items: reminders.drone_insurance_expiry, render: (d)  => `${d.drone_name || d.serial_number} · expires ${formatDateOnly(d.insurance_expiry)}`, onClick: () => navigate('/resources/drones') },
                      ],
                    },
                    {
                      section: 'Action Required',
                      sectionKey: 'action',
                      sectionIcon: 'checklist',
                      sectionColor: 'text-violet-500',
                      groups: [
                        { key: 'unallocated', title: 'Unallocated Projects', icon: 'person_off', tone: 'violet', timeScope: 'action', items: reminders.unallocated, render: (p) => `${p.name} · ${p.client_name || ''} · no resources assigned`, onClick: (p) => navigate(`/projects/${p.id}`) },
                      ],
                    },
                  ];

                  const filteredSections = allSections
                    .map(sec => {
                      let groups = sec.groups.filter(g => g.items && g.items.length > 0);
                      if (reminderSection === 'today') {
                        groups = groups.filter(g => g.timeScope === 'today');
                      } else if (reminderSection === 'critical') {
                        if (sec.sectionKey !== 'critical') groups = [];
                      } else if (reminderSection === 'week') {
                        groups = groups.filter(g => ['today', 'week'].includes(g.timeScope));
                      } else if (reminderSection === 'thismonth') {
                        if (sec.sectionKey !== 'thismonth') groups = [];
                      } else if (reminderSection === 'action') {
                        if (sec.sectionKey !== 'action') groups = [];
                      }
                      return { ...sec, groups };
                    })
                    .filter(sec => sec.groups.length > 0);

                  const toneMap = {
                    red:    'bg-red-50 border-red-200 text-red-700',
                    amber:  'bg-amber-50 border-amber-200 text-amber-700',
                    blue:   'bg-blue-50 border-blue-200 text-blue-700',
                    violet: 'bg-violet-50 border-violet-200 text-violet-700',
                  };

                  if (filteredSections.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-300">
                        <span className="material-symbols-outlined text-4xl">filter_alt</span>
                        <p className="text-sm text-slate-400">No reminders match this filter</p>
                      </div>
                    );
                  }

                  return (
                    <div className="p-4 space-y-4">
                      {filteredSections.map(({ section, sectionIcon, sectionColor, groups }) => (
                        <div key={section}>
                          <div className={`flex items-center gap-1.5 mb-2 ${sectionColor}`}>
                            <span className="material-symbols-outlined text-sm">{sectionIcon}</span>
                            <span className="text-[10px] font-black uppercase tracking-widest">{section}</span>
                            <div className="flex-1 h-px bg-current opacity-20 ml-1" />
                          </div>
                          <div className="grid grid-cols-1 gap-2">
                            {groups.map((g) => (
                              <div key={g.key} className="rounded-xl border border-slate-200 overflow-hidden">
                                <div className={`flex items-center justify-between px-3 py-2 border-b ${toneMap[g.tone]}`}>
                                  <div className="flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-sm">{g.icon}</span>
                                    <span className="text-[11px] font-bold uppercase tracking-wider">{g.title}</span>
                                  </div>
                                  <span className="text-[11px] font-black">{g.items.length}</span>
                                </div>
                                <div className="divide-y divide-slate-50 max-h-32 overflow-y-auto">
                                  {g.items.slice(0, 8).map((it, i) => (
                                    <button key={it.id || i} onClick={() => g.onClick(it)}
                                      className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors truncate">
                                      {g.render(it)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
             MAIN SECTIONS  —  full-width stacked sections
             1. ALL PROJECTS   — full-width card
             2. PROJECT DETAIL — full-width card (context panel)
             + DRONE UTILIZATION / UPCOMING below
        ══════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col gap-6">

          {/* ══ SECTION 1 — ALL PROJECTS (full-width) ══════════════════════════ */}
          <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Header */}
            <div className="px-6 pt-5 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Portfolio</p>
                <h3 className="text-lg font-bold text-slate-900">{projectListTitle}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:flex-none">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
                  <input
                    type="text"
                    placeholder="Search projects, clients…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all w-full sm:w-56"
                  />
                </div>
                <select
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="created_at">Latest first</option>
                  <option value="name">Name A–Z</option>
                  <option value="status">Status</option>
                  <option value="start_date">Start date</option>
                  <option value="end_date">Deadline</option>
                </select>
                <button
                  onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm leading-none">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                </button>
                <button
                  onClick={() => navigate('/projects')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-xl hover:brightness-105 transition-all"
                >
                  View all <span className="material-symbols-outlined text-sm leading-none">arrow_forward</span>
                </button>
              </div>
            </div>

            {/* Project rows */}
            {projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-300">
                <span className="material-symbols-outlined text-4xl">folder_off</span>
                <p className="text-sm font-medium">No projects found</p>
              </div>
            ) : (
              <div>
                {/* Table header — hidden on mobile */}
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-2 bg-slate-50/80 border-b border-slate-100 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  <div className="col-span-5">Project</div>
                  <div className="col-span-2">Client</div>
                  <div className="col-span-2">Type</div>
                  <div className="col-span-1">Start</div>
                  <div className="col-span-2 text-right">Status</div>
                </div>
                <div className="divide-y divide-slate-50">
                  {projects.map((proj) => {
                    const typeIcon = { solar_pv: 'solar_power', wind: 'wind_power', td_lines: 'electric_bolt', tower: 'cell_tower', pipeline: 'valve' }[proj.project_type] || 'folder';
                    return (
                      <button
                        key={proj.id}
                        onClick={() => navigate(`/projects/${proj.id}`)}
                        className="w-full flex flex-col gap-1 px-4 py-3.5 md:grid md:grid-cols-12 md:gap-4 md:px-6 md:py-4 text-left hover:bg-slate-50 transition-all group md:items-center border-l-4 border-transparent"
                      >
                        {/* Name */}
                        <div className="flex items-center gap-3 min-w-0 md:col-span-5">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors bg-slate-100 text-slate-400 group-hover:bg-slate-200">
                            <span className="material-symbols-outlined text-base">{typeIcon}</span>
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-bold truncate block text-slate-900">{proj.name || 'Untitled'}</span>
                            {/* Mobile-only: client + status inline */}
                            <span className="md:hidden text-[10px] text-slate-400 truncate">{proj.client_name || '—'}</span>
                          </div>
                          <span className="md:hidden ml-auto shrink-0">
                            <span className={statusChip(proj.status)}>{(proj.status || '—').replace(/_/g, ' ')}</span>
                          </span>
                        </div>
                        {/* Client */}
                        <div className="hidden md:block md:col-span-2 text-xs text-slate-500 truncate">{proj.client_name || '—'}</div>
                        {/* Type */}
                        <div className="hidden md:block md:col-span-2 text-xs text-slate-600 capitalize truncate">{(proj.project_type || '—').replace(/_/g, ' ')}</div>
                        {/* Start date */}
                        <div className="hidden md:block md:col-span-1 text-xs text-slate-500">
                          {proj.start_date ? formatDateOnly(proj.start_date) : '—'}
                        </div>
                        {/* Status — desktop only */}
                        <div className="hidden md:flex md:col-span-2 justify-end">
                          <span className={statusChip(proj.status)}>{(proj.status || '—').replace(/_/g, ' ')}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ══ RESOURCE GANTT CHARTS ═══════════════════════════ */}
          <div className="space-y-4">

            {/* Shared day-range controls */}
            {(isAdmin || isPM) && (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  {[30, 60, 90, 180].map(d => (
                    <button
                      key={d}
                      onClick={() => setGanttDays(d)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                        ganttDays === d
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-surface text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-500"></span>Project</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-300 border border-dashed border-red-900/30"></span>Leave</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-violet-300"></span>Expo</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-300"></span>Training</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200"></span>Maint.</span>
                </div>
              </div>
            )}

            {/* Drone Gantt */}
            {(isAdmin || isPM) && (
              <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Fleet</p>
                    <h3 className="text-sm font-bold text-slate-900">Drone Schedule</h3>
                  </div>
                  <span className="material-symbols-outlined text-slate-300 text-xl">flight</span>
                </div>
                <div className="overflow-hidden">
                  <ResourceGantt
                    rows={droneGantt}
                    loading={loading}
                    days={ganttDays}
                    emptyIcon="flight"
                    emptyText="No drones allocated"
                  />
                </div>
              </div>
            )}

            {/* Pilot Gantt */}
            {!isPilot ? (
              <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Resources</p>
                    <h3 className="text-sm font-bold text-slate-900">Pilot Schedule</h3>
                  </div>
                  <span className="material-symbols-outlined text-slate-300 text-xl">person</span>
                </div>
                <div className="overflow-hidden">
                  <ResourceGantt
                    rows={pilotGantt}
                    loading={loading}
                    days={ganttDays}
                    emptyIcon="people"
                    emptyText="No pilots allocated"
                  />
                </div>
              </div>
            ) : (
              // Pilot summary card for pilot role (remains as is)
              <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <h3 className="text-base font-bold text-slate-900">My Assignments</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Total Assigned', value: toNumber(projectSummary.total),       icon: 'folder_open',  color: 'text-primary',  bg: 'bg-primary/8' },
                    { label: 'On Going',       value: toNumber(projectSummary.on_going), icon: 'construction', color: 'text-amber-600',bg: 'bg-amber-50' },
                  ].map(({ label, value, icon, color, bg }) => (
                    <div key={label} className={`flex items-center gap-3 rounded-2xl px-5 py-4 ${bg}`}>
                      <span className={`material-symbols-outlined text-2xl ${color}`}>{icon}</span>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                        <p className="text-3xl font-black text-slate-900 leading-none">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* ══ UPCOMING PROJECTS — full-width horizontal scroll ════════════════ */}
          <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Schedule</p>
                <h3 className="text-base font-bold text-slate-900">{isPilot ? 'Upcoming Flights' : 'Upcoming Projects'}</h3>
              </div>
              <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1 rounded-full">next 30 days</span>
            </div>

            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-300">
                <span className="material-symbols-outlined text-4xl">event_available</span>
                <p className="text-sm">No upcoming projects in the next 30 days</p>
              </div>
            ) : (
              <div className="flex gap-4 overflow-x-auto custom-scrollbar px-6 py-5 pb-6">
                {upcoming.map((item, idx) => {
                  const d = item.start_date ? new Date(item.start_date) : null;
                  const month = d ? d.toLocaleString('default', { month: 'short' }).toUpperCase() : '—';
                  const day   = d ? d.getDate() : '';
                  const daysFromNow = d ? Math.ceil((d - new Date()) / 86400000) : null;
                  return (
                    <div
                      key={item.id || idx}
                      onClick={() => item.id && navigate(`/projects/${item.id}`)}
                      className="shrink-0 w-52 bg-slate-50 hover:bg-primary/5 border border-slate-200 hover:border-primary/30 rounded-2xl p-4 transition-all group"
                      style={{ cursor: item.id ? 'pointer' : 'default' }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-12 h-12 rounded-xl bg-surface border border-slate-200 flex flex-col items-center justify-center shadow-sm group-hover:border-primary/30 group-hover:bg-primary/5 transition-all">
                          <span className="text-[9px] font-black text-primary uppercase leading-none">{month}</span>
                          <span className="text-xl font-black text-slate-900 leading-tight">{day}</span>
                        </div>
                        {daysFromNow !== null && (
                          <span className={`text-[9px] font-bold px-2 py-1 rounded-full ${daysFromNow <= 3 ? 'bg-red-50 text-red-600 border border-red-200' : daysFromNow <= 7 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-surface text-slate-500 border border-slate-200'}`}>
                            {daysFromNow === 0 ? 'Today' : daysFromNow === 1 ? 'Tomorrow' : `${daysFromNow}d`}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-slate-900 truncate mb-1">{item.name || 'Project'}</p>
                      <p className="text-[10px] text-slate-400 truncate mb-2.5">{item.client_name || 'Client'}</p>
                      <span className={statusChip(item.status)}>{(item.status || '').replace(/_/g, ' ')}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>  {/* end outer flex column */}
        </>
      )}
    </div>
  );

};

export default Dashboard;
