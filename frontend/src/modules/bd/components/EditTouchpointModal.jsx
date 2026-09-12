import { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../context/ToastContext';
import { correctTouchpoint } from '../api/bd.api';
import { BD_RESPONSE_STATUSES } from '../../../utils/constants';

const ALL_RESPONSE_STATUSES = [
  { value: 'awaiting', label: 'Awaiting Response' },
  ...BD_RESPONSE_STATUSES,
];

export const EditTouchpointModal = ({ isOpen, onClose, touchpoint, onUpdated }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    subject: '',
    summary: '',
    response_status: 'awaiting',
    response_summary: '',
    outcome: '',
    remark: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (touchpoint && isOpen) {
      setForm({
        subject: touchpoint.subject || '',
        summary: touchpoint.summary || '',
        response_status: touchpoint.response_status || 'awaiting',
        response_summary: touchpoint.response_summary || '',
        outcome: touchpoint.outcome || '',
        remark: touchpoint.remark || '',
      });
    }
  }, [touchpoint, isOpen]);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    if (!touchpoint?.id) return;
    setSaving(true);
    try {
      const res = await correctTouchpoint(touchpoint.id, {
        subject: form.subject || null,
        summary: form.summary || null,
        response_status: form.response_status,
        response_summary: form.response_summary || null,
        outcome: form.outcome || null,
        remark: form.remark || null,
      });
      showToast('Touchpoint updated');
      onUpdated?.(res.data.data);
      onClose();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to update touchpoint', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !touchpoint) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit / Correct Touchpoint"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} icon="check" isLoading={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
        {(touchpoint.contact_name || touchpoint.channel_value) && (
          <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-700">
            <span className="material-symbols-outlined text-base text-primary">person</span>
            <span className="font-bold text-slate-800">
              {touchpoint.contact_name || 'General Outreach'}
              {touchpoint.channel_value && ` · ${touchpoint.channel_value}`}
            </span>
          </div>
        )}

        <Input 
          label="Subject / Purpose" 
          value={form.subject} 
          onChange={set('subject')} 
          placeholder="e.g. Initial proposal discussion"
          icon="label"
        />

        <div>
          <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">Outreach Summary</label>
          <textarea
            value={form.summary}
            onChange={set('summary')}
            rows={2}
            className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl p-3 text-sm text-slate-900 resize-none transition-all duration-200"
            placeholder="Details of what was communicated..."
          />
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <div>
            <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">
              Response Status / Sentiment
            </label>
            <select
              value={form.response_status}
              onChange={set('response_status')}
              className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl px-4 py-2.5 text-sm text-slate-900 transition-all duration-200"
            >
              {ALL_RESPONSE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {form.response_status !== 'awaiting' && (
            <div>
              <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">Response Details</label>
              <textarea
                value={form.response_summary}
                onChange={set('response_summary')}
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl p-3 text-sm text-slate-900 resize-none transition-all duration-200"
                placeholder="What they responded..."
              />
            </div>
          )}

          <Input 
            label="Next Step / Outcome" 
            value={form.outcome} 
            onChange={set('outcome')} 
            placeholder="e.g. Follow up with revised pricing"
            icon="flag"
          />

          <Input 
            label="Internal Remark" 
            value={form.remark} 
            onChange={set('remark')} 
            placeholder="Internal notes or corrections"
            icon="sticky_note_2"
          />
        </div>
      </form>
    </Modal>
  );
};

export default EditTouchpointModal;
