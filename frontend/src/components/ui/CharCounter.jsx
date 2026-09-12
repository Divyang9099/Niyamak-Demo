import clsx from 'clsx';

/**
 * Inline character counter shown below a textarea.
 * Turns amber at 80% capacity, red when over limit.
 */
export const CharCounter = ({ current = 0, max }) => {
  if (!max) return null;
  const pct = current / max;
  return (
    <span className={clsx(
      'text-[10px] font-mono tabular-nums',
      pct >= 1    ? 'text-red-500'   :
      pct >= 0.8  ? 'text-amber-500' :
                    'text-slate-400'
    )}>
      {current}/{max}
    </span>
  );
};
