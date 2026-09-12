import { useEffect, useState } from 'react';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import { invalidateProjectTypesCache } from '../../hooks/useProjectTypes';

const BLANK = {
  key: '', label: '', icon: '', default_scope_unit: '',
  default_deliverables: '', sort_order: 0, is_active: true,
};

// Curated Material Symbols relevant to drone / survey operations
const ICON_OPTIONS = [
  { name: 'solar_power',    label: 'Solar Power' },
  { name: 'air',            label: 'Wind' },
  { name: 'electric_bolt',  label: 'T&D / Power' },
  { name: 'cell_tower',     label: 'Tower' },
  { name: 'oil_barrel',     label: 'Pipeline / Oil' },
  { name: 'straighten',     label: 'Volumetric' },
  { name: 'factory',        label: 'Factory' },
  { name: 'landscape',      label: 'Survey / Land' },
  { name: 'route',          label: 'Route / Lines' },
  { name: 'construction',   label: 'Construction' },
  { name: 'water',          label: 'Water / River' },
  { name: 'forest',         label: 'Forest / Green' },
  { name: 'architecture',   label: 'Architecture' },
  { name: 'flight',         label: 'Flight / Drone' },
  { name: 'location_on',    label: 'Location' },
  { name: 'map',            label: 'Map / GIS' },
  { name: 'hub',            label: 'Network / Hub' },
  { name: 'heat_pump',      label: 'Energy / HVAC' },
  { name: 'network_node',   label: 'Network Node' },
  { name: 'flag',           label: 'Flag / Other' },
  { name: 'photo_camera',   label: 'Inspection' },
  { name: 'speed',          label: 'Speed / Scan' },
  { name: 'grain',          label: 'Agriculture' },
  { name: 'biotech',        label: 'Research' },
  { name: 'settings',       label: 'General' },
];

// PRD §10.4 — manage project types that drive the dropdowns across the app.
const ProjectTypeManager = () => {
  const { showToast } = useToast();
  const [types, setTypes]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving]   = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axiosInstance.get(ENDPOINTS.SYSTEM.PROJECT_TYPES);
      setTypes(Array.isArray(r.data.data) ? r.data.data : []);
    } catch {
      showToast('Failed to load project types', 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (t) => {
    setEditing({ ...t, default_deliverables: (t.default_deliverables || []).join(', ') });
    setShowIconPicker(false);
  };

  const startNew = () => { setEditing({ ...BLANK }); setShowIconPicker(false); };
  const cancel   = () => { setEditing(null); setShowIconPicker(false); };

  const save = async () => {
    if (!editing.label?.trim()) return showToast('Label is required', 'error');
    const payload = {
      ...editing,
      default_deliverables: (editing.default_deliverables || '')
        .split(',').map(s => s.trim()).filter(Boolean),
      sort_order: Number(editing.sort_order) || 0,
    };
    setSaving(true);
    try {
      if (editing.id) {
        await axiosInstance.put(ENDPOINTS.SYSTEM.PROJECT_TYPE(editing.id), payload);
        showToast('Project type updated', 'success');
      } else {
        if (!payload.key?.trim()) return showToast('Key is required for new type', 'error');
        await axiosInstance.post(ENDPOINTS.SYSTEM.PROJECT_TYPES, payload);
        showToast('Project type created', 'success');
      }
      setEditing(null);
      setShowIconPicker(false);
      invalidateProjectTypesCache();
      load();
    } catch (e) {
      showToast(e.response?.data?.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  const toggleActive = async (t) => {
    try {
      await axiosInstance.put(ENDPOINTS.SYSTEM.PROJECT_TYPE(t.id), { is_active: !t.is_active });
      showToast(`${t.label} ${t.is_active ? 'deactivated' : 'reactivated'}`, 'success');
      invalidateProjectTypesCache();
      load();
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed', 'error');
    }
  };

  const deleteType = async (t) => {
    if (!confirm(`Permanently delete "${t.label}"?\n\nThis cannot be undone. Existing projects that use this type will keep their type value as a plain text key.`)) return;
    try {
      await axiosInstance.delete(ENDPOINTS.SYSTEM.PROJECT_TYPE(t.id));
      showToast(`${t.label} deleted`, 'success');
      invalidateProjectTypesCache();
      load();
    } catch (e) {
      showToast(e.response?.data?.message || 'Delete failed', 'error');
    }
  };

  return (
    <div className="bg-surface border border-slate-200 rounded-xl p-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-lg text-slate-400">category</span>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 tracking-tight">Project Types</p>
            <p className="text-xs text-slate-400 mt-0.5">Manage the dropdown list of project types and their default scope units & deliverables</p>
          </div>
        </div>
        {!editing && (
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 bg-primary text-on-primary text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-primary-dark active:scale-[0.98] transition-all"
          >
            <span className="material-symbols-outlined text-base">add</span>
            New Type
          </button>
        )}
      </div>

      {editing && (
        <div className="mb-5 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
            {editing.id ? 'Edit Type' : 'Create Type'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                Key {!editing.id && <span className="text-red-500">*</span>}
              </label>
              <input
                value={editing.key}
                onChange={(e) => setEditing(p => ({ ...p, key: e.target.value.toLowerCase() }))}
                disabled={!!editing.id}
                placeholder="e.g. solar_pv"
                className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">Lowercase letters, digits, underscores. Immutable after creation.</p>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">
                Label <span className="text-red-500">*</span>
              </label>
              <input
                value={editing.label}
                onChange={(e) => setEditing(p => ({ ...p, label: e.target.value }))}
                placeholder="Solar PV"
                className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
              />
            </div>

            {/* ── Icon picker ─────────────────────────────────── */}
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Icon (Material Symbol)</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    value={editing.icon || ''}
                    onChange={(e) => setEditing(p => ({ ...p, icon: e.target.value }))}
                    placeholder="e.g. solar_power"
                    className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 pr-10"
                  />
                  {editing.icon && (
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-base text-primary pointer-events-none">
                      {editing.icon}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowIconPicker(v => !v)}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-600 bg-surface border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">grid_view</span>
                  Pick
                </button>
              </div>

              {showIconPicker && (
                <div className="mt-2 p-3 bg-white border border-slate-200 rounded-lg">
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Click an icon to select</p>
                  <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5">
                    {ICON_OPTIONS.map(ic => (
                      <button
                        key={ic.name}
                        type="button"
                        title={ic.label}
                        onClick={() => {
                          setEditing(p => ({ ...p, icon: ic.name }));
                          setShowIconPicker(false);
                        }}
                        className={`flex flex-col items-center gap-0.5 p-2 rounded-lg text-center transition-colors ${
                          editing.icon === ic.name
                            ? 'bg-primary/10 border border-primary/30 text-primary'
                            : 'hover:bg-slate-50 border border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xl">{ic.name}</span>
                        <span className="text-[9px] leading-tight truncate w-full">{ic.label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowIconPicker(false)}
                    className="mt-2 text-[10px] text-slate-400 hover:text-slate-600"
                  >Close picker</button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Default Scope Unit</label>
              <input
                value={editing.default_scope_unit || ''}
                onChange={(e) => setEditing(p => ({ ...p, default_scope_unit: e.target.value }))}
                placeholder="MWp / Per km / Per tower"
                className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Sort Order</label>
              <input
                type="number"
                value={editing.sort_order ?? 0}
                onChange={(e) => setEditing(p => ({ ...p, sort_order: e.target.value }))}
                className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Default Deliverables (comma-separated)</label>
              <input
                value={editing.default_deliverables}
                onChange={(e) => setEditing(p => ({ ...p, default_deliverables: e.target.value }))}
                placeholder="Orthomosaic, Thermal Report, Inspection Report PDF"
                className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={!!editing.is_active}
                  onChange={(e) => setEditing(p => ({ ...p, is_active: e.target.checked }))}
                  className="rounded border-slate-300 text-primary focus:ring-primary/30"
                />
                Active (visible in dropdowns)
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={cancel} className="text-xs font-semibold text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100">Cancel</button>
            <button
              onClick={save}
              disabled={saving}
              className="bg-primary text-on-primary text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-primary-dark active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400 py-6 text-center">Loading…</p>
      ) : types.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">No project types yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <th className="py-2 px-2 font-bold">Type</th>
                <th className="py-2 px-2 font-bold">Key</th>
                <th className="py-2 px-2 font-bold">Scope Unit</th>
                <th className="py-2 px-2 font-bold">Deliverables</th>
                <th className="py-2 px-2 font-bold text-center">Sort</th>
                <th className="py-2 px-2 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.map(t => (
                <tr key={t.id} className={`border-b border-slate-50 ${t.is_active ? '' : 'opacity-50'}`}>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2">
                      {t.icon && <span className="material-symbols-outlined text-base text-primary">{t.icon}</span>}
                      <span className="font-semibold text-slate-900">{t.label}</span>
                      {!t.is_active && <span className="text-[10px] uppercase tracking-widest text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">inactive</span>}
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-xs font-mono text-slate-500">{t.key}</td>
                  <td className="py-2.5 px-2 text-xs text-slate-600">{t.default_scope_unit || '—'}</td>
                  <td className="py-2.5 px-2 text-xs text-slate-600 max-w-[280px] truncate" title={(t.default_deliverables || []).join(', ')}>
                    {(t.default_deliverables || []).join(', ') || '—'}
                  </td>
                  <td className="py-2.5 px-2 text-xs text-slate-500 text-center">{t.sort_order}</td>
                  <td className="py-2.5 px-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-slate-400 hover:text-primary p-1.5 rounded hover:bg-primary/10 transition-colors"
                        title="Edit"
                      ><span className="material-symbols-outlined text-base">edit</span></button>
                      <button
                        onClick={() => toggleActive(t)}
                        className={`p-1.5 rounded transition-colors ${t.is_active
                          ? 'text-slate-400 hover:text-amber-500 hover:bg-amber-50'
                          : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={t.is_active ? 'Deactivate (hide from dropdowns)' : 'Reactivate'}
                      ><span className="material-symbols-outlined text-base">{t.is_active ? 'visibility_off' : 'visibility'}</span></button>
                      <button
                        onClick={() => deleteType(t)}
                        className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50 transition-colors"
                        title="Delete permanently"
                      ><span className="material-symbols-outlined text-base">delete</span></button>
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

export default ProjectTypeManager;
