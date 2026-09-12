import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import useAuth from '../../hooks/useAuth';

// Session key — unlocked state lives in sessionStorage only
const SA_SESSION_KEY = 'sa_unlocked';
const SA_SESSION_PWD = 'sa_pwd';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBytes(bytes, dec = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sz = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dec))} ${sz[i]}`;
}
function fmtNum(n) { return Number(n || 0).toLocaleString(); }

// ── Password Gate ─────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }) {
  const navigate = useNavigate();
  const [pwd, setPwd]   = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr]   = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    // Verify against backend — backend hashes and compares
    try {
      await axiosInstance.post('/system/super-admin/metrics', { secret: pwd }, { skipRedirect: true });
      sessionStorage.setItem(SA_SESSION_KEY, '1');
      sessionStorage.setItem(SA_SESSION_PWD, pwd);
      onUnlock();
    } catch (err) {
      setErr(true); setPwd(''); setTimeout(() => setErr(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-2xl">
            <span className="material-symbols-outlined text-white text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>developer_mode</span>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Developer Console</h1>
            <p className="text-sm text-slate-400 mt-1">Niyamak · Super Admin</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-7 shadow-2xl space-y-5">
          <p className="text-xs text-slate-400 text-center font-medium uppercase tracking-widest">Enter secret to unlock</p>
          <form onSubmit={submit} className="space-y-4">
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                placeholder="Secret password"
                autoFocus
                className={`w-full px-4 py-3 pr-11 rounded-xl border bg-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 transition-all ${err ? 'border-red-500 ring-red-500/30' : 'border-slate-600 focus:border-violet-500 focus:ring-violet-500/30'}`}
              />
              <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                <span className="material-symbols-outlined text-[18px]">{show ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
            {err && <p className="text-xs text-red-400 text-center font-medium">Incorrect password</p>}
            <button type="submit" disabled={!pwd} className="w-full py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white font-bold rounded-xl hover:brightness-110 transition-all shadow-lg text-sm disabled:opacity-40">
              Unlock Console
            </button>
          </form>
        </div>

        <button onClick={() => navigate('/')} className="w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors py-2">
          ← Back to App
        </button>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, percent, colorClass = 'text-blue-400', warn }) {
  const pct = percent !== undefined ? Math.min(100, parseFloat(percent)) : null;
  const barColor = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-orange-400' : 'bg-emerald-500';

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 flex flex-col gap-3 hover:border-slate-600 transition-colors">
      <div className="flex items-center gap-2.5">
        <span className={`material-symbols-outlined text-[20px] ${colorClass}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex-1">{label}</span>
        {warn && <span className="text-[10px] font-bold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded-full border border-orange-400/30">{warn}</span>}
      </div>
      <div>
        <div className="text-2xl font-black text-white">{value}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
      {pct !== null && (
        <div>
          <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
            <span>{pct}% used</span>
            <span className={pct > 85 ? 'text-red-400 font-bold' : 'text-slate-400'}>{(100 - pct).toFixed(1)}% free</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({ icon, title, children }) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-5 pb-4 border-b border-slate-800">
        <span className="material-symbols-outlined text-[16px] text-slate-400">{icon}</span>
        <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── KV Row ────────────────────────────────────────────────────────────────────
function KV({ label, value, mono = true }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-400 font-medium">{label}</span>
      <span className={`text-xs text-slate-200 ${mono ? 'font-mono' : 'font-semibold'}`}>{value ?? '—'}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SA_SESSION_KEY) === '1');
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const pwd = sessionStorage.getItem(SA_SESSION_PWD) || '';
    try {
      const res = await axiosInstance.post('/system/super-admin/metrics', { secret: pwd }, { skipRedirect: true });
      setData(res.data.data);
      setLastRefresh(new Date());
    } catch (e) {
      if (e.response?.status === 403) {
        // Secret rejected — clear session and re-lock
        sessionStorage.removeItem(SA_SESSION_KEY);
        sessionStorage.removeItem(SA_SESSION_PWD);
        setUnlocked(false);
      } else {
        setError(e.response?.data?.message || e.message);
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (unlocked) load(); }, [unlocked, load]);

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur border-b border-slate-800">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-4">
          <button onClick={() => navigate('/')} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span className="hidden sm:inline">Back to App</span>
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-2.5 flex-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>developer_mode</span>
            </div>
            <span className="font-bold text-white text-sm">Developer Console</span>
            <span className="text-[9px] font-black uppercase tracking-widest text-violet-400 bg-violet-400/10 border border-violet-400/30 px-2 py-0.5 rounded-full">Super Admin</span>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && <span className="text-xs text-slate-500 hidden md:block">Refreshed {lastRefresh.toLocaleTimeString()}</span>}
            {user && <span className="text-xs text-slate-400 hidden sm:block">{user.email}</span>}
            <button
              onClick={load} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[14px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-8 space-y-8">
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm">
            <span className="material-symbols-outlined text-[18px]">error</span>{error}
          </div>
        )}

        {loading && !data && (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-700 rounded-2xl p-5 h-36 animate-pulse" />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <StatCard
                icon="storage" label="Database" colorClass="text-blue-400"
                value={data.db.pretty}
                sub={`${data.db.name} · ${data.db.connections} connections`}
                percent={data.db.percent_used}
                warn={data.db.percent_used > 80 ? 'Near limit' : undefined}
              />
              <StatCard
                icon="cloud" label="R2 Storage" colorClass="text-sky-400"
                value={fmtBytes(data.r2.total_bytes)}
                sub={`${fmtNum(data.r2.total_objects)} objects · ${data.r2.free_limit_gb}GB free tier`}
                percent={data.r2.percent_used}
              />
              <StatCard
                icon="bolt" label="Redis Memory" colorClass="text-violet-400"
                value={data.redis.enabled ? (data.redis.used_memory_human || 'N/A') : 'Disabled'}
                sub={data.redis.enabled ? `${data.redis.connected_clients} clients · ${fmtNum(data.redis.total_keys)} keys` : 'Not configured'}
              />
              <StatCard
                icon="monitor_heart" label="Server Uptime" colorClass="text-emerald-400"
                value={data.server.uptime_human}
                sub={`Node ${data.server.node_version} · ${data.server.env}`}
              />
              <StatCard
                icon="developer_board" label="Node.js Heap" colorClass="text-orange-400"
                value={fmtBytes(data.server.heap_used)}
                sub={`V8 current allocation: ${fmtBytes(data.server.heap_total)} · grows automatically`}
                percent={((data.server.heap_used / data.server.heap_total) * 100).toFixed(1)}
                warn={data.server.heap_used / data.server.heap_total > 0.9 ? 'Normal' : undefined}
              />
              <StatCard
                icon="memory" label="Server RAM" colorClass="text-pink-400"
                value={fmtBytes(data.server.os_total_mem - data.server.os_free_mem)}
                sub={`of ${fmtBytes(data.server.os_total_mem)} total · ${data.server.os_mem_percent}% used`}
                percent={data.server.os_mem_percent}
                warn={data.server.os_mem_percent > 85 ? 'High' : undefined}
              />
            </div>

            {/* Heap explainer banner */}
            <div className="flex items-start gap-3 p-4 bg-amber-900/20 border border-amber-700/40 rounded-xl text-sm">
              <span className="material-symbols-outlined text-amber-400 text-[18px] shrink-0 mt-0.5">info</span>
              <div className="text-amber-200/80">
                <strong className="text-amber-300">About Node.js Heap:</strong> The "Heap Used" % looks high because V8 only allocates a small initial heap and grows it on demand. What matters is <strong>Server RAM</strong> ({data.server.os_mem_percent}% used) — your server has plenty of headroom. The heap will auto-expand if the app needs more memory.
              </div>
            </div>

            {/* App stats */}
            <Section icon="bar_chart" title="Application Statistics">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {[
                  { label: 'Users',        value: fmtNum(data.app.users),              icon: 'group',          c: 'text-blue-400' },
                  { label: 'Projects',     value: fmtNum(data.app.projects),           icon: 'folder_open',    c: 'text-emerald-400' },
                  { label: 'Pilots',       value: fmtNum(data.app.pilots),             icon: 'person_pin',     c: 'text-violet-400' },
                  { label: 'Drones',       value: fmtNum(data.app.drones),             icon: 'flight',         c: 'text-sky-400' },
                  { label: 'Pipeline',     value: fmtNum(data.app.leads),              icon: 'view_kanban',    c: 'text-orange-400' },
                  { label: 'Files',        value: fmtNum(data.app.files),              icon: 'attach_file',    c: 'text-pink-400' },
                  { label: 'File Storage', value: fmtBytes(data.app.total_file_bytes), icon: 'hard_drive',     c: 'text-indigo-400' },
                  { label: 'Audit Logs',   value: fmtNum(data.app.audit_entries),      icon: 'receipt_long',   c: 'text-slate-400' },
                ].map(({ label, value, icon, c }) => (
                  <div key={label} className="flex flex-col items-center text-center p-3 rounded-xl bg-slate-800 gap-1.5">
                    <span className={`material-symbols-outlined text-[20px] ${c}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                    <div className="text-xl font-black text-white">{value}</div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{label}</div>
                  </div>
                ))}
              </div>
            </Section>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* DB Tables */}
              <Section icon="table" title={`Database Tables (${data.tables.length}) · ${data.db.migrations} migrations`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700">
                        {['Table', 'Rows', 'Size'].map((h, i) => (
                          <th key={h} className={`pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.tables.map(t => (
                        <tr key={t.tablename} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                          <td className="py-2 font-mono text-slate-300">{t.tablename}</td>
                          <td className="py-2 text-right text-slate-400">{fmtNum(t.rows)}</td>
                          <td className="py-2 text-right">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.size_bytes > 1024*1024 ? 'bg-blue-900/50 text-blue-300' : 'bg-slate-800 text-slate-400'}`}>
                              {t.size}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between text-[11px] text-slate-500">
                  <span>Total DB size: <strong className="text-slate-300">{data.db.pretty}</strong></span>
                  <span>{data.db.connections} active connections</span>
                </div>
              </Section>

              <div className="space-y-6">
                {/* Redis */}
                <Section icon="bolt" title="Redis Cache">
                  {!data.redis.enabled ? <p className="text-sm text-slate-500">Redis not configured.</p>
                    : data.redis.error ? <p className="text-sm text-red-400">{data.redis.error}</p>
                    : <div className="grid grid-cols-2 gap-x-6">
                        {[
                          ['Version', data.redis.version], ['Mode', data.redis.mode],
                          ['Uptime', `${data.redis.uptime_days}d`], ['Role', data.redis.role],
                          ['Clients', data.redis.connected_clients], ['Keys', fmtNum(data.redis.total_keys)],
                          ['Memory', data.redis.used_memory_human], ['Peak', data.redis.peak_memory_human],
                          ['Commands', fmtNum(data.redis.total_commands)], ['Hit Rate', data.redis.hit_rate],
                        ].map(([k, v]) => <KV key={k} label={k} value={v} />)}
                      </div>
                  }
                </Section>

                {/* Server */}
                <Section icon="computer" title="Server · EC2">
                  <div className="grid grid-cols-2 gap-x-6">
                    {[
                      ['Hostname', data.server.hostname], ['Platform', data.server.os_platform],
                      ['Arch', data.server.os_arch], ['CPUs', `${data.server.cpu_count}× ${data.server.cpu_model?.split(' ')[0]}`],
                      ['Load Avg', data.server.load_avg?.join(' / ')], ['Node.js', data.server.node_version],
                      ['RSS', fmtBytes(data.server.rss)], ['Heap Max', fmtBytes(data.server.heap_total)],
                      ['RAM Used', fmtBytes(data.server.os_total_mem - data.server.os_free_mem)],
                      ['RAM Free', fmtBytes(data.server.os_free_mem)],
                    ].map(([k, v]) => <KV key={k} label={k} value={v} />)}
                  </div>
                </Section>

                {/* R2 */}
                <Section icon="cloud_upload" title="Cloudflare R2 Storage">
                  {data.r2.error ? <p className="text-sm text-red-400">{data.r2.error}</p>
                    : <div className="grid grid-cols-2 gap-x-6">
                        {[
                          ['Bucket', data.r2.bucket], ['Objects', fmtNum(data.r2.total_objects)],
                          ['Used', fmtBytes(data.r2.total_bytes)], ['Free Tier', `${data.r2.free_limit_gb} GB`],
                          ['% Used', `${data.r2.percent_used}%`], ['Scan', data.r2.capped ? 'Capped 10k' : 'Full scan'],
                        ].map(([k, v]) => <KV key={k} label={k} value={v} />)}
                      </div>
                  }
                </Section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
