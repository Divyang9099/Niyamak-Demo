import { useEffect, useState, useCallback } from 'react';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../context/SocketContext';
import useAuth from '../../hooks/useAuth';
import { ROLES } from '../../utils/constants';
import { formatDateOnly } from '../../utils/dateUtils';

// ── Constants ─────────────────────────────────────────────────────────────────

const ASSET_TYPES = [
  { value: 'sensor',           label: 'Sensor' },
  { value: 'battery',          label: 'Battery' },
  { value: 'ground_equipment', label: 'Ground Equipment' },
  { value: 'vehicle',          label: 'Vehicle' },
  { value: 'computing',        label: 'Computing' },
  { value: 'accessory',        label: 'Accessory' },
  { value: 'other',            label: 'Other' },
];

const ASSET_STATUSES = [
  { value: 'active',      label: 'Active' },
  { value: 'in_use',      label: 'In Use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired',     label: 'Retired' },
];

const STATUS_BADGE = {
  active:      'success',
  in_use:      'primary',
  maintenance: 'warning',
  retired:     'neutral',
};

const TYPE_ICON = {
  sensor:           'sensors',
  battery:          'battery_charging_full',
  ground_equipment: 'construction',
  vehicle:          'airport_shuttle',
  computing:        'computer',
  accessory:        'cable',
  other:            'inventory_2',
};

const BLANK_FORM = {
  name: '', asset_type: 'other', category: '', serial_number: '', model: '',
  manufacturer: '', status: 'active', purchase_date: '', purchase_price: '',
  current_value: '', warranty_expiry: '', maintenance_due: '', location: '',
  assigned_project_id: '', assigned_drone_id: '', notes: '',
};

const LIMIT = 25;

// ── Summary Card ──────────────────────────────────────────────────────────────

const SummaryCard = ({ icon, label, value, sub, color, bg }) => (
  <div className={`${bg} rounded-2xl p-4 flex items-center gap-3 border border-slate-100`}>
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} bg-surface shadow-sm shrink-0`}>
      <span className="material-symbols-outlined text-xl">{icon}</span>
    </div>
    <div>
      <p className="text-2xl font-black text-slate-900 leading-none">{value}</p>
      <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Form Field helpers ────────────────────────────────────────────────────────

const Field = ({ label, children, half }) => (
  <div className={half ? 'col-span-1' : 'col-span-2'}>
    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
    {children}
  </div>
);

const inputCls = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary placeholder-slate-300';
const selectCls = `${inputCls} bg-surface`;

// ── Main Component ────────────────────────────────────────────────────────────

const Assets = () => {
  const { showToast } = useToast();
  const { socket }    = useSocket();
  const { user }      = useAuth();
  const isAdmin       = user?.role === ROLES.ADMIN;
  const canWrite      = user?.role === ROLES.ADMIN || user?.role === ROLES.PROJECT_MANAGER;

  // list state
  const [items,     setItems]     = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [page,      setPage]      = useState(1);
  const [search,    setSearch]    = useState('');
  const [statusF,   setStatusF]   = useState('');
  const [typeF,     setTypeF]     = useState('');

  // summary
  const [summary,   setSummary]   = useState(null);

  // modals
  const [showForm,  setShowForm]  = useState(false);
  const [editItem,  setEditItem]  = useState(null);
  const [form,      setForm]      = useState({ ...BLANK_FORM });
  const [saving,    setSaving]    = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleting,  setDeleting]  = useState(false);

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const fetchSummary = useCallback(async () => {
    try {
      const res = await axiosInstance.get(ENDPOINTS.ASSETS.SUMMARY);
      setSummary(res.data.data);
    } catch {}
  }, []);

  const fetchAssets = useCallback(async (pg = 1, q = search, st = statusF, tp = typeF) => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(ENDPOINTS.ASSETS.GET_ALL, {
        params: { page: pg, limit: LIMIT, search: q || undefined, status: st || undefined, asset_type: tp || undefined },
      });
      setItems(res.data.data || []);
      setTotal(res.data.pagination?.total || 0);
      setPage(pg);
    } catch {
      showToast('Failed to load assets', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, statusF, typeF]);

  useEffect(() => { fetchAssets(1); fetchSummary(); }, []);

  // filter changes reset to page 1
  useEffect(() => { fetchAssets(1, search, statusF, typeF); }, [search, statusF, typeF]);

  // socket real-time refresh
  useEffect(() => {
    if (!socket) return;
    const refresh = () => { fetchAssets(page); fetchSummary(); };
    socket.on('asset:created', refresh);
    socket.on('asset:updated', refresh);
    socket.on('asset:deleted', refresh);
    return () => {
      socket.off('asset:created', refresh);
      socket.off('asset:updated', refresh);
      socket.off('asset:deleted', refresh);
    };
  }, [socket, page]);

  // ── Modal helpers ───────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditItem(null);
    setForm({ ...BLANK_FORM });
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      name:                item.name || '',
      asset_type:          item.asset_type || 'other',
      category:            item.category || '',
      serial_number:       item.serial_number || '',
      model:               item.model || '',
      manufacturer:        item.manufacturer || '',
      status:              item.status || 'active',
      purchase_date:       item.purchase_date ? item.purchase_date.slice(0, 10) : '',
      purchase_price:      item.purchase_price ?? '',
      current_value:       item.current_value ?? '',
      warranty_expiry:     item.warranty_expiry ? item.warranty_expiry.slice(0, 10) : '',
      maintenance_due:     item.maintenance_due ? item.maintenance_due.slice(0, 10) : '',
      location:            item.location || '',
      assigned_project_id: item.assigned_project_id || '',
      assigned_drone_id:   item.assigned_drone_id || '',
      notes:               item.notes || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('Asset name is required', 'error'); return; }
    setSaving(true);
    const payload = {
      ...form,
      purchase_price:      form.purchase_price !== '' ? Number(form.purchase_price) : null,
      current_value:       form.current_value  !== '' ? Number(form.current_value)  : null,
      purchase_date:       form.purchase_date  || null,
      warranty_expiry:     form.warranty_expiry || null,
      maintenance_due:     form.maintenance_due || null,
      assigned_project_id: form.assigned_project_id || null,
      assigned_drone_id:   form.assigned_drone_id   || null,
    };
    try {
      if (editItem) {
        await axiosInstance.put(ENDPOINTS.ASSETS.UPDATE(editItem.id), payload);
        showToast('Asset updated', 'success');
      } else {
        await axiosInstance.post(ENDPOINTS.ASSETS.CREATE, payload);
        showToast('Asset added', 'success');
      }
      setShowForm(false);
      fetchAssets(editItem ? page : 1);
      fetchSummary();
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    try {
      await axiosInstance.delete(ENDPOINTS.ASSETS.DELETE(deleteItem.id));
      showToast('Asset deleted', 'success');
      setDeleteItem(null);
      fetchAssets(page);
      fetchSummary();
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / LIMIT);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 p-6 pb-10 min-h-0">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Assets</h1>
          <p className="text-sm text-slate-500 mt-0.5">Physical equipment, sensors, batteries and other company resources</p>
        </div>
        {canWrite && (
          <Button onClick={openAdd} className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Asset
          </Button>
        )}
      </div>

      {/* Summary Row */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard icon="inventory_2"       label="Total Assets"        value={summary.total}              color="text-slate-600"   bg="bg-slate-50" />
          <SummaryCard icon="check_circle"      label="Active"              value={summary.active}             color="text-emerald-600" bg="bg-emerald-50" />
          <SummaryCard icon="play_circle"       label="In Use"              value={summary.in_use}             color="text-blue-600"    bg="bg-blue-50" />
          <SummaryCard icon="build"             label="Maintenance"         value={summary.maintenance}        color="text-amber-600"   bg="bg-amber-50" />
          <SummaryCard icon="warning"           label="Warranty Expiring"   value={summary.warranty_expiring_soon}  sub="next 30 days" color="text-orange-600" bg="bg-orange-50" />
          <SummaryCard icon="event_busy"        label="Maintenance Due"     value={summary.maintenance_due_soon}    sub="next 30 days" color="text-red-600"    bg="bg-red-50" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
          <input
            type="text"
            placeholder="Search assets…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <select
          value={statusF}
          onChange={e => setStatusF(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        >
          <option value="">All Statuses</option>
          {ASSET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select
          value={typeF}
          onChange={e => setTypeF(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        >
          <option value="">All Types</option>
          {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {(search || statusF || typeF) && (
          <button
            onClick={() => { setSearch(''); setStatusF(''); setTypeF(''); }}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <span className="material-symbols-outlined text-3xl text-slate-300 animate-spin">progress_activity</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3 text-slate-400">
            <span className="material-symbols-outlined text-5xl">inventory_2</span>
            <p className="text-sm font-medium">No assets found</p>
            {canWrite && <Button onClick={openAdd} className="mt-1">Add your first asset</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Asset</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Serial / Model</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Location</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Warranty</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Maint. Due</th>
                  {canWrite && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(item => {
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const wExp = item.warranty_expiry ? new Date(item.warranty_expiry) : null;
                  const mDue = item.maintenance_due ? new Date(item.maintenance_due) : null;
                  const wWarning = wExp && wExp <= new Date(today.getTime() + 30 * 86400000);
                  const mWarning = mDue && mDue <= new Date(today.getTime() + 30 * 86400000);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[18px] text-slate-500">
                              {TYPE_ICON[item.asset_type] || 'inventory_2'}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 leading-tight">{item.name}</p>
                            {item.manufacturer && <p className="text-[11px] text-slate-400">{item.manufacturer}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-600 text-[12px]">
                          {ASSET_TYPES.find(t => t.value === item.asset_type)?.label || item.asset_type}
                        </span>
                        {item.category && <p className="text-[11px] text-slate-400">{item.category}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700 font-mono text-[12px]">{item.serial_number || '—'}</p>
                        {item.model && <p className="text-[11px] text-slate-400">{item.model}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[item.status] || 'default'}>
                          {ASSET_STATUSES.find(s => s.value === item.status)?.label || item.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-[12px] max-w-[150px] truncate">
                        {item.location || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {wExp ? (
                          <span className={`text-[12px] font-medium ${wWarning ? 'text-orange-600' : 'text-slate-600'}`}>
                            {formatDateOnly(item.warranty_expiry)}
                            {wWarning && <span className="material-symbols-outlined text-[14px] ml-1 align-middle">warning</span>}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {mDue ? (
                          <span className={`text-[12px] font-medium ${mWarning ? 'text-red-600' : 'text-slate-600'}`}>
                            {formatDateOnly(item.maintenance_due)}
                            {mWarning && <span className="material-symbols-outlined text-[14px] ml-1 align-middle">warning</span>}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(item)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                              title="Edit"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit</span>
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => setDeleteItem(item)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                title="Delete"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/40">
            <p className="text-[12px] text-slate-500">
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
            </p>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => fetchAssets(page - 1)}
                className="px-2.5 py-1 rounded-lg text-sm text-slate-600 border border-slate-200 disabled:opacity-40 hover:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px] align-middle">chevron_left</span>
              </button>
              <span className="px-3 py-1 text-sm font-medium text-slate-700">{page} / {totalPages}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => fetchAssets(page + 1)}
                className="px-2.5 py-1 rounded-lg text-sm text-slate-600 border border-slate-200 disabled:opacity-40 hover:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px] align-middle">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title={editItem ? 'Edit Asset' : 'Add Asset'}
        className="max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editItem ? 'Save Changes' : 'Add Asset'}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name *">
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. LiDAR Sensor Unit 1" />
          </Field>
          <Field label="Type" half>
            <select className={selectCls} value={form.asset_type} onChange={e => setForm(f => ({ ...f, asset_type: e.target.value }))}>
              {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Category" half>
            <input className={inputCls} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Payload Sensor" />
          </Field>
          <Field label="Status" half>
            <select className={selectCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {ASSET_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Serial Number" half>
            <input className={inputCls} value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} placeholder="SN-XXXXXX" />
          </Field>
          <Field label="Model" half>
            <input className={inputCls} value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="Model name" />
          </Field>
          <Field label="Manufacturer" half>
            <input className={inputCls} value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} placeholder="Brand / OEM" />
          </Field>
          <Field label="Location" half>
            <input className={inputCls} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Storage room / site" />
          </Field>
          <Field label="Purchase Date" half>
            <input className={inputCls} type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
          </Field>
          <Field label="Purchase Price (₹)" half>
            <input className={inputCls} type="number" min="0" step="0.01" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0.00" />
          </Field>
          <Field label="Current Value (₹)" half>
            <input className={inputCls} type="number" min="0" step="0.01" value={form.current_value} onChange={e => setForm(f => ({ ...f, current_value: e.target.value }))} placeholder="0.00" />
          </Field>
          <Field label="Warranty Expiry" half>
            <input className={inputCls} type="date" value={form.warranty_expiry} onChange={e => setForm(f => ({ ...f, warranty_expiry: e.target.value }))} />
          </Field>
          <Field label="Maintenance Due" half>
            <input className={inputCls} type="date" value={form.maintenance_due} onChange={e => setForm(f => ({ ...f, maintenance_due: e.target.value }))} />
          </Field>
          <Field label="Notes">
            <textarea className={`${inputCls} resize-none`} rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional details…" />
          </Field>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        title="Delete Asset"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteItem(null)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        }
      >
        <p className="text-slate-700">
          Are you sure you want to delete <span className="font-semibold">{deleteItem?.name}</span>? This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
};

export default Assets;
