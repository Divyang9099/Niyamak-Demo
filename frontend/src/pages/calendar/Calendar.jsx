import { useEffect, useRef, useState, useMemo } from 'react';
import useScrollLock from '../../hooks/useScrollLock';
import { createPortal } from 'react-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { CalendarSkeleton } from '../../components/ui/Skeletons';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import { useSocket } from '../../context/SocketContext';
import { formatDateOnly } from '../../utils/helpers';
import QuarterView from '../../components/calendar/QuarterView';

// Add N days to a "YYYY-MM-DD" string and return "YYYY-MM-DD" (timezone-safe).
// FullCalendar treats an all-day event's `end` as EXCLUSIVE, so an inclusive DB
// range [start..end] must be passed to FC as end+1 to render the final day.
const addDaysYmd = (ymd, n) => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const toYmd = (s) => (s ? String(s).slice(0, 10) : null);

// ─── Event category colors ────────────────────────────────────
const CATEGORY_COLORS = {
  project:     { bg: '#3b82f6', text: '#fff', border: 'solid' },  
  pipeline:    { bg: '#a855f7', text: '#fff', border: 'dotted' }, 
  meeting:     { bg: '#f59e0b', text: '#000' },  
  maintenance: { bg: '#ef4444', text: '#fff' },  
  leave:       { bg: '#6b7280', text: '#fff' },  
  deadline:    { bg: '#f97316', text: '#fff' },  
  other:       { bg: '#10b981', text: '#fff' },  
};

const FC_STYLES = `
  .fc { font-family: 'Space Grotesk', sans-serif; }
  .fc-theme-standard td, .fc-theme-standard th { border-color: rgb(var(--sl-200)); }
  .fc-daygrid-day { background: rgb(var(--c-surface)); }
  .fc-daygrid-day:hover { background: rgb(var(--c-surface-low)); }
  .fc-daygrid-day-number { color: rgb(var(--sl-500)); font-size: 11px; font-weight: 600; padding: 6px; }
  .fc-col-header-cell { background: rgb(var(--c-surface-low)); }
  .fc-col-header-cell-cushion { color: rgb(var(--sl-500)); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; padding: 10px 6px; text-decoration: none !important; }
  .fc-daygrid-day.fc-day-today { background: rgb(var(--c-primary) / 0.08) !important; }
  .fc-event { border: none !important; border-radius: 6px; font-size: 10px; font-weight: 600; padding: 2px 6px; cursor: pointer; transition: transform 0.1s; position: relative; }
  .fc-event:hover { transform: scale(1.02); z-index: 10; }

  /* ── 6 block-type stylings per PRD §6.4 ──────────────────────── */
  /* 1. Confirmed Project — solid indigo */
  .fc-event-project { background: rgb(var(--c-primary)) !important; color: rgb(var(--c-on-primary)) !important; }

  /* 2. Pipeline / Probable — dashed border, light purple fill, dark italic text.
     FullCalendar paints the title via .fc-event-main (color: var(--fc-event-text-color),
     default #fff), so the inner elements must be forced dark or the text is invisible. */
  .fc-event-pipeline {
    background: rgba(168,85,247,0.20) !important;
    border: 2px dashed #a855f7 !important;
    font-style: italic !important;
    font-weight: 700 !important;
    --fc-event-text-color: #6d28d9;
  }
  .fc-event-pipeline,
  .fc-event-pipeline .fc-event-main,
  .fc-event-pipeline .fc-event-main-frame,
  .fc-event-pipeline .fc-event-title,
  .fc-event-pipeline .fc-event-title-container,
  .fc-event-pipeline .fc-event-time {
    color: #6d28d9 !important;
  }

  /* 3. Exhibition / Expo — orange + EX badge */
  .fc-event-exhibition { background: #F97316 !important; color: #ffffff !important; padding-left: 22px !important; }
  .fc-event-exhibition::before {
    content: 'EX'; position: absolute; left: 4px; top: 50%; transform: translateY(-50%);
    background: rgba(255,255,255,0.25); color: #fff; font-size: 8px; font-weight: 900;
    padding: 1px 3px; border-radius: 3px; letter-spacing: 0.05em;
  }

  /* 4. Training / Certification — teal + TR badge */
  .fc-event-training { background: #14B8A6 !important; color: #ffffff !important; padding-left: 22px !important; }
  .fc-event-training::before {
    content: 'TR'; position: absolute; left: 4px; top: 50%; transform: translateY(-50%);
    background: rgba(255,255,255,0.25); color: #fff; font-size: 8px; font-weight: 900;
    padding: 1px 3px; border-radius: 3px; letter-spacing: 0.05em;
  }

  /* 5. Equipment Maintenance — gray + wrench */
  .fc-event-maintenance { background: #64748B !important; color: #ffffff !important; padding-left: 20px !important; }
  .fc-event-maintenance::before {
    content: '🔧'; position: absolute; left: 4px; top: 50%; transform: translateY(-50%);
    font-size: 10px;
  }

  /* 6. Leave / Unavailability — striped pattern, red border, dark red text */
  .fc-event-leave {
    background-image: repeating-linear-gradient(45deg, #FEE2E2, #FEE2E2 5px, #FECACA 5px, #FECACA 10px) !important;
    border: 1px solid #EF4444 !important;
    --fc-event-text-color: #B91C1C;
  }
  .fc-event-leave,
  .fc-event-leave .fc-event-main,
  .fc-event-leave .fc-event-main-frame,
  .fc-event-leave .fc-event-title,
  .fc-event-leave .fc-event-title-container,
  .fc-event-leave .fc-event-time {
    color: #B91C1C !important;
  }
  /* deadline (extra) */
  .fc-event-deadline { background: #EF4444 !important; color: #ffffff !important; }
  .fc-event-meeting  { background: #F59E0B !important; color: #000000 !important; }
  .fc-event-other    { background: #10B981 !important; color: #ffffff !important; }

  /* Conflict overlay — double-booked resource: unmistakable red ring + pulse */
  .fc-event-conflict {
    box-shadow: 0 0 0 2px #EF4444, 0 0 10px rgba(239,68,68,0.45) !important;
    outline: 2px solid #EF4444 !important;
    outline-offset: 1px !important;
    animation: fc-conflict-pulse 1.1s ease-in-out infinite !important;
  }
  .fc-event-conflict::after {
    content: '⚠'; position: absolute; top: -6px; right: -5px;
    background: #EF4444; color: #fff; font-size: 9px; font-weight: 900;
    width: 14px; height: 14px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; z-index: 12;
  }
  @keyframes fc-conflict-pulse {
    0%, 100% { box-shadow: 0 0 0 2px #EF4444, 0 0 6px rgba(239,68,68,0.35); }
    50%       { box-shadow: 0 0 0 2px #EF4444, 0 0 14px rgba(239,68,68,0.75); }
  }

  .fc-toolbar { display: none !important; }
  .fc-timegrid-slot { height: 3em !important; border-bottom: 1px solid rgb(var(--sl-100)) !important; }
  .fc-timegrid-axis-cushion { color: rgb(var(--sl-400)); font-size: 9px; }
  .fc-timegrid-slot-label-cushion { color: rgb(var(--sl-500)); font-size: 10px; }
  /* Quarter view is now a custom React component — see QuarterView.jsx */
`;

// Compact multi-select with chips — used for the 3 calendar filter dimensions.
// AND-logic across MultiSelects, OR-logic within one (handled server-side).
const MultiSelect = ({ label, options, selected, onToggle, placeholder = 'All' }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);
    const labelFor = (id) => options.find(o => o.id === id)?.label || id;

    return (
        <div className="relative" ref={ref}>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2 block">{label}</label>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-xs text-left text-slate-700 flex items-center justify-between gap-2 hover:border-slate-300"
            >
                <span className="truncate">
                    {selected.length === 0 ? placeholder : `${selected.length} selected`}
                </span>
                <span className="material-symbols-outlined text-base text-slate-400">expand_more</span>
            </button>

            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                    {selected.map(id => (
                        <span key={id} className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 rounded-full pl-2 pr-1 py-0.5 text-[10px] font-semibold">
                            {labelFor(id)}
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onToggle(id); }}
                                className="hover:bg-primary/20 rounded-full"
                                aria-label={`Remove ${labelFor(id)}`}
                            >
                                <span className="material-symbols-outlined text-sm leading-none">close</span>
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {open && (
                <div className="absolute z-30 mt-1 w-full bg-surface border border-slate-200 rounded-lg shadow-pop max-h-64 overflow-y-auto custom-scrollbar">
                    {options.length === 0 && (
                        <p className="text-xs text-slate-400 p-3">No options</p>
                    )}
                    {options.map(o => {
                        const checked = selected.includes(o.id);
                        return (
                            <label key={o.id} className="flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onToggle(o.id)}
                                    className="rounded border-slate-300 text-primary focus:ring-primary/30"
                                />
                                <span className="truncate">{o.label}</span>
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const Calendar = () => {
    const calRef = useRef(null);
    const { showToast } = useToast();
    const { confirmDialog } = useDialog();
    const { socket } = useSocket();
    const [view, setView] = useState('dayGridMonth');
  const QUARTER_VIEW_KEY = 'quarterView';
  const [quarterAnchor, setQuarterAnchor] = useState(null);
    const [calTitle, setCalTitle] = useState('');
    const [events, setEvents] = useState([]);
    const [conflicts, setConflicts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters — multi-select sets, OR-logic across dimensions (union)
    const [filters, setFilters] = useState({ pilot: [], drone: [], project: [], pipeline: [] });
    const [resources, setResources] = useState({ pilots: [], drones: [], projects: [], pipelines: [] });

    const toggleFilter = (dim, id) => {
        setFilters(prev => {
            const set = new Set(prev[dim]);
            if (set.has(id)) set.delete(id); else set.add(id);
            return { ...prev, [dim]: Array.from(set) };
        });
    };
    const clearAllFilters = () => setFilters({ pilot: [], drone: [], project: [], pipeline: [] });

    // Modals
    const [addModal, setAddModal] = useState(false);
    const [editingEventId, setEditingEventId] = useState(null); // calendar_events row being edited
    const [eventForm, setEventForm] = useState({ title: '', event_type: 'meeting', start_date: '', end_date: '', notes: '', pilot_id: '', drone_id: '' });
    const [detailModal, setDetailModal] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [conflictsModal, setConflictsModal] = useState(false);
    useScrollLock(detailModal);

    const fetchResources = async () => {
        try {
            const [p, d, proj, pipe] = await Promise.all([
                axiosInstance.get(ENDPOINTS.RESOURCES.PILOTS, { params: { limit: 100 } }),
                axiosInstance.get(ENDPOINTS.RESOURCES.DRONES),
                axiosInstance.get(ENDPOINTS.PROJECTS.GET_ALL),
                axiosInstance.get(ENDPOINTS.PIPELINE.GET_ALL)
            ]);
            // Only active pipeline leads appear on the calendar (not converted/lost/cancelled)
            const pipelines = (pipe.data.data || []).filter(
                pl => !pl.converted_project_id && !['lost', 'converted', 'cancelled'].includes(pl.stage)
            );
            setResources({
                pilots: p.data.data || [],
                drones: d.data.data || [],
                projects: proj.data.data || [],
                pipelines
            });
        } catch (err) { showToast('Failed to load filter resources', 'error'); }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [evRes, conRes] = await Promise.all([
                axiosInstance.get(ENDPOINTS.CALENDAR.GET_ALL),
                axiosInstance.get(ENDPOINTS.CALENDAR.CONFLICTS)
            ]);
            setEvents(Array.isArray(evRes.data.data) ? evRes.data.data : []);
            setConflicts(Array.isArray(conRes.data.data) ? conRes.data.data : []);
        } catch (err) {
            showToast("Sync error in temporal grid", "error");
        } finally { setLoading(false); }
    };

    useEffect(() => { fetchResources(); }, []);
    useEffect(() => { fetchData(); }, []);

    // Socket: refresh calendar when allocations or calendar events change
    useEffect(() => {
        if (!socket) return;
        const refresh = () => fetchData();
        socket.on('allocation:created',     refresh);
        socket.on('allocation:updated',     refresh);
        socket.on('allocation:deleted',     refresh);
        socket.on('calendar:event_created', refresh);
        socket.on('calendar:event_updated', refresh);
        socket.on('calendar:event_deleted', refresh);
        return () => {
            socket.off('allocation:created',     refresh);
            socket.off('allocation:updated',     refresh);
            socket.off('allocation:deleted',     refresh);
            socket.off('calendar:event_created', refresh);
            socket.off('calendar:event_updated', refresh);
            socket.off('calendar:event_deleted', refresh);
        };
    }, [socket]);

    const fcEvents = useMemo(() => {
        // Build precise lookup: which specific bookings (by their own id) clash,
        // and the conflict detail attached to each so the detail panel can explain it.
        const conflictEntityIds = new Set();
        const conflictByEntity  = new Map();
        conflicts.forEach(c => {
            [c.entity_a_id, c.entity_b_id].forEach(eid => {
                if (!eid) return;
                conflictEntityIds.add(eid);
                if (!conflictByEntity.has(eid)) conflictByEntity.set(eid, []);
                conflictByEntity.get(eid).push(c);
            });
        });

        const fp = filters.pilot.length, fd = filters.drone.length,
              fpr = filters.project.length, fpl = filters.pipeline.length;
        const anyFilter = fp > 0 || fd > 0 || fpr > 0 || fpl > 0;

        return events
            .filter(e => {
                if (!anyFilter) return true;
                const type   = (e.type || e.event_type || '').toLowerCase();
                const pid    = e.pilot_id   || (e.resource_type === 'pilot' ? e.resource_id : null);
                const cpid   = e.copilot_id || (e.resource_type === 'copilot' ? e.resource_id : null);
                const did    = e.drone_id   || (e.resource_type === 'drone' ? e.resource_id : null);
                const projId = e.project_id;
                // OR-across-dimensions: show an event if it matches ANY active filter.
                // (Selecting a pilot AND a drone shows that pilot's schedule plus that
                //  drone's schedule — the union — instead of the empty intersection.)
                const mP  = fp  > 0 && ((pid && filters.pilot.includes(pid)) || (cpid && filters.pilot.includes(cpid)));
                const mD  = fd  > 0 && did    && filters.drone.includes(did);
                const mR  = fpr > 0 && projId && filters.project.includes(projId);
                const mPl = fpl > 0 && type === 'pipeline' && filters.pipeline.includes(e.id);
                return Boolean(mP || mD || mR || mPl);
            })
            .map(e => {
                const type = (e.type || e.event_type || 'other').toLowerCase();
                const pid = e.pilot_id || (e.resource_type === 'pilot' ? e.resource_id : null);
                const did = e.drone_id || (e.resource_type === 'drone' ? e.resource_id : null);
                const conflictDetails = conflictByEntity.get(e.id) || null;
                const hasConflict = conflictEntityIds.has(e.id);
                const startYmd = toYmd(e.start_date);
                const endYmd   = toYmd(e.end_date) || startYmd;
                return {
                    id: e.id,
                    title: e.title || 'Untitled',
                    start: startYmd,
                    end: endYmd,
                    allDay: true,
                    className: `fc-event-${type} ${hasConflict ? 'fc-event-conflict' : ''}`,
                    extendedProps: { ...e, type, hasConflict, conflictDetails }
                };
            });
    }, [events, conflicts, filters]);

    // FullCalendar needs an EXCLUSIVE end for all-day events; QuarterView uses the
    // inclusive range above. Derive a separate array so each renders the exact days.
    const calendarEvents = useMemo(
        () => fcEvents.map(ev => ({ ...ev, end: ev.end ? addDaysYmd(ev.end, 1) : undefined })),
        [fcEvents]
    );

    const handleDateClick = (info) => {
        setEventForm(prev => ({ ...prev, start_date: info.dateStr + 'T09:00', end_date: info.dateStr + 'T10:00' }));
        setAddModal(true);
    };

    const handleEventClick = (info) => {
        setSelectedEvent(info.event);
        setDetailModal(true);
    };

    const navigate = (action) => {
        // Quarter view uses its own anchor date
        if (view === QUARTER_VIEW_KEY) {
            const base = quarterAnchor ? new Date(quarterAnchor) : new Date();
            if (action === 'prev')  setQuarterAnchor(new Date(base.getFullYear(), base.getMonth() - 3, 1).toISOString());
            else if (action === 'next') setQuarterAnchor(new Date(base.getFullYear(), base.getMonth() + 3, 1).toISOString());
            else if (action === 'today') setQuarterAnchor(null);
            return;
        }
        const api = calRef.current?.getApi();
        if (!api) return;
        if (action === 'prev') api.prev();
        else if (action === 'next') api.next();
        else if (action === 'today') api.today();
        setCalTitle(api.view.title);
    };

    const handleViewChange = (v) => {
        setView(v);
        if (v === QUARTER_VIEW_KEY) {
            // Seed anchor from current FC date if available
            const api = calRef.current?.getApi();
            setQuarterAnchor(api ? api.getDate().toISOString() : null);
            setCalTitle('Quarter View');
            return;
        }
        const api = calRef.current?.getApi();
        if (api) {
            api.changeView(v);
            setCalTitle(api.view.title);
        }
    };

    const resetEventForm = () => {
        setEventForm({ title: '', event_type: 'meeting', start_date: '', end_date: '', notes: '', pilot_id: '', drone_id: '' });
        setEditingEventId(null);
    };

    const handleAddEvent = async () => {
        try {
            if (editingEventId) {
                // Update — backend only accepts title/dates/notes on edit.
                const { title, start_date, end_date, notes } = eventForm;
                await axiosInstance.put(ENDPOINTS.CALENDAR.EVENT(editingEventId), { title, start_date, end_date, notes });
                showToast('Event updated');
            } else {
                const payload = { ...eventForm };
                if (payload.pilot_id) {
                    payload.resource_type = 'pilot';
                    payload.resource_id   = payload.pilot_id;
                } else if (payload.drone_id) {
                    payload.resource_type = 'drone';
                    payload.resource_id   = payload.drone_id;
                }
                delete payload.pilot_id;
                delete payload.drone_id;
                await axiosInstance.post(ENDPOINTS.CALENDAR.EVENTS, payload);
                showToast('Event created');
            }
            setAddModal(false);
            resetEventForm();
            fetchData();
        } catch (err) {
            showToast(err?.response?.data?.message || (editingEventId ? 'Update failed' : 'Scheduling failed'), 'error');
        }
    };

    // Manual calendar_events rows (leave/training/meeting/…) are the only editable
    // entries — allocations, pipeline windows and project markers are derived.
    const isManualEvent = (ev) => ev?.extendedProps?.resource_type !== undefined;

    const startEditEvent = (ev) => {
        const p = ev.extendedProps || {};
        setEventForm({
            title:      ev.title || '',
            event_type: p.type || 'meeting',
            start_date: toYmd(p.start_date) ? `${toYmd(p.start_date)}T09:00` : '',
            end_date:   toYmd(p.end_date || p.start_date) ? `${toYmd(p.end_date || p.start_date)}T18:00` : '',
            notes:      p.notes || '',
            pilot_id:   p.resource_type === 'pilot' ? (p.resource_id || '') : '',
            drone_id:   p.resource_type === 'drone' ? (p.resource_id || '') : '',
        });
        setEditingEventId(ev.id);
        setDetailModal(false);
        setAddModal(true);
    };

    const handleDeleteEvent = async (ev) => {
        if (!(await confirmDialog({ title: 'Delete Event', message: `Delete "${ev.title}" from the calendar?`, danger: true, confirmLabel: 'Delete' }))) return;
        try {
            await axiosInstance.delete(ENDPOINTS.CALENDAR.EVENT(ev.id));
            showToast('Event deleted');
            setDetailModal(false);
            fetchData();
        } catch (err) {
            showToast(err?.response?.data?.message || 'Delete failed', 'error');
        }
    };

    const resolveConflict = async (cid) => {
        try {
            await axiosInstance.put(ENDPOINTS.CALENDAR.RESOLVE(cid));
            showToast("Conflict resolved");
            fetchData();
        } catch (err) { showToast("Resolution failed", "error"); }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-700 pb-20">
            <style>{FC_STYLES}</style>

            <PageHeader
                eyebrow="Scheduling"
                title="Calendar"
                description="Allocations, pipeline windows, leave, training and maintenance — in one timeline."
                actions={
                    <>
                        {conflicts.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setConflictsModal(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">warning</span>
                                {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}
                            </button>
                        )}
                        <Button onClick={() => setAddModal(true)} icon="add">New Event</Button>
                    </>
                }
            />

            {/* Filters Bar */}
            <Card className="bg-slate-50 border-slate-200/70">
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    <MultiSelect
                        label="Personnel Filter"
                        placeholder="All Pilots"
                        options={resources.pilots.map(p => ({ id: p.id, label: p.crew_role === 'co_pilot' ? `${p.name} (Co-Pilot)` : p.name }))}
                        selected={filters.pilot}
                        onToggle={(id) => toggleFilter('pilot', id)}
                    />
                    <MultiSelect
                        label="Asset Filter"
                        placeholder="All Drones"
                        options={resources.drones.map(d => ({ id: d.id, label: `${d.name} (${d.serial_number})` }))}
                        selected={filters.drone}
                        onToggle={(id) => toggleFilter('drone', id)}
                    />
                    <MultiSelect
                        label="Project Filter"
                        placeholder="All Projects"
                        options={resources.projects.map(p => ({ id: p.id, label: p.name }))}
                        selected={filters.project}
                        onToggle={(id) => toggleFilter('project', id)}
                    />
                    <MultiSelect
                        label="Pipeline Filter"
                        placeholder="All Pipelines"
                        options={resources.pipelines.map(pl => ({ id: pl.id, label: pl.name }))}
                        selected={filters.pipeline}
                        onToggle={(id) => toggleFilter('pipeline', id)}
                    />
                    <div className="flex flex-wrap gap-1 md:justify-end items-end">
                         {(filters.pilot.length + filters.drone.length + filters.project.length + filters.pipeline.length) > 0 && (
                             <Button variant="ghost" size="sm" onClick={clearAllFilters} icon="clear_all">Clear</Button>
                         )}
                         <Button variant={view === 'dayGridMonth' ? 'primary' : 'secondary'} size="sm" onClick={() => handleViewChange('dayGridMonth')}>Monthly</Button>
                         <Button variant={view === 'timeGridWeek' ? 'primary' : 'secondary'} size="sm" onClick={() => handleViewChange('timeGridWeek')}>Weekly</Button>
                         <Button variant={view === QUARTER_VIEW_KEY ? 'primary' : 'secondary'} size="sm" onClick={() => handleViewChange(QUARTER_VIEW_KEY)}>Quarter</Button>
                    </div>
                </div>
            </Card>

            <Card className="border-slate-200 overflow-hidden bg-slate-100">
                <div className="p-6 border-b border-slate-200/70 flex flex-wrap justify-between items-center gap-2 bg-slate-50">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">{calTitle || 'Timeline'}</h3>
                    <div className="flex gap-1">
                         <Button variant="secondary" size="sm" icon="chevron_left" onClick={() => navigate('prev')} />
                         <Button variant="secondary" size="sm" icon="today" onClick={() => navigate('today')} />
                         <Button variant="secondary" size="sm" icon="chevron_right" onClick={() => navigate('next')} />
                    </div>
                </div>
                <div className="p-2">
                    {loading ? (
                        <CalendarSkeleton />
                    ) : view === QUARTER_VIEW_KEY ? (
                        <QuarterView
                            anchorDate={quarterAnchor}
                            events={fcEvents}
                            onDateClick={handleDateClick}
                            onEventClick={handleEventClick}
                        />
                    ) : (
                        <FullCalendar
                            ref={calRef}
                            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                            initialView={view}
                            timeZone="Asia/Kolkata"
                            headerToolbar={false}
                            events={calendarEvents}
                            dateClick={handleDateClick}
                            eventClick={handleEventClick}
                            datesSet={() => setCalTitle(calRef.current?.getApi().view.title)}
                            height="auto"
                            dayMaxEvents={4}
                            eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
                        />
                    )}
                </div>
            </Card>

            {/* Event Detail — right-side slide-in panel (PRD §6.5).
                Portaled to body so the fixed backdrop + drawer cover the true
                viewport (escaping the page root's transformed/animated ancestor)
                and sit above the sidebar. */}
            {createPortal(
              <>
              {detailModal && (
                <div
                    className="fixed inset-0 z-[1250] bg-slate-900/30 backdrop-blur-sm transition-opacity"
                    onClick={() => setDetailModal(false)}
                />
              )}
              <aside
                className={`fixed top-0 right-0 h-screen w-full sm:w-[360px] md:w-[420px] bg-surface border-l border-slate-200 shadow-pop z-[1260] transform transition-transform duration-300 ease-out flex flex-col ${
                    detailModal ? 'translate-x-0' : 'translate-x-full'
                }`}
                aria-hidden={!detailModal}
              >
                {selectedEvent && (
                    <>
                        <div className="flex justify-between items-start px-6 pt-6 pb-4 border-b border-slate-100">
                            <div className="min-w-0">
                                <span className="inline-block px-2.5 py-0.5 bg-slate-100 border border-slate-200 rounded-full text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-2">
                                    {selectedEvent.extendedProps?.type || 'event'}
                                </span>
                                <h2 className="text-lg font-bold text-slate-900 truncate">{selectedEvent.title}</h2>
                            </div>
                            <button
                                onClick={() => setDetailModal(false)}
                                className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1.5 transition-colors"
                                aria-label="Close detail panel"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
                            {selectedEvent.extendedProps?.hasConflict && (
                                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 space-y-2">
                                    <div className="flex items-center gap-2 text-red-700">
                                        <span className="material-symbols-outlined text-base">warning</span>
                                        <span className="text-[11px] font-bold uppercase tracking-widest">Scheduling Conflict</span>
                                    </div>
                                    {(selectedEvent.extendedProps.conflictDetails || []).map((c, ci) => {
                                        // Show the OTHER side of the clash relative to this event
                                        const other = c.entity_a_id === selectedEvent.id
                                            ? { name: c.ref_b_name, kind: c.source_b, id: c.ref_b_id }
                                            : { name: c.ref_a_name, kind: c.source_a, id: c.ref_a_id };
                                        return (
                                            <div key={ci} className="text-[11px] text-red-800 leading-snug border-t border-red-200/70 pt-1.5 first:border-t-0 first:pt-0">
                                                <span className="font-bold">{c.resource_name}</span> also booked on{' '}
                                                <span className="font-bold">{other.name}</span>
                                                <span className="ml-1 inline-block px-1.5 py-px rounded bg-red-100 text-red-600 text-[9px] font-bold uppercase tracking-wide">{other.kind}</span>
                                                <span className="block text-red-500 font-mono text-[10px] mt-0.5">{formatDateOnly(c.overlap_start)} → {formatDateOnly(c.overlap_end)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Starts</p>
                                    <p className="text-slate-900 text-sm font-mono">{formatDateOnly(selectedEvent.extendedProps?.start_date)}</p>
                                </div>
                                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Ends</p>
                                    <p className="text-slate-900 text-sm font-mono">{formatDateOnly(selectedEvent.extendedProps?.end_date || selectedEvent.extendedProps?.start_date)}</p>
                                </div>
                            </div>

                            {selectedEvent.extendedProps?.pilot_name && (
                                <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-slate-100">
                                    <span className="material-symbols-outlined text-indigo-500">person</span>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Pilot</p>
                                        <p className="text-sm text-slate-900 font-semibold">{selectedEvent.extendedProps.pilot_name}</p>
                                    </div>
                                </div>
                            )}
                            {selectedEvent.extendedProps?.copilot_name && (
                                <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-slate-100">
                                    <span className="material-symbols-outlined text-violet-500">group</span>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Co-Pilot</p>
                                        <p className="text-sm text-slate-900 font-semibold">{selectedEvent.extendedProps.copilot_name}</p>
                                    </div>
                                </div>
                            )}
                            {selectedEvent.extendedProps?.drone_name && (
                                <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-slate-100">
                                    <span className="material-symbols-outlined text-purple-500">airplanemode_active</span>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Drone</p>
                                        <p className="text-sm text-slate-900 font-semibold">{selectedEvent.extendedProps.drone_name}</p>
                                    </div>
                                </div>
                            )}

                            {selectedEvent.extendedProps?.notes && (
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Notes</p>
                                    <p className="text-sm text-slate-600 leading-relaxed">{selectedEvent.extendedProps.notes}</p>
                                </div>
                            )}

                            {selectedEvent.extendedProps?.project_id && (
                                <a
                                    href={`/projects/${selectedEvent.extendedProps.project_id}`}
                                    className="block w-full text-center bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl py-2.5 text-xs font-bold uppercase tracking-widest transition-colors"
                                >
                                    Open Full Project
                                </a>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
                            {isManualEvent(selectedEvent) && (
                                <>
                                    <Button className="flex-1" icon="edit" onClick={() => startEditEvent(selectedEvent)}>Edit</Button>
                                    <Button className="flex-1" variant="danger" icon="delete" onClick={() => handleDeleteEvent(selectedEvent)}>Delete</Button>
                                </>
                            )}
                            <Button className="flex-1" variant="secondary" onClick={() => setDetailModal(false)}>Close</Button>
                        </div>
                    </>
                )}
              </aside>
              </>,
              document.body
            )}

            {/* Conflicts Modal — live double-booking detail */}
            <Modal isOpen={conflictsModal} onClose={() => setConflictsModal(false)} title="Scheduling Conflicts">
                <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {conflicts.length === 0 && (
                        <p className="text-sm text-slate-500 text-center py-6">No scheduling conflicts. 🎉</p>
                    )}
                    {conflicts.map(c => {
                        const linkFor = (kind, id) => kind === 'pipeline' ? `/pipeline` : `/projects/${id}`;
                        return (
                            <div key={c.id} className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-red-500 text-base">{c.resource_type === 'drone' ? 'airplanemode_active' : 'person'}</span>
                                        {c.resource_name}
                                    </h4>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-red-600 bg-red-100 px-2 py-0.5 rounded-full">{c.resource_type} double-booked</span>
                                </div>
                                <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                                    <a href={linkFor(c.source_a, c.ref_a_id)} className="block bg-surface border border-slate-200 rounded-lg p-2 hover:border-red-300 transition-colors">
                                        <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wide">{c.source_a}</p>
                                        <p className="text-xs font-bold text-slate-800 truncate">{c.ref_a_name}</p>
                                        <p className="text-[10px] font-mono text-slate-400">{formatDateOnly(c.start_a)} → {formatDateOnly(c.end_a)}</p>
                                    </a>
                                    <div className="flex items-center text-red-500 font-black">⇄</div>
                                    <a href={linkFor(c.source_b, c.ref_b_id)} className="block bg-surface border border-slate-200 rounded-lg p-2 hover:border-red-300 transition-colors">
                                        <p className="text-[9px] uppercase font-bold text-slate-400 tracking-wide">{c.source_b}</p>
                                        <p className="text-xs font-bold text-slate-800 truncate">{c.ref_b_name}</p>
                                        <p className="text-[10px] font-mono text-slate-400">{formatDateOnly(c.start_b)} → {formatDateOnly(c.end_b)}</p>
                                    </a>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-red-700 font-semibold">
                                    <span className="material-symbols-outlined text-sm">event_busy</span>
                                    Overlap: {formatDateOnly(c.overlap_start)} → {formatDateOnly(c.overlap_end)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Modal>

            {/* Add / Edit Event Modal */}
            <Modal isOpen={addModal} onClose={() => { setAddModal(false); resetEventForm(); }} title={editingEventId ? 'Edit Event' : 'Schedule New Operational Event'}>
                <form onSubmit={e => { e.preventDefault(); handleAddEvent(); }} className="space-y-4">
                    <Input label="Event Label" value={eventForm.title} onChange={e => setEventForm({...eventForm, title: e.target.value})} required placeholder="e.g. Site Maintenance Alpha" />
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Event Type</label>
                        <select
                            value={eventForm.event_type}
                            onChange={e => setEventForm({...eventForm, event_type: e.target.value, pilot_id: '', drone_id: ''})}
                            disabled={!!editingEventId}
                            title={editingEventId ? 'Event type cannot be changed after creation' : undefined}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm disabled:opacity-60"
                        >
                            <option value="meeting">Meeting</option>
                            <option value="project">Project</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="leave">Leave</option>
                            <option value="training">Training</option>
                            <option value="expo">Expo</option>
                            <option value="deadline">Deadline</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    {/* Drone selector — shown for maintenance events (create only; resource is fixed after) */}
                    {!editingEventId && eventForm.event_type === 'maintenance' && (
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">
                                Drone <span className="normal-case font-normal text-slate-400">(links event to drone — blocks allocation during window)</span>
                            </label>
                            <select
                                value={eventForm.drone_id}
                                onChange={e => setEventForm({...eventForm, drone_id: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm"
                            >
                                <option value="">— Select drone (optional) —</option>
                                {resources.drones.map(d => (
                                    <option key={d.id} value={d.id}>{d.name} — {d.serial_number}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Pilot selector — shown for leave and training events (create only) */}
                    {!editingEventId && (eventForm.event_type === 'leave' || eventForm.event_type === 'training') && (
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">
                                Pilot <span className="normal-case font-normal text-slate-400">(links event to pilot for conflict detection)</span>
                            </label>
                            <select
                                value={eventForm.pilot_id}
                                onChange={e => setEventForm({...eventForm, pilot_id: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm"
                            >
                                <option value="">— Select crew member (optional) —</option>
                                {resources.pilots.map(p => (
                                    <option key={p.id} value={p.id}>{p.crew_role === 'co_pilot' ? `${p.name} (Co-Pilot)` : p.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Start Window" type="datetime-local" value={eventForm.start_date} onChange={e => setEventForm({...eventForm, start_date: e.target.value})} required />
                        <Input label="End Window" type="datetime-local" value={eventForm.end_date} onChange={e => setEventForm({...eventForm, end_date: e.target.value})} required />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Notes <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                        <textarea
                            value={eventForm.notes || ''}
                            onChange={e => setEventForm({...eventForm, notes: e.target.value})}
                            rows={2}
                            placeholder="Mission notes..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm resize-none"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                         <Button variant="secondary" type="button" onClick={() => { setAddModal(false); resetEventForm(); }}>Cancel</Button>
                         <Button type="submit">{editingEventId ? 'Save Changes' : 'Publish Schedule'}</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Calendar;
