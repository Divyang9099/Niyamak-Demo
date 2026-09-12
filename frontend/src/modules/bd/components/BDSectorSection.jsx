import { useState } from 'react';
import clsx from 'clsx';
import { BDClientCard } from './BDClientCard';

const STORAGE_PREFIX = 'bd_section_open_';

const PRIORITY_LABEL = { A: 'Priority A', B: 'Priority B', C: 'Priority C' };

const PRIORITY_BADGES = {
  A: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200/50',
  B: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200/50',
  C: 'bg-slate-50 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400 border border-slate-200/50'
};

const SECTOR_ICON_COLORS = [
  'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
  'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
  'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
  'bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400',
  'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400',
];
const iconColorFor = (str = '') => SECTOR_ICON_COLORS[(str.charCodeAt(0) || 0) % SECTOR_ICON_COLORS.length];

/**
 * A sector pipeline column card designed for multi-column grid boards.
 */
export const BDSectorSection = ({ section, onClientChanged }) => {
  const storageKey = STORAGE_PREFIX + section.key;
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(storageKey);
    return stored === null ? true : stored === 'true';
  });

  const toggle = () => {
    setOpen(o => {
      localStorage.setItem(storageKey, String(!o));
      return !o;
    });
  };

  const clients = section.clients || [];

  // Group into priority runs along the already-sorted list
  const groups = [];
  for (const c of clients) {
    const last = groups[groups.length - 1];
    if (last && last.priority === c.priority) last.clients.push(c);
    else groups.push({ priority: c.priority, clients: [c] });
  }

  const hasClients = clients.length > 0;

  return (
    <div className={clsx(
      'border rounded-2xl bg-surface transition-all duration-300 overflow-hidden flex flex-col',
      hasClients 
        ? 'border-slate-200/80 shadow-soft hover:shadow-card hover:border-slate-300' 
        : 'border-slate-200/50 bg-surface/80 opacity-90 hover:opacity-100'
    )}>
      <button 
        type="button"
        onClick={toggle} 
        className="group w-full flex items-center justify-between p-4 hover:bg-slate-50/80 transition-all duration-200 text-left border-b border-transparent data-[open=true]:border-slate-100 dark:data-[open=true]:border-slate-800"
        data-open={open && hasClients}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
          <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-soft', iconColorFor(section.label || ''))}>
            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>
              {section.icon || 'category'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-900 dark:text-slate-100 text-sm truncate">{section.label}</span>
              <span className={clsx(
                'text-[10px] font-black px-2 py-0.5 rounded-full select-none shrink-0',
                hasClients 
                  ? 'bg-primary/10 text-primary border border-primary/20' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              )}>
                {clients.length}
              </span>
            </div>
          </div>
        </div>

        <span 
          className={clsx(
            'material-symbols-outlined text-lg transition-transform duration-200 text-slate-400 group-hover:text-slate-600', 
            open && 'rotate-90 text-primary'
          )}
        >
          chevron_right
        </span>
      </button>

      {open && (
        <div className="p-4 pt-3 flex-1 flex flex-col space-y-4 animate-fade-in">
          {!hasClients ? (
            <div className="py-4 text-center rounded-xl bg-slate-50/50 dark:bg-slate-800/20 border border-dashed border-slate-200/60">
              <p className="text-xs text-slate-400 font-semibold">No active leads in {section.label}</p>
            </div>
          ) : (
            <div className="space-y-4 flex-1">
              {groups.map((g) => (
                <div key={g.priority} className="space-y-2.5">
                  <div className="flex items-center gap-2 select-none">
                    <span className={clsx(
                      'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border',
                      PRIORITY_BADGES[g.priority] || PRIORITY_BADGES.C
                    )}>
                      {PRIORITY_LABEL[g.priority] || g.priority}
                    </span>
                    <span className="flex-1 h-px bg-gradient-to-r from-slate-200/60 to-transparent dark:from-slate-800/60" />
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {g.clients.map(c => (
                      <BDClientCard key={c.id} client={c} sectorKey={section.key} onClientChanged={onClientChanged} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BDSectorSection;
