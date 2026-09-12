import { useMemo, useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// ── Constants ─────────────────────────────────────────────────────────────────
const COL_W     = 30;
const ROW_H     = 34;
const NAME_W    = 144;
const HEAD_H    = 52;
const PAST_DAYS = 14;

const PROJ_COLORS = [
  { bg: '#6366f1', text: '#fff' },
  { bg: '#0ea5e9', text: '#fff' },
  { bg: '#10b981', text: '#fff' },
  { bg: '#f59e0b', text: '#fff' },
  { bg: '#8b5cf6', text: '#fff' },
  { bg: '#ec4899', text: '#fff' },
  { bg: '#14b8a6', text: '#fff' },
  { bg: '#f97316', text: '#fff' },
];

const EVENT_STYLE = {
  leave:       { bg: '#fca5a5', text: '#7f1d1d', label: 'Leave' },
  expo:        { bg: '#c4b5fd', text: '#4c1d95', label: 'Expo' },
  training:    { bg: '#6ee7b7', text: '#064e3b', label: 'Training' },
  maintenance: { bg: '#fde68a', text: '#78350f', label: 'Maint.' },
  meeting:     { bg: '#bae6fd', text: '#0c4a6e', label: 'Meeting' },
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseDateYmd = (s) => {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

const diffDays = (a, b) => Math.round((b - a) / 86400000);

const projColor = (projectId, colorMap) => {
  if (!colorMap.has(projectId)) {
    colorMap.set(projectId, PROJ_COLORS[colorMap.size % PROJ_COLORS.length]);
  }
  return colorMap.get(projectId);
};

const shortName = (s) => {
  if (!s) return '';
  return s.length > 14 ? s.split(' ')[0] : s;
};

const UNAVAILABILITY = ['leave', 'training', 'maintenance'];

// Detect every overlapping pair on ONE resource across all of its commitments:
// confirmed project allocations, tentative pipeline windows, and unavailability
// events (leave/training/maintenance). Returns rich pairs for the bars + panel.
const detectConflicts = (row) => {
  const items = [];
  (row.allocations || []).forEach(a => items.push({
    s: parseDateYmd(a.start_date), e: parseDateYmd(a.end_date),
    name: a.project_name, kind: 'project', id: a.project_id,
  }));
  (row.pipeline || []).forEach(p => items.push({
    s: parseDateYmd(p.start_date), e: parseDateYmd(p.end_date),
    name: p.project_name, kind: 'pipeline', id: p.pipeline_id,
  }));
  (row.events || []).forEach(ev => {
    if (!UNAVAILABILITY.includes(ev.event_type)) return;
    items.push({
      s: parseDateYmd(ev.start_date), e: parseDateYmd(ev.end_date),
      name: ev.title || ev.event_type, kind: ev.event_type, id: null,
    });
  });

  const valid = items.filter(a => a.s && a.e);
  const conflicts = [];
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i], b = valid[j];
      // Two allocations of the SAME project are one job window, not a clash.
      if (a.kind === 'project' && b.kind === 'project' && a.id && a.id === b.id) continue;
      if (a.s <= b.e && b.s <= a.e) {
        conflicts.push({
          start: a.s > b.s ? a.s : b.s,
          end:   a.e < b.e ? a.e : b.e,
          a, b,
          label: `${a.name} ↔ ${b.name}`,
        });
      }
    }
  }
  return conflicts;
};

const KIND_BADGE = {
  project:     { label: 'Project',  cls: 'bg-indigo-100 text-indigo-700' },
  pipeline:    { label: 'Pipeline', cls: 'bg-purple-100 text-purple-700' },
  leave:       { label: 'Leave',    cls: 'bg-red-100 text-red-700' },
  training:    { label: 'Training', cls: 'bg-emerald-100 text-emerald-700' },
  maintenance: { label: 'Maint.',   cls: 'bg-amber-100 text-amber-700' },
};

const fmtRange = (s, e) => {
  const f = (d) => d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : '?';
  return `${f(s)} → ${f(e)}`;
};

// Inject keyframes once into document head
let _injected = false;
const injectStyles = () => {
  if (_injected || typeof document === 'undefined') return;
  _injected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes gantt-conflict-blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.25; }
    }
    .gantt-conflict-bar {
      animation: gantt-conflict-blink 0.9s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
};

const fmtDate = (s) => {
  const d = parseDateYmd(s);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const KIND_LABEL = {
  project:     'Project',
  pipeline:    'Pipeline',
  leave:       'Leave',
  training:    'Training',
  maintenance: 'Maintenance',
  meeting:     'Meeting',
};

const KIND_COLOR = {
  project:     'bg-indigo-100 text-indigo-700',
  pipeline:    'bg-purple-100 text-purple-700',
  leave:       'bg-red-100 text-red-700',
  training:    'bg-emerald-100 text-emerald-700',
  maintenance: 'bg-amber-100 text-amber-700',
  meeting:     'bg-sky-100 text-sky-700',
};

// ── Component ─────────────────────────────────────────────────────────────────

const ResourceGantt = ({ rows = [], loading, emptyIcon, emptyText, days = 90 }) => {
  const scrollRef  = useRef(null);
  const colorMap   = useMemo(() => new Map(), [rows]);
  const [markerCol, setMarkerCol] = useState(null);
  const [panelItem, setPanelItem] = useState(null);

  const openPanel = (item) => setPanelItem(item);
  const closePanel = () => setPanelItem(null);

  useEffect(() => { injectStyles(); }, []);

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);

  const rangeStart = useMemo(() => {
    const d = new Date(today); d.setDate(d.getDate() - PAST_DAYS); return d;
  }, [today]);

  const totalDays  = days;
  const todayOffset = PAST_DAYS;

  const dateCols = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(rangeStart); d.setDate(d.getDate() + i); return d;
    });
  }, [rangeStart, totalDays]);

  const monthGroups = useMemo(() => {
    const groups = [];
    let cur = null;
    for (let i = 0; i < dateCols.length; i++) {
      const m = dateCols[i].getMonth();
      const y = dateCols[i].getFullYear();
      const key = `${y}-${m}`;
      if (!cur || cur.key !== key) {
        cur = { key, label: `${MONTHS[m]} ${y}`, start: i, count: 1 };
        groups.push(cur);
      } else { cur.count++; }
    }
    return groups;
  }, [dateCols]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset * COL_W - 80);
    }
  }, [rows.length]);

  // ── Bar helpers ──────────────────────────────────────────────────────────────

  const barProps = (startDateStr, endDateStr) => {
    const s = parseDateYmd(startDateStr);
    const e = parseDateYmd(endDateStr);
    if (!s || !e) return null;
    const startIdx = diffDays(rangeStart, s);
    const endIdx   = diffDays(rangeStart, e);
    const clampedStart = Math.max(0, startIdx);
    const clampedEnd   = Math.min(totalDays - 1, endIdx);
    if (clampedStart > clampedEnd) return null;
    return {
      left:    clampedStart * COL_W,
      width:   (clampedEnd - clampedStart + 1) * COL_W - 2,
      clipped: clampedStart > startIdx || clampedEnd < endIdx,
    };
  };

  const barPropsFromDates = (startDate, endDate) => {
    if (!startDate || !endDate) return null;
    const startIdx = diffDays(rangeStart, startDate);
    const endIdx   = diffDays(rangeStart, endDate);
    const clampedStart = Math.max(0, startIdx);
    const clampedEnd   = Math.min(totalDays - 1, endIdx);
    if (clampedStart > clampedEnd) return null;
    return {
      left:  clampedStart * COL_W,
      width: (clampedEnd - clampedStart + 1) * COL_W,
    };
  };

  // ── States ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-300">
        <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-300">
        <span className="material-symbols-outlined text-3xl">{emptyIcon || 'event_busy'}</span>
        <p className="text-xs font-medium">{emptyText || 'No data'}</p>
      </div>
    );
  }

  // Pre-compute conflicts per row, then flatten for the detail panel below the grid
  const rowConflicts = rows.map(row => detectConflicts(row));
  const allConflicts = rows.flatMap((row, i) =>
    rowConflicts[i].map(cf => ({ ...cf, resource: row.pilot_name || row.drone_name || '—' }))
  );
  const gridH = rows.length * ROW_H;

  return (
   <>
   <div>
    <div className="flex select-none" style={{ minHeight: HEAD_H + gridH }}>

      {/* ── Frozen name column ─────────────────────────────────────────────── */}
      <div className="shrink-0 z-10 bg-surface border-r border-slate-200" style={{ width: NAME_W }}>
        <div style={{ height: HEAD_H }} className="border-b border-slate-200 bg-slate-50 flex items-end pb-1 px-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Resource</span>
        </div>

        {rows.map((row, i) => {
          const hasConflict = rowConflicts[i].length > 0;
          return (
            <div
              key={row.pilot_id || row.drone_id || i}
              className="flex items-center px-3 border-b border-slate-100"
              style={{ height: ROW_H }}
            >
              {/* Avatar */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mr-2 ${
                hasConflict ? 'bg-red-100 text-red-600' : 'bg-primary/10 text-primary'
              }`}>
                {(row.pilot_name || row.drone_name || '?')[0].toUpperCase()}
              </div>

              <span className="text-[12px] font-semibold text-slate-800 truncate leading-tight flex-1">
                {shortName(row.pilot_name || row.drone_name || '—')}
              </span>

              {/* Conflict badge */}
              {hasConflict && (
                <span
                  title={`${rowConflicts[i].length} scheduling conflict${rowConflicts[i].length > 1 ? 's' : ''}`}
                  className="ml-1 shrink-0 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center gantt-conflict-bar"
                  style={{ fontSize: 8, color: '#fff', fontWeight: 900 }}
                >
                  !
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Scrollable timeline ────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto custom-scrollbar" style={{ minWidth: 0 }}>
        <div style={{ width: totalDays * COL_W, position: 'relative' }}>

          {/* Month header */}
          <div className="flex border-b border-slate-200 bg-slate-50" style={{ height: HEAD_H / 2 }}>
            {monthGroups.map(mg => (
              <div
                key={mg.key}
                className="border-r border-slate-200 flex items-center px-2 shrink-0"
                style={{ width: mg.count * COL_W, height: HEAD_H / 2 }}
              >
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap overflow-hidden">
                  {mg.label}
                </span>
              </div>
            ))}
          </div>

          {/* Day header */}
          <div className="flex border-b border-slate-200 bg-slate-50" style={{ height: HEAD_H / 2 }}>
            {dateCols.map((d, i) => {
              const isToday    = i === todayOffset;
              const isWeekend  = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-center shrink-0 border-r text-[10px] font-semibold
                    ${isToday ? 'bg-primary text-on-primary' : isWeekend ? 'bg-slate-100 text-slate-400' : 'text-slate-500 border-slate-100'}`}
                  style={{ width: COL_W, height: HEAD_H / 2 }}
                >
                  {d.getDate()}
                </div>
              );
            })}
          </div>

          {/* Grid body */}
          <div
            style={{ position: 'relative', height: gridH, cursor: 'crosshair' }}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const col  = Math.floor((e.clientX - rect.left) / COL_W);
              setMarkerCol(prev => prev === col ? null : col);
            }}
          >

            {/* Weekend shading */}
            {dateCols.map((d, i) => (
              (d.getDay() === 0 || d.getDay() === 6) ? (
                <div key={i} style={{ position: 'absolute', left: i * COL_W, top: 0, width: COL_W, height: gridH }}
                  className="bg-slate-50/80 pointer-events-none" />
              ) : null
            ))}

            {/* Today line */}
            <div
              style={{ position: 'absolute', left: todayOffset * COL_W + COL_W / 2 - 1, top: 0, width: 2, height: gridH }}
              className="bg-primary/40 pointer-events-none z-10"
            />

            {/* Clicked-date marker line */}
            {markerCol !== null && markerCol >= 0 && markerCol < totalDays && (() => {
              const d   = dateCols[markerCol];
              const lx  = markerCol * COL_W + COL_W / 2;
              const label = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
              const chipW = label.length * 6.5 + 14;
              const chipX = Math.min(Math.max(lx - chipW / 2, 2), totalDays * COL_W - chipW - 2);
              return (
                <>
                  {/* Vertical line */}
                  <div
                    style={{
                      position: 'absolute', left: lx - 1, top: 0,
                      width: 2, height: gridH,
                      background: '#334155',
                      opacity: 0.75,
                      zIndex: 20,
                      pointerEvents: 'none',
                    }}
                  />
                  {/* Date chip at top */}
                  <div
                    style={{
                      position: 'absolute', left: chipX, top: 4,
                      background: '#334155', color: '#fff',
                      fontSize: 10, fontWeight: 800,
                      padding: '2px 7px', borderRadius: 5,
                      whiteSpace: 'nowrap',
                      zIndex: 21,
                      pointerEvents: 'none',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                    }}
                  >
                    {label}
                  </div>
                </>
              );
            })()}

            {/* Row dividers */}
            {rows.map((_, i) => (
              <div key={i}
                style={{ position: 'absolute', left: 0, top: (i + 1) * ROW_H - 1, width: '100%', height: 1 }}
                className="bg-slate-100 pointer-events-none"
              />
            ))}

            {/* Bars per row */}
            {rows.map((row, ri) => {
              const topY    = ri * ROW_H + 4;
              const barH    = ROW_H - 8;
              const conflicts = rowConflicts[ri];

              return (
                <div key={row.pilot_id || row.drone_id || ri}>

                  {/* Project allocation bars */}
                  {(row.allocations || []).map((alloc, ai) => {
                    const bp = barProps(alloc.start_date, alloc.end_date);
                    if (!bp) return null;
                    const color = projColor(alloc.project_id, colorMap);
                    return (
                      <div
                        key={ai}
                        title={`${alloc.project_name}\n${alloc.start_date} → ${alloc.end_date}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openPanel({
                            kind: 'project',
                            name: alloc.project_name,
                            startDate: alloc.start_date,
                            endDate: alloc.end_date,
                            projectId: alloc.project_id,
                            resourceName: row.pilot_name || row.drone_name,
                            resourceType: row.pilot_name ? 'pilot' : 'drone',
                            conflicts: rowConflicts[ri].filter(cf =>
                              (cf.a.kind === 'project' && cf.a.id === alloc.project_id) ||
                              (cf.b.kind === 'project' && cf.b.id === alloc.project_id)
                            ),
                          });
                        }}
                        style={{
                          position: 'absolute', left: bp.left, top: topY,
                          width: bp.width, height: barH,
                          backgroundColor: color.bg, color: color.text,
                          borderRadius: bp.clipped ? '0' : '5px',
                          overflow: 'hidden', display: 'flex', alignItems: 'center',
                          paddingLeft: 6, paddingRight: 4,
                          fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                          cursor: 'pointer', zIndex: 5,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        }}
                      >
                        {bp.width > 28 && shortName(alloc.project_name)}
                      </div>
                    );
                  })}

                  {/* Pipeline (tentative) bars — dashed purple */}
                  {(row.pipeline || []).map((pipe, pi) => {
                    const bp = barProps(pipe.start_date, pipe.end_date);
                    if (!bp) return null;
                    return (
                      <div
                        key={`pipe-${pi}`}
                        title={`[Pipeline] ${pipe.project_name}\n${pipe.start_date} → ${pipe.end_date}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openPanel({
                            kind: 'pipeline',
                            name: pipe.project_name,
                            startDate: pipe.start_date,
                            endDate: pipe.end_date,
                            pipelineId: pipe.pipeline_id,
                            resourceName: row.pilot_name || row.drone_name,
                            resourceType: row.pilot_name ? 'pilot' : 'drone',
                            conflicts: rowConflicts[ri].filter(cf =>
                              (cf.a.kind === 'pipeline' && cf.a.id === pipe.pipeline_id) ||
                              (cf.b.kind === 'pipeline' && cf.b.id === pipe.pipeline_id)
                            ),
                          });
                        }}
                        style={{
                          position: 'absolute', left: bp.left, top: topY,
                          width: bp.width, height: barH,
                          background: 'rgba(168,85,247,0.14)',
                          border: '2px dashed #a855f7',
                          color: '#6d28d9',
                          borderRadius: bp.clipped ? '0' : '5px',
                          overflow: 'hidden', display: 'flex', alignItems: 'center',
                          paddingLeft: 6, paddingRight: 4,
                          fontSize: 10, fontWeight: 700, fontStyle: 'italic',
                          whiteSpace: 'nowrap', cursor: 'pointer', zIndex: 3,
                        }}
                      >
                        {bp.width > 28 && shortName(pipe.project_name)}
                      </div>
                    );
                  })}

                  {/* Calendar event bars */}
                  {(row.events || []).map((ev, ei) => {
                    const bp = barProps(ev.start_date, ev.end_date);
                    if (!bp) return null;
                    const st = EVENT_STYLE[ev.event_type] || { bg: '#e2e8f0', text: '#475569', label: ev.event_type };
                    return (
                      <div
                        key={`ev-${ei}`}
                        title={`${ev.title || st.label}\n${ev.start_date} → ${ev.end_date}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openPanel({
                            kind: ev.event_type || 'other',
                            name: ev.title || st.label,
                            startDate: ev.start_date,
                            endDate: ev.end_date,
                            notes: ev.notes || null,
                            resourceName: row.pilot_name || row.drone_name,
                            resourceType: row.pilot_name ? 'pilot' : 'drone',
                            conflicts: rowConflicts[ri].filter(cf =>
                              cf.a.kind === ev.event_type || cf.b.kind === ev.event_type
                            ),
                          });
                        }}
                        style={{
                          position: 'absolute', left: bp.left, top: topY,
                          width: bp.width, height: barH,
                          backgroundColor: st.bg, color: st.text,
                          borderRadius: '4px', overflow: 'hidden',
                          display: 'flex', alignItems: 'center', paddingLeft: 5,
                          fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                          cursor: 'pointer', zIndex: 4,
                          border: `1px dashed ${st.text}44`,
                        }}
                      >
                        {bp.width > 28 && (ev.title || st.label)}
                      </div>
                    );
                  })}

                  {/* ── Conflict overlay bars (blinking red) ─────────────── */}
                  {conflicts.map((cf, ci) => {
                    const bp = barPropsFromDates(cf.start, cf.end);
                    if (!bp) return null;
                    return (
                      <div key={`cf-${ci}`}>
                        {/* Full-height red stripe behind the overlap zone */}
                        <div
                          title={`⚠ Scheduling conflict: ${cf.label}`}
                          className="gantt-conflict-bar"
                          style={{
                            position: 'absolute',
                            left: bp.left,
                            top: ri * ROW_H,         // full row height, not just bar
                            width: bp.width,
                            height: ROW_H,
                            background: 'repeating-linear-gradient(45deg, rgba(239,68,68,0.18) 0px, rgba(239,68,68,0.18) 4px, transparent 4px, transparent 10px)',
                            pointerEvents: 'none',
                            zIndex: 8,
                          }}
                        />
                        {/* Red border bar on top */}
                        <div
                          title={`⚠ Conflict: ${cf.label}`}
                          className="gantt-conflict-bar"
                          style={{
                            position: 'absolute',
                            left: bp.left,
                            top: topY - 1,
                            width: bp.width,
                            height: barH + 2,
                            border: '2px solid #ef4444',
                            borderRadius: '5px',
                            pointerEvents: 'none',
                            zIndex: 9,
                            boxShadow: '0 0 6px rgba(239,68,68,0.6)',
                          }}
                        />
                        {/* "CONFLICT" label chip */}
                        {bp.width > 44 && (
                          <div
                            className="gantt-conflict-bar"
                            style={{
                              position: 'absolute',
                              left: bp.left + 4,
                              top: topY + 1,
                              height: barH - 2,
                              display: 'flex', alignItems: 'center',
                              background: '#ef4444',
                              color: '#fff',
                              fontSize: 9,
                              fontWeight: 900,
                              paddingLeft: 4, paddingRight: 4,
                              borderRadius: 3,
                              whiteSpace: 'nowrap',
                              pointerEvents: 'none',
                              zIndex: 10,
                              letterSpacing: '0.05em',
                            }}
                          >
                            ⚠ CONFLICT
                          </div>
                        )}
                      </div>
                    );
                  })}

                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>

    {/* ── Conflict detail panel — accurate who/what/when under the chart ─────── */}
    {allConflicts.length > 0 && (
      <div className="border-t border-red-200 bg-red-50/60">
        <div className="px-4 py-2.5 flex items-center gap-2 border-b border-red-100">
          <span className="material-symbols-outlined text-red-500 text-base gantt-conflict-bar">warning</span>
          <span className="text-[11px] font-black uppercase tracking-widest text-red-700">
            {allConflicts.length} Scheduling Conflict{allConflicts.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="p-3 space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
          {allConflicts.map((cf, i) => {
            const aB = KIND_BADGE[cf.a.kind] || { label: cf.a.kind, cls: 'bg-slate-100 text-slate-600' };
            const bB = KIND_BADGE[cf.b.kind] || { label: cf.b.kind, cls: 'bg-slate-100 text-slate-600' };
            const Side = ({ side, badge }) => {
              const inner = (
                <>
                  <span className="font-bold text-slate-800 truncate">{side.name}</span>
                  <span className={`shrink-0 inline-block px-1.5 py-px rounded text-[8px] font-bold uppercase tracking-wide ${badge.cls}`}>{badge.label}</span>
                </>
              );
              const cls = 'flex items-center gap-1.5 min-w-0';
              if (side.kind === 'project' && side.id) return <a href={`/projects/${side.id}`} className={`${cls} hover:underline`}>{inner}</a>;
              if (side.kind === 'pipeline') return <a href="/pipeline" className={`${cls} hover:underline`}>{inner}</a>;
              return <span className={cls}>{inner}</span>;
            };
            return (
              <div key={i} className="bg-surface border border-red-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                <span className="flex items-center gap-1 font-black text-red-700 shrink-0">
                  <span className="material-symbols-outlined text-sm">priority_high</span>{cf.resource}
                </span>
                <Side side={cf.a} badge={aB} />
                <span className="text-red-400 font-black shrink-0">⇄</span>
                <Side side={cf.b} badge={bB} />
                <span className="ml-auto shrink-0 font-mono text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
                  {fmtRange(cf.start, cf.end)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    )}
   </div>

    {/* ── Bar detail slide-in panel ──────────────────────────────────────────── */}
    {createPortal(
      <>
        {panelItem && (
          <div
            className="fixed inset-0 z-[1250] bg-slate-900/30 backdrop-blur-sm"
            onClick={closePanel}
          />
        )}
        <aside
          className={`fixed top-0 right-0 h-screen w-full sm:w-[360px] md:w-[420px] bg-surface border-l border-slate-200 shadow-pop z-[1260] transform transition-transform duration-300 ease-out flex flex-col ${
            panelItem ? 'translate-x-0' : 'translate-x-full'
          }`}
          aria-hidden={!panelItem}
        >
          {panelItem && (
            <>
              {/* Header */}
              <div className="flex justify-between items-start px-6 pt-6 pb-4 border-b border-slate-100">
                <div className="min-w-0">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-2 ${KIND_COLOR[panelItem.kind] || 'bg-slate-100 text-slate-600'}`}>
                    {KIND_LABEL[panelItem.kind] || panelItem.kind}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 leading-snug">{panelItem.name || '—'}</h2>
                </div>
                <button
                  onClick={closePanel}
                  className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-1.5 transition-colors shrink-0 ml-3"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">

                {/* Conflict warning */}
                {panelItem.conflicts?.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-red-700">
                      <span className="material-symbols-outlined text-base">warning</span>
                      <span className="text-[11px] font-bold uppercase tracking-widest">Scheduling Conflict</span>
                    </div>
                    {panelItem.conflicts.map((cf, ci) => (
                      <p key={ci} className="text-[11px] text-red-800 leading-snug border-t border-red-200/70 pt-1.5">
                        <span className="font-bold">{cf.a.name}</span>
                        <span className="mx-1 text-red-400">⇄</span>
                        <span className="font-bold">{cf.b.name}</span>
                        <span className="block text-red-500 font-mono text-[10px] mt-0.5">
                          {fmtDate(cf.start)} → {fmtDate(cf.end)}
                        </span>
                      </p>
                    ))}
                  </div>
                )}

                {/* Date range */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Starts</p>
                    <p className="text-slate-900 text-sm font-mono">{fmtDate(panelItem.startDate)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Ends</p>
                    <p className="text-slate-900 text-sm font-mono">{fmtDate(panelItem.endDate)}</p>
                  </div>
                </div>

                {/* Resource */}
                {panelItem.resourceName && (
                  <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-slate-100">
                    <span className="material-symbols-outlined text-indigo-500">
                      {panelItem.resourceType === 'drone' ? 'airplanemode_active' : 'person'}
                    </span>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                        {panelItem.resourceType === 'drone' ? 'Drone' : 'Pilot'}
                      </p>
                      <p className="text-sm text-slate-900 font-semibold">{panelItem.resourceName}</p>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {panelItem.notes && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Notes</p>
                    <p className="text-sm text-slate-600 leading-relaxed">{panelItem.notes}</p>
                  </div>
                )}

                {/* CTA */}
                {panelItem.projectId && (
                  <a
                    href={`/projects/${panelItem.projectId}`}
                    className="block w-full text-center bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl py-2.5 text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    Open Full Project →
                  </a>
                )}
                {panelItem.pipelineId && (
                  <a
                    href="/pipeline"
                    className="block w-full text-center bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl py-2.5 text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    Open Pipeline →
                  </a>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100">
                <button
                  onClick={closePanel}
                  className="w-full py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </aside>
      </>,
      document.body
    )}
   </>
  );
};

export default ResourceGantt;
