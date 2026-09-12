import { useCallback, useEffect, useState } from 'react';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../context/ToastContext';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const HOURS = Array.from({ length: 24 }, (_, i) => {
  const suffix = i < 12 ? 'AM' : 'PM';
  const h = i % 12 === 0 ? 12 : i % 12;
  return { value: i, label: `${h}:00 ${suffix} IST` };
});

// ── Mini stat card ─────────────────────────────────────────────────────────
const StatBox = ({ label, value, sub, color = '#6366f1' }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4">
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">{label}</p>
    <p className="text-2xl font-black tracking-tight" style={{ color }}>{value}</p>
    {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
  </div>
);

// ── Horizontal bar ─────────────────────────────────────────────────────────
const Bar = ({ label, count, pct, color }) => (
  <div className="flex items-center gap-3">
    <span className="text-xs text-slate-500 w-32 shrink-0">{label}</span>
    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, 2)}%`, background: color }} />
    </div>
    <span className="text-xs font-bold text-slate-700 w-6 text-right">{count}</span>
  </div>
);

const STATUS_COLOR = { initiate:'#94a3b8', planned:'#3b82f6', on_going:'#f59e0b', executed:'#8b5cf6', post_processing:'#a855f7', complete:'#10b981' };

// ── Preview Panel ──────────────────────────────────────────────────────────
const PreviewPanel = ({ data }) => {
  if (!data) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
      <span className="material-symbols-outlined text-5xl">mail_outline</span>
      <p className="text-sm">Click "Preview Report" to see live data</p>
    </div>
  );

  const { kpis, projectBars, pipelineBars, upcomingDeadlines, recentlyCompleted, maintenanceDue, topPipeline, weekRange } = data;

  return (
    <div className="space-y-6 text-slate-900">
      {/* Header mock */}
      <div className="bg-slate-900 rounded-xl p-5 text-white">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-lg font-black tracking-tight">◈ NIYAMAK</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Drone Operations Platform</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Weekly Report</p>
            <p className="text-sm font-bold text-slate-200 mt-0.5">{weekRange}</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-800">
          <p className="text-xl font-black">Weekly Operations Summary</p>
          <p className="text-xs text-slate-400 mt-1">Platform-wide digest — projects, pipeline, fleet, and compliance.</p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Active Projects" value={kpis.activeProjects} sub={kpis.overdueProjects > 0 ? `⚠ ${kpis.overdueProjects} overdue` : 'On track'} color={kpis.overdueProjects > 0 ? '#ef4444' : '#10b981'} />
        <StatBox label="Pipeline Open" value={kpis.pipelineOpen} sub={kpis.pipelineValue} color="#6366f1" />
        <StatBox label="Active Drones" value={kpis.activeDrones} color="#3b82f6" />
        <StatBox label="Active Pilots" value={kpis.activePilots} color="#10b981" />
      </div>

      {/* Revenue */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Active Project Value</p>
          <p className="text-xl font-black text-slate-900">{kpis.activeValue}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Pipeline Value</p>
          <p className="text-xl font-black text-indigo-600">{kpis.pipelineValue}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Won (30 days)</p>
          <p className="text-xl font-black text-emerald-600">{kpis.wonValue30d}</p>
        </div>
      </div>

      {/* Project bars */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">📊 Project Status</p>
        <div className="space-y-2">
          {projectBars.map(b => <Bar key={b.label} {...b} />)}
        </div>
      </div>

      {/* Pipeline funnel */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">🔭 Pipeline Funnel</p>
        <div className="space-y-2">
          {pipelineBars.map(b => <Bar key={b.label} {...b} />)}
        </div>
      </div>

      {/* Upcoming deadlines */}
      {upcomingDeadlines.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">📅 Upcoming Deadlines (14 days)</p>
          <div className="space-y-2">
            {upcomingDeadlines.slice(0, 5).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-0">
                <div>
                  <p className="font-semibold text-slate-900">{r.name}</p>
                  <p className="text-xs text-slate-400">{r.client} · {r.state}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold" style={{ color: r.daysLeft <= 3 ? '#ef4444' : r.daysLeft <= 7 ? '#f59e0b' : '#64748b' }}>{r.endDate}</p>
                  <p className="text-[10px] text-slate-400">{r.daysLeft}d left</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drone maintenance */}
      {maintenanceDue.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-xs font-black uppercase tracking-widest text-amber-600 mb-3">🔧 Maintenance Due (30 days)</p>
          <div className="space-y-1">
            {maintenanceDue.slice(0, 5).map((r, i) => (
              <div key={i} className="flex justify-between text-sm py-1.5 border-b border-amber-100 last:border-0">
                <span className="font-medium text-slate-800">{r.name} <span className="font-normal text-slate-500">({r.model})</span></span>
                <span className="font-bold" style={{ color: r.days <= 3 ? '#ef4444' : '#f59e0b' }}>{r.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top pipeline */}
      {topPipeline.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">💼 Top Pipeline Opportunities</p>
          {topPipeline.map((r, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <div>
                <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                <p className="text-xs text-slate-400">{r.client} · {r.stage}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-indigo-600">{r.value}</p>
                <p className="text-[10px] text-slate-400">{r.probability} win</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-center text-xs text-slate-400 py-2">
        ◈ Niyamak — Drone Operations Platform · Auto-generated weekly digest
      </div>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────
const WeeklyReportSettings = () => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [newEmail, setNewEmail] = useState('');
  const [dirty, setDirty] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await axiosInstance.get(ENDPOINTS.REPORTS.WEEKLY_SETTINGS);
      const s = res.data.data;
      setSettings(s);
      setForm({
        enabled:       s.enabled,
        send_day:      s.send_day,
        send_hour_ist: s.send_hour_ist,
        recipients:    [...(s.recipients || [])],
        include_admins:s.include_admins,
        include_pms:   s.include_pms,
      });
      setDirty(false);
    } catch {
      showToast('Failed to load report settings', 'error');
    }
  }, [showToast]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setDirty(true);
  };

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { showToast('Enter a valid email', 'error'); return; }
    if (form.recipients.includes(email)) { showToast('Already added', 'warning'); return; }
    set('recipients', [...form.recipients, email]);
    setNewEmail('');
  };

  const removeEmail = (i) => set('recipients', form.recipients.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    try {
      await axiosInstance.put(ENDPOINTS.REPORTS.WEEKLY_SETTINGS, form);
      showToast('Report settings saved');
      setDirty(false);
      fetchSettings();
    } catch (e) {
      showToast(e?.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    setSending(true);
    try {
      const res = await axiosInstance.post(ENDPOINTS.REPORTS.WEEKLY_SEND_TEST);
      const d = res.data.data;
      if (d?.skipped) showToast('No recipients configured — add emails first', 'warning');
      else showToast(`Test report sent to ${d.sentTo?.length || 0} recipient(s)`);
    } catch (e) {
      showToast(e?.response?.data?.message || 'Send failed', 'error');
    } finally {
      setSending(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await axiosInstance.get(ENDPOINTS.REPORTS.WEEKLY_PREVIEW_DATA);
      setPreviewData(res.data.data);
    } catch {
      showToast('Failed to load preview data', 'error');
    } finally {
      setPreviewing(false);
    }
  };

  if (!form) return (
    <div className="flex items-center justify-center h-64">
      <span className="material-symbols-outlined text-4xl text-slate-300 animate-spin">progress_activity</span>
    </div>
  );

  const nextSendLabel = () => {
    if (!form.enabled) return 'Disabled';
    const day = DAYS[form.send_day];
    const hr = HOURS.find(h => h.value === Number(form.send_hour_ist));
    return `Every ${day} at ${hr?.label || form.send_hour_ist + ':00 IST'}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <PageHeader
        eyebrow="Admin · Reports"
        title="Weekly Report"
        description="Automated weekly operations email sent to your team with charts, deadlines, and fleet status."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon="preview" onClick={handlePreview} isLoading={previewing}>Preview</Button>
            <Button variant="secondary" icon="send" onClick={handleSendTest} isLoading={sending}>Send Test</Button>
            {dirty && <Button icon="save" onClick={handleSave} isLoading={saving}>Save Settings</Button>}
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* ── LEFT: Settings ───────────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Enable / status */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">Weekly Report</p>
                <p className="text-xs text-slate-500 mt-0.5">{nextSendLabel()}</p>
              </div>
              <button
                onClick={() => set('enabled', !form.enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${form.enabled ? 'bg-primary' : 'bg-slate-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {settings?.last_sent_at && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="material-symbols-outlined text-sm text-emerald-500">check_circle</span>
                Last sent: {new Date(settings.last_sent_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
            )}
          </Card>

          {/* Schedule */}
          <Card className="p-5 space-y-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Schedule</p>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Day of Week</label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => set('send_day', i)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                      form.send_day === i ? 'bg-primary text-on-primary border-primary shadow-sm' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Send Time (IST)</label>
              <select
                value={form.send_hour_ist}
                onChange={e => set('send_hour_ist', Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-primary transition-all"
              >
                {HOURS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
          </Card>

          {/* Recipients */}
          <Card className="p-5 space-y-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Recipients</p>

            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={form.include_admins} onChange={e => set('include_admins', e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary/30 w-4 h-4" />
                <span className="text-sm text-slate-700">All Admins</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={form.include_pms} onChange={e => set('include_pms', e.target.checked)}
                  className="rounded border-slate-300 text-primary focus:ring-primary/30 w-4 h-4" />
                <span className="text-sm text-slate-700">All Project Managers</span>
              </label>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Additional Emails</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="extra@domain.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-primary transition-all"
                />
                <button onClick={addEmail}
                  className="px-3 py-2 text-xs font-bold text-primary border border-primary/30 bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors">
                  Add
                </button>
              </div>
              <div className="space-y-1 mt-2">
                {form.recipients.map((e, i) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="text-xs text-slate-700">{e}</span>
                    <button onClick={() => removeEmail(i)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <span className="material-symbols-outlined text-sm leading-none">close</span>
                    </button>
                  </div>
                ))}
                {form.recipients.length === 0 && !form.include_admins && !form.include_pms && (
                  <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    ⚠ No recipients — add emails or enable Admins/PMs above.
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Report contents info */}
          <Card className="p-5">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Report Includes</p>
            <ul className="space-y-1.5">
              {[
                'KPI strip — active projects, pipeline, fleet, pilots',
                'Revenue summary — project value, pipeline value, won (30d)',
                'Project status bar chart',
                'Pipeline funnel bar chart',
                'Upcoming deadlines (next 14 days)',
                'Projects completed this week',
                'Drone maintenance due (next 30 days)',
                'Pilot licenses expiring (next 30 days)',
                'Top 5 pipeline opportunities by value',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="material-symbols-outlined text-xs text-emerald-500 mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* ── RIGHT: Live Preview ───────────────────────────────────────── */}
        <div className="xl:col-span-3">
          <Card className="p-0 overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-slate-400">mail</span>
                <p className="text-sm font-bold text-slate-700">Email Preview</p>
                {previewData && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Live Data</span>
                )}
              </div>
              <Button size="sm" variant="secondary" icon="refresh" onClick={handlePreview} isLoading={previewing}>
                {previewData ? 'Refresh' : 'Preview Report'}
              </Button>
            </div>
            <div className="p-6 overflow-y-auto" style={{ maxHeight: '80vh' }}>
              <PreviewPanel data={previewData} />
            </div>
          </Card>
        </div>
      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-surface/95 backdrop-blur border border-primary/30 rounded-2xl shadow-pop px-6 py-3 flex items-center gap-4">
          <span className="text-sm text-slate-700 font-medium">You have unsaved changes</span>
          <Button size="sm" onClick={handleSave} isLoading={saving} icon="save">Save Settings</Button>
          <Button size="sm" variant="ghost" onClick={fetchSettings}>Discard</Button>
        </div>
      )}
    </div>
  );
};

export default WeeklyReportSettings;
