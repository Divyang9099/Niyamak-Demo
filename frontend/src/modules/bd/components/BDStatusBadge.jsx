import clsx from 'clsx';
import { Badge } from '../../../components/ui/Badge';
import { BD_STATUSES } from '../../../utils/constants';

const VARIANT = {
  to_be_initiated: 'neutral',
  wip:              'warning',
  closed_onboard:   'success',
  closed_cancelled: 'danger',
};

// Compact-card equivalent of the dot color, keyed the same as VARIANT above.
const DOT = {
  to_be_initiated: 'bg-slate-400',
  wip:              'bg-amber-500',
  closed_onboard:   'bg-emerald-500',
  closed_cancelled: 'bg-red-500',
};

// Short token for the `dot` mode — the full label ("To Be Initiated") is too
// long to read as compact text, so it's kept as a title/aria tooltip instead
// (never color-only, per BD_MODULE_PLAN.md §14 — mirrors BDPriorityChip's A/B/C).
const SHORT = {
  to_be_initiated: 'TBI',
  wip:              'WIP',
  closed_onboard:   'Won',
  closed_cancelled: 'Lost',
};

export const BDStatusBadge = ({ status, className, dot = false }) => {
  const label = BD_STATUSES.find(s => s.value === status)?.label || status;
  if (dot) {
    return (
      <span className={clsx('inline-flex items-center gap-1 text-[11px] font-bold', className)} title={label}>
        <span className={clsx('w-2 h-2 rounded-full', DOT[status] || DOT.to_be_initiated)} aria-hidden="true" />
        {SHORT[status] || label}
      </span>
    );
  }
  return <Badge variant={VARIANT[status] || 'neutral'} className={className}>{label}</Badge>;
};

export default BDStatusBadge;
