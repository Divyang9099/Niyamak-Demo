import { useRef, useState, useEffect } from 'react';
import { BDPriorityChip } from './BDPriorityChip';
import { updateClientPriority } from '../api/bd.api';
import { useToast } from '../../../context/ToastContext';
import { BD_PRIORITIES } from '../../../utils/constants';

// Click the priority chip anywhere it's used in a list/board — change it
// without leaving the page. Stops propagation so it works inside cards/rows
// that navigate on click.
export const BDInlinePriority = ({ client, dot = false, onChanged }) => {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const choose = async (e, priority) => {
    e.stopPropagation();
    if (priority === client.priority) { setOpen(false); return; }
    setSaving(true);
    try {
      await updateClientPriority(client.id, priority);
      onChanged?.({ ...client, priority });
      setOpen(false);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to update priority', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)} disabled={saving} className="hover:opacity-70 transition-opacity">
        <BDPriorityChip priority={client.priority} dot={dot} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-surface border border-slate-200 rounded-xl shadow-pop py-1 animate-scale-in origin-top-left">
          {BD_PRIORITIES.map(p => (
            <button
              key={p}
              onClick={(e) => choose(e, p)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <BDPriorityChip priority={p} dot />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default BDInlinePriority;
