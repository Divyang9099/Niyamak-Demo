import { useEffect, useRef, useState } from 'react';
import axiosInstance from '../../../api/axios';
import { ENDPOINTS } from '../../../api/endpoints';
import { useToast } from '../../../context/ToastContext';
import { useDialog } from '../../../context/DialogContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';

const fmt = (n) =>
  n != null && n !== ''
    ? `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const EMPTY_ITEM = () => ({
  _key: Math.random().toString(36).slice(2),
  description: '', qty: '', unit: '', rate: '',
  taxable_value: '', tax_percent: '', tax_amount: '', amount: '',
});

// ── Editable cells ─────────────────────────────────────────────────────────────
const NC = ({ v, onChange, ph = '' }) => (
  <input type="number" min="0" step="0.01" value={v ?? ''} onChange={e => onChange(e.target.value)}
    placeholder={ph}
    className="w-full bg-transparent border-0 outline-none text-xs text-right text-slate-800 placeholder:text-slate-300
      focus:bg-surface focus:ring-1 focus:ring-primary/20 rounded px-1 py-0.5" />
);
const TC = ({ v, onChange, ph = '' }) => (
  <input type="text" value={v ?? ''} onChange={e => onChange(e.target.value)} placeholder={ph}
    className="w-full bg-transparent border-0 outline-none text-xs text-slate-800 placeholder:text-slate-300
      focus:bg-surface focus:ring-1 focus:ring-primary/20 rounded px-1 py-0.5" />
);

// ── Items table (editable or read-only) ────────────────────────────────────────
const ItemsTable = ({ items, onChange, readOnly = false }) => {
  const upd = (idx, field, val) => {
    const next = items.map((it, i) => {
      if (i !== idx) return it;
      const u = { ...it, [field]: val };
      if (field === 'qty' || field === 'rate') {
        const q = parseFloat(field === 'qty' ? val : u.qty) || 0;
        const r = parseFloat(field === 'rate' ? val : u.rate) || 0;
        u.taxable_value = (q * r).toFixed(2);
        const ta = parseFloat(u.tax_percent || 0) * (q * r) / 100;
        if (u.tax_percent) { u.tax_amount = ta.toFixed(2); u.amount = (q * r + ta).toFixed(2); }
        else u.amount = (q * r).toFixed(2);
      }
      if (field === 'tax_percent') {
        const tv = parseFloat(u.taxable_value) || 0;
        const ta = tv * (parseFloat(val) || 0) / 100;
        u.tax_amount = ta.toFixed(2); u.amount = (tv + ta).toFixed(2);
      }
      if (field === 'taxable_value' || field === 'tax_amount') {
        const tv = parseFloat(field === 'taxable_value' ? val : u.taxable_value) || 0;
        const ta = parseFloat(field === 'tax_amount' ? val : u.tax_amount) || 0;
        u.amount = (tv + ta).toFixed(2);
      }
      return u;
    });
    onChange(next);
  };

  const C = 'border border-slate-100 px-1.5 py-1';
  const TH = `${C} text-[9px] font-black uppercase tracking-widest text-slate-400`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className={`${TH} text-left w-8`}>#</th>
            <th className={`${TH} text-left min-w-[200px]`}>Description / Service</th>
            <th className={`${TH} text-right w-20`}>Qty</th>
            <th className={`${TH} text-right w-14`}>Unit</th>
            <th className={`${TH} text-right w-28`}>Rate (₹)</th>
            <th className={`${TH} text-right w-28`}>Taxable Value</th>
            <th className={`${TH} text-right w-16`}>Tax %</th>
            <th className={`${TH} text-right w-28`}>Tax Amt</th>
            <th className={`${TH} text-right w-28`}>Total (₹)</th>
            {!readOnly && <th className={`${C} w-8`} />}
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it._key ?? i} className="hover:bg-slate-50/40">
              <td className={`${C} text-center text-slate-400 text-[10px]`}>{i + 1}</td>
              <td className={C}>
                {readOnly
                  ? <span className="text-slate-800 whitespace-normal leading-snug">{it.description || '—'}</span>
                  : <TC v={it.description} onChange={v => upd(i, 'description', v)} ph="e.g. Survey Flight Day" />}
              </td>
              <td className={C}>
                {readOnly ? <span className="block text-right">{it.qty ?? '—'}</span> : <NC v={it.qty} onChange={v => upd(i, 'qty', v)} />}
              </td>
              <td className={C}>
                {readOnly ? <span className="text-slate-600">{it.unit || '—'}</span> : <TC v={it.unit} onChange={v => upd(i, 'unit', v)} ph="UNT" />}
              </td>
              <td className={C}>
                {readOnly ? <span className="block text-right">{fmt(it.rate)}</span> : <NC v={it.rate} onChange={v => upd(i, 'rate', v)} />}
              </td>
              <td className={C}>
                {readOnly ? <span className="block text-right">{fmt(it.taxable_value)}</span> : <NC v={it.taxable_value} onChange={v => upd(i, 'taxable_value', v)} />}
              </td>
              <td className={C}>
                {readOnly
                  ? <span className="block text-right text-slate-600">{it.tax_percent != null && it.tax_percent !== '' ? `${it.tax_percent}%` : '—'}</span>
                  : <NC v={it.tax_percent} onChange={v => upd(i, 'tax_percent', v)} ph="18" />}
              </td>
              <td className={C}>
                {readOnly ? <span className="block text-right">{fmt(it.tax_amount)}</span> : <NC v={it.tax_amount} onChange={v => upd(i, 'tax_amount', v)} />}
              </td>
              <td className={`${C} font-bold`}>
                <span className="block text-right">{fmt(it.amount)}</span>
              </td>
              {!readOnly && (
                <td className={`${C} text-center`}>
                  <button onClick={() => onChange(items.filter((_, j) => j !== i))}
                    className="text-slate-300 hover:text-red-500 transition-colors">
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {!readOnly && (
          <tfoot>
            <tr>
              <td colSpan={10} className="pt-2 pl-1">
                <button onClick={() => onChange([...items, EMPTY_ITEM()])}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/70 transition-colors">
                  <span className="material-symbols-outlined text-sm">add_circle</span>Add Row
                </button>
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {items.length > 0 && (
        <div className="flex justify-end gap-6 mt-3 pt-3 border-t border-slate-100 text-xs">
          {[
            ['Taxable', items.reduce((s, it) => s + (parseFloat(it.taxable_value) || 0), 0)],
            ['Tax',     items.reduce((s, it) => s + (parseFloat(it.tax_amount)    || 0), 0)],
            ['Total',   items.reduce((s, it) => s + (parseFloat(it.amount)        || 0), 0)],
          ].map(([l, v]) => (
            <div key={l} className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{l}</span>
              <span className={`font-black text-slate-900 ${l === 'Total' ? 'text-base' : ''}`}>{fmt(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Add / Edit form ────────────────────────────────────────────────────────────
const BLANK = () => ({
  invoice_number: '', invoice_date: '', vendor_name: '',
  buyer_name: '', subtotal: '', tax_amount: '', total_amount: '',
  notes: '', status: 'draft',
});

const InvoiceForm = ({ projectId, existing, onSaved, onClose }) => {
  const { showToast } = useToast();
  const [form, setForm]       = useState(existing ? { ...BLANK(), ...existing } : BLANK());
  const [items, setItems]     = useState(existing?.items?.length ? existing.items.map(it => ({ _key: Math.random().toString(36).slice(2), ...it })) : [EMPTY_ITEM()]);
  const [extracting, setExtr] = useState(false);
  const [extStatus, setExtSt] = useState(null);
  const [rawText, setRawText] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [pdfFile, setPdf]     = useState(null);
  const [saving, setSaving]   = useState(false);
  const fileRef = useRef(null);

  const set = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }));

  // Keep header totals in sync with items
  useEffect(() => {
    const sub = items.reduce((s, it) => s + (parseFloat(it.taxable_value) || 0), 0);
    const tax = items.reduce((s, it) => s + (parseFloat(it.tax_amount)    || 0), 0);
    const tot = items.reduce((s, it) => s + (parseFloat(it.amount)        || 0), 0);
    if (sub > 0 || tax > 0 || tot > 0) {
      setForm(f => ({
        ...f,
        subtotal:     sub > 0 ? sub.toFixed(2) : f.subtotal,
        tax_amount:   tax > 0 ? tax.toFixed(2) : f.tax_amount,
        total_amount: tot > 0 ? tot.toFixed(2) : f.total_amount,
      }));
    }
  }, [items]);

  const handleExtract = async (file) => {
    setPdf(file); setExtr(true); setExtSt(null); setRawText(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await axiosInstance.post(ENDPOINTS.PROJECTS.INVOICE_EXTRACT(projectId), fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { fields, items: exItems, raw_text, extraction_status } = r.data.data || {};
      setExtSt(extraction_status || 'ok');
      if (raw_text) setRawText(raw_text);

      if (extraction_status === 'no_text_layer') {
        showToast('PDF could not be read — fill manually', 'error'); return;
      }

      if (fields && typeof fields === 'object') {
        setForm(f => ({
          ...f,
          ...(fields.invoice_number  ? { invoice_number: fields.invoice_number } : {}),
          ...(fields.invoice_date    ? { invoice_date:   fields.invoice_date   } : {}),
          ...(fields.vendor_name     ? { vendor_name:    fields.vendor_name    } : {}),
          ...(fields.buyer_name      ? { buyer_name:     fields.buyer_name     } : {}),
          ...(fields.subtotal     != null ? { subtotal:     String(fields.subtotal)     } : {}),
          ...(fields.tax_amount   != null ? { tax_amount:   String(fields.tax_amount)   } : {}),
          ...(fields.total_amount != null ? { total_amount: String(fields.total_amount) } : {}),
        }));
      }

      if (exItems?.length) {
        setItems(exItems.map(it => ({
          _key:          Math.random().toString(36).slice(2),
          description:   String(it.description   ?? ''),
          qty:           String(it.qty           ?? ''),
          unit:          String(it.unit          ?? ''),
          rate:          String(it.rate          ?? ''),
          taxable_value: String(it.taxable_value ?? ''),
          tax_percent:   String(it.tax_percent   ?? ''),
          tax_amount:    String(it.tax_amount    ?? ''),
          amount:        String(it.amount        ?? ''),
        })));
        const filled = Object.values(fields || {}).filter(v => v != null).length;
        showToast(`Auto-filled ${filled} field(s) + ${exItems.length} line item(s) — review below`);
      } else {
        const filled = Object.values(fields || {}).filter(v => v != null).length;
        if (filled > 0) showToast(`Auto-filled ${filled} field(s) — add line items manually`);
        else showToast('Could not match invoice fields — fill manually', 'info');
      }
    } catch (err) {
      showToast(err?.response?.data?.message || 'PDF extraction failed', 'error');
    } finally { setExtr(false); }
  };

  const handleSave = async () => {
    if (!form.invoice_number && !form.vendor_name) {
      showToast('Enter at least Invoice # or Vendor name', 'error'); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, items: items.filter(i => i.description || i.amount) };
      let saved;
      if (existing?.id) {
        const r = await axiosInstance.put(ENDPOINTS.PROJECTS.INVOICE(projectId, existing.id), payload);
        saved = r.data.data;
      } else {
        const fd = new FormData();
        fd.append('data', JSON.stringify(payload));
        if (pdfFile) fd.append('file', pdfFile);
        const r = await axiosInstance.post(ENDPOINTS.PROJECTS.INVOICES(projectId), fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        saved = r.data.data;
      }
      showToast(existing ? 'Invoice updated' : 'Invoice saved');
      onSaved(saved);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  const IC = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all';
  const LB = 'text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1 block';

  return (
    <div className="space-y-5">
      {/* PDF drop zone */}
      <div className={`flex flex-col items-center gap-2 border-2 border-dashed rounded-2xl p-5 cursor-pointer transition-colors
        ${extStatus === 'no_text_layer' ? 'border-red-300 bg-red-50'
          : extStatus === 'no_match'    ? 'border-amber-300 bg-amber-50'
          : pdfFile                     ? 'border-primary/30 bg-primary/5'
          :                               'border-slate-200 bg-slate-50 hover:border-primary/30'}`}
        onClick={() => fileRef.current?.click()}>
        {extracting ? (
          <>
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-primary">Scanning PDF…</p>
            <p className="text-[10px] text-slate-400">Scanned images may take 10–30 s via OCR</p>
          </>
        ) : pdfFile ? (
          <>
            <span className={`material-symbols-outlined text-3xl ${extStatus === 'no_text_layer' ? 'text-red-400' : extStatus === 'no_match' ? 'text-amber-400' : 'text-primary'}`}>
              description
            </span>
            <p className="text-xs font-bold text-slate-800">{pdfFile.name}</p>
            {extStatus === 'ok'           && <p className="text-[10px] font-bold text-primary">Fields auto-filled — review below</p>}
            {extStatus === 'no_match'     && <p className="text-[10px] font-bold text-amber-600">Partial match — check fields below</p>}
            {extStatus === 'no_text_layer'&& <p className="text-[10px] font-bold text-red-500 text-center">Could not read PDF — fill manually</p>}
            <p className="text-[9px] text-slate-400">Click to replace</p>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-3xl text-slate-400">upload_file</span>
            <p className="text-sm font-bold text-slate-600">Upload Invoice PDF</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Auto-extracts invoice data</p>
          </>
        )}
        <input ref={fileRef} type="file" accept=".pdf" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleExtract(f); e.target.value = ''; }} />
      </div>

      {/* Raw text (only on partial match) */}
      {rawText && extStatus !== 'ok' && (
        <div className="border border-amber-200 rounded-xl overflow-hidden">
          <button onClick={() => setShowRaw(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">article</span>
              Extracted text ({rawText.length} chars) — use to verify fields manually
            </span>
            <span className="material-symbols-outlined text-sm">{showRaw ? 'expand_less' : 'expand_more'}</span>
          </button>
          {showRaw && (
            <pre className="px-4 py-3 text-[10px] text-slate-600 bg-surface overflow-auto max-h-48 whitespace-pre-wrap font-mono leading-relaxed">
              {rawText}
            </pre>
          )}
        </div>
      )}

      {/* Header fields */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className={LB}>Invoice #</label>
          <input className={IC} value={form.invoice_number} onChange={set('invoice_number')} placeholder="e.g. VAI-15" />
        </div>
        <div>
          <label className={LB}>Invoice Date</label>
          <input type="date" className={IC} value={form.invoice_date ? form.invoice_date.slice(0, 10) : ''} onChange={set('invoice_date')} />
        </div>
        <div>
          <label className={LB}>Status</label>
          <select className={IC} value={form.status} onChange={set('status')}>
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </div>
        <div>
          <label className={LB}>From (Vendor)</label>
          <input className={IC} value={form.vendor_name} onChange={set('vendor_name')} placeholder="Supplier / Vendor name" />
        </div>
        <div className="md:col-span-2">
          <label className={LB}>To (Buyer / Client)</label>
          <input className={IC} value={form.buyer_name} onChange={set('buyer_name')} placeholder="Buyer / Client name" />
        </div>
      </div>

      {/* Line items */}
      <div>
        <p className={`${LB} mb-2`}>Line Items</p>
        <div className="border border-slate-200 rounded-xl overflow-hidden p-2">
          <ItemsTable items={items} onChange={setItems} />
        </div>
      </div>

      {/* Summary totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[['subtotal', 'Taxable Amount (₹)'], ['tax_amount', 'Total Tax (₹)'], ['total_amount', 'Grand Total (₹)']].map(([f, l]) => (
          <div key={f}>
            <label className={LB}>{l}</label>
            <input type="number" min="0" step="0.01" className={IC} value={form[f]} onChange={set(f)} placeholder="auto from items" />
          </div>
        ))}
      </div>

      {/* Notes */}
      <div>
        <label className={LB}>Notes</label>
        <textarea rows={2} className={`${IC} resize-none`} value={form.notes} onChange={set('notes')} placeholder="Payment terms, remarks…" />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button icon="save" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : existing ? 'Update Invoice' : 'Save Invoice'}
        </Button>
      </div>
    </div>
  );
};

// ── Full-page invoice view ─────────────────────────────────────────────────────
const InvoiceView = ({ inv, projectId, canEdit, onClose, onEdit, onDownload, downloading }) => {
  const items = Array.isArray(inv.items) ? inv.items : [];

  const COL = 'border border-slate-100 px-3 py-2.5 text-sm';
  const TH  = `${COL} text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50`;

  const rowTotal = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const rowTax   = items.reduce((s, it) => s + (parseFloat(it.tax_amount) || 0), 0);
  const rowTaxable = items.reduce((s, it) => s + (parseFloat(it.taxable_value) || 0), 0);

  const displayTotal   = parseFloat(inv.total_amount)  || rowTotal;
  const displayTax     = parseFloat(inv.tax_amount)    || rowTax;
  const displayTaxable = parseFloat(inv.subtotal)      || rowTaxable;

  const statusStyle = inv.status === 'confirmed'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f8fafc', overflowY: 'auto' }}
      className="flex flex-col">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-10 bg-surface border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-3 gap-4">
          <button onClick={onClose}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back to Invoices
          </button>

          <div className="flex items-center gap-2">
            {inv.file_key && (
              <Button
                icon={downloading ? 'hourglass_empty' : 'download'}
                onClick={onDownload}
                disabled={downloading}
                variant="secondary">
                {downloading ? 'Preparing…' : 'Download PDF'}
              </Button>
            )}
            {canEdit && (
              <Button icon="edit" onClick={onEdit}>Edit</Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Invoice content ── */}
      <div className="max-w-5xl mx-auto w-full px-6 py-8 flex-1">

        {/* Invoice header */}
        <div className="bg-surface rounded-2xl shadow-sm border border-slate-200 p-8 mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Invoice Number</p>
              <h1 className="text-4xl font-black text-slate-900 mb-3">
                {inv.invoice_number || <span className="text-slate-400 italic text-2xl">No Number</span>}
              </h1>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusStyle}`}>
                {inv.status || 'draft'}
              </span>
            </div>

            <div className="flex gap-12 md:text-right md:flex-row flex-col md:items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Invoice Date</p>
                <p className="text-lg font-bold text-slate-800">{fmtDate(inv.invoice_date)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Grand Total</p>
                <p className="text-3xl font-black text-slate-900">{fmt(displayTotal)}</p>
              </div>
            </div>
          </div>

          {(inv.vendor_name || inv.buyer_name) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 pt-6 border-t border-slate-100">
              {inv.vendor_name && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">From</p>
                  <p className="text-base font-bold text-slate-800">{inv.vendor_name}</p>
                  {inv.vendor_gstin && <p className="text-xs text-slate-500 mt-0.5">GSTIN: {inv.vendor_gstin}</p>}
                </div>
              )}
              {inv.buyer_name && (
                <div className="md:text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Bill To</p>
                  <p className="text-base font-bold text-slate-800">{inv.buyer_name}</p>
                  {inv.buyer_gstin && <p className="text-xs text-slate-500 mt-0.5">GSTIN: {inv.buyer_gstin}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="bg-surface rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Line Items</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${TH} text-center w-10`}>#</th>
                  <th className={`${TH} text-left`}>Description / Service</th>
                  <th className={`${TH} text-right w-24`}>Qty</th>
                  <th className={`${TH} text-right w-32`}>Rate (₹)</th>
                  <th className={`${TH} text-right w-36`}>Taxable Value</th>
                  <th className={`${TH} text-right w-36`}>Tax Amount</th>
                  <th className={`${TH} text-right w-36 text-slate-700`}>Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400 text-sm italic">No line items</td>
                  </tr>
                ) : items.map((it, i) => (
                  <tr key={it._key ?? i} className="hover:bg-slate-50/50 transition-colors">
                    <td className={`${COL} text-center text-slate-400 text-xs`}>{i + 1}</td>
                    <td className={`${COL} max-w-xs`}>
                      <p className="font-semibold text-slate-900 leading-snug">{it.description || '—'}</p>
                      {it.unit && <p className="text-xs text-slate-400 mt-0.5">{it.unit}</p>}
                    </td>
                    <td className={`${COL} text-right text-slate-700`}>{it.qty != null && it.qty !== '' ? it.qty : '—'}</td>
                    <td className={`${COL} text-right`}>{fmt(it.rate)}</td>
                    <td className={`${COL} text-right`}>{fmt(it.taxable_value)}</td>
                    <td className={`${COL} text-right`}>
                      {it.tax_amount != null && it.tax_amount !== ''
                        ? <span>{fmt(it.tax_amount)}{it.tax_percent ? <span className="text-[10px] text-slate-400 ml-1">({it.tax_percent}%)</span> : null}</span>
                        : '—'}
                    </td>
                    <td className={`${COL} text-right font-bold text-slate-900 text-base`}>{fmt(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary band */}
          <div className="border-t-2 border-slate-200 px-6 py-5">
            <div className="flex justify-end">
              <div className="min-w-[280px] space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-semibold">Taxable Amount</span>
                  <span className="font-bold text-slate-700">{fmt(displayTaxable)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-semibold">Total Tax (GST)</span>
                  <span className="font-bold text-slate-700">{fmt(displayTax)}</span>
                </div>
                <div className="flex justify-between text-xl font-black pt-2 border-t-2 border-slate-200">
                  <span className="text-slate-900">Grand Total</span>
                  <span className="text-slate-900">{fmt(displayTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {inv.notes && (
          <div className="bg-surface rounded-2xl shadow-sm border border-slate-200 px-6 py-5 mb-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Notes</p>
            <p className="text-sm text-slate-700 leading-relaxed">{inv.notes}</p>
          </div>
        )}

        {/* Attached file name */}
        {inv.file_name && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="material-symbols-outlined text-sm">description</span>
            Attached: {inv.file_name}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main InvoicesTab ─────────────────────────────────────────────────────────
const InvoicesTab = ({ projectId, canEdit }) => {
  const { showToast } = useToast();
  const { confirmDialog } = useDialog();
  const [invoices, setInvoices] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEdit]   = useState(null);
  const [viewInv, setViewInv]   = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [downloading, setDl]    = useState(false);

  const load = async () => {
    try {
      const r = await axiosInstance.get(ENDPOINTS.PROJECTS.INVOICES(projectId));
      setInvoices(r.data.data || []);
    } catch { setInvoices([]); }
  };

  useEffect(() => { load(); }, [projectId]);

  const handleSaved = (inv) => {
    setInvoices(prev => {
      if (!prev) return [inv];
      const idx = prev.findIndex(i => i.id === inv.id);
      return idx >= 0 ? prev.map((i, x) => x === idx ? inv : i) : [inv, ...prev];
    });
    setShowForm(false); setEdit(null);
    // Refresh the viewed invoice if it was just saved
    if (viewInv && viewInv.id === inv.id) setViewInv(inv);
  };

  const handleDelete = async (inv) => {
    if (!(await confirmDialog({ message: `Delete invoice ${inv.invoice_number || inv.id.slice(0, 8)}?`, danger: true }))) return;
    setDeleting(inv.id);
    try {
      await axiosInstance.delete(ENDPOINTS.PROJECTS.INVOICE(projectId, inv.id));
      setInvoices(prev => prev.filter(i => i.id !== inv.id));
      showToast('Invoice deleted');
    } catch (err) { showToast(err?.response?.data?.message || 'Delete failed', 'error'); }
    finally { setDeleting(null); }
  };

  const handleDownload = async (inv) => {
    setDl(true);
    try {
      const r = await axiosInstance.get(ENDPOINTS.PROJECTS.INVOICE_PDF(projectId, inv.id));
      const url = r.data.data?.url;
      if (url) window.open(url, '_blank');
      else showToast('No PDF attached to this invoice', 'error');
    } catch (err) { showToast(err?.response?.data?.message || 'Download failed', 'error'); }
    finally { setDl(false); }
  };

  // ── Full-page view ──
  if (viewInv) {
    return (
      <InvoiceView
        inv={viewInv}
        projectId={projectId}
        canEdit={canEdit}
        downloading={downloading}
        onClose={() => setViewInv(null)}
        onEdit={() => { setEdit(viewInv); setShowForm(true); setViewInv(null); }}
        onDownload={() => handleDownload(viewInv)}
      />
    );
  }

  if (invoices === null) return (
    <Card className="p-8">
      <div className="space-y-3">
        {[1, 2].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-slate-900">Project Invoices</p>
          <p className="text-xs text-slate-500 mt-0.5">Upload PDFs for auto-extraction or add entries manually.</p>
        </div>
        {canEdit && (
          <Button icon="add" onClick={() => { setEdit(null); setShowForm(true); }}>Add Invoice</Button>
        )}
      </div>

      {invoices.length === 0 ? (
        <Card className="py-14 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-3xl text-indigo-400">receipt_long</span>
          </div>
          <p className="text-sm font-bold text-slate-800 mb-1">No invoices yet</p>
          <p className="text-xs text-slate-500 mb-4">Upload a PDF — invoice data will be auto-extracted for review.</p>
          {canEdit && (
            <Button icon="add" onClick={() => { setEdit(null); setShowForm(true); }}>Add First Invoice</Button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid gap-2 px-5 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100"
            style={{ gridTemplateColumns: '1fr 130px 160px 150px 110px 140px' }}>
            <span>Invoice #</span>
            <span>Date</span>
            <span>From</span>
            <span>Grand Total</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>

          {invoices.map(inv => {
            const statusStyle = inv.status === 'confirmed'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200';
            return (
              <div key={inv.id}
                className="grid gap-2 items-center px-5 py-3.5 border-b border-slate-50 hover:bg-slate-50/40 transition-colors cursor-pointer"
                style={{ gridTemplateColumns: '1fr 130px 160px 150px 110px 140px' }}
                onClick={() => setViewInv(inv)}>
                <div>
                  <p className="text-sm font-bold text-slate-900">{inv.invoice_number || <span className="italic text-slate-400">No number</span>}</p>
                  {inv.file_name && (
                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <span className="material-symbols-outlined text-xs">description</span>{inv.file_name}
                    </p>
                  )}
                </div>
                <span className="text-xs text-slate-600">{fmtDate(inv.invoice_date)}</span>
                <span className="text-xs text-slate-600 truncate">{inv.vendor_name || '—'}</span>
                <span className="text-sm font-black text-slate-900">{fmt(inv.total_amount)}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border w-fit ${statusStyle}`}>
                  {inv.status}
                </span>
                <div className="flex gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setViewInv(inv)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors" title="View">
                    <span className="material-symbols-outlined text-base">open_in_new</span>
                  </button>
                  {inv.file_key && (
                    <button onClick={() => handleDownload(inv)} disabled={downloading}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Download PDF">
                      <span className="material-symbols-outlined text-base">download</span>
                    </button>
                  )}
                  {canEdit && (
                    <>
                      <button onClick={() => { setEdit(inv); setShowForm(true); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors" title="Edit">
                        <span className="material-symbols-outlined text-base">edit</span>
                      </button>
                      <button onClick={() => handleDelete(inv)} disabled={deleting === inv.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                        <span className="material-symbols-outlined text-base">{deleting === inv.id ? 'hourglass_empty' : 'delete'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Footer summary */}
          <div className="flex flex-wrap justify-end gap-6 px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs">
            {[
              ['Total Invoices', invoices.length],
              ['Confirmed',      invoices.filter(i => i.status === 'confirmed').length],
              ['Total Value',    fmt(invoices.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0))],
            ].map(([l, v]) => (
              <div key={l} className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{l}</span>
                <span className="font-black text-slate-900">{v}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Add / Edit modal */}
      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEdit(null); }}
        title={editTarget ? `Edit Invoice — ${editTarget.invoice_number || 'Draft'}` : 'Add Invoice'}
        size="xl">
        <InvoiceForm
          projectId={projectId}
          existing={editTarget}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEdit(null); }}
        />
      </Modal>
    </div>
  );
};

export default InvoicesTab;
