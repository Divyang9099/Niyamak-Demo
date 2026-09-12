import clsx from 'clsx';
import { statusVariant } from '../../utils/status';

const VARIANTS = {
  default:  'bg-slate-100 text-slate-700 border-slate-200',
  success:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning:  'bg-amber-50 text-amber-700 border-amber-200',
  danger:   'bg-red-50 text-red-700 border-red-200',
  info:     'bg-blue-50 text-blue-700 border-blue-200',
  primary:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  neutral:  'bg-slate-50 text-slate-600 border-slate-200',
};

export const Badge = ({ children, variant, status, className }) => {
  // Status → variant comes from the single source of truth in utils/status.js
  const v = status ? statusVariant(status) : (variant || 'default');
  return (
    <span className={clsx(
      'inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest',
      VARIANTS[v],
      className
    )}>
      {children}
    </span>
  );
};
