import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { ClientSelect } from '../../components/ui/ClientSelect';
import { CharCounter } from '../../components/ui/CharCounter';
import { UnsavedChangesModal } from '../../components/ui/UnsavedChangesModal';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { isEndOnOrAfterStart, toInputDate } from '../../utils/dateUtils';
import { INDIAN_STATES } from '../../utils/constants';
import { useProjectTypes } from '../../hooks/useProjectTypes';
import { useDialog } from '../../context/DialogContext';

const TEXTAREA_MAX = 500;
const PREF_STATE_KEY = 'niyamak_pref_state';

// Normalize a mobile number to E.164 (+91 default), or null if invalid.
const normalizePhone = (raw, defaultCc = '91') => {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const isIntl = s.startsWith('+') || s.startsWith('00');
  let digits = s.replace(/\D/g, '');
  if (s.startsWith('00')) digits = digits.replace(/^00/, '');
  if (!isIntl) {
    digits = digits.replace(/^0+/, '');
    if (digits.length === 10) digits = defaultCc + digits;
  }
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.startsWith('91') && digits.length === 12 && !/^91[6-9]\d{9}$/.test(digits)) return null;
  return '+' + digits;
};

const LBL = 'text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1';
const ISEL = 'w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-lg px-3 py-2.5 text-sm text-slate-900 transition-all';

const PipelineForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { confirmDialog } = useDialog();
  const isEdit = !!id;
  const projectTypes = useProjectTypes();

  const savedState = typeof window !== 'undefined' ? (localStorage.getItem(PREF_STATE_KEY) || '') : '';

  const [form, setForm] = useState({
    name: '', client_name: '', client_id: '', project_type: '',
    stage: 'inquiry', estimated_value: '', win_probability: 50,
    state: savedState, latitude: '', longitude: '',
    tentative_scope: '', notes: '',
    tentative_pilot: '', tentative_drone: '',
    enquiry_date: new Date().toISOString().slice(0, 10),
    estimated_start: '', estimated_end: '',
    requirement: '', estimation_notes: '',
    contact_number: '', contact_email: '',
    sales_executive: ''
  });
  const [pilots, setPilots] = useState([]);
  const [drones, setDrones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const blocker = useUnsavedGuard(isDirty);

  useEffect(() => {
    axiosInstance.get(ENDPOINTS.RESOURCES.PILOTS, { params: { crew_role: 'pilot', limit: 100 } })
      .then(r => setPilots(r.data.data || []))
      .catch(() => setError('Failed to load pilots list'));
    axiosInstance.get(ENDPOINTS.RESOURCES.DRONES, { params: { limit: 100 } })
      .then(r => setDrones(r.data.data || []))
      .catch(() => {});
    if (isEdit) {
      axiosInstance.get(ENDPOINTS.PIPELINE.GET_BY_ID(id)).then(r => {
        const d = r.data.data;
        setForm({
          name: d.name || '',
          client_name: d.client_name || '',
          client_id: d.client_id || '',
          project_type: d.project_type || '',
          stage: d.stage || 'inquiry',
          estimated_value: d.estimated_value || '',
          win_probability: d.win_probability || 50,
          state: d.state || '',
          latitude:  d.latitude  != null ? String(d.latitude)  : '',
          longitude: d.longitude != null ? String(d.longitude) : '',
          tentative_scope: d.tentative_scope || '',
          notes: d.notes || '',
          tentative_pilot: d.tentative_pilot || '',
          tentative_drone: d.tentative_drone || '',
          enquiry_date:    toInputDate(d.enquiry_date) || new Date().toISOString().slice(0, 10),
          estimated_start: toInputDate(d.estimated_start),
          estimated_end:   toInputDate(d.estimated_end),
          requirement: d.requirement || '',
          estimation_notes: d.estimation_notes || '',
          contact_number: d.contact_number || '',
          contact_email: d.contact_email || '',
          sales_executive: d.sales_executive || '',
        });
        // loading existing data is not a dirty state
        setIsDirty(false);
      }).catch(() => setError('Failed to load pipeline entry'));
    }
  }, [id, isEdit]);

  const set = (field) => (e) => {
    const val = e.target.value;
    setForm(f => ({ ...f, [field]: val }));
    setIsDirty(true);
    // Remember the last-used state for next time
    if (field === 'state' && val) localStorage.setItem(PREF_STATE_KEY, val);
  };

  const handleLatPaste = (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const parts = text.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
      e.preventDefault();
      setForm(f => ({ ...f, latitude: parts[0], longitude: parts[1] }));
      setIsDirty(true);
    }
  };

  const handleSubmit = async () => {
    if (!isEndOnOrAfterStart(form.estimated_start, form.estimated_end)) {
      setError('Estimated end date must be on or after the start date');
      return;
    }
    const phone = normalizePhone(form.contact_number);
    if (!phone) {
      setError('A valid mobile number is required (e.g. 98765 43210)');
      return;
    }
    setLoading(true); setError('');
    try {
      const payload = {
        ...form,
        contact_number: phone,
        estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
        win_probability: form.win_probability ? Number(form.win_probability) : null,
        latitude:  form.latitude  !== '' ? Number(form.latitude)  : null,
        longitude: form.longitude !== '' ? Number(form.longitude) : null,
        tentative_pilot: form.tentative_pilot || null,
        tentative_drone: form.tentative_drone || null,
        enquiry_date: form.enquiry_date || null,
        estimated_start: form.estimated_start || null,
        estimated_end: form.estimated_end || null,
      };
      if (isEdit) { await axiosInstance.put(ENDPOINTS.PIPELINE.UPDATE(id), payload); }
      else { await axiosInstance.post(ENDPOINTS.PIPELINE.CREATE, payload); }
      setIsDirty(false);
      navigate('/pipeline');
    } catch (err) { setError(err.userMessage); }
    finally { setLoading(false); }
  };

  const handleCancel = async () => {
    if (isDirty && !(await confirmDialog({ message: 'You have unsaved changes. Are you sure you want to exit without saving?', danger: true }))) return;
    navigate('/pipeline');
  };

  return (
    <div className="space-y-8 animate-in fade-in max-w-3xl mx-auto">
      <UnsavedChangesModal blocker={blocker} />

      <div>
        <p className="uppercase tracking-[0.2em] text-[11px] text-slate-500 mb-1">Pre-Sales</p>
        <h2 className="text-3xl font-bold text-slate-900 tracking-[-0.03em]">
          {isEdit ? 'Edit Pipeline Entry' : 'New Pipeline Opportunity'}
        </h2>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-600 px-4 py-3 rounded-lg text-sm font-bold">{error}</div>
      )}

      <Card className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input label="Opportunity Name" value={form.name} onChange={set('name')} placeholder="e.g. NTPC Windmill Survey Q3" required />
          <ClientSelect
            value={form.client_id}
            clientName={form.client_name}
            onChange={({ client_id, client_name, client }) => {
              setForm(f => ({
                ...f,
                client_id,
                client_name,
                // Picking a client means "use this client's contacts" — mirror them
                // onto the lead, including clearing them when the client has none,
                // so a previously-picked client's details never linger.
                ...(client && {
                  contact_number: client.contact_number || '',
                  contact_email:  client.contact_email  || '',
                }),
              }));
              setIsDirty(true);
            }}
          />
          <div>
            <label className={LBL}>Enquiry Date <span className="text-primary font-black">*</span></label>
            <input type="date" value={form.enquiry_date} onChange={set('enquiry_date')} className={ISEL} />
            <p className="text-[10px] text-slate-400 mt-1">The date this opportunity was received. Defaults to today.</p>
          </div>
          <div>
            <label className={LBL}>Project Type</label>
            <select value={form.project_type} onChange={set('project_type')} className={ISEL}>
              <option value="">Select type…</option>
              {projectTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={LBL}>Lead By</label>
            <input
              type="text"
              value={form.sales_executive}
              onChange={set('sales_executive')}
              className={ISEL}
              placeholder="e.g. Ravi Patel"
              maxLength={120}
            />
            <p className="text-[10px] text-slate-400 mt-1">Who brought in this lead. Shown on the pipeline board and lead detail.</p>
          </div>
          <div>
            <label className={LBL}>Stage</label>
            <div className="w-full bg-slate-50 border border-slate-200 text-slate-500 text-sm rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-slate-400">lock</span>
              <span className="capitalize">{(form.stage || 'inquiry').replace(/_/g, ' ')}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Stage advances from the Pipeline board.</p>
          </div>
          <Input label="Contact Number" type="tel" required value={form.contact_number} onChange={set('contact_number')} placeholder="e.g. 98765 43210" />
          <Input label="Contact Email" type="email" value={form.contact_email} onChange={set('contact_email')} placeholder="e.g. buyer@client.com" />
          <Input label="Estimated Value (₹)" type="number" value={form.estimated_value} onChange={set('estimated_value')} placeholder="e.g. 1500000" />
          <div>
            <label className={LBL}>Win Probability: {form.win_probability}%</label>
            <input type="range" min="0" max="100" value={form.win_probability} onChange={set('win_probability')} className="w-full accent-primary" />
          </div>
          <div>
            <label className={LBL}>State</label>
            <select className={ISEL} value={form.state} onChange={set('state')}>
              <option value="">Select state</option>
              {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {!form.state && savedState && (
              <p className="text-[10px] text-slate-400 mt-1">
                Last used: <button type="button" onClick={() => { setForm(f => ({ ...f, state: savedState })); setIsDirty(true); }} className="text-primary underline underline-offset-2">{savedState}</button>
              </p>
            )}
          </div>
          <div>
            <label className={LBL}>Latitude <span className="text-slate-400 normal-case">(optional)</span></label>
            <input type="number" step="any" min="-90" max="90"
              value={form.latitude} onChange={set('latitude')} onPaste={handleLatPaste}
              className={ISEL} placeholder="e.g. 22.3511  (paste 'lat, lng' to fill both)" />
          </div>
          <div>
            <label className={LBL}>Longitude <span className="text-slate-400 normal-case">(optional)</span></label>
            <input type="number" step="any" min="-180" max="180"
              value={form.longitude} onChange={set('longitude')} className={ISEL} placeholder="e.g. 71.4897" />
          </div>
          <div>
            <label className={LBL}>Tentative Pilot</label>
            <select className={ISEL} value={form.tentative_pilot} onChange={set('tentative_pilot')}>
              <option value="">None</option>
              {pilots.filter(p => p.status === 'active').map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.license_number}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LBL}>Tentative Drone</label>
            <select className={ISEL} value={form.tentative_drone} onChange={set('tentative_drone')}>
              <option value="">None</option>
              {drones.filter(d => d.status === 'active').map(d => (
                <option key={d.id} value={d.id}>{d.name} — {d.model}</option>
              ))}
            </select>
          </div>
          <Input label="Estimated Start" type="date" value={form.estimated_start} onChange={set('estimated_start')} />
          <Input label="Estimated End" type="date" value={form.estimated_end} onChange={set('estimated_end')} />
        </div>

        {/* Textareas with char counters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className={LBL + ' mb-0'}>Client Requirement <span className="text-slate-400 normal-case">(Inquiry)</span></label>
              <CharCounter current={form.requirement.length} max={TEXTAREA_MAX} />
            </div>
            <textarea
              className="w-full bg-surface border border-slate-200 text-slate-900 text-sm rounded-lg px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:border-primary/40 transition-all"
              value={form.requirement} onChange={set('requirement')} maxLength={TEXTAREA_MAX}
              placeholder="What does the client need? Site, deliverables, timelines…"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className={LBL + ' mb-0'}>Internal Estimation <span className="text-slate-400 normal-case">(Inquiry)</span></label>
              <CharCounter current={form.estimation_notes.length} max={TEXTAREA_MAX} />
            </div>
            <textarea
              className="w-full bg-surface border border-slate-200 text-slate-900 text-sm rounded-lg px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:border-primary/40 transition-all"
              value={form.estimation_notes} onChange={set('estimation_notes')} maxLength={TEXTAREA_MAX}
              placeholder="Rough cost / effort estimate, assumptions…"
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className={LBL + ' mb-0'}>Tentative Scope</label>
            <CharCounter current={form.tentative_scope.length} max={TEXTAREA_MAX} />
          </div>
          <textarea
            className="w-full bg-surface border border-slate-200 text-slate-900 text-sm rounded-lg px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:border-white/30 transition-all"
            value={form.tentative_scope} onChange={set('tentative_scope')} maxLength={TEXTAREA_MAX}
            placeholder="e.g. 20 turbines at hub height 120m, visual + thermal inspection..."
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className={LBL + ' mb-0'}>Internal Notes</label>
            <CharCounter current={form.notes.length} max={TEXTAREA_MAX} />
          </div>
          <textarea
            className="w-full bg-surface border border-slate-200 text-slate-900 text-sm rounded-lg px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:border-white/30 transition-all"
            value={form.notes} onChange={set('notes')} maxLength={TEXTAREA_MAX}
            placeholder="e.g. Client prefers weekend surveys, budget negotiable..."
          />
        </div>

        <div className="flex gap-4 pt-2">
          <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : isEdit ? 'Update Pipeline' : 'Create Pipeline'}
          </Button>
          <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
        </div>
      </Card>
    </div>
  );
};

export default PipelineForm;
