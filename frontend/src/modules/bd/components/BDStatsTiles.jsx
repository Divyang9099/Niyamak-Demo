import clsx from 'clsx';

const TILES = [
  { key: 'to_be_initiated', label: 'To Be Initiated', sub: 'Not started yet',      icon: 'flag',            color: 'text-slate-600 dark:text-slate-400',   bg: 'bg-slate-100 dark:bg-slate-800',   dot: 'bg-slate-400' },
  { key: 'wip',              label: 'WIP',             sub: 'Actively working',    icon: 'trending_up',     color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-950/40',    dot: 'bg-blue-500' },
  { key: 'closed_onboard',   label: 'Onboarded',       sub: 'Converted to client', icon: 'handshake',       color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40', dot: 'bg-emerald-500' },
  { key: 'closed_cancelled', label: 'Cancelled',       sub: 'Dropped out',         icon: 'cancel',          color: 'text-red-600 dark:text-red-400',     bg: 'bg-red-50 dark:bg-red-950/40',     dot: 'bg-red-400' },
];

const STAT_KEY = {
  to_be_initiated: 'to_be_initiated',
  wip: 'wip',
  closed_onboard: 'onboarded',
  closed_cancelled: 'cancelled',
};

export const BDStatsTiles = ({ stats, activeStatus, onSelectStatus, onFollowupsClick }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {TILES.map(t => {
        const active = activeStatus === t.key;
        const value = stats?.[STAT_KEY[t.key]] ?? 0;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelectStatus(active ? null : t.key)}
            className={clsx(
              'rounded-2xl border p-4 text-left transition-all duration-200 shadow-soft select-none relative overflow-hidden group',
              active
                ? 'bg-surface border-primary ring-2 ring-primary/40 shadow-glow scale-[1.02]'
                : 'bg-surface border-slate-200/80 hover:border-slate-300 hover:shadow-card hover:-translate-y-0.5'
            )}
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className={clsx(
                'w-9 h-9 rounded-xl flex items-center justify-center transition-colors shadow-soft',
                active ? 'bg-primary text-on-primary' : `${t.bg} ${t.color}`
              )}>
                <span className="material-symbols-outlined text-lg">{t.icon}</span>
              </div>
              <span className={clsx(
                'w-2 h-2 rounded-full transition-all',
                active ? 'bg-primary scale-125' : t.dot
              )} />
            </div>
            <p className="text-2xl font-black tracking-tight leading-none mb-1 text-slate-900">
              {value}
            </p>
            <p className={clsx('text-xs font-bold truncate', active ? 'text-primary' : 'text-slate-700')}>
              {t.label}
            </p>
            <p className="text-[10px] font-semibold text-slate-400 mt-0.5 truncate">{t.sub}</p>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onFollowupsClick}
        className="rounded-2xl border border-amber-200/80 bg-surface hover:border-amber-400 p-4 text-left transition-all duration-200 shadow-soft hover:shadow-card hover:-translate-y-0.5 select-none group"
      >
        <div className="flex items-center justify-between mb-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 flex items-center justify-center shadow-soft">
            <span className="material-symbols-outlined text-lg">alarm</span>
          </div>
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        </div>
        <p className="text-2xl font-black tracking-tight leading-none mb-1 text-amber-600">
          {stats?.followups_due ?? 0}
        </p>
        <p className="text-xs font-bold text-slate-800 truncate">Follow-ups Due</p>
        <p className="text-[10px] font-semibold text-amber-600/90 mt-0.5 truncate flex items-center gap-0.5">
          Schedule panel <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
        </p>
      </button>
    </div>
  );
};

export default BDStatsTiles;
