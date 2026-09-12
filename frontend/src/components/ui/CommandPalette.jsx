import { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { ROUTES, ROLES } from '../../utils/constants';
import useAuth from '../../hooks/useAuth';
import useScrollLock from '../../hooks/useScrollLock';

const ALL_COMMANDS = [
  { label: 'Dashboard',        icon: 'dashboard',             path: ROUTES.DASHBOARD,        roles: null },
  { label: 'Projects',         icon: 'folder_open',           path: ROUTES.PROJECTS,         roles: null },
  { label: 'New Project',      icon: 'add_circle',            path: '/projects/new',         roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER] },
  { label: 'Pipeline',         icon: 'view_kanban',           path: ROUTES.PIPELINE,         roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER] },
  { label: 'Calendar',         icon: 'calendar_month',        path: ROUTES.CALENDAR,         roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER] },
  { label: 'Pilots',           icon: 'person_pin',            path: ROUTES.RESOURCES,        roles: null },
  { label: 'Drones',           icon: 'flight',                path: `${ROUTES.RESOURCES}/drones`,      roles: null },
  { label: 'Allocations',      icon: 'event_available',       path: `${ROUTES.RESOURCES}/allocations`, roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER] },
  { label: 'Assets',           icon: 'category',              path: ROUTES.ASSETS,           roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER] },
  { label: 'Estimations',      icon: 'request_quote',         path: ROUTES.ESTIMATIONS,      roles: [ROLES.ADMIN] },
  { label: 'Library',          icon: 'library_books',         path: ROUTES.LIBRARY,          roles: null },
  { label: 'Archive',          icon: 'inventory_2',           path: ROUTES.ARCHIVE,          roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER] },
  { label: 'User Management',  icon: 'manage_accounts',       path: ROUTES.USERS,            roles: [ROLES.ADMIN] },
  { label: 'Audit Log',        icon: 'history',               path: ROUTES.AUDIT,            roles: [ROLES.ADMIN] },
  { label: 'System Settings',  icon: 'settings',              path: ROUTES.SYSTEM_SETTINGS,  roles: [ROLES.ADMIN] },
  { label: 'My Profile',       icon: 'account_circle',        path: ROUTES.PROFILE,          roles: null },
  { label: 'Notifications',    icon: 'notifications',         path: ROUTES.NOTIFICATIONS,    roles: null },
];

export const CommandPalette = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const effectiveRole = user?.role === 'super_admin' ? ROLES.ADMIN : user?.role;
  useScrollLock(isOpen);

  const commands = useMemo(() =>
    ALL_COMMANDS.filter(c =>
      (!c.roles || c.roles.includes(effectiveRole)) &&
      (query === '' || c.label.toLowerCase().includes(query.toLowerCase()))
    ),
    [query, effectiveRole]
  );

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, commands.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && commands[active]) { go(commands[active]); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, active, commands]);

  useEffect(() => {
    const el = listRef.current?.children[active];
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (cmd) => { navigate(cmd.path); onClose(); };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] flex items-start justify-center pt-[15vh] px-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-surface border border-slate-200 rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <span className="material-symbols-outlined text-slate-400 text-xl flex-shrink-0">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Go to page…"
            className="flex-1 bg-transparent text-slate-900 text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono text-slate-400 border border-slate-200 rounded-md">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1.5">
          {commands.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">No results for "{query}"</p>
          ) : commands.map((cmd, i) => (
            <button
              key={cmd.path}
              onClick={() => go(cmd)}
              onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === active ? 'bg-primary/8 text-primary' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className={`material-symbols-outlined text-lg flex-shrink-0 ${i === active ? 'text-primary' : 'text-slate-400'}`}>
                {cmd.icon}
              </span>
              <span className="text-sm font-medium">{cmd.label}</span>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><kbd className="kbd">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="kbd">↵</kbd> go</span>
            <span className="flex items-center gap-1"><kbd className="kbd">Esc</kbd> close</span>
          </div>
          <span className="text-[10px] text-slate-300 font-mono">Ctrl K</span>
        </div>
      </div>
    </div>,
    document.body
  );
};
