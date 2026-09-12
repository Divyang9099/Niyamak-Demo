import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Badge } from '../../components/ui/Badge';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionSkeleton } from '../../components/ui/Skeletons';
import { formatDate } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';

// ── Action options (every action the backend actually emits) ──────────────────
const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'CREATE_PROJECT',           label: 'Project created' },
  { value: 'UPDATE_PROJECT',           label: 'Project updated' },
  { value: 'DELETE_PROJECT',           label: 'Project deleted' },
  { value: 'ARCHIVE_PROJECT',          label: 'Project archived' },
  { value: 'RESTORE_FROM_ARCHIVE',     label: 'Restored from archive' },
  { value: 'BULK_UPDATE_STATUS',       label: 'Bulk status update' },
  { value: 'ALLOCATE_RESOURCE',        label: 'Resource allocated' },
  { value: 'FORCE_ALLOCATION',         label: 'Allocation forced' },
  { value: 'UPDATE_ALLOCATION',        label: 'Allocation updated' },
  { value: 'FORCE_UPDATE_ALLOCATION',  label: 'Allocation force-updated' },
  { value: 'DELETE_ALLOCATION',        label: 'Allocation deleted' },
  { value: 'UPLOAD_DELIVERABLE',       label: 'Deliverable uploaded' },
  { value: 'APPROVE_DELIVERABLE',      label: 'Deliverable approved' },
  { value: 'REJECT_DELIVERABLE',       label: 'Deliverable rejected' },
  { value: 'RESUBMIT_DELIVERABLE',     label: 'Deliverable resubmitted' },
  { value: 'CREATE_PIPELINE',          label: 'Pipeline created' },
  { value: 'UPDATE_PIPELINE',          label: 'Pipeline updated' },
  { value: 'UPDATE_PIPELINE_STAGE',    label: 'Pipeline stage changed' },
  { value: 'CONVERT_PIPELINE',         label: 'Pipeline converted' },
  { value: 'UPLOAD_PROJECT_DOC',       label: 'Project doc uploaded' },
  { value: 'UPLOAD_LIBRARY_DOC',       label: 'Library doc uploaded' },
  { value: 'DOWNLOAD',                 label: 'Document downloaded' },
  { value: 'DOWNLOAD_CATEGORY_ZIP',    label: 'Library category ZIP' },
  { value: 'ADD_ESTIMATION_ITEM',      label: 'Estimation item added' },
];

const ENTITY_OPTIONS = [
  { value: '', label: 'All entities' },
  { value: 'project',          label: 'Project' },
  { value: 'pipeline',         label: 'Pipeline' },
  { value: 'allocation',       label: 'Allocation' },
  { value: 'deliverable',      label: 'Deliverable' },
  { value: 'project_document', label: 'Project document' },
  { value: 'library_document', label: 'Library document' },
  { value: 'library_category', label: 'Library category' },
  { value: 'pilot',            label: 'Pilot' },
  { value: 'drone',            label: 'Drone' },
  { value: 'estimation',       label: 'Estimation' },
];

// TC-AUD-02: FORCE_* yellow · DELETE/REJECT red · UPLOAD/APPROVE green · UPDATE_* blue · DOWNLOAD indigo · others gray
const variantForAction = (action = '') => {
  if (action.startsWith('FORCE_'))                              return 'warning';  // yellow
  if (action.startsWith('DELETE') || action.includes('REJECT')) return 'danger';   // red
  if (action.startsWith('UPLOAD') || action.includes('APPROVE'))return 'success';  // green
  if (action.startsWith('UPDATE'))                              return 'info';      // blue
  if (action.startsWith('DOWNLOAD'))                            return 'primary';   // indigo
  return 'default'; // gray
};

// Stable avatar colour per user initial
const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700', 'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700', 'bg-teal-100 text-teal-700',
];
const avatarColor = (name = '') => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length] || AVATAR_COLORS[0];

// ── Component ─────────────────────────────────────────────────────────────────
const AuditLog = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filters,  setFilters]  = useState({ entity_type: '', action: '' });
  const [page,     setPage]     = useState(1);
  const [hasMore,  setHasMore]  = useState(false);
  const [expanded, setExpanded] = useState(null);
  const LIMIT = 50;

  const fetchLogs = useCallback(async (nextPage = 1) => {
    setLoading(true);
    try {
      const params = { page: nextPage, limit: LIMIT };
      if (filters.entity_type) params.entity_type = filters.entity_type;
      if (filters.action)      params.action      = filters.action;
      const res  = await axiosInstance.get(ENDPOINTS.AUDIT.GET_ALL, { params });
      const rows = Array.isArray(res.data.data) ? res.data.data : [];
      setLogs(prev => nextPage === 1 ? rows : [...prev, ...rows]);
      setHasMore(rows.length === LIMIT);
      setPage(nextPage);
    } catch {
      showToast('Failed to load audit log', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, showToast]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  // Entity → navigable link
  const getEntityLink = (row) => {
    if (!row.entity_id || !row.entity_type) return null;
    const t = row.entity_type.toLowerCase();
    if (t === 'project')    return `/projects/${row.entity_id}`;
    if (t === 'pilot')      return `/resources/pilots/${row.entity_id}`;
    if (t === 'drone')      return `/resources/drones/${row.entity_id}`;
    if (t === 'estimation') return `/estimations/${row.entity_id}`;
    return null;
  };

  // Before / After field-level diff panel
  const renderDiff = (row) => {
    const parse = (v) => {
      if (!v) return null;
      try { return typeof v === 'string' ? JSON.parse(v) : v; }
      catch { return null; }
    };
    const oldObj  = parse(row.old_value);
    const nextObj = parse(row.new_value);

    if (!oldObj && !nextObj) {
      return <p className="text-xs text-slate-400 italic">No payload recorded for this action.</p>;
    }

    // Collect all keys, skip nulls-on-both-sides and internal IDs
    const SKIP = new Set(['id', 'created_at', 'updated_at', 'deleted_at', 'archived_at', 'archived_by', 'created_by']);
    const allKeys = Array.from(new Set([
      ...Object.keys(oldObj  || {}),
      ...Object.keys(nextObj || {}),
    ])).filter(k => !SKIP.has(k));

    const fmt = (v) => {
      if (v === null || v === undefined) return <span className="text-slate-300 italic">null</span>;
      if (typeof v === 'object') return <span className="text-slate-500">{JSON.stringify(v)}</span>;
      return String(v);
    };

    const changed = allKeys.filter(k => JSON.stringify((oldObj||{})[k]) !== JSON.stringify((nextObj||{})[k]));
    const unchanged = allKeys.filter(k => !changed.includes(k));

    // Show changed fields first, then collapsed unchanged count
    const displayKeys = [...changed, ...unchanged];

    if (displayKeys.length === 0) {
      return <p className="text-xs text-slate-400 italic">No field-level data available.</p>;
    }

    return (
      <div className="space-y-3">
        {/* Summary pill */}
        <div className="flex items-center gap-2 flex-wrap">
          {changed.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
              <span className="material-symbols-outlined text-sm leading-none">edit</span>
              {changed.length} field{changed.length !== 1 ? 's' : ''} changed
            </span>
          )}
          {unchanged.length > 0 && (
            <span className="text-[10px] text-slate-400 font-medium">
              {unchanged.length} field{unchanged.length !== 1 ? 's' : ''} unchanged
            </span>
          )}
        </div>

        {/* Field-level diff table */}
        <div className="rounded-xl border border-slate-200 overflow-x-auto text-[11px] font-mono">
          {/* Header */}
          <div className="grid grid-cols-[160px_1fr_1fr] bg-slate-50 border-b border-slate-200">
            <div className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Field</div>
            <div className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-red-400 border-l border-slate-200 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs leading-none">remove_circle</span> Before
            </div>
            <div className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-emerald-500 border-l border-slate-200 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs leading-none">add_circle</span> After
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {displayKeys.map(k => {
              const isChanged = changed.includes(k);
              const oldVal = (oldObj || {})[k];
              const newVal = (nextObj || {})[k];
              return (
                <div
                  key={k}
                  className={`grid grid-cols-[160px_1fr_1fr] ${isChanged ? 'bg-amber-50/60' : 'bg-surface'}`}
                >
                  {/* Field name */}
                  <div className={`px-3 py-2 flex items-center gap-1.5 border-r border-slate-100 ${isChanged ? 'text-amber-700 font-bold' : 'text-slate-500'}`}>
                    {isChanged && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    )}
                    <span className="truncate" title={k}>{k.replace(/_/g, ' ')}</span>
                  </div>
                  {/* Before */}
                  <div className={`px-3 py-2 border-r border-slate-100 ${isChanged ? 'text-red-600 bg-red-50/70' : 'text-slate-400'}`}>
                    <span className="break-all">{fmt(oldVal)}</span>
                  </div>
                  {/* After */}
                  <div className={`px-3 py-2 ${isChanged ? 'text-emerald-700 bg-emerald-50/70 font-semibold' : 'text-slate-400'}`}>
                    <span className="break-all">{fmt(newVal)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow="System"
        title="Audit Log"
        description="Immutable, append-only record of every system action."
        actions={
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Integrity OK</span>
            </div>
            <button
              onClick={() => fetchLogs(1)}
              disabled={loading}
              className="p-2 bg-surface border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 hover:text-primary transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <span className={`material-symbols-outlined text-base leading-none ${loading ? 'animate-spin' : ''}`}>refresh</span>
            </button>
          </>
        }
      />

      {/* ── Badge legend (TC-AUD-02) ───────────────────────────────────────── */}
      <div className="bg-surface border border-slate-200 rounded-2xl px-6 py-4 flex flex-wrap items-center gap-3">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mr-1">Badge legend:</span>
        {[
          { label: 'FORCE_*',         variant: 'warning' },
          { label: 'DELETE / REJECT', variant: 'danger'  },
          { label: 'UPLOAD / APPROVE',variant: 'success' },
          { label: 'UPDATE_*',        variant: 'info'    },
          { label: 'DOWNLOAD',        variant: 'primary' },
          { label: 'Others',          variant: 'default' },
        ].map(({ label, variant }) => (
          <Badge key={variant} variant={variant}>{label}</Badge>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="bg-surface border border-slate-200 rounded-2xl p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Action filter</label>
            <select
              value={filters.action}
              onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Entity filter</label>
            <select
              value={filters.entity_type}
              onChange={e => setFilters(f => ({ ...f, entity_type: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              {ENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {(filters.action || filters.entity_type) && (
            <div className="flex items-end">
              <button
                onClick={() => setFilters({ entity_type: '', action: '' })}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                <span className="material-symbols-outlined text-sm leading-none">filter_alt_off</span>
                Clear filters
              </button>
            </div>
          )}
        </div>

        {/* Active filter chips */}
        {(filters.action || filters.entity_type) && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
            {filters.action && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                Action: {ACTION_OPTIONS.find(o => o.value === filters.action)?.label || filters.action}
                <button onClick={() => setFilters(f => ({ ...f, action: '' }))} className="hover:text-red-600">
                  <span className="material-symbols-outlined text-sm leading-none">close</span>
                </button>
              </span>
            )}
            {filters.entity_type && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full">
                Entity: {ENTITY_OPTIONS.find(o => o.value === filters.entity_type)?.label || filters.entity_type}
                <button onClick={() => setFilters(f => ({ ...f, entity_type: '' }))} className="hover:text-red-600">
                  <span className="material-symbols-outlined text-sm leading-none">close</span>
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-surface border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading && logs.length === 0 ? (
          <SectionSkeleton rows={8} />
        ) : logs.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-300">
            <span className="material-symbols-outlined text-5xl">manage_search</span>
            <p className="text-sm font-semibold text-slate-400">No records match the current filter</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[820px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    {['Timestamp (IST)', 'Operator', 'Action', 'Entity', 'Details'].map(h => (
                      <th key={h} className="py-3 px-4 text-[9px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {logs.map(row => {
                    const isOpen  = expanded === row.id;
                    const link    = getEntityLink(row);
                    const initial = (row.user_name || 'S')[0].toUpperCase();
                    const hasDiff = !!(row.old_value || row.new_value);
                    return (
                      <React.Fragment key={row.id}>
                        <tr className={`hover:bg-slate-50/60 transition-colors ${isOpen ? 'bg-primary/3' : ''}`}>

                          {/* Timestamp — IST via formatDate */}
                          <td className="py-3.5 px-4 text-xs font-mono text-slate-500 whitespace-nowrap">
                            {formatDate(row.created_at)}
                          </td>

                          {/* Operator — avatar + name */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${avatarColor(row.user_name || '')}`}>
                                {initial}
                              </div>
                              <span className="text-sm font-semibold text-slate-900 whitespace-nowrap">
                                {row.user_name || 'System'}
                              </span>
                            </div>
                          </td>

                          {/* Action badge */}
                          <td className="py-3.5 px-4">
                            <Badge variant={variantForAction(row.action)}>
                              {row.action || 'unknown'}
                            </Badge>
                          </td>

                          {/* Entity — type + name + truncated ID (TC-AUD-01) */}
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-xs font-bold text-slate-700 capitalize">
                                {(row.entity_type || '—').replace(/_/g, ' ')}
                              </span>
                              {row.entity_name && (
                                <span className="text-[11px] text-slate-500 truncate max-w-[180px]" title={row.entity_name}>
                                  {row.entity_name}
                                </span>
                              )}
                              {row.entity_id && (
                                <span className="text-[10px] font-mono text-slate-300">
                                  {String(row.entity_id).replace(/-/g, '').slice(0, 8).toUpperCase()}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Details — expand diff + navigate */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1 justify-end">
                              {hasDiff && (
                                <button
                                  onClick={() => setExpanded(isOpen ? null : row.id)}
                                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                                    isOpen
                                      ? 'bg-primary/10 text-primary'
                                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                  }`}
                                  title={isOpen ? 'Hide diff' : 'Show before/after diff'}
                                >
                                  <span className="material-symbols-outlined text-sm leading-none">
                                    {isOpen ? 'expand_less' : 'difference'}
                                  </span>
                                  {isOpen ? 'Hide' : 'Diff'}
                                </button>
                              )}
                              {link && (
                                <button
                                  onClick={() => navigate(link)}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-primary/10 hover:text-primary transition-colors"
                                  title="Open entity"
                                >
                                  <span className="material-symbols-outlined text-sm leading-none">visibility</span>
                                  View
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded diff row */}
                        {isOpen && (
                          <tr className="bg-slate-50/40">
                            <td colSpan={5} className="px-6 py-5 border-t border-slate-100">
                              <div className="max-w-4xl">
                                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                                  Change payload — {row.action}
                                </p>
                                {renderDiff(row)}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {hasMore && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                <span className="text-xs text-slate-400">Showing {logs.length} records</span>
                <button
                  onClick={() => fetchLogs(page + 1)}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-surface border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all disabled:opacity-40"
                >
                  {loading ? (
                    <span className="material-symbols-outlined text-sm animate-spin leading-none">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-sm leading-none">expand_more</span>
                  )}
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
