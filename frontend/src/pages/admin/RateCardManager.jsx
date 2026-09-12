import { useEffect, useState } from 'react';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';

const CATEGORIES = [
  { value: 'travel',        label: 'Travel' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'per_diem',      label: 'Food' },
  { value: 'software',      label: 'Software' },
  { value: 'deliverable',   label: 'Deliverable' },
  { value: 'report_writing',label: 'Report Writing' },
  { value: 'storage',       label: 'Storage' },
];

const BLANK = { category: 'travel', item_name: '', unit: '', rate: '', description: '', sort_order: 0, is_active: true };

// Map a stored category key (e.g. "per_diem") to its display label (e.g. "Food").
const catLabel = (v) => CATEGORIES.find(c => c.value === v)?.label || v;

const RateCardManager = () => {
  const { showToast } = useToast();
  const [cards, setCards]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filterCat, setFilter]  = useState('');
  const [editing, setEditing]   = useState(null);
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axiosInstance.get(ENDPOINTS.SYSTEM.RATE_CARDS_LIST);
      setCards(Array.isArray(r.data.data) ? r.data.data : []);
    } catch { showToast('Failed to load rate cards', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (c) => setEditing({ ...c });
  const startNew  = () => setEditing({ ...BLANK });
  const cancel    = () => setEditing(null);

  const save = async () => {
    if (!editing.item_name?.trim()) return showToast('Item name is required', 'error');
    if (editing.rate === '' || isNaN(Number(editing.rate))) return showToast('Rate must be a number', 'error');
    setSaving(true);
    try {
      const payload = { ...editing, rate: Number(editing.rate), sort_order: Number(editing.sort_order) || 0 };
      if (editing.id) {
        await axiosInstance.put(ENDPOINTS.SYSTEM.RATE_CARD(editing.id), payload);
        showToast('Rate card updated', 'success');
      } else {
        await axiosInstance.post(ENDPOINTS.SYSTEM.RATE_CARDS, payload);
        showToast('Rate card created', 'success');
      }
      setEditing(null);
      load();
    } catch (e) {
      showToast(e.response?.data?.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  const toggleActive = async (c) => {
    try {
      await axiosInstance.put(ENDPOINTS.SYSTEM.RATE_CARD(c.id), { is_active: !c.is_active });
      showToast(`${c.item_name} ${c.is_active ? 'deactivated' : 'reactivated'}`, 'success');
      load();
    } catch (e) { showToast(e.response?.data?.message || 'Failed', 'error'); }
  };

  const deleteCard = async (c) => {
    if (!confirm(`Permanently delete "${c.item_name}"?\n\nThis cannot be undone.`)) return;
    try {
      await axiosInstance.delete(ENDPOINTS.SYSTEM.RATE_CARD(c.id));
      showToast(`${c.item_name} deleted`, 'success');
      load();
    } catch (e) { showToast(e.response?.data?.message || 'Delete failed', 'error'); }
  };

  const visible = filterCat ? cards.filter(c => c.category === filterCat) : cards;

  return (
    <div className="bg-surface border border-slate-200 rounded-xl p-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-lg text-slate-400">payments</span>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 tracking-tight">Estimation Rate Cards</p>
            <p className="text-xs text-slate-400 mt-0.5">Travel, accommodation, food, software, deliverable and report-writing rates used by the cost estimator (PRD §10.3)</p>
          </div>
        </div>
        {!editing && (
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 bg-primary text-on-primary text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-primary-dark active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New Rate
          </button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <button
          onClick={() => setFilter('')}
          className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${
            filterCat === '' ? 'bg-primary text-on-primary border-primary' : 'border-slate-200 text-slate-600 hover:border-primary/40'
          }`}
        >All</button>
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setFilter(c.value)}
            className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${
              filterCat === c.value ? 'bg-primary text-on-primary border-primary' : 'border-slate-200 text-slate-600 hover:border-primary/40'
            }`}
          >{c.label}</button>
        ))}
      </div>

      {editing && (
        <div className="mb-5 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
            {editing.id ? 'Edit Rate Card' : 'New Rate Card'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Category</label>
              <select
                value={editing.category}
                disabled={!!editing.id}
                onChange={e => setEditing(p => ({ ...p, category: e.target.value }))}
                className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
              >
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Item Name {!editing.id && <span className="text-red-500">*</span>}</label>
              <input
                value={editing.item_name}
                disabled={!!editing.id}
                onChange={e => setEditing(p => ({ ...p, item_name: e.target.value }))}
                placeholder="e.g. road"
                className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Unit</label>
              <input
                value={editing.unit || ''}
                onChange={e => setEditing(p => ({ ...p, unit: e.target.value }))}
                placeholder="km / night / hour / project"
                className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Rate (₹) <span className="text-red-500">*</span></label>
              <input
                type="number"
                value={editing.rate}
                onChange={e => setEditing(p => ({ ...p, rate: e.target.value }))}
                className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Sort Order</label>
              <input
                type="number"
                value={editing.sort_order ?? 0}
                onChange={e => setEditing(p => ({ ...p, sort_order: e.target.value }))}
                className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={!!editing.is_active}
                  onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))}
                  className="rounded border-slate-300 text-primary focus:ring-primary/30"
                />
                Active
              </label>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Description</label>
            <input
              value={editing.description || ''}
              onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
              placeholder="Brief description shown in estimator dropdowns"
              className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={cancel} className="text-xs font-semibold text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100">Cancel</button>
            <button
              onClick={save}
              disabled={saving}
              className="bg-primary text-on-primary text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-primary-dark active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400 py-6 text-center">Loading...</p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">No rate cards{filterCat ? ' in this category' : ''}.</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <th className="py-2 px-2 font-bold">Category</th>
                <th className="py-2 px-2 font-bold">Item</th>
                <th className="py-2 px-2 font-bold">Unit</th>
                <th className="py-2 px-2 font-bold">Rate (₹)</th>
                <th className="py-2 px-2 font-bold hidden md:table-cell">Description</th>
                <th className="py-2 px-2 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(c => (
                <tr key={c.id} className={`border-b border-slate-50 ${c.is_active ? '' : 'opacity-50'}`}>
                  <td className="py-2.5 px-2">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {catLabel(c.category)}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 font-semibold text-slate-900">{c.item_name}</td>
                  <td className="py-2.5 px-2 text-xs text-slate-500">{c.unit || '—'}</td>
                  <td className="py-2.5 px-2 font-mono font-bold text-slate-900">
                    ₹{Number(c.rate).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2.5 px-2 text-xs text-slate-500 max-w-[220px] truncate hidden md:table-cell" title={c.description}>
                    {c.description || '—'}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => startEdit(c)} className="text-slate-400 hover:text-primary p-1.5 rounded hover:bg-primary/10 transition-colors" title="Edit">
                        <span className="material-symbols-outlined text-base">edit</span>
                      </button>
                      <button
                        onClick={() => toggleActive(c)}
                        className={`p-1.5 rounded transition-colors ${c.is_active
                          ? 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                          : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={c.is_active ? 'Deactivate (hide from estimator)' : 'Reactivate'}
                      >
                        <span className="material-symbols-outlined text-base">{c.is_active ? 'visibility_off' : 'visibility'}</span>
                      </button>
                      <button onClick={() => deleteCard(c)} className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors" title="Delete permanently">
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RateCardManager;
