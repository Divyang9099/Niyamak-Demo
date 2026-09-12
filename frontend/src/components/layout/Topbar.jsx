import { useEffect, useCallback, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth';
import { capitalize } from '../../utils/helpers';
import axiosInstance from '../../api/axios';
import { API_BASE_URL, ENDPOINTS } from '../../api/endpoints';
import { useSocket } from '../../context/SocketContext';

const NOTIFICATION_NEW      = 'notification:new';
const NOTIFICATION_READ     = 'notification:read';
const NOTIFICATION_ALL_READ = 'notification:all_read';
const NOTIFICATION_DELETED  = 'notification:deleted';

// Per-route search config: placeholder text + where to navigate on submit
const SEARCH_CONFIG = [
  { pattern: /^\/projects/,          placeholder: 'Search projects…',    nav: (q) => `/projects?search=${q}` },
  { pattern: /^\/pipeline/,          placeholder: 'Search pipeline…',    nav: (q) => `/pipeline?search=${q}` },
  { pattern: /^\/resources\/drones/, placeholder: 'Search drones…',      nav: (q) => `/resources/drones?search=${q}` },
  { pattern: /^\/resources/,         placeholder: 'Search pilots…',      nav: (q) => `/resources?search=${q}` },
  { pattern: /^\/estimations/,       placeholder: 'Search estimations…', nav: (q) => `/estimations?search=${q}` },
  { pattern: /^\/admin/,             placeholder: 'Search users…',       nav: (q) => `/admin/users?search=${q}` },
  { pattern: /^\/library/,           placeholder: 'Search library…',     nav: (q) => `/library?search=${q}` },
];

const DEFAULT_SEARCH = { placeholder: 'Search projects…', nav: (q) => `/projects?search=${q}` };

const getSearchConfig = (pathname) => {
  for (const cfg of SEARCH_CONFIG) {
    if (cfg.pattern.test(pathname)) return cfg;
  }
  return DEFAULT_SEARCH;
};

const Topbar = ({ setSidebarOpen }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { socket, connected } = useSocket();
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const searchCfg = getSearchConfig(pathname);
  const debounceRef = useRef(null);

  // Reset search input when navigating to a different section
  useEffect(() => { setSearchQuery(''); }, [pathname]);

  // Navigate instantly as user types (300ms debounce)
  const handleChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate(searchCfg.nav(encodeURIComponent(val.trim())));
    }, 300);
  };

  const fetchUnread = useCallback(async () => {
    try {
      const res = await axiosInstance.get(ENDPOINTS.NOTIFICATIONS.GET_ALL);
      const notifications = Array.isArray(res.data.data) ? res.data.data : [];
      setUnreadCount(notifications.filter(n => !n.is_read).length);
    } catch { /* silent fail */ }
  }, []);

  useEffect(() => { fetchUnread(); }, [fetchUnread]);

  useEffect(() => {
    if (!socket) return;
    const onNew      = () => setUnreadCount(c => c + 1);
    const onRead     = () => setUnreadCount(c => Math.max(0, c - 1));
    const onAllRead  = () => setUnreadCount(0);
    const onDeleted  = () => fetchUnread();

    socket.on(NOTIFICATION_NEW,      onNew);
    socket.on(NOTIFICATION_READ,     onRead);
    socket.on(NOTIFICATION_ALL_READ, onAllRead);
    socket.on(NOTIFICATION_DELETED,  onDeleted);

    return () => {
      socket.off(NOTIFICATION_NEW,      onNew);
      socket.off(NOTIFICATION_READ,     onRead);
      socket.off(NOTIFICATION_ALL_READ, onAllRead);
      socket.off(NOTIFICATION_DELETED,  onDeleted);
    };
  }, [socket, fetchUnread]);

  useEffect(() => {
    if (connected) return;
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [connected, fetchUnread]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) navigate(searchCfg.nav(encodeURIComponent(searchQuery.trim())));
  };

  return (
    <header className="sticky top-0 flex justify-between items-center w-full px-4 md:px-8 h-16 md:h-20 border-b border-slate-200/70 bg-surface/80 backdrop-blur-xl z-[900] transition-all">
      <div className="flex items-center gap-4 md:gap-6 flex-1 min-w-0">
        <button
          className="md:hidden text-slate-600 p-2 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation menu"
          title="Menu"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>

        <form
          className="relative w-full max-w-md md:max-w-lg"
          onSubmit={handleSearch}
        >
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={handleChange}
            placeholder={searchCfg.placeholder}
            aria-label={searchCfg.placeholder}
            className="w-full bg-slate-50 border border-slate-200/80 focus:border-primary focus:bg-surface focus:ring-2 focus:ring-primary/15 outline-none text-sm rounded-full pl-11 pr-20 py-2.5 placeholder:text-slate-400 text-slate-700 transition-all"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-0.5 pointer-events-none">
            <kbd className="kbd">Ctrl</kbd><kbd className="kbd">K</kbd>
          </span>
        </form>
      </div>

      <div className="flex items-center gap-2 md:gap-3 ml-4 flex-shrink-0">
        <Link
          to="/notifications"
          title="Notifications"
          className="p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all relative"
        >
          <span className="material-symbols-outlined text-xl">notifications</span>
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        <Link to="/profile" className="flex items-center gap-2.5 group ml-1">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-slate-900 leading-none">{user?.name || 'User'}</p>
            <p className="text-[10px] text-slate-400 mt-1">{capitalize(user?.role || 'User')}</p>
          </div>
          <img
            src={user?.avatar_url
              ? `${API_BASE_URL}/users/${user.id}/avatar`
              : `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=6366F1&color=fff&bold=true`}
            alt="User avatar"
            className="w-10 h-10 rounded-full object-cover ring-2 ring-surface shadow-soft group-hover:ring-primary/30 transition-all"
            onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=6366F1&color=fff&bold=true`; }}
          />
        </Link>
      </div>
    </header>
  );
};

export default Topbar;
