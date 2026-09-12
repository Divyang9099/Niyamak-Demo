import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import useAuth from '../../hooks/useAuth';
import clsx from 'clsx';
import { ROLES, ROUTES } from '../../utils/constants';

const STORAGE_KEY = 'varuna_sidebar_open';

// ── Nav groups ────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    id: 'operations',
    label: 'Operations',
    icon: 'work',
    roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER, ROLES.PILOT],
    items: [
      { label: 'Projects',  path: ROUTES.PROJECTS,  icon: 'folder_open',    roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER, ROLES.PILOT] },
      { label: 'Pipeline',  path: ROUTES.PIPELINE,  icon: 'view_kanban',    roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER] },
      { label: 'Clients',   path: ROUTES.CLIENTS,   icon: 'contacts',       roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER] },
      { label: 'Calendar',  path: ROUTES.CALENDAR,  icon: 'calendar_month', roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER] },
    ],
  },
  {
    id: 'resources',
    label: 'Resources',
    icon: 'hub',
    roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER, ROLES.PILOT],
    items: [
      { label: 'Pilots',       path: ROUTES.RESOURCES,                  icon: 'person_pin',   roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER, ROLES.PILOT],
        match: (p) => p === ROUTES.RESOURCES || (p.startsWith(`${ROUTES.RESOURCES}/pilots`) && !p.startsWith(ROUTES.COPILOTS)) },
      { label: 'Co-Pilots',    path: ROUTES.COPILOTS,                   icon: 'group',        roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER, ROLES.PILOT] },
      { label: 'Drones',       path: `${ROUTES.RESOURCES}/drones`,      icon: 'flight',       roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER, ROLES.PILOT] },
      { label: 'Allocations',  path: `${ROUTES.RESOURCES}/allocations`, icon: 'event_available', roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER] },
      { label: 'Assets',       path: ROUTES.ASSETS,                     icon: 'category',     roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER] },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    icon: 'business_center',
    roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER, ROLES.PILOT],
    items: [
      { label: 'Estimations', path: ROUTES.ESTIMATIONS, icon: 'request_quote',  roles: [ROLES.ADMIN] },
      { label: 'Library',     path: ROUTES.LIBRARY,     icon: 'library_books',  roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER, ROLES.PILOT] },
      { label: 'Archive',     path: ROUTES.ARCHIVE,     icon: 'inventory_2',    roles: [ROLES.ADMIN, ROLES.PROJECT_MANAGER] },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    icon: 'admin_panel_settings',
    roles: [ROLES.ADMIN],
    items: [
      { label: 'Pilot Attendance', path: ROUTES.ATTENDANCE, icon: 'fact_check', roles: [ROLES.ADMIN] },
      { label: 'Users',            path: ROUTES.USERS,       icon: 'group',        roles: [ROLES.ADMIN] },
      { label: 'Audit Log',        path: ROUTES.AUDIT,       icon: 'receipt_long', roles: [ROLES.ADMIN] },
      { label: 'Weekly Report',    path: ROUTES.WEEKLY_REPORT, icon: 'mark_email_read', roles: [ROLES.ADMIN] },
    ],
  },
];

// ── Animated section ──────────────────────────────────────────────────────────
const NavSection = ({ group, role, pathname, isOpen, onToggle, setSidebarOpen }) => {
  const visibleItems = group.items.filter(i => i.roles.includes(role));
  if (!visibleItems.length) return null;

  const isNavActive = (item) => {
    if (item.match) return item.match(pathname);
    return pathname === item.path || pathname.startsWith(`${item.path}/`);
  };

  const hasActiveChild = visibleItems.some(isNavActive);

  return (
    <div className="mb-0.5">
      {/* Section header — toggle button */}
      <button
        onClick={onToggle}
        className={clsx(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 group select-none",
          hasActiveChild
            ? "bg-primary/10 text-primary hover:bg-primary/15"
            : "text-slate-500 hover:text-primary hover:bg-primary/8"
        )}
      >
        {/* Group icon — always outlined, lighter */}
        <span
          className={clsx(
            "material-symbols-outlined text-[17px] shrink-0 transition-colors duration-200",
            hasActiveChild ? "text-primary" : "text-slate-400 group-hover:text-primary"
          )}
          style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
        >
          {group.icon}
        </span>

        <span className={clsx(
          "flex-1 text-left text-[10.5px] font-bold uppercase tracking-[0.16em] transition-colors duration-200",
          hasActiveChild ? "text-primary" : "text-slate-500 group-hover:text-primary"
        )}>
          {group.label}
        </span>

        {/* Active dot when collapsed */}
        {!isOpen && hasActiveChild && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
        )}

        {/* Chevron */}
        <span
          className={clsx(
            "material-symbols-outlined text-[15px] shrink-0 transition-transform duration-300",
            hasActiveChild ? "text-primary" : "text-slate-400 group-hover:text-primary",
            isOpen ? "rotate-180" : "rotate-0"
          )}
          style={{ fontVariationSettings: "'wght' 300" }}
        >
          expand_more
        </span>
      </button>

      {/* Animated items container */}
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isOpen ? `${visibleItems.length * 44}px` : '0px',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="pl-2 pr-1 pt-0.5 pb-1">
          <div className="relative">
            {/* Track line */}
            <div className="absolute left-3 top-1 bottom-1 w-px bg-slate-200/80 rounded-full" />

            <div className="space-y-0.5 pl-2">
              {visibleItems.map((item) => {
                const active = isNavActive(item);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      "relative flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-lg transition-all duration-200 text-[13.5px] font-semibold group",
                      active
                        ? "text-primary bg-primary/8"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                    )}
                  >
                    {/* Active left border indicator */}
                    {active && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-full" />
                    )}

                    {/* Icon — always outlined, lighter */}
                    <span
                      className={clsx(
                        "material-symbols-outlined text-[17px] shrink-0 transition-colors duration-200",
                        active ? "text-primary" : "text-slate-400 group-hover:text-slate-600"
                      )}
                      style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
                    >
                      {item.icon}
                    </span>

                    <span className="tracking-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main sidebar ──────────────────────────────────────────────────────────────
const Sidebar = ({ isOpen, setSidebarOpen }) => {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const role = user?.role || ROLES.PILOT;

  // Persist open/closed state per group
  const [openGroups, setOpenGroups] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === 'object') return saved;
    } catch { /* ignore */ }
    return { operations: true, resources: true, business: true, admin: true };
  });

  // Auto-open the group that contains the active route
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find(g =>
      g.items.some(i => i.match ? i.match(pathname) : pathname === i.path || pathname.startsWith(`${i.path}/`))
    );
    if (activeGroup) {
      setOpenGroups(prev => {
        if (prev[activeGroup.id]) return prev;
        const next = { ...prev, [activeGroup.id]: true };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, [pathname]);

  const toggleGroup = (id) => {
    setOpenGroups(prev => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const isProfileActive = pathname === ROUTES.PROFILE;
  const isSettingsActive = pathname === ROUTES.SYSTEM_SETTINGS;

  return (
    <aside className={clsx(
      "fixed top-0 left-0 h-screen w-64 bg-surface border-r border-slate-200/70 shadow-soft flex flex-col z-[1200] transition-transform duration-300 ease-in-out md:translate-x-0",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}>

      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-slate-100 shrink-0">
        <Link to={ROUTES.DASHBOARD} onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 group">
          <img
            src="/favicon.png"
            alt="Logo"
            className="w-9 h-9 object-contain shrink-0 filter drop-shadow-[0_2px_8px_rgba(37,99,235,0.25)] transition-transform duration-300 group-hover:scale-105"
          />
          <span className="text-[20px] font-black tracking-tight leading-none bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent select-none">
            नियामक:
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2.5 space-y-0.5">

        {/* Dashboard — standalone */}
        <Link
          to={ROUTES.DASHBOARD}
          onClick={() => setSidebarOpen(false)}
          aria-current={pathname === ROUTES.DASHBOARD ? 'page' : undefined}
          className={clsx(
            "flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 text-[13.5px] font-semibold mb-2",
            pathname === ROUTES.DASHBOARD
              ? "text-primary bg-primary/10"
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          )}
        >
          {pathname === ROUTES.DASHBOARD && (
            <span className="absolute left-3 top-auto w-[3px] h-5 bg-primary rounded-full" />
          )}
          <span
            className={clsx("material-symbols-outlined text-[17px] shrink-0",
              pathname === ROUTES.DASHBOARD ? "text-primary" : "text-slate-400"
            )}
            style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
          >
            dashboard
          </span>
          <span className="tracking-tight">Dashboard</span>
        </Link>

        {/* Grouped sections */}
        {NAV_GROUPS.map(group => (
          <NavSection
            key={group.id}
            group={group}
            role={role}
            pathname={pathname}
            isOpen={!!openGroups[group.id]}
            onToggle={() => toggleGroup(group.id)}
            setSidebarOpen={setSidebarOpen}
          />
        ))}

        {/* Business Development — independent lead-generation module, admin
            only (BD_MODULE_PLAN.md §0). Single destination, so it's a flat
            link like Dashboard rather than a collapsible group. */}
        {role === ROLES.ADMIN && (
          <Link
            to={ROUTES.BD}
            onClick={() => setSidebarOpen(false)}
            aria-current={pathname === ROUTES.BD || pathname.startsWith(`${ROUTES.BD}/`) ? 'page' : undefined}
            className={clsx(
              "flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 text-[13.5px] font-semibold mb-0.5",
              (pathname === ROUTES.BD || pathname.startsWith(`${ROUTES.BD}/`))
                ? "text-primary bg-primary/10"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <span
              className={clsx("material-symbols-outlined text-[17px] shrink-0",
                (pathname === ROUTES.BD || pathname.startsWith(`${ROUTES.BD}/`)) ? "text-primary" : "text-slate-400"
              )}
              style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
            >
              handshake
            </span>
            <span className="tracking-tight">Business Development</span>
          </Link>
        )}

        {/* New Project CTA */}
        {role !== ROLES.PILOT && (
          <div className="pt-3">
            <Link
              to="/projects/new"
              onClick={() => setSidebarOpen(false)}
              className="w-full bg-gradient-to-br from-primary to-primary-dark text-on-primary font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all shadow-glow text-[13px]"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span className="uppercase tracking-widest">New Project</span>
            </Link>
          </div>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="shrink-0 px-3 pt-2.5 pb-3 border-t border-slate-100 space-y-0.5">
        <Link
          to={ROUTES.PROFILE}
          onClick={() => setSidebarOpen(false)}
          className={clsx(
            "flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 text-[13.5px] font-semibold",
            isProfileActive ? "text-primary bg-primary/10" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
          )}
        >
          <span
            className={clsx("material-symbols-outlined text-[17px]", isProfileActive ? "text-primary" : "text-slate-400")}
            style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
          >
            manage_accounts
          </span>
          <span>Profile</span>
        </Link>

        {role === ROLES.ADMIN && (
          <Link
            to={ROUTES.SYSTEM_SETTINGS}
            onClick={() => setSidebarOpen(false)}
            className={clsx(
              "flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 text-[13.5px] font-semibold",
              isSettingsActive ? "text-primary bg-primary/10" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            )}
          >
            <span
              className={clsx("material-symbols-outlined text-[17px]", isSettingsActive ? "text-primary" : "text-slate-400")}
              style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}
            >
              settings
            </span>
            <span>Settings</span>
          </Link>
        )}

        <button
          onClick={() => { logout(); setSidebarOpen(false); }}
          className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 text-[13.5px] font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50"
        >
          <span className="material-symbols-outlined text-[17px] text-slate-400" style={{ fontVariationSettings: "'FILL' 0, 'wght' 300" }}>logout</span>
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
