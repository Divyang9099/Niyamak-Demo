import clsx from 'clsx';

// Priority is a visual hierarchy, not just a chip (BD_MODULE_PLAN.md §14.1) —
// color pairs with the letter so it never reads as "broken" or relies on color alone.
const STYLES = {
  A: 'bg-red-50 text-red-700 border-red-200',
  B: 'bg-amber-50 text-amber-700 border-amber-200',
  C: 'bg-slate-100 text-slate-600 border-slate-200',
};

const DOT = {
  A: 'bg-red-500',
  B: 'bg-amber-500',
  C: 'bg-slate-400',
};

/**
 * `dot` — compact mode: just a colored dot + letter, for dense card layouts.
 * Default — a full chip, for forms and tables.
 */
export const BDPriorityChip = ({ priority, dot = false, className }) => {
  const p = STYLES[priority] ? priority : 'C';
  if (dot) {
    return (
      <span className={clsx('inline-flex items-center gap-1 text-[11px] font-bold', className)}>
        <span className={clsx('w-2 h-2 rounded-full', DOT[p])} aria-hidden="true" />
        {p}
      </span>
    );
  }
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest',
      STYLES[p], className
    )}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', DOT[p])} aria-hidden="true" />
      Priority {p}
    </span>
  );
};

export default BDPriorityChip;
