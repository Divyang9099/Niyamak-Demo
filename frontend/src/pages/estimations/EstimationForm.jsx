import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import { calcCost } from '../../utils/costEngine';
import { downloadFile } from '../../utils/download';
import { useProjectTypes } from '../../hooks/useProjectTypes';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { UnsavedChangesModal } from '../../components/ui/UnsavedChangesModal';

const fmt = (n) => `₹ ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const LBL = 'text-[9px] font-bold tracking-[0.15em] uppercase text-slate-500 mb-1 block';
const SEL = 'w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900 text-sm focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all';

const SectionTitle = ({ children }) => (
  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mb-3">{children}</p>
);

const EstimationForm = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirmDialog } = useDialog();
  const isEdit = !!id;
  const projectTypes = useProjectTypes();
  const [isDirty, setIsDirty] = useState(false);
  const blocker = useUnsavedGuard(isDirty);

  // URL prefill — from ProjectDetail "New Estimation" or PipelineDetail "New Scenario"
  const urlProjectId   = searchParams.get('project_id')   || '';
  const urlPipelineId  = searchParams.get('pipeline_id')  || '';
  const urlClientName  = searchParams.get('client_name')  || '';
  const urlProjectType = searchParams.get('project_type') || 'solar_pv';
  const urlLabel       = searchParams.get('label')        || '';

  const [form, setForm] = useState({
    name: '',
    client_name: urlClientName, project_type: urlProjectType, project_id: urlProjectId, pipeline_id: urlPipelineId,
    days: '', pilot_rate: 15000, drone_rate: 25000,
    pilots_count: 1, drones_count: 1, copilot_count: 0, copilot_rate: 0, team_size: 2, post_processing_days: '',
    travel_mode: 'road', travel_rate: 12, distance_km: '', mobilizations: 1, travel_cost: '',
    accommodation_nights: '', accommodation_rate: 3000, accommodation_cost: '',
    daily_travel_days: '', daily_travel_rate: 500, daily_travel_cost: '',
    per_diem_rate: 1500, on_site_days: '', per_diem: '',
    software_cost: '', storage_cost: '',
    deliverable_items: [],
    deliverable_cost: '',
    report_writing_hours: '', report_writing_rate: 1200, report_writing_cost: '',
    overhead_percent: 15, contingency_percent: 5,
    margin_percent: 15, tax_percent: 18,
    processing_cost: '',
    mw: '', turbines: '', km: '', stockpiles: '', towers: '',
    area_acres: '', hub_height: '', voltage: '', terrain_type: 'flat',
    scope_quantity: '',
  });

  const [projects,      setProjects]      = useState([]);
  const [pipelines,     setPipelines]     = useState([]);
  const [rateCardsData, setRateCardsData] = useState({ rate_cards: {}, defaults: {} });
  const [loading,       setLoading]       = useState(false);

  const rateCards = rateCardsData.rate_cards || {};
  const breakdown = useMemo(() => calcCost(form), [form]);

  useEffect(() => {
    axiosInstance.get(ENDPOINTS.PROJECTS.GET_ALL).then(r => setProjects(r.data.data || []));
    axiosInstance.get(ENDPOINTS.PIPELINE.GET_ALL).then(r => setPipelines(r.data.data || [])).catch(() => {});
    axiosInstance.get(ENDPOINTS.ESTIMATIONS.RATE_CARDS)
      .then(r => setRateCardsData(r.data.data || { rate_cards: {}, defaults: {} }))
      .catch(() => {});
    if (isEdit) {
      axiosInstance.get(ENDPOINTS.ESTIMATIONS.GET_BY_ID(id)).then(r => {
        const d = r.data.data;
        const inputs = d.details?.inputs || {};
        setForm(prev => ({ ...prev, ...inputs, name: d.name || '', client_name: d.client_name, project_type: d.project_type, project_id: d.project_id || '' }));
      });
    }
  }, [id, isEdit]);

  useEffect(() => {
    if (isEdit) return;
    const d = rateCardsData.defaults || {};
    if (!Object.keys(d).length) return;
    setForm(prev => ({
      ...prev,
      overhead_percent:    d.overhead_percent    ?? prev.overhead_percent,
      margin_percent:      d.margin_percent      ?? prev.margin_percent,
      contingency_percent: d.contingency_percent ?? prev.contingency_percent,
      tax_percent:         d.tax_percent         ?? prev.tax_percent,
      per_diem_rate:       d.per_diem_amount     ?? prev.per_diem_rate,
    }));
  }, [rateCardsData, isEdit]);

  useEffect(() => {
    const tr = (rateCards.travel || []).find(r => r.name === form.travel_mode);
    if (tr) setForm(f => ({ ...f, travel_rate: tr.rate }));
  }, [form.travel_mode, rateCards.travel]);

  const set = (field) => (e) => {
    setIsDirty(true);
    setForm(f => ({ ...f, [field]: e.target.value }));
  };

  const addDeliverable = (key) => {
    const opt = (rateCards.deliverable || []).find(d => d.name === key);
    if (!opt || form.deliverable_items.some(d => d.key === key)) return;
    setIsDirty(true);
    setForm(f => ({ ...f, deliverable_items: [...f.deliverable_items, { key: opt.name, label: opt.description || opt.name, quantity: 1, unit_cost: opt.rate, prep_hours: 0 }] }));
  };

  const updateDeliverable = (idx, field, value) => {
    setIsDirty(true);
    setForm(f => ({ ...f, deliverable_items: f.deliverable_items.map((it, i) => i === idx ? { ...it, [field]: value } : it) }));
  };

  const removeDeliverable = (idx) => {
    setIsDirty(true);
    setForm(f => ({ ...f, deliverable_items: f.deliverable_items.filter((_, i) => i !== idx) }));
  };

  const handleCancelNavigation = async () => {
    if (isDirty && !(await confirmDialog({ message: 'You have unsaved changes in this estimation scenario. Are you sure you want to leave without saving?', danger: true }))) return;
    if (urlPipelineId) navigate(`/pipeline/${urlPipelineId}`);
    else if (urlProjectId) navigate(`/projects/${urlProjectId}?tab=estimations`);
    else if (form.pipeline_id) navigate(`/pipeline/${form.pipeline_id}`);
    else navigate('/estimations');
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const payload = { ...form, total_amount: breakdown.total, details: { inputs: form, breakdown } };
      if (isEdit) {
        await axiosInstance.put(ENDPOINTS.ESTIMATIONS.UPDATE(id), payload);
        showToast('Estimation updated', 'success');
        setIsDirty(false);
        if (form.pipeline_id) navigate(`/pipeline/${form.pipeline_id}`);
        else if (form.project_id) navigate(`/projects/${form.project_id}?tab=estimations`);
        else navigate('/estimations');
      } else {
        await axiosInstance.post(ENDPOINTS.ESTIMATIONS.CREATE, payload);
        showToast('Estimation created', 'success');
        setIsDirty(false);
        if (urlPipelineId) navigate(`/pipeline/${urlPipelineId}`);
        else if (urlProjectId) navigate(`/projects/${urlProjectId}?tab=estimations`);
        else navigate('/estimations');
      }
    } catch (err) { showToast(err.userMessage, 'error'); }
    finally { setLoading(false); }
  };

  const handleExportPDF = async () => {
    if (!id) return;
    try { await downloadFile(ENDPOINTS.ESTIMATIONS.EXPORT_PDF(id), `EST_${id.slice(0,6)}.pdf`); }
    catch { showToast('PDF export failed', 'error'); }
  };
  const handleExportExcel = async () => {
    if (!id) return;
    try {
      const res = await axiosInstance.get(ENDPOINTS.ESTIMATIONS.EXPORT_XLS(id), { responseType: 'blob' });
      const url  = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url; link.setAttribute('download', `EST_${id.slice(0,6)}.xlsx`);
      document.body.appendChild(link); link.click(); link.remove();
    } catch { showToast('Excel export failed', 'error'); }
  };

  const renderTypeParams = () => {
    switch (form.project_type) {
      case 'solar_pv': case 'solar': return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Capacity (MW)" type="number" value={form.mw} onChange={set('mw')} placeholder="e.g. 50" />
          <Input label="Area (Acres)" type="number" value={form.area_acres} onChange={set('area_acres')} placeholder="e.g. 300" />
        </div>
      );
      case 'wind': return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Turbine Count" type="number" value={form.turbines} onChange={set('turbines')} placeholder="e.g. 40" />
          <Input label="Hub Height (M)" type="number" value={form.hub_height} onChange={set('hub_height')} placeholder="e.g. 120" />
        </div>
      );
      case 'td_lines': case 'transmission': case 'pipeline': return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Distance (KM)" type="number" value={form.km} onChange={set('km')} placeholder="e.g. 250" />
          <div>
            <label className={LBL}>Terrain</label>
            <select value={form.terrain_type} onChange={set('terrain_type')} className={SEL}>
              <option value="flat">Flat</option>
              <option value="hilly">Hilly / Dense</option>
              <option value="urban">Urban / Restricted</option>
            </select>
          </div>
        </div>
      );
      case 'tower': return (
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tower Count" type="number" value={form.towers} onChange={set('towers')} placeholder="e.g. 12" />
          <Input label="Avg Height (M)" type="number" value={form.hub_height} onChange={set('hub_height')} placeholder="e.g. 60" />
        </div>
      );
      case 'volumetric': return (
        <div className="grid grid-cols-2 gap-3">
          <Input label="Stockpile Count" type="number" value={form.stockpiles} onChange={set('stockpiles')} placeholder="e.g. 24" />
          <Input label="Site Area (Ha)" type="number" value={form.area_acres} onChange={set('area_acres')} placeholder="e.g. 15" />
        </div>
      );
      default: return null;
    }
  };

  const availableDeliverables = (rateCards.deliverable || [])
    .filter(d => !form.deliverable_items.some(it => it.key === d.name));

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-8 animate-in fade-in duration-500">
      {/* Header — sticky just below the app Topbar (h-20 = 80px) */}
      <div className="flex items-center justify-between gap-3 bg-surface border border-slate-200 rounded-xl px-6 py-4 shadow-sm sticky top-[80px] z-[800]">
        <div className="flex items-center gap-3">
          <button
            onClick={handleCancelNavigation}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
          </button>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-400">
              {urlPipelineId || form.pipeline_id ? 'Pipeline — Cost Estimation' : 'Cost Estimation'}
            </p>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">
              {isEdit ? 'Refine Estimate' : urlLabel ? `New Scenario — ${urlLabel}` : 'New Cost Estimate'}
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancelNavigation}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading} icon="save">
            {loading ? 'Saving…' : 'Save Estimate'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">

          {/* Identity + Scope combined */}
          <Card>
            <SectionTitle>Project Identity</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="col-span-2">
                <Input label="Scenario Name" value={form.name} onChange={set('name')} placeholder="e.g. Base Case, Optimistic…" />
              </div>
              <div className="col-span-2">
                <Input label="Client" value={form.client_name} onChange={set('client_name')} required placeholder="e.g. NTPC Limited" />
              </div>
              <div>
                <label className={LBL}>Project Type</label>
                <select value={form.project_type} onChange={set('project_type')} className={SEL}>
                  {projectTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={LBL}>Bind to Project</label>
                <select value={form.project_id} onChange={set('project_id')} className={SEL}>
                  <option value="">None</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            {(() => { const tp = renderTypeParams(); return tp ? (
              <>
                <div className="h-px bg-slate-100 mb-3" />
                <SectionTitle>Scope Parameters</SectionTitle>
                {tp}
                <p className="text-[10px] text-slate-400 mt-2">
                  Estimated <span className="text-primary font-black">{breakdown.days}</span> flight days
                </p>
              </>
            ) : null; })()}
          </Card>

          {/* Resources */}
          <Card>
            <SectionTitle>Resources</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Input label="Flight Days" type="number" value={form.days} onChange={set('days')} placeholder={String(breakdown.days)} />
              <Input label="Post-Proc Days" type="number" value={form.post_processing_days} onChange={set('post_processing_days')} placeholder="e.g. 5" />
              <Input label="Team Size" type="number" value={form.team_size} onChange={set('team_size')} placeholder="2" />
              <Input label="Software (₹)" type="number" value={form.software_cost} onChange={set('software_cost')} placeholder="0" />
            </div>

            <div className="h-px bg-slate-100 my-3" />

            {/* Pilot */}
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Pilot</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Input label="# Pilots" type="number" value={form.pilots_count} onChange={set('pilots_count')} placeholder="1" />
              <Input label="Rate ₹/Day" type="number" value={form.pilot_rate} onChange={set('pilot_rate')} placeholder="15000" />
              <div className="md:col-span-2 flex items-end">
                <div className="text-xs text-slate-400 py-2">
                  Total: <span className="font-black text-slate-700">{`₹ ${(Number(form.pilots_count || 1) * Number(form.pilot_rate || 0) * (breakdown.days || 0)).toLocaleString('en-IN')}`}</span>
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100 my-3" />

            {/* Co-Pilot (optional) */}
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Co-Pilot <span className="normal-case font-normal text-slate-400">(optional)</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Input label="# Co-Pilots" type="number" value={form.copilot_count} onChange={set('copilot_count')} placeholder="0" />
              <Input label="Rate ₹/Day" type="number" value={form.copilot_rate} onChange={set('copilot_rate')} placeholder="0" />
              <div className="md:col-span-2 flex items-end">
                <div className="text-xs text-slate-400 py-2">
                  {Number(form.copilot_count) > 0
                    ? <>Total: <span className="font-black text-slate-700">{`₹ ${(Number(form.copilot_count) * Number(form.copilot_rate || 0) * (breakdown.days || 0)).toLocaleString('en-IN')}`}</span></>
                    : <span className="italic">Enter co-pilots count to enable</span>
                  }
                </div>
              </div>
            </div>

            <div className="h-px bg-slate-100 my-3" />

            {/* Drone */}
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Drone</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Input label="# Drones" type="number" value={form.drones_count} onChange={set('drones_count')} placeholder="1" />
              <Input label="Rate ₹/Day" type="number" value={form.drone_rate} onChange={set('drone_rate')} placeholder="25000" />
              <div className="md:col-span-2 flex items-end">
                <div className="text-xs text-slate-400 py-2">
                  Total: <span className="font-black text-slate-700">{`₹ ${(Number(form.drones_count || 1) * Number(form.drone_rate || 0) * (breakdown.days || 0)).toLocaleString('en-IN')}`}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Mobilization + Accommodation + Daily Travel + Per Diem */}
          <Card>
            <SectionTitle>Mobilization & Accommodation</SectionTitle>

            {/* ── Mobilization travel ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className={LBL}>Travel Mode</label>
                <select value={form.travel_mode} onChange={set('travel_mode')} className={SEL}>
                  <option value="road">Road</option>
                  <option value="rail">Rail</option>
                  <option value="air">Air</option>
                </select>
              </div>
              <Input label={form.travel_mode === 'air' ? 'Rate ₹/Trip' : 'Rate ₹/km'} type="number" value={form.travel_rate} onChange={set('travel_rate')} placeholder="e.g. 12" />
              {form.travel_mode !== 'air'
                ? <Input label="Distance (km)" type="number" value={form.distance_km} onChange={set('distance_km')} placeholder="e.g. 450" />
                : <div />
              }
              <Input label="# Trips" type="number" value={form.mobilizations} onChange={set('mobilizations')} placeholder="1" />
            </div>

            <div className="h-px bg-slate-100 mb-3" />

            {/* ── Accommodation ── */}
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Accommodation</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <Input label="Nights" type="number" value={form.accommodation_nights} onChange={set('accommodation_nights')} placeholder="e.g. 10" />
              <Input label="Rate ₹/Night" type="number" value={form.accommodation_rate} onChange={set('accommodation_rate')} placeholder="3000" />
              <div className="relative">
                <Input
                  label="Total (₹)"
                  type="number"
                  value={form.accommodation_cost !== '' ? form.accommodation_cost : Math.round(breakdown.accommodationCost || 0) || ''}
                  onChange={e => set('accommodation_cost')(e)}
                  placeholder="0"
                />
                {form.accommodation_cost !== '' && (
                  <button
                    type="button"
                    className="absolute right-2 bottom-2 text-[9px] text-slate-400 hover:text-primary underline"
                    onClick={() => setForm(f => ({ ...f, accommodation_cost: '' }))}
                  >auto</button>
                )}
              </div>
            </div>

            <div className="h-px bg-slate-100 mb-3" />

            {/* ── Daily Travel ── */}
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Daily Travel</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <Input label="Days" type="number" value={form.daily_travel_days} onChange={set('daily_travel_days')} placeholder="e.g. 5" />
              <Input label="Rate ₹/Day" type="number" value={form.daily_travel_rate} onChange={set('daily_travel_rate')} placeholder="500" />
              <div className="relative">
                <Input
                  label="Total (₹)"
                  type="number"
                  value={form.daily_travel_cost !== '' ? form.daily_travel_cost : Math.round(breakdown.dailyTravelCost || 0) || ''}
                  onChange={e => set('daily_travel_cost')(e)}
                  placeholder="0"
                />
                {form.daily_travel_cost !== '' && (
                  <button
                    type="button"
                    className="absolute right-2 bottom-2 text-[9px] text-slate-400 hover:text-primary underline"
                    onClick={() => setForm(f => ({ ...f, daily_travel_cost: '' }))}
                  >auto</button>
                )}
              </div>
            </div>

            <div className="h-px bg-slate-100 mb-3" />

            {/* ── Per Diem ── */}
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">Food / Per Diem</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <Input label="Food ₹/Person/Day" type="number" value={form.per_diem_rate} onChange={set('per_diem_rate')} placeholder="1500" />
              <Input label="On-Site Days" type="number" value={form.on_site_days} onChange={set('on_site_days')} placeholder={String(breakdown.days || '')} />
              <div className="relative">
                <Input
                  label="Total (₹)"
                  type="number"
                  value={form.per_diem !== '' ? form.per_diem : Math.round(breakdown.perDiem || 0) || ''}
                  onChange={e => set('per_diem')(e)}
                  placeholder="0"
                />
                {form.per_diem !== '' && (
                  <button
                    type="button"
                    className="absolute right-2 bottom-2 text-[9px] text-slate-400 hover:text-primary underline"
                    onClick={() => setForm(f => ({ ...f, per_diem: '' }))}
                  >auto</button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['Travel', breakdown.mobilizationCost],
                ['Accom', breakdown.accommodationCost],
                ['Daily Travel', breakdown.dailyTravelCost],
                ['Food', breakdown.perDiem],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">{l}</span>
                  <span className="font-mono font-bold text-xs text-slate-900">{fmt(v)}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Deliverables */}
          <Card>
            <SectionTitle>Deliverables</SectionTitle>
            {form.deliverable_items.length === 0 && availableDeliverables.length === 0 && (
              <p className="text-xs text-slate-400 mb-2">No rate-card deliverables configured. Items will appear once rate cards are set up in Settings.</p>
            )}
            {form.deliverable_items.length > 0 && (
              <div className="space-y-1.5 mb-3">
                <div className="grid grid-cols-12 gap-2 text-[9px] uppercase tracking-widest text-slate-400 font-bold px-2">
                  <div className="col-span-5">Deliverable</div>
                  <div className="col-span-2 text-center">Qty</div>
                  <div className="col-span-2 text-center">Unit ₹</div>
                  <div className="col-span-2 text-right">Total</div>
                  <div className="col-span-1" />
                </div>
                {form.deliverable_items.map((it, idx) => (
                  <div key={it.key ?? idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 rounded-lg px-2 py-1.5">
                    <div className="col-span-5">
                      <p className="text-xs font-semibold text-slate-900 truncate">{it.label || it.key}</p>
                    </div>
                    <input type="number" min="0" value={it.quantity}
                      onChange={e => updateDeliverable(idx, 'quantity', Number(e.target.value))}
                      className="col-span-2 bg-surface border border-slate-200 rounded px-2 py-1 text-xs text-slate-900 text-center" />
                    <input type="number" min="0" value={it.unit_cost}
                      onChange={e => updateDeliverable(idx, 'unit_cost', Number(e.target.value))}
                      className="col-span-2 bg-surface border border-slate-200 rounded px-2 py-1 text-xs text-slate-900 text-center" />
                    <span className="col-span-2 text-right font-mono text-xs font-bold text-slate-900">
                      {fmt((Number(it.quantity) || 0) * (Number(it.unit_cost) || 0))}
                    </span>
                    <button onClick={() => removeDeliverable(idx)}
                      className="col-span-1 text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 justify-self-end">
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {availableDeliverables.length > 0 && (
              <select className={SEL} value="" onChange={e => e.target.value && addDeliverable(e.target.value)}>
                <option value="">+ Add deliverable…</option>
                {availableDeliverables.map(d => (
                  <option key={d.id} value={d.name}>{d.description || d.name} — ₹{d.rate}</option>
                ))}
              </select>
            )}
          </Card>

          {/* Reporting + Commercial combined */}
          <Card>
            <SectionTitle>Reporting & Commercial</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Input label="Report Hours" type="number" value={form.report_writing_hours} onChange={set('report_writing_hours')} placeholder="e.g. 8" />
              <Input label="Rate ₹/Hour" type="number" value={form.report_writing_rate} onChange={set('report_writing_rate')} placeholder="1200" />
              <Input label="Report Override (₹)" type="number" value={form.report_writing_cost} onChange={set('report_writing_cost')} placeholder="auto" />
              <Input label="Data Storage (₹)" type="number" value={form.storage_cost} onChange={set('storage_cost')} placeholder="0" />
            </div>
            <div className="h-px bg-slate-100 mb-3" />
            <SectionTitle>Commercial Parameters</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Input label="Overhead %" type="number" value={form.overhead_percent} onChange={set('overhead_percent')} placeholder="15" />
              <Input label="Contingency %" type="number" value={form.contingency_percent} onChange={set('contingency_percent')} placeholder="5" />
              <Input label="Margin %" type="number" value={form.margin_percent} onChange={set('margin_percent')} placeholder="15" />
              <Input label="Tax %" type="number" value={form.tax_percent} onChange={set('tax_percent')} placeholder="18" />
            </div>
          </Card>

        </div>

        {/* Live Breakdown Panel — sticky below header (80px topbar + ~60px form header + 8px gap) */}
        <div className="space-y-4 sticky top-[148px] self-start">
          <Card className="bg-gradient-to-br from-primary/5 to-surface border-primary/20">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary mb-3">Live Breakdown</h3>

            <div className="space-y-1.5 text-xs">
              <Row label="Pilot"              value={breakdown.pilotCost} />
              {(breakdown.copilotCount > 0 || Number(form.copilot_count) > 0) && <Row label="Co-Pilot" value={breakdown.copilotCost} />}
              <Row label="Drone"              value={breakdown.droneCost} />
              <Row label="Mobilization"      value={breakdown.mobilizationCost} />
              <Row label="Accommodation"     value={breakdown.accommodationCost} />
              <Row label="Daily Travel"      value={breakdown.dailyTravelCost} />
              <Row label="Food"              value={breakdown.perDiem} />
              <Row label="Software"          value={breakdown.softwareCost} />
              <Row label="Deliverables"      value={breakdown.deliverableCost} />
              <Row label="Report Writing"    value={breakdown.reportWritingCost} />
              <Row label="Data Storage"      value={breakdown.storageCost} />
              <Row label="Post-Processing"   value={breakdown.processing_cost} />
            </div>

            <div className="h-px bg-slate-200 my-3" />

            <div className="space-y-1.5 text-xs">
              <Row label="Direct Cost"                         value={breakdown.directCost}    strong />
              {breakdown.overhead    > 0 && <Row label={`OH (${form.overhead_percent}%)`}     value={breakdown.overhead}    muted="amber" />}
              {breakdown.contingency > 0 && <Row label={`Cont (${form.contingency_percent}%)`} value={breakdown.contingency} muted="orange" />}
              <Row label={`Margin (${form.margin_percent}%)`}  value={breakdown.margin}        muted="indigo" />
              <Row label="Total (excl. GST)"                   value={breakdown.subtotal}      strong />
              <Row label={`GST (${form.tax_percent}%)`}        value={breakdown.tax}           muted="emerald" />
            </div>

            <div className="bg-primary/10 -mx-5 md:-mx-6 -mb-5 md:-mb-6 mt-3 p-4 border-t border-primary/20 rounded-b-2xl">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary/70 mb-0.5">Quoted Value (excl. GST)</p>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">{fmt(breakdown.subtotal)}</p>
                  {breakdown.smartUnitRate && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="inline-flex items-center gap-1 bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest">
                        <span className="material-symbols-outlined text-[10px]">calculate</span>
                        {(() => {
                          const { value, labelFull } = breakdown.smartUnitRate;
                          const n = Number(value || 0);
                          const formatted = n >= 1e7
                            ? `₹${(n/1e7).toFixed(2)} Cr`
                            : n >= 1e5
                            ? `₹${(n/1e5).toFixed(2)} L`
                            : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
                          return `${formatted} ${labelFull.replace('₹/', '/ ')}`;
                        })()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">+{form.tax_percent}% GST</p>
                  <p className="text-[11px] font-bold text-slate-500 mt-0.5">{fmt(breakdown.tax)}</p>
                  <div className="mt-2 pt-2 border-t border-primary/20">
                    <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-primary/70">Grand Total</p>
                    <p className="text-base font-black text-primary">{fmt(breakdown.total)}</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {isEdit && (
            <Card>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-2">Export</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" icon="picture_as_pdf" onClick={handleExportPDF}>PDF</Button>
                <Button variant="secondary" size="sm" icon="table_chart" onClick={handleExportExcel}>Excel</Button>
              </div>
            </Card>
          )}
        </div>
      </div>
      <UnsavedChangesModal blocker={blocker} />
    </div>
  );
};

const Row = ({ label, value, strong, muted }) => {
  const color = muted === 'amber'   ? 'text-amber-600'
              : muted === 'orange'  ? 'text-orange-600'
              : muted === 'indigo'  ? 'text-indigo-600'
              : muted === 'emerald' ? 'text-emerald-600'
              : 'text-slate-700';
  return (
    <div className="flex justify-between items-center">
      <span className={muted ? `text-[9px] font-bold uppercase tracking-widest ${color}` : 'text-[11px] text-slate-500'}>{label}</span>
      <span className={`font-mono text-xs ${strong ? 'font-black text-slate-900' : muted ? `font-bold ${color}` : 'font-semibold text-slate-900'}`}>
        {fmt(value)}
      </span>
    </div>
  );
};

export default EstimationForm;
