import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ListSkeleton, SectionSkeleton } from '../../components/ui/Skeletons';
import { formatDate } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';

const PREF_LABELS = {
  allocation:     { label: 'Resource Allocations',   desc: 'When you are assigned to or removed from a project', icon: 'precision_manufacturing' },
  expiry:         { label: 'Expiry & Maintenance',    desc: 'License expiry, drone maintenance due dates',        icon: 'schedule' },
  project_status: { label: 'Project Status Changes',  desc: 'When a project status is updated',                   icon: 'folder_open' },
  system:         { label: 'System Alerts',            desc: 'Platform-wide announcements and admin messages',     icon: 'campaign' },
};

const Toggle = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${checked ? 'bg-primary' : 'bg-slate-200'}`}
  >
    <span className={`absolute top-0.5 w-4 h-4 bg-surface rounded-full shadow transition-all ${checked ? 'left-5' : 'left-0.5'}`} />
  </button>
);

// Map entity_type + title to a route.
// Primary: use entity_type + entity_id (set on new notifications).
// Fallback: title-based routing for old notifications without entity data.
const getNotificationRoute = (n) => {
  const { entity_type, entity_id, title = '' } = n;
  const t = title.toLowerCase();

  // Primary — entity_id present
  if (entity_id) {
    if (entity_type === 'project') return t.includes('deliverable') ? `/projects/${entity_id}?tab=deliverables` : `/projects/${entity_id}`;
    if (entity_type === 'pilot')   return `/resources/pilots/${entity_id}`;
    if (entity_type === 'drone')   return `/resources/drones/${entity_id}`;
  }

  // Fallback — title-based (old notifications without entity_id)
  if (t.includes('deliverable') || t.includes('project') || t.includes('allocation') || t.includes('overdue')) return '/projects';
  if (t.includes('license') || t.includes('pilot'))     return '/resources';
  if (t.includes('drone') || t.includes('maintenance')) return '/resources/drones';

  return null;
};

const Notifications = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Preferences panel
  const [showPrefs, setShowPrefs]       = useState(false);
  const [prefs, setPrefs]               = useState([]);
  const [savingPrefs, setSavingPrefs]   = useState(false);
  const [prefsLoaded, setPrefsLoaded]   = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await axiosInstance.get(ENDPOINTS.NOTIFICATIONS.GET_ALL);
      setNotifications(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to load notifications', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const loadPrefs = useCallback(async () => {
    if (prefsLoaded) return;
    try {
      const res = await axiosInstance.get(ENDPOINTS.NOTIFICATIONS.PREFS);
      setPrefs(Array.isArray(res.data.data) ? res.data.data : []);
      setPrefsLoaded(true);
    } catch { /* silent */ }
  }, [prefsLoaded]);

  const togglePrefs = () => {
    if (!showPrefs) loadPrefs();
    setShowPrefs(v => !v);
  };

  const togglePref = (category, field) => {
    setPrefs(prev => prev.map(p =>
      p.category === category ? { ...p, [field]: !p[field] } : p
    ));
  };

  const savePrefs = async () => {
    setSavingPrefs(true);
    try {
      await axiosInstance.put(ENDPOINTS.NOTIFICATIONS.PREFS, prefs);
      showToast('Notification preferences saved');
    } catch {
      showToast('Failed to save preferences', 'error');
    } finally { setSavingPrefs(false); }
  };

  const markAllRead = async () => {
    try {
      await axiosInstance.put(ENDPOINTS.NOTIFICATIONS.READ_ALL);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to acknowledge all', 'error');
    }
  };

  const markAsRead = async (id) => {
    try {
      await axiosInstance.put(ENDPOINTS.NOTIFICATIONS.MARK_READ(id));
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to mark as read', 'error');
    }
  };

  const deleteNotification = async (id) => {
    try {
      await axiosInstance.delete(ENDPOINTS.NOTIFICATIONS.DELETE(id));
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to delete notification', 'error');
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="font-['Space_Grotesk'] uppercase tracking-[0.2em] text-[11px] text-slate-500 mb-1">Inbox</p>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-6 h-6 bg-primary text-on-primary text-[11px] font-black rounded-full">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </h2>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" icon="tune" onClick={togglePrefs}>
            Preferences
          </Button>
          {unreadCount > 0 && (
            <Button variant="secondary" onClick={markAllRead} icon="done_all">Mark all read</Button>
          )}
        </div>
      </div>

      {/* Preferences panel (PRD §11.3) */}
      {showPrefs && (
        <Card className="border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-slate-900">Notification Preferences</p>
              <p className="text-xs text-slate-500 mt-0.5">Control which alerts reach you via in-app and email channels</p>
            </div>
            <Button size="sm" onClick={savePrefs} disabled={savingPrefs || !prefsLoaded}>
              {savingPrefs ? 'Saving...' : 'Save'}
            </Button>
          </div>

          {!prefsLoaded ? (
            <SectionSkeleton rows={4} />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-x-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 border-b border-primary/10 pb-2 mb-3">
                <span className="col-span-1">Category</span>
                <span className="text-center">In-App</span>
                <span className="text-center">Email</span>
              </div>
              <div className="space-y-3">
                {prefs.map(p => {
                  const meta = PREF_LABELS[p.category] || { label: p.category, desc: '', icon: 'notifications' };
                  return (
                    <div key={p.category} className="grid grid-cols-3 gap-x-4 items-center">
                      <div className="flex items-start gap-2 col-span-1">
                        <span className="material-symbols-outlined text-base text-primary mt-0.5 flex-shrink-0">{meta.icon}</span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{meta.label}</p>
                          <p className="text-[11px] text-slate-400">{meta.desc}</p>
                        </div>
                      </div>
                      <div className="flex justify-center">
                        <Toggle checked={!!p.in_app_enabled} onChange={() => togglePref(p.category, 'in_app_enabled')} />
                      </div>
                      <div className="flex justify-center">
                        <Toggle checked={!!p.email_enabled} onChange={() => togglePref(p.category, 'email_enabled')} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Notifications list */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-4"><ListSkeleton rows={6} /></div>
        ) : notifications.length === 0 ? (
          <div className="py-20 text-center">
            <span className="material-symbols-outlined text-4xl text-slate-300 block mb-2">notifications_off</span>
            <p className="text-sm text-slate-500 font-semibold">No notifications yet</p>
            <p className="text-xs text-slate-400 mt-1">You are all caught up.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((n) => {
              const route = getNotificationRoute(n);
              return (
              <div
                key={n.id}
                onClick={route ? async () => {
                  if (!n.is_read) await markAsRead(n.id);
                  navigate(route);
                } : undefined}
                className={`p-5 flex flex-col md:flex-row gap-4 transition-colors ${
                  n.is_read ? 'opacity-60 bg-surface' : 'bg-surface border-l-4 border-primary'
                } ${route ? 'cursor-pointer hover:bg-slate-50' : ''}`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  n.is_read ? 'bg-slate-100 text-slate-400' : 'bg-primary/10 text-primary'
                }`}>
                  <span className="material-symbols-outlined text-base">
                    {n.title?.toLowerCase().includes('license') ? 'badge'
                     : n.title?.toLowerCase().includes('maintenance') ? 'build'
                     : n.title?.toLowerCase().includes('alloc') ? 'precision_manufacturing'
                     : 'notifications'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h4 className={`text-sm font-bold truncate ${n.is_read ? 'text-slate-500' : 'text-slate-900'}`}>
                      {n.title}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-mono shrink-0">{formatDate(n.created_at)}</p>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3">{n.message}</p>
                  <div className="flex gap-2">
                    {!n.is_read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markAsRead(n.id); }}
                        className="text-[10px] font-bold text-primary hover:text-primary-dark flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">done</span>
                        Mark read
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                      className="text-[10px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-1 ml-2"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Notifications;
