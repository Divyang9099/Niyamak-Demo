import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../context/ToastContext';
import { logResponse } from '../api/bd.api';
import { BD_RESPONSE_STATUSES } from '../../../utils/constants';

/**
 * LogResponseModal — attaches a response to any open touchpoint (either via
 * channel.latest_open_touchpoint_id or directly via touchpoint.id),
 * automatically closing the linked follow-up on the backend.
 */
export const LogResponseModal = ({ isOpen, onClose, channel, touchpoint, onLogged }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState({ response_status: 'positive', response_summary: '', remark: '', outcome: '' });
  const [saving, setSaving] = useState(false);

  const touchpointId = touchpoint?.id || channel?.latest_open_touchpoint_id;
  const displayLabel = touchpoint?.contact_name
    ? `${touchpoint.contact_name}${touchpoint.channel_value ? ` (${touchpoint.channel_value})` : ''}`
    : touchpoint?.channel_value || touchpoint?.subject || channel?.value || 'Outreach entry';

  useEffect(() => {
    if (isOpen) setForm({ response_status: 'positive', response_summary: '', remark: '', outcome: '' });
  }, [isOpen, touchpointId]);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    if (!touchpointId) {
      showToast('No outreach is awaiting a reply on this item', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await logResponse(touchpointId, {
        response_status: form.response_status,
        response_summary: form.response_summary || undefined,
        remark: form.remark || undefined,
        outcome: form.outcome || undefined,
      });
      showToast('Response logged successfully');
      onLogged?.(res.data.data);
      onClose();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to log response', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Log Response"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} icon="reply" isLoading={saving}>
            {saving ? 'Logging…' : 'Log Response'}
          </Button>
        </div>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
        <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-700">
          <span className="material-symbols-outlined text-base text-primary">reply</span>
          <span className="font-bold text-slate-800 truncate">{displayLabel}</span>
        </div>

        <div>
          <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">
            Response Sentiment / Status<span className="text-red-500 ml-0.5">*</span>
          </label>
          <select
            value={form.response_status}
            onChange={set('response_status')}
            className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl px-4 py-2.5 text-sm text-slate-900 transition-all duration-200"
          >
            {BD_RESPONSE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">What they said / Summary</label>
          <textarea
            value={form.response_summary}
            onChange={set('response_summary')}
            rows={3}
            className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl p-3 text-sm text-slate-900 resize-none transition-all duration-200"
            placeholder="Key discussion points, interest level, questions raised..."
          />
        </div>

        <Input 
          label="Next Step / Outcome" 
          value={form.outcome} 
          onChange={set('outcome')} 
          placeholder="e.g. Schedule product demo next Tuesday" 
          icon="flag"
        />

        <Input 
          label="Internal Remark" 
          value={form.remark} 
          onChange={set('remark')} 
          placeholder="Internal notes or observations (optional)" 
          icon="sticky_note_2"
        />
      </form>
    </Modal>
  );
};

export default LogResponseModal;
