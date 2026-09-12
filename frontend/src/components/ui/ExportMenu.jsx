import { useRef, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

/**
 * Dropdown export button: CSV + Excel.
 *
 * Props:
 *   data        — array of row objects (already fetched, as displayed)
 *   columns     — [{ header: string, key: string, format?: (val, row) => string }]
 *   filename    — base filename without extension (e.g. 'niyamak_projects')
 *   label       — optional button label (default 'Export')
 */
export const ExportMenu = ({ data = [], columns = [], filename = 'export', label = 'Export' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const buildRows = () =>
    data.map(row => {
      const out = {};
      columns.forEach(col => {
        out[col.header] = col.format ? col.format(row[col.key], row) : (row[col.key] ?? '');
      });
      return out;
    });

  const exportCSV = () => {
    const rows = buildRows();
    const headers = columns.map(c => c.header);
    const lines = [
      headers.join(','),
      ...rows.map(r => headers.map(h => {
        const v = String(r[h] ?? '');
        return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${filename}.csv`; a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const exportExcel = () => {
    const rows = buildRows();
    const ws = XLSX.utils.json_to_sheet(rows, { header: columns.map(c => c.header) });
    // Auto column widths
    const colWidths = columns.map(col => ({
      wch: Math.max(col.header.length, ...rows.map(r => String(r[col.header] ?? '').length), 10),
    }));
    ws['!cols'] = colWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}.xlsx`);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-700 bg-surface border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl shadow-soft transition-all"
      >
        <span className="material-symbols-outlined text-base leading-none">download</span>
        {label}
        <span className="material-symbols-outlined text-sm leading-none text-slate-400">expand_more</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-surface border border-slate-200 rounded-xl shadow-pop w-44 py-1 animate-scale-in origin-top-right">
          <button
            onClick={exportCSV}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span className="material-symbols-outlined text-base text-slate-400">table_view</span>
            Export CSV
          </button>
          <button
            onClick={exportExcel}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span className="material-symbols-outlined text-base text-green-600">grid_on</span>
            Export Excel
          </button>
        </div>
      )}
    </div>
  );
};
