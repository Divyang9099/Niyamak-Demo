import { useEffect, useRef, useState } from 'react';
import axiosInstance from '../../api/axios';
import { API_BASE_URL, ENDPOINTS } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import { ContentSkeleton } from '../../components/ui/Skeletons';
import ProjectTypeManager from './ProjectTypeManager';
import RateCardManager from './RateCardManager';

const LBL = 'block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5';
const INP = 'w-full bg-surface border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-900 placeholder-[#555] focus:outline-none focus:border-white/30 transition-colors';

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' },
  { value: 3, label: 'March' },   { value: 4, label: 'April' },
  { value: 5, label: 'May' },     { value: 6, label: 'June' },
  { value: 7, label: 'July' },    { value: 8, label: 'August' },
  { value: 9, label: 'September'},{ value: 10, label: 'October' },
  { value: 11, label: 'November'},{ value: 12, label: 'December' },
];

const SectionHeader = ({ icon, title, subtitle }) => (
  <div className="flex items-start gap-3 mb-6">
    <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-lg text-slate-400">{icon}</span>
    </div>
    <div>
      <p className="text-sm font-bold text-slate-900 tracking-tight">{title}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  </div>
);

const SystemSettings = () => {
  const { showToast } = useToast();
  const logoInputRef = useRef(null);

  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoPreview, setLogoPreview]     = useState(null);

  const [form, setForm] = useState({
    company_name:                '',
    address:                     '',
    gstin:                       '',
    cin:                         '',
    financial_year_start:        4,
    primary_contact_email:       '',
    primary_contact_phone:       '',
    default_overhead_percent:    15,
    default_margin_percent:      18,
    default_contingency_percent: 5,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await axiosInstance.get(ENDPOINTS.SYSTEM.CONFIG);
        const cfg = res.data.data || {};
        setForm({
          company_name:                cfg.company_name                ?? '',
          address:                     cfg.address                     ?? '',
          gstin:                       cfg.gstin                       ?? '',
          cin:                         cfg.cin                         ?? '',
          financial_year_start:        cfg.financial_year_start        ?? 4,
          primary_contact_email:       cfg.primary_contact_email       ?? '',
          primary_contact_phone:       cfg.primary_contact_phone       ?? '',
          default_overhead_percent:    cfg.default_overhead_percent    ?? 15,
          default_margin_percent:      cfg.default_margin_percent      ?? 18,
          default_contingency_percent: cfg.default_contingency_percent ?? 5,
        });
        if (cfg.logo_url) {
          setLogoPreview(`${API_BASE_URL}/system/config/logo`);
        }
      } catch {
        showToast('Failed to load system configuration', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
  };

  const handleSave = async () => {
    if (!form.company_name.trim()) {
      showToast('Company name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await axiosInstance.put(ENDPOINTS.SYSTEM.CONFIG, form);
      showToast('Settings saved', 'success');
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Instant local preview
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);

    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      await axiosInstance.post(ENDPOINTS.SYSTEM.LOGO_UPLOAD, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast('Logo uploaded', 'success');
      // Switch preview to the proxy URL so it reflects the saved file
      setLogoPreview(`${API_BASE_URL}/system/config/logo?t=${Date.now()}`);
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return <ContentSkeleton />;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">System Settings</h1>
          <p className="text-sm text-slate-400 mt-1">Company identity, financial defaults, and branding</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-surface text-slate-900 text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-lg hover:brightness-90 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-base">save</span>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left column (span 2) ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Company Identity */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <SectionHeader icon="business" title="Company Identity" subtitle="Legal name and registration numbers" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={LBL}>Company Name <span className="text-red-400">*</span></label>
                <input name="company_name" value={form.company_name} onChange={handleChange} className={INP} placeholder="Varuna Aerotech Pvt. Ltd." />
              </div>
              <div>
                <label className={LBL}>GSTIN</label>
                <input name="gstin" value={form.gstin} onChange={handleChange} className={INP} placeholder="27AABCV1234D1Z5" maxLength={15} />
              </div>
              <div>
                <label className={LBL}>CIN</label>
                <input name="cin" value={form.cin} onChange={handleChange} className={INP} placeholder="U62099MH2020PTC123456" maxLength={21} />
              </div>
              <div className="sm:col-span-2">
                <label className={LBL}>Registered Address</label>
                <textarea name="address" value={form.address} onChange={handleChange} rows={3} className={`${INP} resize-none`} placeholder="Unit 4B, Drone Innovation Hub, Navi Mumbai — 400706" />
              </div>
            </div>
          </div>

          {/* Contact & Calendar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <SectionHeader icon="contact_mail" title="Contact & Calendar" subtitle="Primary contact and financial year configuration" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LBL}>Primary Contact Email</label>
                <input name="primary_contact_email" type="email" value={form.primary_contact_email} onChange={handleChange} className={INP} placeholder="ops@varuna.aero" />
              </div>
              <div>
                <label className={LBL}>Primary Contact Phone</label>
                <input name="primary_contact_phone" value={form.primary_contact_phone} onChange={handleChange} className={INP} placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className={LBL}>Financial Year Starts</label>
                <select name="financial_year_start" value={form.financial_year_start} onChange={handleChange}
                  className={`${INP} cursor-pointer`}>
                  {MONTHS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Estimation Defaults */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <SectionHeader icon="request_quote" title="Estimation Defaults" subtitle="Default rates applied to new project estimations" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={LBL}>Overhead %</label>
                <div className="relative">
                  <input name="default_overhead_percent" type="number" min={0} max={100} step={0.5}
                    value={form.default_overhead_percent} onChange={handleChange}
                    className={`${INP} pr-8`} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">%</span>
                </div>
              </div>
              <div>
                <label className={LBL}>Margin %</label>
                <div className="relative">
                  <input name="default_margin_percent" type="number" min={0} max={100} step={0.5}
                    value={form.default_margin_percent} onChange={handleChange}
                    className={`${INP} pr-8`} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">%</span>
                </div>
              </div>
              <div>
                <label className={LBL}>Contingency %</label>
                <div className="relative">
                  <input name="default_contingency_percent" type="number" min={0} max={100} step={0.5}
                    value={form.default_contingency_percent} onChange={handleChange}
                    className={`${INP} pr-8`} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">%</span>
                </div>
              </div>
            </div>
            {/* Effective total preview */}
            <div className="mt-4 px-4 py-4 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-slate-500">info</span>
              <p className="text-xs text-slate-500">
                Effective cost multiplier:{' '}
                <span className="text-slate-900 font-bold">
                  {(
                    (1 + Number(form.default_overhead_percent) / 100) *
                    (1 + Number(form.default_margin_percent) / 100) *
                    (1 + Number(form.default_contingency_percent) / 100)
                  ).toFixed(3)}×
                </span>
                {' '}of base cost
              </p>
            </div>
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────── */}
        <div className="space-y-6">

          {/* Company Logo */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <SectionHeader icon="image" title="Company Logo" subtitle="Shown on reports and invoices" />

            {/* Preview */}
            <div className="w-full aspect-video bg-surface border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden mb-4">
              {logoPreview ? (
                <img src={logoPreview} alt="Company logo" className="w-full h-full object-contain p-4" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <span className="material-symbols-outlined text-4xl">image</span>
                  <span className="text-xs">No logo uploaded</span>
                </div>
              )}
            </div>

            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp"
              className="hidden" onChange={handleLogoFile} />

            <button
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="w-full flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 text-xs font-bold uppercase tracking-widest px-4 py-2.5 rounded-lg transition-all disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-base">
                {uploadingLogo ? 'hourglass_empty' : 'upload'}
              </span>
              {uploadingLogo ? 'Uploading…' : 'Upload Logo'}
            </button>
            <p className="text-[10px] text-slate-400 text-center mt-2">PNG, JPG or WebP · Max 5 MB</p>
          </div>

          {/* Quick summary card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <SectionHeader icon="summarize" title="Config Summary" subtitle="Current stored values" />
            <dl className="space-y-2.5 text-xs">
              {[
                { label: 'Company',    value: form.company_name || '—' },
                { label: 'GSTIN',      value: form.gstin || '—' },
                { label: 'CIN',        value: form.cin || '—' },
                { label: 'FY Starts',  value: MONTHS.find(m => m.value === Number(form.financial_year_start))?.label || '—' },
                { label: 'Overhead',   value: `${form.default_overhead_percent}%` },
                { label: 'Margin',     value: `${form.default_margin_percent}%` },
                { label: 'Contingency',value: `${form.default_contingency_percent}%` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-slate-400 font-medium">{label}</dt>
                  <dd className="text-slate-800 font-bold text-right truncate max-w-[60%]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* Project Type Configuration (PRD §10.4) */}
      <ProjectTypeManager />

      {/* Estimation Rate Cards (PRD §10.3) */}
      <RateCardManager />
    </div>
  );
};

export default SystemSettings;
