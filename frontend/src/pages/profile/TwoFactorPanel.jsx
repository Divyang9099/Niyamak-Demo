import { useEffect, useState } from 'react';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../context/ToastContext';

/**
 * PRD §9.3 — TOTP 2FA.
 * Compact single-row when idle. Expands only when the user actively sets up or disables.
 */
const TwoFactorPanel = () => {
  const { showToast } = useToast();
  const [status,      setStatus]      = useState({ enabled: false });
  const [loading,     setLoading]     = useState(true);
  const [setupData,   setSetupData]   = useState(null);
  const [code,        setCode]        = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [disabling,   setDisabling]   = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const r = await axiosInstance.get(ENDPOINTS.AUTH.TWO_FA_STATUS);
      setStatus(r.data.data || { enabled: false });
    } catch { /* silent */ } finally { setLoading(false); }
  };

  useEffect(() => { loadStatus(); }, []);

  const beginSetup = async () => {
    try {
      const r = await axiosInstance.post(ENDPOINTS.AUTH.TWO_FA_SETUP);
      setSetupData(r.data.data);
    } catch (e) { showToast(e.response?.data?.message || 'Setup failed', 'error'); }
  };

  const confirmEnable = async () => {
    if (!/^\d{6}$/.test(code)) return showToast('Enter the 6-digit code from your authenticator', 'error');
    setSubmitting(true);
    try {
      await axiosInstance.post(ENDPOINTS.AUTH.TWO_FA_ENABLE, { code });
      showToast('Two-factor authentication enabled');
      setSetupData(null); setCode(''); loadStatus();
    } catch (e) { showToast(e.response?.data?.message || 'Invalid code', 'error'); }
    finally { setSubmitting(false); }
  };

  const disable = async () => {
    if (!/^\d{6}$/.test(disableCode)) return showToast('Enter your current 6-digit code to disable', 'error');
    setDisabling(true);
    try {
      await axiosInstance.post(ENDPOINTS.AUTH.TWO_FA_DISABLE, { code: disableCode });
      showToast('Two-factor authentication disabled');
      setDisableCode(''); setShowDisable(false); loadStatus();
    } catch (e) { showToast(e.response?.data?.message || 'Disable failed', 'error'); }
    finally { setDisabling(false); }
  };

  if (loading) return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 animate-pulse">
      <div className="w-8 h-8 rounded-lg bg-slate-200" />
      <div className="h-4 w-40 bg-slate-200 rounded" />
    </div>
  );

  /* ── Setup flow — QR + code entry ─────────────────────────────── */
  if (setupData) return (
    <div className="bg-surface rounded-2xl border border-slate-200 shadow-soft p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-lg">qr_code_2</span>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">Set up Two-Factor Authentication</p>
          <p className="text-xs text-slate-400">Scan the QR with Google Authenticator, Authy, or 1Password</p>
        </div>
      </div>

      <div className="flex gap-6 flex-wrap">
        <img src={setupData.qr} alt="2FA QR" className="w-40 h-40 border border-slate-200 rounded-xl p-2 bg-surface" />
        <div className="space-y-3 flex-1 min-w-[200px]">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">Manual entry key</p>
            <code className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 block break-all text-slate-700">
              {setupData.secret}
            </code>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Enter the 6-digit code to confirm</p>
            <input
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              autoFocus
              className="bg-surface border border-slate-200 rounded-xl px-4 py-2.5 text-base text-slate-900 font-mono tracking-[0.3em] w-40 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={confirmEnable} disabled={submitting || code.length !== 6}>
              {submitting ? 'Verifying…' : 'Confirm & Enable'}
            </Button>
            <Button variant="ghost" onClick={() => { setSetupData(null); setCode(''); }}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Disable flow ──────────────────────────────────────────────── */
  if (status.enabled && showDisable) return (
    <div className="bg-surface rounded-2xl border border-slate-200 shadow-soft p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
          <span className="material-symbols-outlined text-emerald-600 text-lg">verified_user</span>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">Disable Two-Factor Authentication</p>
          <p className="text-xs text-slate-400">Enter your current authenticator code to confirm</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={disableCode}
          onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          maxLength={6}
          inputMode="numeric"
          autoFocus
          className="bg-surface border border-slate-200 rounded-xl px-4 py-2.5 text-base font-mono tracking-[0.3em] w-40 focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none"
        />
        <Button variant="danger" onClick={disable} disabled={disabling || disableCode.length !== 6}>
          {disabling ? 'Disabling…' : 'Disable 2FA'}
        </Button>
        <Button variant="ghost" onClick={() => { setShowDisable(false); setDisableCode(''); }}>Cancel</Button>
      </div>
    </div>
  );

  /* ── Compact idle row ──────────────────────────────────────────── */
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors ${
      status.enabled
        ? 'bg-emerald-50 border-emerald-200'
        : 'bg-slate-50 border-slate-200'
    }`}>
      <span className={`material-symbols-outlined text-xl ${status.enabled ? 'text-emerald-600' : 'text-slate-400'}`}
        style={{ fontVariationSettings: status.enabled ? "'FILL' 1" : "'FILL' 0" }}>
        {status.enabled ? 'verified_user' : 'shield'}
      </span>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-tight ${status.enabled ? 'text-emerald-800' : 'text-slate-700'}`}>
          Two-Factor Authentication
        </p>
        <p className={`text-xs mt-0.5 ${status.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
          {status.enabled
            ? `Active${status.enabled_at ? ` · enabled ${new Date(status.enabled_at).toLocaleDateString('en-IN')}` : ''}`
            : 'Not enabled'}
        </p>
      </div>

      {status.enabled
        ? <button onClick={() => setShowDisable(true)}
            className="text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors shrink-0">
            Disable
          </button>
        : <Button size="sm" onClick={beginSetup}>Set up</Button>
      }
    </div>
  );
};

export default TwoFactorPanel;
