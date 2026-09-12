import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../context/ToastContext';
import { useDialog } from '../../../context/DialogContext';
import { updateContact, deleteContact } from '../api/bd.api';
import { ChannelLogTable } from './ChannelLogTable';

const SEL = 'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all';
const INP = 'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all';

/**
 * One "person involved" — small fields auto-save on blur/change (fast to
 * scan, fast to act, BD_MODULE_PLAN.md §14.1), with its own nested
 * Email / Phone / LinkedIn channel logs.
 */
export const ContactCard = ({ clientId, contact, departments, onUpdated, onDeleted, onActivityChanged, defaultExpanded = true }) => {
  const { showToast } = useToast();
  const { confirmDialog } = useDialog();
  const [form, setForm] = useState({
    name: contact.name || '',
    designation: contact.designation || '',
    department: contact.department || '',
    is_decision_maker: !!contact.is_decision_maker,
    is_primary: !!contact.is_primary,
  });
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      name: contact.name || '', designation: contact.designation || '', department: contact.department || '',
      is_decision_maker: !!contact.is_decision_maker, is_primary: !!contact.is_primary,
    });
  }, [contact]);

  const save = async (patch) => {
    const next = { ...form, ...patch };
    setForm(next);
    setSaving(true);
    try {
      const res = await updateContact(contact.id, patch);
      onUpdated?.(res.data.data);
      onActivityChanged?.();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to save contact', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!(await confirmDialog({ title: 'Remove contact', message: `Remove ${contact.name}? Their logged history is kept, but they'll no longer appear on this client.`, danger: true, confirmLabel: 'Remove' }))) return;
    try {
      await deleteContact(contact.id);
      onDeleted?.(contact.id);
      onActivityChanged?.();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to remove contact', 'error');
    }
  };

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/60">
        <button type="button" onClick={() => setExpanded(e => !e)} className="text-slate-400 hover:text-slate-700 shrink-0">
          <span className={clsx('material-symbols-outlined text-lg transition-transform', expanded && 'rotate-90')}>chevron_right</span>
        </button>
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
          {(form.name || '?').trim().charAt(0).toUpperCase() || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800 text-sm truncate">{form.name || 'Unnamed contact'}</p>
          {form.designation && <p className="text-[11px] text-slate-400 truncate">{form.designation}</p>}
        </div>
        {form.is_decision_maker && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
            Decision maker
          </span>
        )}
        {saving && <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />}
        <button type="button" onClick={handleDelete} title="Remove contact" className="text-slate-300 hover:text-red-600 shrink-0">
          <span className="material-symbols-outlined text-lg">delete</span>
        </button>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Name</label>
              <input className={INP} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} onBlur={() => save({ name: form.name })} placeholder="Full name" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Designation</label>
              <input className={INP} value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} onBlur={() => save({ designation: form.designation })} placeholder="e.g. Procurement Head" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Department</label>
              <select className={SEL} value={form.department} onChange={e => save({ department: e.target.value })}>
                <option value="">— Select —</option>
                {departments.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={form.is_decision_maker} onChange={e => save({ is_decision_maker: e.target.checked })} className="rounded border-slate-300 text-primary focus:ring-primary/30" />
              Decision maker
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={form.is_primary} onChange={e => save({ is_primary: e.target.checked })} className="rounded border-slate-300 text-primary focus:ring-primary/30" />
              Primary contact
            </label>
          </div>

          <div className="space-y-4 pt-2 border-t border-slate-100">
            <ChannelLogTable clientId={clientId} ownerType="contact" contactId={contact.id} channelType="email" title="Email" onActivityChanged={onActivityChanged} />
            <ChannelLogTable clientId={clientId} ownerType="contact" contactId={contact.id} channelType="phone" title="Phone" onActivityChanged={onActivityChanged} />
            <ChannelLogTable clientId={clientId} ownerType="contact" contactId={contact.id} channelType="linkedin" title="LinkedIn" onActivityChanged={onActivityChanged} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactCard;
