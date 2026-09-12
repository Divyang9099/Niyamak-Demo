import { useRef, useState, useEffect } from 'react';
import { BDStatusBadge } from './BDStatusBadge';
import { updateClientStatus } from '../api/bd.api';
import { useToast } from '../../../context/ToastContext';
import { BD_STATUSES } from '../../../utils/constants';

// Same click-to-edit pattern as BDInlinePriority. Cancelling requires a
// reason (backend enforces this — bd.clients.service.js updateStatus), so
// that one option reveals a one-line input before it can be saved.
export const BDInlineStatus = ({ client, className, dot = false, onChanged }) => {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setCancelling(false); setReason(''); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const submit = async (e, status, status_reason) => {
    e?.stopPropagation();
    if (status === client.status) { setOpen(false); return; }
    setSaving(true);
    try {
      await updateClientStatus(client.id, { status, status_reason });
      onChanged?.({ ...client, status });
      setOpen(false); setCancelling(false); setReason('');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to update status', 'error');
    } finally {
      setSaving(false);
    }
  };

  const choose = (e, status) => {
    e.stopPropagation();
    if (status === 'closed_cancelled') { setCancelling(true); return; }
    submit(e, status);
  };

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)} disabled={saving} className="hover:opacity-70 transition-opacity">
        <BDStatusBadge status={client.status} className={className} dot={dot} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-surface border border-slate-200 rounded-xl shadow-pop py-1 w-56 animate-scale-in origin-top-left">
          {cancelling ? (
            <div className="p-2.5 space-y-2">
              <input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for cancelling…"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
              <div className="flex justify-end gap-1.5">
                <button onClick={(e) => { e.stopPropagation(); setCancelling(false); setReason(''); }} className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Back</button>
                <button
                  onClick={(e) => submit(e, 'closed_cancelled', reason)}
                  disabled={!reason.trim() || saving}
                  className="px-2.5 py-1 text-[11px] font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg disabled:opacity-40"
                >
                  Confirm
                </button>
              </div>
            </div>
          ) : (
            BD_STATUSES.map(s => (
              <button
                key={s.value}
                onClick={(e) => choose(e, s.value)}
                className="w-full flex items-center px-3 py-1.5 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                <BDStatusBadge status={s.value} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default BDInlineStatus;
