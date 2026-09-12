import { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BD_PRIORITIES, BD_STATUSES } from '../../../utils/constants';

const FOLLOWUP_OPTIONS = [
  { value: 'overdue',   label: 'Overdue' },
  { value: 'due_today', label: 'Due today' },
  { value: 'due_week',  label: 'Due this week' },
  { value: 'none',      label: 'None scheduled' },
];

/**
 * Custom dropdown menu for a premium look and feel.
 * Replaces native HTML select tags.
 */
export const FilterDropdown = ({ label, icon, options, value, onChange, placeholder, getOptionExtra }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeOption = options.find(o => o.value === value);
  const isFiltered = !!value;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl border transition-all duration-200 min-h-[38px] group shadow-soft ${
          isFiltered
            ? 'bg-primary-light border-primary/30 text-primary shadow-glow'
            : 'bg-surface border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
        }`}
      >
        {icon && (
          <span className={`material-symbols-outlined text-base transition-colors ${
            isFiltered ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600'
          }`}>
            {icon}
          </span>
        )}
        <span>{activeOption && activeOption.value ? activeOption.label : placeholder}</span>
        <span className={`material-symbols-outlined text-base transition-transform duration-200 ${
          open ? 'rotate-180 text-primary' : 'text-slate-400 group-hover:text-slate-600'
        }`}>
          expand_more
        </span>
      </button>

      {open && (
        <div className="absolute left-0 mt-1.5 z-50 bg-surface border border-slate-200 rounded-xl shadow-pop min-w-[200px] py-1.5 animate-scale-in origin-top-left">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors text-left ${
                  isSelected
                    ? 'bg-primary-light text-primary font-bold'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  {getOptionExtra && getOptionExtra(opt.value)}
                  <span>{opt.label}</span>
                </div>
                {isSelected && (
                  <span className="material-symbols-outlined text-sm font-bold text-primary">
                    check
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * Premium filter bar for Business Development.
 */
export const BDFilterBar = ({ fields = ['search', 'sector', 'priority', 'status', 'followup'], sectors = [], onChange }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [sector, setSector] = useState(searchParams.get('sector') || '');
  const [priority, setPriority] = useState(searchParams.get('priority') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [followup, setFollowup] = useState(searchParams.get('followup') || '');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Debounced URL write + onChange
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = new URLSearchParams();
      if (search)   next.set('search', search);
      if (sector)   next.set('sector', sector);
      if (priority) next.set('priority', priority);
      if (status)   next.set('status', status);
      if (followup) next.set('followup', followup);
      setSearchParams(next, { replace: true });
      onChange?.({ search, sector, priority, status, followup });
    }, 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sector, priority, status, followup]);

  const togglePriority = (p) => setPriority(prev => {
    const set = new Set(prev ? prev.split(',') : []);
    set.has(p) ? set.delete(p) : set.add(p);
    return [...set].filter(Boolean).join(',');
  });

  const clearAll = () => {
    setSearch('');
    setSector('');
    setPriority('');
    setStatus('');
    setFollowup('');
  };

  const hasActive = search || sector || priority || status || followup;

  const sectorOptions = useMemo(() => [
    { value: '', label: 'All sectors' },
    ...sectors.map(s => ({ value: s.key, label: s.label }))
  ], [sectors]);

  const statusOptions = useMemo(() => [
    { value: '', label: 'All statuses' },
    ...BD_STATUSES.map(s => ({ value: s.value, label: s.label }))
  ], []);

  const followupOptions = useMemo(() => [
    { value: '', label: 'Any follow-up state' },
    ...FOLLOWUP_OPTIONS.map(o => ({ value: o.value, label: o.label }))
  ], []);

  const getStatusDot = (val) => {
    if (!val) return null;
    const colors = {
      to_be_initiated: 'bg-slate-400',
      wip: 'bg-amber-500',
      closed_onboard: 'bg-emerald-500',
      closed_cancelled: 'bg-red-500',
    };
    return <span className={`w-2 h-2 rounded-full ${colors[val] || 'bg-slate-400'}`} />;
  };

  const getFollowupIcon = (val) => {
    if (!val) return null;
    const icons = {
      overdue: 'alarm',
      due_today: 'today',
      due_week: 'calendar_month',
      none: 'block',
    };
    return <span className="material-symbols-outlined text-xs text-slate-400">{icons[val] || 'event'}</span>;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {fields.includes('search') && (
          <div className="relative max-w-sm flex-1 min-w-[240px]">
            <span className={`material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none transition-colors duration-200 ${
              isSearchFocused ? 'text-primary' : 'text-slate-400'
            }`}>
              search
            </span>
            <input
              type="text"
              placeholder="Search clients, contacts, addresses…"
              value={search}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2 bg-surface border border-slate-200 text-slate-900 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-soft"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
        )}

        {fields.includes('sector') && sectors.length > 0 && (
          <FilterDropdown
            label="Sector"
            icon="business"
            placeholder="All sectors"
            options={sectorOptions}
            value={sector}
            onChange={setSector}
          />
        )}

        {fields.includes('priority') && (
          <div className="flex items-center gap-1 border border-slate-200 rounded-xl p-1 bg-surface shadow-soft min-h-[38px]">
            <div className="flex items-center gap-1 pl-2 pr-1">
              <span className="material-symbols-outlined text-sm text-slate-400">label_important</span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mr-1 select-none">Priority</span>
            </div>
            <div className="flex items-center gap-0.5">
              {BD_PRIORITIES.map(p => {
                const isSelected = priority.split(',').filter(Boolean).includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePriority(p)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all duration-200 ${
                      isSelected
                        ? 'bg-primary text-on-primary shadow-glow scale-[1.02]'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {fields.includes('status') && (
          <FilterDropdown
            label="Status"
            icon="checklist"
            placeholder="All statuses"
            options={statusOptions}
            value={status}
            onChange={setStatus}
            getOptionExtra={getStatusDot}
          />
        )}

        {fields.includes('followup') && (
          <FilterDropdown
            label="Follow-up"
            icon="calendar_today"
            placeholder="Any follow-up state"
            options={followupOptions}
            value={followup}
            onChange={setFollowup}
            getOptionExtra={getFollowupIcon}
          />
        )}
      </div>

      {hasActive && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 mt-1 animate-fade-in">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">Active Filters:</span>
          
          {search && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary-light border border-primary/10 text-primary text-xs font-semibold">
              <span className="text-[10px] uppercase font-bold opacity-60">Search:</span>
              <span>&ldquo;{search}&rdquo;</span>
              <button type="button" onClick={() => setSearch('')} className="hover:bg-primary/10 rounded-full p-0.5 transition-colors flex items-center justify-center">
                <span className="material-symbols-outlined text-[10px] font-bold">close</span>
              </button>
            </span>
          )}
          
          {sector && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary-light border border-primary/10 text-primary text-xs font-semibold">
              <span className="text-[10px] uppercase font-bold opacity-60">Sector:</span>
              <span>{sectors.find(s => s.key === sector)?.label || sector}</span>
              <button type="button" onClick={() => setSector('')} className="hover:bg-primary/10 rounded-full p-0.5 transition-colors flex items-center justify-center">
                <span className="material-symbols-outlined text-[10px] font-bold">close</span>
              </button>
            </span>
          )}
          
          {priority && priority.split(',').filter(Boolean).map(p => (
            <span key={p} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary-light border border-primary/10 text-primary text-xs font-semibold">
              <span className="text-[10px] uppercase font-bold opacity-60">Priority:</span>
              <span>{p}</span>
              <button type="button" onClick={() => togglePriority(p)} className="hover:bg-primary/10 rounded-full p-0.5 transition-colors flex items-center justify-center">
                <span className="material-symbols-outlined text-[10px] font-bold">close</span>
              </button>
            </span>
          ))}
          
          {status && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary-light border border-primary/10 text-primary text-xs font-semibold">
              <span className="text-[10px] uppercase font-bold opacity-60">Status:</span>
              <span>{BD_STATUSES.find(s => s.value === status)?.label || status}</span>
              <button type="button" onClick={() => setStatus('')} className="hover:bg-primary/10 rounded-full p-0.5 transition-colors flex items-center justify-center">
                <span className="material-symbols-outlined text-[10px] font-bold">close</span>
              </button>
            </span>
          )}
          
          {followup && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary-light border border-primary/10 text-primary text-xs font-semibold">
              <span className="text-[10px] uppercase font-bold opacity-60">Follow-up:</span>
              <span>{FOLLOWUP_OPTIONS.find(o => o.value === followup)?.label || followup}</span>
              <button type="button" onClick={() => setFollowup('')} className="hover:bg-primary/10 rounded-full p-0.5 transition-colors flex items-center justify-center">
                <span className="material-symbols-outlined text-[10px] font-bold">close</span>
              </button>
            </span>
          )}
          
          <button type="button" onClick={clearAll} className="text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center gap-0.5 ml-1">
            <span className="material-symbols-outlined text-xs">restart_alt</span>
            Reset
          </button>
        </div>
      )}
    </div>
  );
};

export default BDFilterBar;
