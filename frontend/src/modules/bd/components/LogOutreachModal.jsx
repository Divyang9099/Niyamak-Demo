import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../context/ToastContext';
import { logOutreach } from '../api/bd.api';

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/**
 * The "Sent" checkbox action (BD_MODULE_PLAN.md §7.2/D2) — ticking a channel's
 * Sent box is not a dumb boolean, it logs a real touchpoint. Follow-up scheduling
 * is computed server-side from bd_settings + the client's priority.
 */
export const LogOutreachModal = ({ isOpen, onClose, channel, onLogged }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState({ occurred_at: nowLocal(), subject: '', summary: '', remark: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setForm({ occurred_at: nowLocal(), subject: '', summary: '', remark: '' });
  }, [isOpen, channel?.id]);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await logOutreach(channel.id, {
        occurred_at: new Date(form.occurred_at).toISOString(),
        subject: form.subject || undefined,
        summary: form.summary || undefined,
        remark: form.remark || undefined,
      });
      showToast('Outreach logged');
      onLogged?.(res.data.data);
      onClose();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to log outreach', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!channel) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Log Outreach"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} icon="send">
            {saving ? 'Logging…' : 'Log Outreach'}
          </Button>
        </div>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
        <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-600">
          <span className="material-symbols-outlined text-sm text-slate-400">
            {channel.channel_type === 'email' ? 'mail' : channel.channel_type === 'phone' ? 'call' : channel.channel_type === 'linkedin' ? 'work' : 'chat'}
          </span>
          <span className="font-semibold text-slate-800 truncate">{channel.value}</span>
          {channel.label && <span className="text-slate-400">· {channel.label}</span>}
        </div>

        <Input label="Sent on" type="datetime-local" value={form.occurred_at} onChange={set('occurred_at')} required />
        <Input label="Subject" value={form.subject} onChange={set('subject')} placeholder="e.g. Company profile & rate card" />
        <div>
          <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">What was sent</label>
          <textarea
            value={form.summary}
            onChange={set('summary')}
            rows={3}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 resize-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
            placeholder="Brief summary of what was sent or discussed"
          />
        </div>
        <Input label="Remark" value={form.remark} onChange={set('remark')} placeholder="Internal note (optional)" />
      </form>
    </Modal>
  );
};

export default LogOutreachModal;
