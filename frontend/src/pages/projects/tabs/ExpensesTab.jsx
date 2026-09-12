import React, { useEffect, useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import axiosInstance from '../../../api/axios';
import { ENDPOINTS } from '../../../api/endpoints';
import { useDialog } from '../../../context/DialogContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts';

// ── Constants ────────────────────────────────────────────────────────────────
const METHODS = [
  { value: 'cash',   label: '💵 Cash'   },
  { value: 'upi',    label: '📱 UPI'    },
  { value: 'online', label: '🌐 Online' },
  { value: 'card',   label: '💳 Card'   },
  { value: 'cheque', label: '📄 Cheque' },
];

const CATEGORIES = [
  { value: 'fuel',          label: 'Fuel',          color: '#F59E0B' },
  { value: 'accommodation', label: 'Accommodation',  color: '#3B82F6' },
  { value: 'equipment',     label: 'Equipment',      color: '#8B5CF6' },
  { value: 'labour',        label: 'Labour',         color: '#10B981' },
  { value: 'food',          label: 'Food',           color: '#F97316' },
  { value: 'travel',        label: 'Travel',         color: '#06B6D4' },
  { value: 'general',       label: 'General',        color: '#6366F1' },
  { value: 'misc',          label: 'Miscellaneous',  color: '#94A3B8' },
];

const VALID_CATEGORIES = CATEGORIES.map(c => c.value);

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const EMPTY_FORM = {
  method: 'cash',
  bank_name: '',
  category: 'general',
  description: '',
  expense_date: new Date().toISOString().split('T')[0],
  amount: '',
  member_id: '',
};

// ── Spreadsheet / CSV parser (SheetJS) ───────────────────────────────────────
const CAT_NORM = {
  stay: 'accommodation', accommodation: 'accommodation',
  advance: 'general',    receipt: 'general',
  other: 'misc',         misc: 'misc',
  food: 'food',          travel: 'travel',
  fuel: 'fuel',          petrol: 'fuel',
  equipment: 'equipment',labour: 'labour', labor: 'labour',
  general: 'general',
};

function normCat(v) {
  const s = (v || '').trim().toLowerCase();
  return CAT_NORM[s] || (VALID_CATEGORIES.includes(s) ? s : 'general');
}

// Convert an Excel serial date OR a string date to ISO YYYY-MM-DD
function parseDate(v) {
  if (v == null || v === '') return null;

  // SheetJS parses date cells as JS Date objects when cellDates:true is set
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Already ISO
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // D/M/YYYY or M/D/YYYY — Indian D/M/YYYY assumed
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = '20' + y;
    // If first part > 12 it must be day; otherwise treat as D/M/YYYY (Indian)
    const day = Number(a) > 12 ? a : a;
    const mon = Number(a) > 12 ? b : b;
    return `${y}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

function parseSpreadsheet(buffer, filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();

  let rows;
  if (ext === 'csv' || ext === 'txt') {
    // For CSV/txt SheetJS is still the most robust parser (handles BOM, encodings)
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
  } else {
    // .xlsx / .xls
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
  }

  if (!rows || rows.length < 2) return [];

  // Find header row (first non-empty row)
  const headerRow = rows[0].map(h => String(h || '').toLowerCase().trim().replace(/[\s\-]+/g, '_'));

  const col = (row, ...names) => {
    for (const name of names) {
      const idx = headerRow.indexOf(name);
      if (idx >= 0 && row[idx] !== undefined && row[idx] !== '') return String(row[idx]).trim();
    }
    return '';
  };

  return rows.slice(1).map((row, i) => {
    // Skip fully empty rows
    if (!row.some(c => c !== '' && c != null)) return null;

    const dateRaw    = col(row, 'date', 'expense_date', 'date_of_expense', 'transaction_date');
    const amountRaw  = col(row, 'amount', 'amt', 'expense_amount', 'value');
    const categoryRaw= col(row, 'category', 'expense_category', 'type_of_expense', 'type');
    const description= col(row, 'description', 'desc', 'note', 'remarks', 'details', 'narration');

    const expense_date = parseDate(dateRaw);
    const cleanAmt = (amountRaw || '').replace(/,/g, '').replace(/[₹$]/g, '').trim();
    const amount   = parseFloat(cleanAmt);

    const errors = [];
    if (!expense_date) errors.push('Invalid date');
    if (isNaN(amount) || amount <= 0) errors.push('Invalid amount');

    return {
      _row:      i + 2,
      _valid:    errors.length === 0,
      _errors:   errors,
      expense_date,
      amount:    isNaN(amount) ? 0 : amount,
      category:  normCat(categoryRaw),
      description,
      method:    'cash',
      dateRaw,
      amountRaw,
      categoryRaw,
    };
  }).filter(Boolean);
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ExpensesTab({ projectId, members = [], canEdit = false, showToast }) {
  const { confirmDialog } = useDialog();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(null);
  const [clearing,  setClearing]  = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [showForm,  setShowForm]  = useState(false);

  // CSV import state
  const csvInputRef = useRef(null);
  const [importRows,    setImportRows]    = useState([]);
  const [importState,   setImportState]   = useState('idle'); // idle | preview | importing
  const [importFilter,  setImportFilter]  = useState('valid'); // valid | all

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(ENDPOINTS.PROJECTS.EXPENSES(projectId));
      setData(res.data.data);
    } catch (err) {
      showToast(err.userMessage || 'Failed to load expenses', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // ── Add single expense ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) {
      showToast('Enter a valid amount', 'error'); return;
    }
    if (!form.expense_date) {
      showToast('Expense date is required', 'error'); return;
    }
    setSaving(true);
    try {
      await axiosInstance.post(ENDPOINTS.PROJECTS.EXPENSES(projectId), {
        ...form,
        amount:    Number(form.amount),
        member_id: form.member_id || undefined,
        bank_name: form.bank_name.trim() || undefined,
      });
      showToast('Expense added');
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      showToast(err.userMessage || 'Failed to save expense', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (expId) => {
    if (!(await confirmDialog({ message: 'Delete this expense? This cannot be undone.', danger: true }))) return;
    setDeleting(expId);
    try {
      await axiosInstance.delete(ENDPOINTS.PROJECTS.EXPENSE(projectId, expId));
      showToast('Expense deleted');
      load();
    } catch (err) {
      showToast(err.userMessage || 'Failed to delete expense', 'error');
    } finally {
      setDeleting(null);
    }
  };

  // ── Delete every expense on the project ────────────────────────────────────
  const handleDeleteAll = async () => {
    const count = data?.expenses?.length || 0;
    if (!count) return;
    const ok = await confirmDialog({
      title: 'Delete all expenses?',
      message: `This permanently removes all ${count} expense${count !== 1 ? 's' : ''} (${fmt(data.total)}) from this project. This cannot be undone.`,
      confirmLabel: 'Delete All',
      danger: true,
    });
    if (!ok) return;
    setClearing(true);
    try {
      const res = await axiosInstance.delete(ENDPOINTS.PROJECTS.EXPENSES(projectId));
      showToast(res.data?.message || 'All expenses deleted');
      load();
    } catch (err) {
      showToast(err.userMessage || 'Failed to delete expenses', 'error');
    } finally {
      setClearing(false);
    }
  };

  // ── CSV import handlers ────────────────────────────────────────────────────
  const handleCSVPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseSpreadsheet(new Uint8Array(ev.target.result), file.name);
        if (!parsed.length) { showToast('No data rows found in file — check column headers', 'error'); return; }
        setImportRows(parsed);
        setImportState('preview');
      } catch (err) {
        showToast('Could not read file — try saving as .csv from Excel', 'error');
      }
    };
    reader.readAsArrayBuffer(file); // ArrayBuffer works for both xlsx and csv
    e.target.value = '';
  };

  const confirmImport = async () => {
    const validRows = importRows.filter(r => r._valid);
    if (!validRows.length) { showToast('No valid rows to import', 'error'); return; }
    setImportState('importing');
    try {
      const payload = validRows.map(r => ({
        expense_date: r.expense_date,
        amount:       r.amount,
        category:     r.category,
        description:  r.description || '',
        method:       'cash',
      }));
      const res = await axiosInstance.post(ENDPOINTS.PROJECTS.EXPENSES_IMPORT(projectId), { rows: payload });
      const { inserted, errors } = res.data.data;
      showToast(
        `Imported ${inserted} expense${inserted !== 1 ? 's' : ''}${errors.length ? ` · ${errors.length} skipped` : ''}`,
        'success'
      );
      setImportState('idle');
      setImportRows([]);
      load();
    } catch (err) {
      showToast(err.userMessage || 'Import failed', 'error');
      setImportState('preview');
    }
  };

  const cancelImport = () => { setImportState('idle'); setImportRows([]); };

  // ── Derived ────────────────────────────────────────────────────────────────
  const chartCategories = CATEGORIES.filter(c => data?.byCategory?.[c.value] > 0);
  const validCount   = importRows.filter(r => r._valid).length;
  const invalidCount = importRows.length - validCount;
  const previewRows  = importFilter === 'valid' ? importRows.filter(r => r._valid) : importRows;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  // ── CSV Preview panel ──────────────────────────────────────────────────────
  if (importState === 'preview' || importState === 'importing') {
    const isImporting = importState === 'importing';
    return (
      <div className="space-y-5 animate-in fade-in duration-300">
        {/* Header */}
        <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">CSV Import Preview</p>
              <h4 className="text-base font-black text-slate-900 mt-0.5">Review before importing</h4>
            </div>
            {/* Summary pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold bg-green-50 text-green-600 border border-green-200">
                <span className="material-symbols-outlined text-xs">check_circle</span>
                {validCount} valid
              </span>
              {invalidCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold bg-red-50 text-red-500 border border-red-200">
                  <span className="material-symbols-outlined text-xs">error</span>
                  {invalidCount} skipped
                </span>
              )}
            </div>
          </div>

          {/* Filter tabs */}
          {invalidCount > 0 && (
            <div className="mt-4 flex items-center gap-2 border-b border-slate-100 pb-0">
              {[
                { key: 'valid', label: `Valid (${validCount})` },
                { key: 'all',   label: `All (${importRows.length})` },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setImportFilter(tab.key)}
                  className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors -mb-px ${
                    importFilter === tab.key
                      ? 'border-violet-500 text-violet-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Preview table */}
        <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full min-w-[640px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  <th className="py-3 px-4 text-left">Row</th>
                  <th className="py-3 px-4 text-left">Date</th>
                  <th className="py-3 px-4 text-left">Category</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-left">Description</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {previewRows.map((r) => {
                  const cat = CAT_MAP[r.category] || { label: r.category, color: '#94A3B8' };
                  return (
                    <tr key={r._row} className={r._valid ? 'hover:bg-slate-50/50' : 'bg-red-50/40'}>
                      <td className="py-2.5 px-4 text-xs text-slate-400 font-mono">{r._row}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {r.expense_date ? fmtDate(r.expense_date) : (
                          <span className="text-red-400 font-mono text-[10px]">{r.dateRaw || '—'}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{ background: `${cat.color}18`, color: cat.color }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cat.color }} />
                          {cat.label}
                          {r.categoryRaw && r.categoryRaw.toLowerCase() !== r.category && (
                            <span className="text-slate-400 font-normal">← {r.categoryRaw}</span>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-sm font-bold text-slate-900 text-right whitespace-nowrap">
                        {r._valid ? fmt(r.amount) : (
                          <span className="text-red-400 font-mono text-[10px]">{r.amountRaw || '—'}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-500 max-w-[180px] truncate">
                        {r.description || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {r._valid ? (
                          <span className="material-symbols-outlined text-green-500 text-base">check_circle</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500"
                            title={r._errors.join(', ')}>
                            <span className="material-symbols-outlined text-base">error</span>
                            <span className="hidden sm:inline">{r._errors[0]}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Preview total */}
              {validCount > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={3} className="py-3 px-4 text-xs font-bold uppercase tracking-widest text-slate-400">
                      Total ({validCount} rows)
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-black text-slate-900 whitespace-nowrap">
                      {fmt(importRows.filter(r => r._valid).reduce((s, r) => s + r.amount, 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
          <p className="text-xs text-slate-500">
            {validCount > 0
              ? `${validCount} valid row${validCount !== 1 ? 's' : ''} will be imported as expenses.`
              : 'No valid rows found. Fix the CSV and try again.'}
            {invalidCount > 0 && ` ${invalidCount} row${invalidCount !== 1 ? 's' : ''} with errors will be skipped.`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={cancelImport}
              disabled={isImporting}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmImport}
              disabled={isImporting || validCount === 0}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm leading-none">upload</span>
                  Import {validCount} Expense{validCount !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal view ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── KPI row ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-4 text-white shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-widest opacity-70">Total Expenses</p>
          <p className="text-2xl font-black mt-1 leading-none">{fmt(data?.total || 0)}</p>
          <p className="text-[10px] opacity-60 mt-1">{data?.expenses?.length || 0} transactions</p>
        </div>

        {CATEGORIES.filter(c => data?.byCategory?.[c.value] > 0)
          .sort((a, b) => (data.byCategory[b.value] || 0) - (data.byCategory[a.value] || 0))
          .slice(0, 3)
          .map(cat => (
            <div key={cat.value}
              className="bg-surface rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cat.color }} />
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{cat.label}</p>
              </div>
              <p className="text-lg font-black text-slate-900">{fmt(data.byCategory[cat.value])}</p>
            </div>
          ))
        }

        {Array.from({ length: Math.max(0, 3 - chartCategories.length) }).map((_, i) => (
          <div key={`empty-${i}`}
            className="bg-slate-50 rounded-2xl p-4 border border-dashed border-slate-200 flex items-center justify-center">
            <span className="material-symbols-outlined text-slate-300 text-2xl">bar_chart</span>
          </div>
        ))}
      </div>

      {/* ── Daily expense chart ──────────────────────────────────────────────── */}
      {(data?.dailyChart?.length || 0) > 0 && (() => {
        const renderLegend = ({ payload }) => (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 justify-center mt-3">
            {(payload || []).map(entry => (
              <div key={entry.dataKey} className="flex items-center gap-1.5">
                <span className="shrink-0" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: entry.color }} />
                <span style={{ fontSize: 11, color: 'rgb(var(--sl-500))', fontWeight: 600 }}>
                  {CAT_MAP[entry.dataKey]?.label || entry.dataKey}
                </span>
              </div>
            ))}
          </div>
        );

        const CustomTooltip = ({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const dayStr = new Date(label).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          const total  = payload.reduce((s, p) => s + (p.value || 0), 0);
          return (
            <div style={{ background: 'rgb(var(--c-surface))', border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.10)', minWidth: 180 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'rgb(var(--sl-400))', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{dayStr}</p>
              {payload.map(p => (
                <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: p.fill, flexShrink: 0, display: 'inline-block' }} />
                  <span style={{ fontSize: 12, color: 'rgb(var(--sl-600))', flex: 1 }}>{CAT_MAP[p.dataKey]?.label || p.dataKey}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: p.fill }}>{fmt(p.value)}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'rgb(var(--sl-400))', fontWeight: 600 }}>Total</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: 'rgb(var(--sl-800))' }}>{fmt(total)}</span>
              </div>
            </div>
          );
        };

        return (
          <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="mb-4">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Spending Pattern</p>
              <h4 className="text-base font-black text-slate-900">Daily Expenses by Category</h4>
              <p className="text-xs text-slate-400 mt-0.5">Expense totals by day</p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.dailyChart} margin={{ top: 8, right: 16, left: 0, bottom: 8 }} barCategoryGap="28%" barGap={3}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'rgb(var(--sl-400))', fontWeight: 600 }} tickLine={false}
                  axisLine={{ stroke: 'rgb(var(--sl-200))' }}
                  tickFormatter={d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} />
                <YAxis tickFormatter={v => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`}
                  tick={{ fontSize: 11, fill: 'rgb(var(--sl-400))', fontWeight: 600 }} tickLine={false} axisLine={false} width={52} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.05)', radius: 6 }} />
                <Legend content={renderLegend} />
                {chartCategories.map((cat, idx) => (
                  <Bar key={cat.value} dataKey={cat.value} stackId="a" fill={cat.color}
                    radius={idx === chartCategories.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={52} isAnimationActive animationDuration={800} animationEasing="ease-out" />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* ── Action bar: Add + Import ─────────────────────────────────────────── */}
      {canEdit && (
        <>
          {/* Hidden file input */}
          <input ref={csvInputRef} type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={handleCSVPick} />

          <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Top bar with both actions */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <button
                onClick={() => setShowForm(f => !f)}
                className="flex items-center gap-2 text-sm font-bold text-slate-800 hover:text-violet-600 transition-colors"
              >
                <span className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                  <span className="material-symbols-outlined text-sm text-violet-600">add</span>
                </span>
                Add Expense
                <span className={`material-symbols-outlined text-slate-400 text-base transition-transform ${showForm ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>

              <div className="flex items-center gap-2">
                {(data?.expenses?.length || 0) > 0 && (
                  <button
                    onClick={handleDeleteAll}
                    disabled={clearing}
                    title="Delete every expense on this project"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    {clearing ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm leading-none">delete_sweep</span>
                        Delete All
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => csvInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm leading-none">upload_file</span>
                  Import CSV
                </button>
              </div>
            </div>

            {showForm && (
              <div className="px-5 pb-5 pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                    Payment Method <span className="text-red-500">*</span>
                  </label>
                  <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all bg-surface">
                    {METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all bg-surface">
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input type="date" value={form.expense_date}
                    onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all" />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                    Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input type="number" min="1" step="0.01" placeholder="0.00" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all" />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                    Member (optional)
                  </label>
                  <select value={form.member_id} onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all bg-surface">
                    <option value="">— No specific member —</option>
                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                    Bank Name (optional)
                  </label>
                  <input type="text" placeholder="e.g. HDFC, SBI…" value={form.bank_name}
                    onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all" />
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                    Description
                  </label>
                  <textarea rows={2} placeholder="Brief note about this expense…" value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all resize-none" />
                </div>

                <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2 pt-1">
                  <button onClick={() => { setForm(EMPTY_FORM); setShowForm(false); }}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleSubmit} disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50">
                    {saving ? (
                      <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
                    ) : (
                      <><span className="material-symbols-outlined text-sm leading-none">add</span>Add Expense</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Expense list ─────────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Records</p>
            <h4 className="text-sm font-black text-slate-900">All Expenses</h4>
          </div>
          <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-violet-50 text-violet-600 border border-violet-200">
            {data?.expenses?.length || 0} item{(data?.expenses?.length || 0) !== 1 ? 's' : ''}
          </span>
        </div>

        {!data?.expenses?.length ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-300">
            <span className="material-symbols-outlined text-5xl">receipt_long</span>
            <p className="text-sm font-medium text-slate-400">No expenses recorded yet</p>
            {canEdit && (
              <div className="flex items-center gap-2">
                <button onClick={() => setShowForm(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 transition-colors">
                  <span className="material-symbols-outlined text-sm leading-none">add</span>
                  Add Expense
                </button>
                <button onClick={() => csvInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors">
                  <span className="material-symbols-outlined text-sm leading-none">upload_file</span>
                  Import CSV
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  <th className="py-3 px-4 text-left">Date</th>
                  <th className="py-3 px-4 text-left">Category</th>
                  <th className="py-3 px-4 text-left">Method</th>
                  <th className="py-3 px-4 text-left">Member</th>
                  <th className="py-3 px-4 text-left">Description</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  {canEdit && <th className="py-3 px-4 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.expenses.map(exp => {
                  const cat = CAT_MAP[exp.category] || { label: exp.category, color: '#94A3B8' };
                  return (
                    <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(exp.expense_date)}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold"
                          style={{ background: `${cat.color}18`, color: cat.color }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cat.color }} />
                          {cat.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 capitalize">{exp.method}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{exp.member_name || '—'}</td>
                      <td className="py-3 px-4 text-xs text-slate-500 max-w-[200px] truncate">
                        {exp.description || (exp.bank_name ? `Bank: ${exp.bank_name}` : '—')}
                      </td>
                      <td className="py-3 px-4 text-sm font-bold text-slate-900 text-right whitespace-nowrap">
                        {fmt(exp.amount)}
                      </td>
                      {canEdit && (
                        <td className="py-3 px-4 text-right">
                          <button onClick={() => handleDelete(exp.id)} disabled={deleting === exp.id}
                            title="Delete expense"
                            className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
                            {deleting === exp.id
                              ? <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-red-500 rounded-full animate-spin inline-block" />
                              : <span className="material-symbols-outlined text-base">delete</span>
                            }
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/70">
                  <td colSpan={5} className="py-3 px-4 text-xs font-bold uppercase tracking-widest text-slate-400">Total</td>
                  <td className="py-3 px-4 text-right text-sm font-black text-slate-900 whitespace-nowrap">{fmt(data.total)}</td>
                  {canEdit && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
