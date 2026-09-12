import { useEffect, useRef, useState } from 'react';
import axiosInstance from '../../api/axios';
import { API_BASE_URL, ENDPOINTS } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import useAuth from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import TwoFactorPanel from './TwoFactorPanel';
import ThemeSettings from './ThemeSettings';

// Profile pictures are offered to PMs and pilots; admins don't need one.
const AVATAR_ROLES = new Set(['project_manager', 'pilot']);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

const PREF_LABELS = {
  allocation:     { label: 'Resource Allocations',  desc: 'When you are assigned to or removed from a project', icon: 'precision_manufacturing' },
  expiry:         { label: 'Expiry & Maintenance',  desc: 'License expiry, drone maintenance due dates',        icon: 'schedule' },
  project_status: { label: 'Project Status Changes',desc: 'When a project status is updated',                   icon: 'folder_open' },
  system:         { label: 'System Alerts',          desc: 'Platform-wide announcements and admin messages',     icon: 'campaign' },
};

const ROLE_META = {
  admin:           { label: 'Administrator', color: 'bg-violet-100 text-violet-700 border-violet-200', dot: 'bg-violet-500' },
  project_manager: { label: 'Project Manager', color: 'bg-blue-100 text-blue-700 border-blue-200',   dot: 'bg-blue-500'   },
  pilot:           { label: 'Pilot',           color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
};

const Toggle = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 flex-shrink-0 ${
      checked ? 'bg-primary' : 'bg-slate-200'
    }`}
  >
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-surface rounded-full shadow-sm transition-transform duration-200 ${
      checked ? 'translate-x-5' : 'translate-x-0'
    }`} />
  </button>
);

const SectionHeading = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3 mb-6">
    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-primary text-lg">{icon}</span>
    </div>
    <div>
      <p className="text-[15px] font-bold text-slate-900 leading-tight">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const Profile = () => {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();

  const [profile, setProfile] = useState({ name: '', email: '', role: '', phone: '', avatar_url: null, created_at: '' });
  const [form,    setForm]    = useState({ name: '', phone: '' });
  const [saving,  setSaving]  = useState(false);

  // Avatar (profile picture) — PM / pilot only
  const avatarInputRef = useRef(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarBuster, setAvatarBuster] = useState(() => Date.now()); // cache-bust after change

  const [prefs,       setPrefs]       = useState([]);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [pwForm,   setPwForm]   = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [showPw,   setShowPw]   = useState({ cur: false, nw: false, conf: false });

  useEffect(() => {
    axiosInstance.get(ENDPOINTS.AUTH.PROFILE).then(r => {
      const d = r.data.data;
      setProfile(d);
      setForm({ name: d.name || '', phone: d.phone || '' });
    }).catch(() => showToast('Failed to load profile', 'error'));

    axiosInstance.get(ENDPOINTS.NOTIFICATIONS.PREFS)
      .then(r => setPrefs(r.data.data || []))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axiosInstance.put(ENDPOINTS.USERS.UPDATE(user.id), { name: form.name, phone: form.phone });
      setProfile(p => ({ ...p, name: form.name, phone: form.phone }));
      showToast('Profile updated successfully');
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally { setSaving(false); }
  };

  const handleAvatarPick = () => avatarInputRef.current?.click();

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast('Please choose an image file (JPG, PNG, WEBP)', 'error');
    if (file.size > MAX_AVATAR_BYTES)    return showToast('Image is too large (max 5 MB)', 'error');

    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await axiosInstance.post(ENDPOINTS.USERS.AVATAR(user.id), fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const key = res.data?.data?.avatar_url || 'set';
      setProfile(p => ({ ...p, avatar_url: key }));
      setAvatarBuster(Date.now());
      setUser?.(u => (u ? { ...u, avatar_url: key } : u)); // reflect in Topbar immediately
      showToast('Profile picture updated');
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally { setAvatarBusy(false); }
  };

  const handleAvatarRemove = async () => {
    setAvatarBusy(true);
    try {
      await axiosInstance.delete(ENDPOINTS.USERS.AVATAR(user.id));
      setProfile(p => ({ ...p, avatar_url: null }));
      setAvatarBuster(Date.now());
      setUser?.(u => (u ? { ...u, avatar_url: null } : u));
      showToast('Profile picture removed');
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally { setAvatarBusy(false); }
  };

  const handleChangePassword = async () => {
    if (!pwForm.current_password) return showToast('Enter your current password', 'error');
    if (pwForm.new_password.length < 8) return showToast('New password must be at least 8 characters', 'error');
    if (pwForm.new_password !== pwForm.confirm_password) return showToast('New passwords do not match', 'error');
    setSavingPw(true);
    try {
      await axiosInstance.put(ENDPOINTS.AUTH.CHANGE_PASSWORD, {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      showToast('Password changed successfully');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally { setSavingPw(false); }
  };

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    try {
      await axiosInstance.put(ENDPOINTS.NOTIFICATIONS.PREFS, prefs);
      showToast('Notification preferences saved');
    } catch {
      showToast('Failed to save preferences', 'error');
    } finally { setSavingPrefs(false); }
  };

  const togglePref = (category, field) =>
    setPrefs(prev => prev.map(p => p.category === category ? { ...p, [field]: !p[field] } : p));

  const roleMeta = ROLE_META[profile.role] || ROLE_META.pilot;
  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const initials = (profile.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const canHaveAvatar = AVATAR_ROLES.has(profile.role);
  const avatarSrc = profile.avatar_url ? `${API_BASE_URL}/users/${user?.id}/avatar?t=${avatarBuster}` : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">Account</p>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">My Profile</h1>
      </div>

      {/* ── Two-column grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── LEFT COLUMN (1/3) ─────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Identity card */}
          <div className="bg-surface rounded-2xl border border-slate-200/80 shadow-soft p-6">
            {/* Avatar row */}
            <div className="flex items-center gap-4 mb-5">
              <div className="relative flex-shrink-0 group">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-white text-xl font-bold shadow-sm select-none">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={profile.name || 'Avatar'}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : initials}
                </div>
                {/* Upload control — only for PM & pilot */}
                {canHaveAvatar && (
                  <button
                    type="button"
                    onClick={handleAvatarPick}
                    disabled={avatarBusy}
                    title={profile.avatar_url ? 'Change profile picture' : 'Add profile picture'}
                    className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md ring-2 ring-surface hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {avatarBusy
                      ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <span className="material-symbols-outlined text-[15px] leading-none">photo_camera</span>}
                  </button>
                )}
                {canHaveAvatar && (
                  <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarChange} />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 leading-tight truncate">{profile.name || '—'}</h2>
                <p className="text-sm text-slate-400 mt-0.5 truncate">{profile.email || '—'}</p>
                <span className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleMeta.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${roleMeta.dot}`} />
                  {roleMeta.label}
                </span>
                {canHaveAvatar && profile.avatar_url && (
                  <button
                    type="button"
                    onClick={handleAvatarRemove}
                    disabled={avatarBusy}
                    className="block mt-2 text-[11px] font-semibold text-red-500 hover:text-red-600 disabled:opacity-60"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 space-y-2.5">
              {[
                { icon: 'call',          label: profile.phone || 'No phone added' },
                { icon: 'calendar_today',label: `Member since ${memberSince}` },
              ].map(({ icon, label }) => (
                <div key={icon} className="flex items-center gap-2.5 text-sm text-slate-500">
                  <span className="material-symbols-outlined text-base text-slate-300">{icon}</span>
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* 2FA panel */}
          <TwoFactorPanel />
        </div>

        {/* ── RIGHT COLUMN (2/3) ────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-6">

          {/* Edit profile */}
          <div className="bg-surface rounded-2xl border border-slate-200/80 shadow-soft p-7">
            <SectionHeading icon="manage_accounts" title="Edit Profile" subtitle="Update your name and contact details" />
            <div className="space-y-5">
              <Input
                label="Full Name"
                icon="person"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Your full name"
              />
              <Input
                label="Email Address"
                icon="mail"
                value={profile.email}
                disabled
                className="opacity-60"
              />
              <Input
                label="Phone Number"
                icon="call"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+91 98765 43210"
              />
              <div className="pt-1">
                <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto px-10" size="lg">
                  {saving ? (
                    <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                  ) : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>

          {/* Change password */}
          <div className="bg-surface rounded-2xl border border-slate-200/80 shadow-soft p-7">
            <SectionHeading icon="lock" title="Change Password" subtitle="Use a strong password with at least 8 characters" />
            <div className="space-y-5">
              {[
                { key: 'current_password', label: 'Current Password',     ph: 'Enter current password',  vis: showPw.cur,  toggle: () => setShowPw(s => ({ ...s, cur:  !s.cur  })) },
                { key: 'new_password',     label: 'New Password',         ph: 'Min 8 characters',         vis: showPw.nw,   toggle: () => setShowPw(s => ({ ...s, nw:   !s.nw   })) },
                { key: 'confirm_password', label: 'Confirm New Password', ph: 'Repeat new password',      vis: showPw.conf, toggle: () => setShowPw(s => ({ ...s, conf: !s.conf })) },
              ].map(({ key, label, ph, vis, toggle }) => (
                <Input
                  key={key}
                  label={label}
                  icon="lock"
                  type={vis ? 'text' : 'password'}
                  value={pwForm[key]}
                  onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={ph}
                  rightAdornment={
                    <button type="button" onClick={toggle} tabIndex={-1}
                      className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                      <span className="material-symbols-outlined text-lg">{vis ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  }
                />
              ))}
              <div className="pt-1">
                <Button
                  onClick={handleChangePassword}
                  disabled={savingPw || !pwForm.current_password || !pwForm.new_password}
                  className="w-full sm:w-auto px-10"
                  size="lg"
                >
                  {savingPw ? (
                    <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Updating…</>
                  ) : 'Update Password'}
                </Button>
              </div>
            </div>
          </div>

          {/* Appearance / theme preferences */}
          <ThemeSettings SectionHeading={SectionHeading} />

          {/* Notification preferences */}
          {prefs.length > 0 && (
            <div className="bg-surface rounded-2xl border border-slate-200/80 shadow-soft p-7">
              <div className="flex items-start justify-between gap-4 mb-6">
                <SectionHeading
                  icon="notifications"
                  title="Notification Preferences"
                  subtitle="Control which alerts reach you in-app and by email"
                />
                <Button size="sm" onClick={handleSavePrefs} disabled={savingPrefs} className="flex-shrink-0 mt-0.5">
                  {savingPrefs ? 'Saving…' : 'Save'}
                </Button>
              </div>

              {/* Header row */}
              <div className="overflow-x-auto">
              <div className="grid grid-cols-[1fr_80px_80px] gap-4 px-4 pb-3 border-b border-slate-100 min-w-[320px]">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Category</span>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center">In-App</span>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 text-center">Email</span>
              </div>

              <div className="divide-y divide-slate-50">
                {prefs.map(p => {
                  const meta = PREF_LABELS[p.category] || { label: p.category, desc: '', icon: 'notifications' };
                  return (
                    <div key={p.category} className="grid grid-cols-[1fr_80px_80px] gap-4 items-center px-4 py-4 min-w-[320px]">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-slate-400 text-base">{meta.icon}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{meta.label}</p>
                          <p className="text-xs text-slate-400 truncate">{meta.desc}</p>
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
              </div>{/* end overflow-x-auto */}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Profile;
