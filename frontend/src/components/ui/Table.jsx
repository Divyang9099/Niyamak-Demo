import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import clsx from 'clsx';
import { EmptyState } from './EmptyState';

const DENSITY_KEY = 'niyamak_table_density';

const sortValueOf = (col, row) =>
  col.sortValue ? col.sortValue(row) : (col.accessorKey ? row[col.accessorKey] : undefined);

const compareValues = (a, b) => {
  const aNull = a == null || a === '';
  const bNull = b == null || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

// ── Column Visibility Picker ───────────────────────────────────────────────
const ColPicker = ({ columns, hidden, setHidden }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pickable = columns.filter(c => typeof c.header === 'string' && c.header);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Show / hide columns"
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
      >
        <span className="material-symbols-outlined text-sm leading-none">view_column</span>
        <span className="hidden sm:inline">Columns</span>
        <span className="material-symbols-outlined text-xs leading-none text-slate-400">expand_more</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-slate-200 rounded-xl shadow-pop w-48 py-1.5 animate-scale-in origin-top-right">
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Show columns</p>
          {pickable.map((col, i) => {
            const idx = columns.indexOf(col);
            const visible = !hidden.has(idx);
            return (
              <label key={i} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => setHidden(prev => {
                    const next = new Set(prev);
                    if (next.has(idx)) next.delete(idx); else next.add(idx);
                    return next;
                  })}
                  className="rounded border-slate-300 text-primary focus:ring-primary/30 w-3.5 h-3.5"
                />
                {col.header}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ── Density Toggle ─────────────────────────────────────────────────────────
const DensityToggle = ({ density, setDensity }) => (
  <button
    onClick={() => setDensity(d => d === 'comfortable' ? 'compact' : 'comfortable')}
    title={density === 'comfortable' ? 'Switch to compact view' : 'Switch to comfortable view'}
    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
  >
    <span className="material-symbols-outlined text-sm leading-none">
      {density === 'comfortable' ? 'density_small' : 'density_medium'}
    </span>
    <span className="hidden sm:inline capitalize">{density === 'comfortable' ? 'Compact' : 'Comfortable'}</span>
  </button>
);

/**
 * Table — sortable, with optional column visibility and density toggles.
 *
 * Extra props (all optional):
 *   visibilityKey  string  — enables column picker; key for localStorage persistence
 *   allowDensity   bool    — shows density toggle (default: true when visibilityKey present)
 */
export const Table = React.memo(({
  columns, data, className, onRowClick, empty, rowClassName,
  visibilityKey, allowDensity,
}) => {
  const isSortable = (col) =>
    col.sortable === true ||
    (col.sortable !== false && typeof col.header === 'string' && (col.accessorKey || col.sortValue));

  const [sort, setSort] = useState({ index: null, dir: null });
  const [focusedRow, setFocusedRow] = useState(null);
  const tbodyRef = useRef(null);

  // ── Density (global, shared across all Table instances) ──────────────────
  const showDensity = allowDensity !== undefined ? allowDensity : !!visibilityKey;
  const [density, setDensityState] = useState(() => {
    try { return localStorage.getItem(DENSITY_KEY) || 'comfortable'; } catch { return 'comfortable'; }
  });
  const setDensity = (updater) => {
    const next = typeof updater === 'function' ? updater(density) : updater;
    setDensityState(next);
    try { localStorage.setItem(DENSITY_KEY, next); } catch {}
  };

  // ── Column visibility ────────────────────────────────────────────────────
  const [hidden, setHiddenState] = useState(() => {
    if (!visibilityKey) return new Set();
    try {
      const stored = JSON.parse(localStorage.getItem(`niyamak_cols_${visibilityKey}`) || '[]');
      return new Set(stored);
    } catch { return new Set(); }
  });
  const setHidden = (updater) => {
    const next = typeof updater === 'function' ? updater(hidden) : updater;
    setHiddenState(next);
    if (visibilityKey) {
      try { localStorage.setItem(`niyamak_cols_${visibilityKey}`, JSON.stringify([...next])); } catch {}
    }
  };

  const visibleColumns = useMemo(
    () => columns.filter((_, i) => !hidden.has(i)),
    [columns, hidden]
  );

  const sortedData = useMemo(() => {
    if (sort.index == null || !sort.dir || !Array.isArray(data)) return data;
    const col = columns[sort.index];
    if (!col) return data;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...data].sort((r1, r2) => factor * compareValues(sortValueOf(col, r1), sortValueOf(col, r2)));
  }, [data, sort, columns]);

  const toggleSort = (index) => {
    setSort(prev => {
      if (prev.index !== index) return { index, dir: 'asc' };
      if (prev.dir === 'asc') return { index, dir: 'desc' };
      return { index: null, dir: null };
    });
  };

  const rows = sortedData;
  const hasData = rows && rows.length > 0;

  const handleTableKeyDown = useCallback((e) => {
    if (!onRowClick || !rows?.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedRow(i => { const next = i == null ? 0 : Math.min(i + 1, rows.length - 1); tbodyRef.current?.children[next]?.focus(); return next; });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedRow(i => { const next = i == null ? 0 : Math.max(i - 1, 0); tbodyRef.current?.children[next]?.focus(); return next; });
    } else if (e.key === 'Enter' && focusedRow != null && rows[focusedRow]) {
      onRowClick(rows[focusedRow]);
    }
  }, [onRowClick, focusedRow, rows]);

  const emptyEl = <EmptyState
    icon={empty?.icon}
    title={empty?.title || 'No records yet'}
    description={empty?.description}
    action={empty?.action}
  />;

  const labelledCols = visibleColumns.filter(c => c.header);
  const rowPadding = density === 'compact' ? 'py-2' : 'py-3.5';
  const showControls = visibilityKey || showDensity;

  return (
    <div className={clsx('w-full', className)}>

      {/* ── Controls bar (column picker + density) ──────────────────── */}
      {showControls && (
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/60">
          {showDensity && <DensityToggle density={density} setDensity={setDensity} />}
          {visibilityKey && <ColPicker columns={columns} hidden={hidden} setHidden={setHidden} />}
        </div>
      )}

      {/* ── Mobile card list ─────────────────────────────────────────── */}
      <div className="sm:hidden divide-y divide-slate-100">
        {hasData ? rows.map((row, rowIndex) => (
          <div
            key={row?.id ?? rowIndex}
            onClick={onRowClick ? (e) => onRowClick(row, e) : undefined}
            className={clsx(
              'px-4 py-3 space-y-2',
              onRowClick && 'cursor-pointer active:bg-slate-50',
              rowClassName && rowClassName(row, rowIndex),
            )}
          >
            {labelledCols.map((col, colIndex) => (
              <div key={colIndex} className="flex items-start justify-between gap-3 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap flex-shrink-0 pt-px">
                  {col.header}
                </span>
                <span className="text-sm text-slate-700 text-right min-w-0 break-words">
                  {col.cell ? col.cell(row) : row[col.accessorKey]}
                </span>
              </div>
            ))}
            {visibleColumns.filter(c => !c.header).map((col, i) => (
              <div key={`action-${i}`} className="flex justify-end pt-1">
                {col.cell ? col.cell(row) : null}
              </div>
            ))}
          </div>
        )) : emptyEl}
      </div>

      {/* ── Desktop table ────────────────────────────────────────────── */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 uppercase tracking-widest text-[10px] text-slate-500 font-bold">
              {visibleColumns.map((col, index) => {
                const origIdx = columns.indexOf(col);
                const sortable = isSortable(col);
                const active = sort.index === origIdx && sort.dir;
                return (
                  <th
                    key={index}
                    onClick={sortable ? () => toggleSort(origIdx) : undefined}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={clsx(
                      'py-3 px-4 whitespace-nowrap select-none sticky top-0 z-20 bg-slate-50',
                      sortable && 'cursor-pointer hover:text-slate-700 transition-colors',
                      col.stickyRight && 'right-0 z-30 shadow-[-8px_0_8px_-6px_rgba(15,23,42,0.08)]',
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {sortable && (
                        <span className={clsx(
                          'material-symbols-outlined text-[14px] leading-none transition-colors',
                          active ? 'text-primary' : 'text-slate-300',
                        )}>
                          {active ? (sort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody ref={tbodyRef} onKeyDown={handleTableKeyDown} className="divide-y divide-slate-100">
            {hasData ? (
              rows.map((row, rowIndex) => {
                const rowCls = rowClassName ? rowClassName(row, rowIndex) : '';
                const isFocused = focusedRow === rowIndex;
                return (
                  <tr
                    key={row?.id ?? rowIndex}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? (e) => { setFocusedRow(rowIndex); onRowClick(row, e); } : undefined}
                    onFocus={() => setFocusedRow(rowIndex)}
                    className={clsx(
                      'hover:bg-slate-50/80 transition-colors duration-150 group outline-none',
                      onRowClick && 'cursor-pointer',
                      isFocused && 'ring-2 ring-inset ring-primary/40 bg-primary/5',
                      rowCls,
                    )}
                  >
                    {visibleColumns.map((col, colIndex) => (
                      <td
                        key={colIndex}
                        className={clsx(
                          `${rowPadding} px-4 text-sm text-slate-700 whitespace-nowrap transition-all`,
                          col.stickyRight && (rowCls
                            ? 'sticky right-0 z-10 bg-inherit shadow-[-8px_0_8px_-6px_rgba(15,23,42,0.08)]'
                            : 'sticky right-0 z-10 bg-surface group-hover:bg-slate-50 shadow-[-8px_0_8px_-6px_rgba(15,23,42,0.08)]'),
                        )}
                      >
                        {col.cell ? col.cell(row) : row[col.accessorKey]}
                      </td>
                    ))}
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan={visibleColumns.length}>{emptyEl}</td></tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
});

Table.displayName = 'Table';
