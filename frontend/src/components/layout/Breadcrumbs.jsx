import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useBreadcrumbLabels } from '../../context/BreadcrumbContext';

// Static labels for known path segments. Dynamic segments (ids) fall back to a
// page-provided label (via useSetBreadcrumb) or a generic one.
const STATIC_LABELS = {
  projects: 'Projects', pipeline: 'Pipeline', clients: 'Clients', calendar: 'Calendar',
  resources: 'Resources', pilots: 'Pilots', drones: 'Drones', allocations: 'Allocations',
  assets: 'Assets', estimations: 'Estimations', library: 'Library', archive: 'Archive',
  notifications: 'Notifications', profile: 'Profile', admin: 'Administration',
  users: 'Users', audit: 'Audit Log', settings: 'Settings', new: 'New', edit: 'Edit',
};

// Segments that are NOT their own navigable route (rendered as plain text, not links).
const NON_NAVIGABLE = new Set(['/admin']);

const looksDynamic = (s) => /^[0-9a-fA-F-]{20,}$/.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
const prettify = (s) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const Breadcrumbs = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const labels = useBreadcrumbLabels();

  const segments = location.pathname.split('/').filter(Boolean);

  // Always start from Dashboard, then each cumulative segment.
  const crumbs = [{ path: '/', label: 'Dashboard', navigable: true }];
  segments.forEach((seg, i) => {
    const path = '/' + segments.slice(0, i + 1).join('/');
    const label = labels[path] || STATIC_LABELS[seg] || (looksDynamic(seg) ? 'Details' : prettify(seg));
    crumbs.push({ path, label, navigable: !NON_NAVIGABLE.has(path) });
  });

  const onDashboard = segments.length === 0;

  // Back: use real history when we arrived in-app; otherwise fall back to the parent
  // crumb (so a deep-linked / refreshed page never dead-ends or leaves the app).
  const parentPath = crumbs.length > 1 ? crumbs[crumbs.length - 2].path : '/';
  const canGoBack = location.key !== 'default';
  const handleBack = () => (canGoBack ? navigate(-1) : navigate(parentPath));

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 min-w-0">
      {!onDashboard && (
        <button
          onClick={handleBack}
          title="Go back"
          className="shrink-0 flex items-center gap-1 pl-1.5 pr-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-slate-500 hover:text-primary hover:bg-primary/8 transition-colors"
        >
          <span className="material-symbols-outlined text-lg leading-none">arrow_back</span>
          <span className="hidden sm:inline">Back</span>
        </button>
      )}

      {!onDashboard && <span className="w-px h-4 bg-slate-200 shrink-0" />}

      <ol className="flex items-center gap-1 min-w-0 overflow-hidden flex-wrap">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={c.path} className="flex items-center gap-1 min-w-0">
              {i > 0 && <span className="material-symbols-outlined text-slate-300 text-base leading-none">chevron_right</span>}
              {i === 0 ? (
                // Home icon crumb
                isLast ? (
                  <span className="flex items-center gap-1 text-[12.5px] font-semibold text-slate-800">
                    <span className="material-symbols-outlined text-base leading-none">home</span>
                    Dashboard
                  </span>
                ) : (
                  <Link to="/" title="Dashboard" className="flex items-center text-slate-400 hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-base leading-none">home</span>
                  </Link>
                )
              ) : isLast ? (
                <span className="text-[12.5px] font-semibold text-slate-800 truncate max-w-[240px]" title={c.label}>{c.label}</span>
              ) : c.navigable ? (
                <Link to={c.path} className="text-[12.5px] font-medium text-slate-500 hover:text-primary transition-colors truncate max-w-[180px]" title={c.label}>{c.label}</Link>
              ) : (
                <span className="text-[12.5px] font-medium text-slate-400 truncate max-w-[180px]">{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
