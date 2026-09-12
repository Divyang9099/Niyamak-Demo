import { useEffect, useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../context/ToastContext';
import { useDialog } from '../../../context/DialogContext';
import {
  getSectors, createSector, updateSector, deleteSector,
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getSettings, updateSettings,
} from '../api/bd.api';

const INP = 'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all';

// Shared "small reference list" manager — sectors and departments are both
// { key, label, sort_order, is_active } tables, so one component drives both.
const RefListManager = ({ title, description, icon, items, onCreate, onUpdate, onDelete, showIcon = false }) => {
  const { showToast } = useToast();
  const { confirmDialog } = useDialog();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ key: '', label: '', icon: '', sort_order: 0 });
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});

  const startAdd = () => { setAdding(true); setDraft({ key: '', label: '', icon: '', sort_order: (items.length + 1) * 10 }); };

  const handleCreate = async () => {
    if (!draft.key.trim() || !draft.label.trim()) { showToast('Key and label are required', 'error'); return; }
    try {
      await onCreate({ ...draft, sort_order: Number(draft.sort_order) || 0 });
      setAdding(false);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to create', 'error');
    }
  };

  const startEdit = (item) => { setEditingId(item.id); setEditDraft({ label: item.label, icon: item.icon || '', sort_order: item.sort_order }); };
  const saveEdit = async (item) => {
    try {
      await onUpdate(item.id, { ...editDraft, sort_order: Number(editDraft.sort_order) || 0 });
      setEditingId(null);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to update', 'error');
    }
  };

  const toggleActive = async (item) => {
    try { await onUpdate(item.id, { is_active: !item.is_active }); }
    catch (err) { showToast(err?.response?.data?.message || 'Failed to update', 'error'); }
  };

  const handleDelete = async (item) => {
    if (!(await confirmDialog({ title: `Delete "${item.label}"`, message: 'This cannot be undone.', danger: true, confirmLabel: 'Delete' }))) return;
    try { await onDelete(item.id); }
    catch (err) { showToast(err?.response?.data?.message || 'Failed to delete', 'error'); }
  };

  return (
    <Card
      title={<span className="flex items-center gap-2">{icon && <span className="material-symbols-outlined text-lg text-slate-400">{icon}</span>}{title}</span>}
      action={!adding && <Button size="sm" icon="add" onClick={startAdd}>Add</Button>}
    >
      {description && <p className="text-xs text-slate-400 -mt-3 mb-3">{description}</p>}

      {adding && (
        <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={draft.key} onChange={e => setDraft(d => ({ ...d, key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} placeholder="key" className={INP} />
          <input value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} placeholder="Label" className={INP} />
          {showIcon && <input value={draft.icon} onChange={e => setDraft(d => ({ ...d, icon: e.target.value }))} placeholder="material icon" className={INP} />}
          <input type="number" value={draft.sort_order} onChange={e => setDraft(d => ({ ...d, sort_order: e.target.value }))} placeholder="Sort" className={INP} />
          <div className="sm:col-span-4 flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreate}>Save</Button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {items.map(item => (
          <div key={item.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100 ${!item.is_active ? 'opacity-50' : ''}`}>
            {editingId === item.id ? (
              <>
                {showIcon && <input value={editDraft.icon} onChange={e => setEditDraft(d => ({ ...d, icon: e.target.value }))} className={INP + ' w-28'} />}
                <input value={editDraft.label} onChange={e => setEditDraft(d => ({ ...d, label: e.target.value }))} className={INP + ' flex-1'} />
                <input type="number" value={editDraft.sort_order} onChange={e => setEditDraft(d => ({ ...d, sort_order: e.target.value }))} className={INP + ' w-20'} />
                <Button size="sm" onClick={() => saveEdit(item)}>Save</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
              </>
            ) : (
              <>
                {showIcon && item.icon && <span className="material-symbols-outlined text-base text-primary">{item.icon}</span>}
                <span className="flex-1 text-sm font-semibold text-slate-800">{item.label}</span>
                <span className="text-xs font-mono text-slate-400">{item.key}</span>
                <span className="text-xs text-slate-400 w-8 text-center">{item.sort_order}</span>
                <button onClick={() => startEdit(item)} className="text-slate-400 hover:text-primary p-1"><span className="material-symbols-outlined text-base">edit</span></button>
                <button onClick={() => toggleActive(item)} className={item.is_active ? 'text-slate-400 hover:text-amber-500 p-1' : 'text-emerald-500 p-1'} title={item.is_active ? 'Deactivate' : 'Reactivate'}>
                  <span className="material-symbols-outlined text-base">{item.is_active ? 'visibility_off' : 'visibility'}</span>
                </button>
                <button onClick={() => handleDelete(item)} className="text-slate-400 hover:text-red-600 p-1"><span className="material-symbols-outlined text-base">delete</span></button>
              </>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-slate-400 text-center py-4">None yet.</p>}
      </div>
    </Card>
  );
};

export const BDSettingsPanel = () => {
  const { showToast } = useToast();
  const [sectors, setSectors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [settings, setSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const loadSectors = () => getSectors().then(r => setSectors(r.data.data || [])).catch(() => {});
  const loadDepartments = () => getDepartments().then(r => setDepartments(r.data.data || [])).catch(() => {});
  const loadSettings = () => getSettings().then(r => setSettings(r.data.data)).catch(() => {});

  useEffect(() => { loadSectors(); loadDepartments(); loadSettings(); }, []);

  const handleSettingsSave = async () => {
    setSavingSettings(true);
    try {
      const res = await updateSettings(settings);
      setSettings(res.data.data);
      showToast('Settings saved');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to save settings', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      <RefListManager
        title="Sectors" icon="category" showIcon
        description="Dashboard sections — copied from this software's naming, then independent (BD_MODULE_PLAN.md §0.2)."
        items={sectors}
        onCreate={async (d) => { await createSector(d); loadSectors(); }}
        onUpdate={async (id, d) => { await updateSector(id, d); loadSectors(); }}
        onDelete={async (id) => { await deleteSector(id); loadSectors(); }}
      />

      <RefListManager
        title="Departments" icon="apartment"
        description="The department dropdown on each contact."
        items={departments}
        onCreate={async (d) => { await createDepartment(d); loadDepartments(); }}
        onUpdate={async (id, d) => { await updateDepartment(id, d); loadDepartments(); }}
        onDelete={async (id) => { await deleteDepartment(id); loadDepartments(); }}
      />

      {settings && (
        <Card title="Reminder Cadence">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Default follow-up (days)" type="number" min={1} value={settings.default_followup_days}
                onChange={e => setSettings(s => ({ ...s, default_followup_days: e.target.value }))} />
              <Input label="Priority A follow-up (days)" type="number" min={1} value={settings.priority_a_followup_days}
                onChange={e => setSettings(s => ({ ...s, priority_a_followup_days: e.target.value }))} />
              <Input label="Escalation cadence (days)" type="number" min={1} value={settings.escalation_days}
                onChange={e => setSettings(s => ({ ...s, escalation_days: e.target.value }))} />
              <Input label="Max reminders before escalating" type="number" min={1} value={settings.max_reminders}
                onChange={e => setSettings(s => ({ ...s, max_reminders: e.target.value }))} />
              <Input label="Digest send hour (IST, 0–23)" type="number" min={0} max={23} value={settings.reminder_hour_ist}
                onChange={e => setSettings(s => ({ ...s, reminder_hour_ist: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={settings.digest_enabled} onChange={e => setSettings(s => ({ ...s, digest_enabled: e.target.checked }))} className="rounded border-slate-300 text-primary focus:ring-primary/30" />
              Send one combined digest per admin (instead of one email per follow-up)
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={settings.weekly_summary_enabled} onChange={e => setSettings(s => ({ ...s, weekly_summary_enabled: e.target.checked }))} className="rounded border-slate-300 text-primary focus:ring-primary/30" />
              Send a weekly BD summary every Monday
            </label>
            <p className="text-xs text-slate-400">
              Reminders and summaries are emailed only to admins — never to a client (BD_MODULE_PLAN.md §8).
            </p>
            <div className="flex justify-end">
              <Button onClick={handleSettingsSave} disabled={savingSettings} icon="check">
                {savingSettings ? 'Saving…' : 'Save Settings'}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default BDSettingsPanel;
