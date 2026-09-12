import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useToast } from '../../../context/ToastContext';
import { getFollowups, completeFollowup, snoozeFollowup, cancelFollowup, clientLogoUrl } from '../api/bd.api';
import { BDPriorityChip } from './BDPriorityChip';

const dayDiff = (d) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

const GROUP_DEFS = [
  { key: 'overdue',  label: 'Overdue',        headerClass: 'text-red-700 bg-red-50 border-red-100',   test: (f) => dayDiff(f.due_at) < 0 },
  { key: 'today',    label: 'Due today',      headerClass: 'text-amber-700 bg-amber-50 border-amber-100', test: (f) => dayDiff(f.due_at) === 0 },
  { key: 'week',     label: 'Due this week',  headerClass: 'text-blue-700 bg-blue-50 border-blue-100', test: (f) => dayDiff(f.due_at) > 0 && dayDiff(f.due_at) <= 7 },
  { key: 'upcoming', label: 'Upcoming',       headerClass: 'text-slate-500 bg-slate-50 border-slate-200', test: () => true },
];

const Row = ({ f, onChange }) => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [snoozing, setSnoozing] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');
  const [imgError, setImgError] = useState(false);
  const diff = dayDiff(f.due_at);

  const act = async (fn) => {
    try { await fn(); onChange(); }
    catch (err) { showToast(err?.response?.data?.message || 'Action failed', 'error'); }
  };

  return (
    <div className="flex items-center gap-3 border border-slate-100 rounded-xl p-3 hover:bg-slate-50/40 transition-colors">
      {f.client_logo_url && !imgError ? (
        // Rounded square, not a circle: a circle clips the corners of a
        // contained logo and wastes the width wide wordmarks need.
        <img src={clientLogoUrl(f.client_id)} onError={() => setImgError(true)} className="w-9 h-9 rounded-xl object-contain p-0.5 shrink-0" alt="" />
      ) : (
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
          {(f.client_name || '?')[0].toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/bd/clients/${f.client_id}`)}>
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-800 text-sm truncate">{f.client_name}</p>
          <BDPriorityChip priority={f.client_priority} dot />
        </div>
        <p className="text-xs text-slate-400 truncate">
          {f.contact_name && <span>{f.contact_name} · </span>}
          {f.channel_value && <span>{f.channel_value} · </span>}
          {f.touchpoint_subject || f.note || 'Follow-up'}
        </p>
      </div>
      <span className={clsx('text-xs font-bold px-2 py-1 rounded-full shrink-0', diff < 0 ? 'bg-red-50 text-red-600' : diff === 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500')}>
        {diff < 0 ? `${Math.abs(diff)}d overdue` : diff === 0 ? 'Today' : `in ${diff}d`}
      </span>
      {snoozing ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <input type="date" value={snoozeDate} onChange={e => setSnoozeDate(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1" />
          <Button size="sm" onClick={() => act(() => snoozeFollowup(f.id, { due_at: new Date(snoozeDate).toISOString() })).then(() => setSnoozing(false))} disabled={!snoozeDate}>Save</Button>
          <Button size="sm" variant="secondary" onClick={() => setSnoozing(false)}>✕</Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="secondary" onClick={() => act(() => completeFollowup(f.id))} title="Complete">
            <span className="material-symbols-outlined text-sm">check</span>
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setSnoozing(true)} title="Snooze">
            <span className="material-symbols-outlined text-sm">snooze</span>
          </Button>
          <Button size="sm" variant="danger" onClick={() => act(() => cancelFollowup(f.id))} title="Cancel">
            <span className="material-symbols-outlined text-sm">close</span>
          </Button>
        </div>
      )}
    </div>
  );
};

const Group = ({ def, items, onChange }) => {
  const [open, setOpen] = useState(def.key !== 'upcoming');
  if (items.length === 0) return null;
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className={clsx('w-full flex items-center justify-between px-3 py-2 rounded-xl border font-bold text-xs uppercase tracking-widest mb-2', def.headerClass)}>
        <span>{def.label} · {items.length}</span>
        <span className={clsx('material-symbols-outlined text-base transition-transform', open && 'rotate-90')}>chevron_right</span>
      </button>
      {open && (
        <div className="space-y-2 mb-4">
          {items.map(f => <Row key={f.id} f={f} onChange={onChange} />)}
        </div>
      )}
    </div>
  );
};

export const BDFollowUpsPanel = () => {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getFollowups({});
      setRows(r.data.data || []);
    } catch {
      showToast('Failed to load follow-ups', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const remaining = [...rows];
  const grouped = GROUP_DEFS.map(def => {
    const matched = remaining.filter(f => def.test(f));
    matched.forEach(f => { const i = remaining.indexOf(f); if (i > -1) remaining.splice(i, 1); });
    return { def, items: matched.sort((a, b) => new Date(a.due_at) - new Date(b.due_at)) };
  });

  const overdueCount = grouped.find(g => g.def.key === 'overdue')?.items.length || 0;

  return (
    <div className="max-w-3xl">
      <Card>
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-10">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon="task_alt" title="You're all caught up" description="No follow-ups are due right now." />
        ) : (
          <>
            {overdueCount === 0 && (
              <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-4 text-sm font-semibold">
                <span className="material-symbols-outlined text-base">task_alt</span> Nothing overdue — you're on top of it.
              </div>
            )}
            {grouped.map(g => <Group key={g.def.key} def={g.def} items={g.items} onChange={load} />)}
          </>
        )}
      </Card>
    </div>
  );
};

export default BDFollowUpsPanel;
