import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { useSetBreadcrumb } from '../../context/BreadcrumbContext';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import { useSocket } from '../../context/SocketContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { DetailSkeleton } from '../../components/ui/Skeletons';
import { formatDateOnly } from '../../utils/dateUtils';

// ── Stage metadata (mirrors PipelineBoard) ───────────────────────────────────
const STAGE_FLOW = ['inquiry', 'commercial_proposal', 'pre_confirmation', 'onboarding'];
// The funnel now displays a 5th "Convert" node representing the project conversion.
const FUNNEL_DISPLAY = [...STAGE_FLOW, 'converted'];
const STAGE_META = {
  inquiry:             { label: 'Inquiry',             icon: 'help',            dot: 'bg-blue-500',    ring: 'ring-blue-300',    text: 'text-blue-600',    soft: 'bg-blue-50' },
  commercial_proposal: { label: 'Commercial Proposal', icon: 'request_quote',   dot: 'bg-amber-500',   ring: 'ring-amber-300',   text: 'text-amber-600',   soft: 'bg-amber-50' },
  pre_confirmation:    { label: 'Pre-Confirmation',    icon: 'mark_email_read', dot: 'bg-violet-500',  ring: 'ring-violet-300',  text: 'text-violet-600',  soft: 'bg-violet-50' },
  onboarding:          { label: 'Onboarding',          icon: 'handshake',       dot: 'bg-emerald-500', ring: 'ring-emerald-300', text: 'text-emerald-600', soft: 'bg-emerald-50' },
  converted:           { label: 'Convert',             icon: 'rocket_launch',   dot: 'bg-green-600',   ring: 'ring-green-300',   text: 'text-green-700',   soft: 'bg-green-50' },
};
const TYPE_ICON = { solar_pv: 'solar_power', wind: 'wind_power', td_lines: 'electric_bolt', tower: 'cell_tower', pipeline: 'valve', volumetric: 'landscape' };

const isFinalStage = (s) => s === 'onboarding'; // convert is available only here
const stageIndex   = (s) => FUNNEL_DISPLAY.indexOf(s);
const fmtMoney     = (v) => { const n = Number(v || 0); if (n >= 1e7) return `₹${(n/1e7).toFixed(2)} Cr`; if (n >= 1e5) return `₹${(n/1e5).toFixed(2)} L`; return `₹${n.toLocaleString('en-IN')}`; };

const WinBar = ({ pct }) => {
  const p = Math.min(100, Math.max(0, Number(pct || 0)));
  const color = p >= 70 ? 'bg-emerald-500' : p >= 40 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${p}%` }} />
      </div>
      <span className="text-sm font-black text-slate-700 w-9 text-right">{p}%</span>
    </div>
  );
};

// ── Inline field editor ──────────────────────────────────────────────────────
const InfoRow = ({ label, value, empty = '—' }) => (
  <div>
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
    <p className="text-sm text-slate-800 font-semibold">{value || empty}</p>
  </div>
);

// ════════════════════════════════════════════════════════════════════════════
const PipelineDetail = () => {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { showToast } = useToast();
const { confirmDialog, promptDialog } = useDialog();
  const { socket }   = useSocket();

  const [activeTab, setActiveTab]   = useState('overview');
  const [lead, setLead]             = useState(null);
  useSetBreadcrumb(lead?.name);
  const [docs, setDocs]             = useState([]);
  const [loading, setLoading]       = useState(true);

  // Estimations tab state
  const [estimations, setEstimations]     = useState([]);
  const [estiLoading, setEstiLoading]     = useState(false);
  const [deletingEsti, setDeletingEsti]   = useState(null);

  // Stage change (free, no document)
  const [changingStage, setChangingStage] = useState(false);

  // Documents tab
  const [docsLoading, setDocsLoading] = useState(false);
  const [docBusy, setDocBusy]         = useState(null); // doc id currently uploading/deleting
  const [editingDoc, setEditingDoc]   = useState(null); // { id, name, file, busy }

  // Onboarding PO / WO inline editor
  const [poInput, setPoInput]   = useState('');
  const [woInput, setWoInput]   = useState('');
  const [savingPoWo, setSavingPoWo] = useState(false);

  // Cancel
  const [showCancel, setShowCancel]   = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling]   = useState(false);

  // Convert
  const [showConvert, setShowConvert] = useState(false);
  const [converting, setConverting]   = useState(false);

  // ── Fetch estimations ────────────────────────────────────────────────────
  const fetchEstimations = useCallback(async () => {
    setEstiLoading(true);
    try {
      const r = await axiosInstance.get(`${ENDPOINTS.ESTIMATIONS.GET_ALL}?pipeline_id=${id}`);
      setEstimations(r.data.data?.rows || r.data.data || []);
    } catch { setEstimations([]); }
    finally { setEstiLoading(false); }
  }, [id]);

  useEffect(() => { if (activeTab === 'estimations') fetchEstimations(); }, [activeTab, fetchEstimations]);

  const deleteEstimation = async (estiId) => {
    if (!(await confirmDialog({ message: 'Delete this estimation scenario?', danger: true }))) return;
    setDeletingEsti(estiId);
    try {
      await axiosInstance.delete(ENDPOINTS.ESTIMATIONS.DELETE(estiId));
      setEstimations(prev => prev.filter(e => e.id !== estiId));
      showToast('Estimation deleted');
    } catch (err) { showToast(err?.response?.data?.message || 'Delete failed', 'error'); }
    finally { setDeletingEsti(null); }
  };

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const r = await axiosInstance.get(ENDPOINTS.PIPELINE.DOCUMENTS(id));
      setDocs(Array.isArray(r.data.data) ? r.data.data : []);
    } catch { setDocs([]); }
    finally { setDocsLoading(false); }
  }, [id]);

  const fetchLead = async () => {
    try {
      const r1 = await axiosInstance.get(ENDPOINTS.PIPELINE.GET_BY_ID(id));
      setLead(r1.data.data);
      setPoInput(r1.data.data?.onboarding_po_number || '');
      setWoInput(r1.data.data?.onboarding_wo_number || '');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to load lead', 'error');
      navigate('/pipeline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLead(); }, [id]);
  useEffect(() => { if (activeTab === 'documents') fetchDocs(); }, [activeTab, fetchDocs]);

  // Socket live-update
  useEffect(() => {
    if (!socket) return;
    const onUpdate = (item) => { if (item.id === id) setLead(prev => ({ ...prev, ...item })); };
    const onDelete = ({ id: did }) => { if (did === id) { showToast('This lead was deleted.', 'error'); navigate('/pipeline'); } };
    socket.on('pipeline:updated',       onUpdate);
    socket.on('pipeline:stage_changed', onUpdate);
    socket.on('pipeline:deleted',       onDelete);
    return () => {
      socket.off('pipeline:updated',       onUpdate);
      socket.off('pipeline:stage_changed', onUpdate);
      socket.off('pipeline:deleted',       onDelete);
    };
  }, [socket, id]);

  // ── Actions ──────────────────────────────────────────────────────────────
  // Free stage change — pick any stage, no document required.
  const handleStageChange = async (target) => {
    if (!lead || target === lead.stage || changingStage) return;
    setChangingStage(true);
    try {
      const fd = new FormData();
      fd.append('stage', target);
      const res = await axiosInstance.put(ENDPOINTS.PIPELINE.UPDATE_STAGE(id), fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setLead(res.data.data);
      showToast(`Moved to ${STAGE_META[target]?.label || target}`);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Stage update failed', 'error');
    } finally { setChangingStage(false); }
  };

  // Save onboarding PO / WO references (contact_number resent — required by schema).
  const savePoWo = async () => {
    setSavingPoWo(true);
    try {
      const res = await axiosInstance.put(ENDPOINTS.PIPELINE.UPDATE(id), {
        onboarding_po_number: poInput.trim(),
        onboarding_wo_number: woInput.trim(),
        contact_number: lead.contact_number,
      });
      setLead(res.data.data);
      showToast('PO / WO saved');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to save PO / WO', 'error');
    } finally { setSavingPoWo(false); }
  };

  // ── Document handlers (Documents tab) ──────────────────────────────────────
  const attachDoc = async (docId, file) => {
    if (!file) return;
    setDocBusy(docId);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await axiosInstance.put(ENDPOINTS.PIPELINE.DOCUMENT(id, docId), fd);
      await fetchDocs();
      showToast('File attached');
    } catch (err) { showToast(err?.response?.data?.message || 'Attach failed', 'error'); }
    finally { setDocBusy(null); }
  };

  const addDoc = async () => {
    const name = await promptDialog({ title: 'Add Document', label: 'Document name', placeholder: 'e.g. NDA, Site Survey Report', confirmLabel: 'Add' });
    if (!name || !name.trim()) return;
    try {
      await axiosInstance.post(ENDPOINTS.PIPELINE.DOCUMENTS(id), { name: name.trim() });
      await fetchDocs();
      showToast('Document added');
    } catch (err) { showToast(err?.response?.data?.message || 'Failed to add document', 'error'); }
  };

  const openEditDoc   = (doc) => setEditingDoc({ id: doc.id, name: doc.name, file: null, busy: false });
  const cancelEditDoc = () => setEditingDoc(null);
  const saveEditDoc   = async () => {
    if (!editingDoc) return;
    const { id: docId, name, file } = editingDoc;
    setEditingDoc(e => ({ ...e, busy: true }));
    try {
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('name', name.trim());
        await axiosInstance.put(ENDPOINTS.PIPELINE.DOCUMENT(id, docId), fd);
      } else {
        await axiosInstance.put(ENDPOINTS.PIPELINE.DOCUMENT(id, docId), { name: name.trim() });
      }
      await fetchDocs();
      setEditingDoc(null);
      showToast('Document updated');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Update failed', 'error');
      setEditingDoc(e => ({ ...e, busy: false }));
    }
  };

  const revokeDoc = async (docId) => {
    if (!(await confirmDialog({ message: 'Remove the attached file from this slot? The slot itself will remain.', danger: true }))) return;
    try {
      await axiosInstance.delete(ENDPOINTS.PIPELINE.DOCUMENT_REVOKE(id, docId));
      await fetchDocs();
      showToast('File removed from document slot');
    } catch (err) { showToast(err.userMessage || 'Revoke failed', 'error'); }
  };

  const deleteDoc = async (docId) => {
    if (!(await confirmDialog({ message: 'Delete this document slot? Any attached file will be removed.', danger: true }))) return;
    setDocBusy(docId);
    try {
      await axiosInstance.delete(ENDPOINTS.PIPELINE.DOCUMENT(id, docId));
      setDocs(prev => prev.filter(d => d.id !== docId));
      showToast('Document deleted');
    } catch (err) { showToast(err?.response?.data?.message || 'Delete failed', 'error'); }
    finally { setDocBusy(null); }
  };

  const submitCancel = async () => {
    if (!cancelReason.trim()) { showToast('A cancellation reason is required', 'error'); return; }
    setCancelling(true);
    try {
      const fd = new FormData();
      fd.append('stage', 'cancelled');
      fd.append('reason', cancelReason.trim());
      await axiosInstance.put(ENDPOINTS.PIPELINE.UPDATE_STAGE(id), fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      showToast('Opportunity cancelled');
      navigate('/pipeline');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Cancellation failed', 'error');
      setCancelling(false);
    }
  };

  const submitConvert = async () => {
    setConverting(true);
    try {
      const res = await axiosInstance.post(ENDPOINTS.PIPELINE.CONVERT(id));
      const projectId = res.data.data?.id || res.data.data?.project_id;
      showToast('Converted to project successfully!');
      if (projectId) navigate(`/projects/${projectId}`);
      else navigate('/projects');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Conversion failed', 'error');
      setConverting(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  if (loading) return <DetailSkeleton />;
  if (!lead)   return null;

  const meta      = STAGE_META[lead.stage] || STAGE_META.inquiry;
  const curIdx    = lead.converted_project_id ? FUNNEL_DISPLAY.indexOf('converted') : stageIndex(lead.stage);
  const typeIcon  = TYPE_ICON[lead.project_type] || 'business_center';
  const isTerminal = lead.stage === 'cancelled' || lead.converted_project_id;
  const canConvert = !isTerminal && isFinalStage(lead.stage); // convert only at Onboarding

  return (
    <div className="space-y-6 animate-in fade-in duration-400 font-['Space_Grotesk']">

      {/* ── Back bar ── */}
      <div className="flex items-center gap-2">
        <Link to="/pipeline" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary transition-colors font-semibold">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to Pipeline
        </Link>
      </div>

      {/* ── Hero header ── */}
      <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-2xl ${meta.soft} flex items-center justify-center shrink-0`}>
              <span className={`material-symbols-outlined text-2xl ${meta.text}`}>{typeIcon}</span>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">Lead Generation</p>
              <h1 className="text-2xl font-black text-slate-900 leading-tight">{lead.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${meta.soft} ${meta.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
                {lead.client_name && <span className="text-xs text-slate-500 font-semibold">{lead.client_name}</span>}
                {lead.state && <span className="text-xs text-slate-400">· {lead.state}</span>}
                {lead.project_type && <span className="text-xs text-slate-400">· {lead.project_type.replace(/_/g, ' ')}</span>}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {!isTerminal && (
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button variant="secondary" icon="edit" onClick={() => navigate(`/pipeline/${id}/edit`)}>Edit</Button>
              {canConvert && (
                <Button icon="rocket_launch" onClick={() => setShowConvert(true)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500">
                  Convert to Project
                </Button>
              )}
              <Button variant="danger" icon="cancel" onClick={() => setShowCancel(true)}>Cancel Lead</Button>
            </div>
          )}
          {lead.converted_project_id && (
            <Button icon="folder_open" onClick={() => navigate(`/projects/${lead.converted_project_id}`)}>
              View Project
            </Button>
          )}
        </div>
      </div>

      {/* ── Stage funnel ── */}
      <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm p-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Sales Funnel</p>
        {/* Animated progress bar */}
        <div className="relative h-1.5 bg-slate-100 rounded-full mb-5 overflow-hidden">
          <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-400 via-amber-400 to-green-500 transition-all duration-700 ease-out"
            style={{ width: curIdx < 0 ? '0%' : `${Math.round((curIdx / (FUNNEL_DISPLAY.length - 1)) * 100)}%` }} />
        </div>
        <div className="flex items-center overflow-x-auto">
          {FUNNEL_DISPLAY.map((s, i) => {
            const sm       = STAGE_META[s];
            const done     = curIdx > i;
            const active   = curIdx === i;
            return (
              <div key={s} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                    done   ? `${sm.dot} border-transparent shadow-md` :
                    active ? `bg-surface ring-4 ${sm.ring} border-2 border-current ${sm.text} animate-pulse` :
                    'bg-slate-100 border-slate-200'
                  }`}>
                    {done ? (
                      <span className="material-symbols-outlined text-white text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                    ) : (
                      <span className={`material-symbols-outlined text-base ${active ? sm.text : 'text-slate-400'}`}>{sm.icon}</span>
                    )}
                  </div>
                  <p className={`text-[10px] font-black uppercase tracking-wider mt-2 text-center leading-tight max-w-[80px] ${active ? sm.text : done ? 'text-slate-600' : 'text-slate-400'}`}>
                    {sm.label}
                  </p>
                </div>
                {i < FUNNEL_DISPLAY.length - 1 && (
                  <div className={`h-0.5 w-full mx-1 rounded-full transition-all ${done ? 'bg-slate-400' : 'bg-slate-100'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-100">
          {[
            { key: 'overview',    label: 'Overview',    icon: 'info' },
            { key: 'estimations', label: 'Estimations', icon: 'request_quote' },
            { key: 'documents',   label: 'Documents',   icon: 'folder' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-5 py-4 text-sm font-bold border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}>
              <span className="material-symbols-outlined text-base">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Estimations tab ── */}
      {activeTab === 'estimations' && (
        <EstimationsTab
          pipelineId={id}
          lead={lead}
          estimations={estimations}
          loading={estiLoading}
          onDelete={deleteEstimation}
          deletingId={deletingEsti}
          onRefresh={fetchEstimations}
          navigate={navigate}
        />
      )}

      {/* ── Documents tab ── */}
      {activeTab === 'documents' && (
        <DocumentsTab
          onRevoke={revokeDoc}
          docs={docs}
          loading={docsLoading}
          busyId={docBusy}
          readOnly={isTerminal}
          onAttach={attachDoc}
          onAdd={addDoc}
          onEdit={openEditDoc}
          onDelete={deleteDoc}
        />
      )}

      {/* ── Main content grid (overview) ── */}
      {activeTab === 'overview' && <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left column: details */}
        <div className="lg:col-span-2 space-y-6">

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Est. Value',   value: fmtMoney(lead.estimated_value),                          icon: 'payments',     color: 'text-blue-500' },
              { label: 'Win Probability', value: `${lead.win_probability ?? 0}%`,                      icon: 'percent',      color: 'text-amber-500' },
              { label: 'Est. Start',   value: lead.estimated_start ? formatDateOnly(lead.estimated_start) : '—', icon: 'event',        color: 'text-violet-500' },
              { label: 'Est. Close',   value: lead.estimated_end   ? formatDateOnly(lead.estimated_end)   : '—', icon: 'event_available', color: 'text-emerald-500' },
            ].map(k => (
              <Card key={k.label} className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{k.label}</p>
                    <p className="text-lg font-black text-slate-900 mt-0.5">{k.value}</p>
                  </div>
                  <span className={`material-symbols-outlined text-2xl ${k.color} opacity-25`}>{k.icon}</span>
                </div>
              </Card>
            ))}
          </div>

          {/* Win probability bar */}
          <Card>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Win Probability</p>
            <WinBar pct={lead.win_probability} />
          </Card>

          {/* Core details */}
          <Card title="Lead Details">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <InfoRow label="Client / Company" value={lead.client_name} />
              <InfoRow label="Lead By"          value={lead.sales_executive} />
              <InfoRow label="Project Type"     value={lead.project_type?.replace(/_/g, ' ')} />
              <InfoRow label="Enquiry Date"     value={lead.enquiry_date ? formatDateOnly(lead.enquiry_date) : null} />
              <InfoRow label="State"            value={lead.state} />
              <InfoRow label="Tentative Scope"  value={lead.tentative_scope} />
              <InfoRow label="Contact Phone"    value={lead.contact_number} />
              <InfoRow label="Contact Email"    value={lead.contact_email} />
              {lead.latitude != null && <InfoRow label="Coordinates" value={`${lead.latitude}, ${lead.longitude}`} />}
            </div>
          </Card>

          {/* Requirement */}
          {lead.requirement && (
            <Card title="Client Requirement">
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{lead.requirement}</p>
            </Card>
          )}

          {/* Notes */}
          {lead.notes && (
            <Card title="Notes">
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{lead.notes}</p>
            </Card>
          )}

          {/* Estimation notes */}
          {lead.estimation_notes && (
            <Card title="Estimation Notes">
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{lead.estimation_notes}</p>
            </Card>
          )}

          {/* Tentative resources */}
          {(lead.tentative_pilot || lead.tentative_drone) && (
            <Card title="Tentative Resources">
              <div className="grid grid-cols-2 gap-4">
                {lead.tentative_pilot && (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                    <span className="material-symbols-outlined text-blue-400">person</span>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Pilot</p>
                      <p className="text-sm font-bold text-slate-800">{lead.tentative_pilot_name || '—'}</p>
                    </div>
                  </div>
                )}
                {lead.tentative_drone && (
                  <div className="flex items-center gap-3 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                    <span className="material-symbols-outlined text-indigo-400">flight</span>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Drone</p>
                      <p className="text-sm font-bold text-slate-800">{lead.tentative_drone_name ? `${lead.tentative_drone_name} — ${lead.tentative_drone_model || ''}` : '—'}</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Right column: stage actions + docs */}
        <div className="space-y-6">

          {/* Change stage — free movement, no document required */}
          {!isTerminal && (
            <Card title="Change Stage">
              <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">Move this lead to any stage. No document is required.</p>
              <div className="grid grid-cols-1 gap-2">
                {STAGE_FLOW.map(s => {
                  const sm = STAGE_META[s];
                  const cur = lead.stage === s;
                  return (
                    <button key={s} onClick={() => handleStageChange(s)} disabled={cur || changingStage}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        cur ? `${sm.soft} border-current ${sm.text} cursor-default`
                            : 'bg-surface border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'} ${changingStage ? 'opacity-60' : ''}`}>
                      <span className={`material-symbols-outlined text-base ${cur ? sm.text : 'text-slate-400'}`}>{sm.icon}</span>
                      <span className="text-sm font-bold flex-1">{sm.label}</span>
                      {cur && <span className="text-[9px] font-black uppercase tracking-widest">Current</span>}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Onboarding PO / WO — editable */}
          {!isTerminal && lead.stage === 'onboarding' && (
            <Card title="Onboarding References">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">PO Number</label>
                  <input type="text" value={poInput} onChange={e => setPoInput(e.target.value)} placeholder="e.g. 12345"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">WO Number</label>
                  <input type="text" value={woInput} onChange={e => setWoInput(e.target.value)} placeholder="e.g. 67890"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
                </div>
              </div>
              <Button size="sm" variant="secondary" icon="save" onClick={savePoWo} disabled={savingPoWo}>
                {savingPoWo ? 'Saving…' : 'Save PO / WO'}
              </Button>
            </Card>
          )}

          {/* Convert card — only available at the final (Onboarding) stage */}
          {canConvert && (
            <Card className="border-emerald-200 bg-emerald-50/40">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-emerald-500 text-2xl mt-0.5">rocket_launch</span>
                <div>
                  <p className="text-sm font-black text-slate-900">Ready to Convert</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">This lead has reached Onboarding and is ready to become an active project.</p>
                  <Button className="mt-3" icon="rocket_launch" onClick={() => setShowConvert(true)}
                    disabled={converting}>
                    {converting ? 'Converting…' : 'Convert to Project'}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Converted badge */}
          {lead.converted_project_id && (
            <Card className="border-green-200 bg-green-50/40">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-green-500 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <div>
                  <p className="text-sm font-black text-slate-900">Converted to Project</p>
                  <Button size="sm" variant="secondary" icon="folder_open" className="mt-2"
                    onClick={() => navigate(`/projects/${lead.converted_project_id}`)}>
                    Open Project
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Cancelled badge */}
          {lead.stage === 'cancelled' && (
            <Card className="border-red-200 bg-red-50/40">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-red-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
                <div>
                  <p className="text-sm font-black text-red-600">Lead Cancelled</p>
                  {lead.cancel_reason && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{lead.cancel_reason}</p>}
                </div>
              </div>
            </Card>
          )}

        </div>
      </div>}

      {/* ── Edit Document modal ── */}
      {editingDoc && (
        <Modal isOpen={!!editingDoc} onClose={cancelEditDoc}
          title="Edit Document"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={cancelEditDoc} disabled={editingDoc.busy}>Cancel</Button>
              <Button icon="save" onClick={saveEditDoc} disabled={editingDoc.busy || !editingDoc.name.trim()}>
                {editingDoc.busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Document Name</label>
              <input
                value={editingDoc.name}
                onChange={e => setEditingDoc(d => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Purchase Order (PO)"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                Replace File <span className="text-slate-400 font-normal normal-case">(optional — leave blank to keep existing)</span>
              </label>
              <label className="flex items-center gap-3 px-3 py-2.5 border border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all">
                <span className="material-symbols-outlined text-slate-400">upload_file</span>
                <span className="text-sm text-slate-500 truncate flex-1">
                  {editingDoc.file ? editingDoc.file.name : 'Click to select a file'}
                </span>
                {editingDoc.file && (
                  <button
                    type="button"
                    onClick={e => { e.preventDefault(); setEditingDoc(d => ({ ...d, file: null })); }}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                )}
                <input type="file" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setEditingDoc(d => ({ ...d, file: f })); e.target.value = ''; }} />
              </label>
              {editingDoc.file && (
                <p className="text-xs text-slate-400 mt-1">{(editingDoc.file.size / 1e6).toFixed(2)} MB — will replace current file on save</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Cancel modal ── */}
      <Modal isOpen={showCancel} onClose={() => { if (!cancelling) { setShowCancel(false); setCancelReason(''); } }}
        title="Cancel Lead"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setShowCancel(false); setCancelReason(''); }} disabled={cancelling}>Keep Lead</Button>
            <Button variant="danger" icon="cancel" onClick={submitCancel} disabled={cancelling || !cancelReason.trim()}>
              {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Cancelling <span className="font-bold text-slate-900">{lead.name}</span> will remove it from the active pipeline. This action cannot be undone.
          </p>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
              Cancellation Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="e.g. Client withdrew, budget constraints…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* ── Convert modal ── */}
      <Modal isOpen={showConvert} onClose={() => { if (!converting) setShowConvert(false); }}
        title="Convert to Project"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowConvert(false)} disabled={converting}>Cancel</Button>
            <Button icon="rocket_launch" onClick={submitConvert} disabled={converting}>
              {converting ? 'Converting…' : 'Yes, Convert'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-500 leading-relaxed">
          Convert <span className="font-bold text-slate-900">{lead.name}</span> into an active project?
          A new project will be created at the <span className="font-bold">Initiate</span> stage, pre-populated with this lead's data.
        </p>
      </Modal>

    </div>
  );
};

// ── EstimationsTab component ──────────────────────────────────────────────────
const fmtCurrency = (v) => {
  const n = Number(v || 0);
  if (n >= 1e7) return `₹${(n/1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n/1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

// Derives unit rate from stored estimation inputs (same logic as costEngine)
const getUnitRateInfo = (inputs = {}, subtotal = 0) => {
  if (subtotal <= 0) return null;
  const safe = (v) => { const n = Number(v); return (isNaN(n) || n < 0) ? 0 : n; };
  const type = (inputs.project_type || '').toLowerCase();
  if (type === 'solar' || type === 'solar_pv') {
    const mw = safe(inputs.mw);
    if (mw > 0) return { value: subtotal / mw, label: 'MW' };
    const acres = safe(inputs.area_acres);
    if (acres > 0) return { value: subtotal / acres, label: 'Acre' };
  }
  if (type === 'wind') {
    const t = safe(inputs.turbines);
    if (t > 0) return { value: subtotal / t, label: 'Turbine' };
  }
  if (type === 'transmission' || type === 'td_lines') {
    const km = safe(inputs.km);
    if (km > 0) return { value: subtotal / km, label: 'km' };
  }
  if (type === 'pipeline') {
    const km = safe(inputs.km);
    if (km > 0) return { value: subtotal / km, label: 'km' };
  }
  if (type === 'volumetric') {
    const s = safe(inputs.stockpiles);
    if (s > 0) return { value: subtotal / s, label: 'Stockpile' };
  }
  if (type === 'tower') {
    const tw = safe(inputs.towers);
    if (tw > 0) return { value: subtotal / tw, label: 'Tower' };
  }
  // Universal fallback: cost per flight day — always meaningful for drone surveys
  const d = safe(inputs.days);
  if (d > 0) return { value: subtotal / d, label: 'Flight Day' };
  return null;
};


// Inline rename modal — shown inside the card overlay
const RenameModal = ({ current, onSave, onClose }) => {
  const [val, setVal] = useState(current || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!val.trim()) return;
    setSaving(true);
    await onSave(val.trim());
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Rename Scenario</p>
        <p className="text-sm text-slate-600 mb-4">This name is displayed on the pipeline card and in the comparison table.</p>
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
          placeholder="e.g. Base Case, Optimistic…"
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          >Cancel</button>
          <button
            onClick={submit}
            disabled={saving || !val.trim()}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
          >{saving ? 'Saving…' : 'Save Name'}</button>
        </div>
      </div>
    </div>
  );
};

const EstimationsTab = ({ pipelineId, lead, estimations, loading, onDelete, deletingId, onRefresh, navigate }) => {
  const { showToast } = useToast();
  const [renamingId, setRenamingId] = useState(null); // id of estimation being renamed

  const params = new URLSearchParams({
    pipeline_id:  pipelineId,
    client_name:  lead.client_name  || '',
    project_type: lead.project_type || 'solar_pv',
    label:        lead.name         || '',
  });

  const handleRename = async (estimationId, newName) => {
    try {
      await axiosInstance.patch(ENDPOINTS.ESTIMATIONS.RENAME(estimationId), { name: newName });
      showToast('Estimation renamed', 'success');
      setRenamingId(null);
      onRefresh();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to rename', 'error');
    }
  };

  // Fallback label when the user hasn't named an estimation yet
  const getDisplayName = (e, idx) => {
    if (e.name && e.name.trim()) return e.name.trim();
    const defaults = ['Pessimistic', 'Base Case', 'Optimistic'];
    return defaults[idx] || `Scenario ${idx + 1}`;
  };

  const scenarioColors = [
    'text-red-600 bg-red-50 border-red-100',
    'text-amber-600 bg-amber-50 border-amber-100',
    'text-emerald-600 bg-emerald-50 border-emerald-100',
  ];

  return (
    <div className="space-y-4">
      {/* Rename modal */}
      {renamingId && (
        <RenameModal
          current={estimations.find(e => e.id === renamingId)?.name || ''}
          onSave={(newName) => handleRename(renamingId, newName)}
          onClose={() => setRenamingId(null)}
        />
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-slate-900">Cost Estimation Scenarios</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Create multiple scenarios (pessimistic / base / optimistic) to compare pricing.
            Pre-filled from this pipeline's data.
          </p>
        </div>
        <button
          onClick={() => navigate(`/estimations/new?${params.toString()}`)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm"
        >
          <span className="material-symbols-outlined text-base">add</span>
          New Scenario
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="bg-surface rounded-2xl border border-slate-200 p-5 animate-pulse">
              <div className="h-4 bg-slate-100 rounded mb-3 w-2/3" />
              <div className="h-8 bg-slate-100 rounded mb-3 w-1/2" />
              <div className="h-3 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : estimations.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-3xl text-blue-400">request_quote</span>
          </div>
          <p className="text-sm font-bold text-slate-800 mb-1">No estimation scenarios yet</p>
          <p className="text-xs text-slate-500 mb-4">Build 2–3 scenarios with different assumptions to compare pricing options.</p>
          <button
            onClick={() => navigate(`/estimations/new?${params.toString()}`)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-base">add</span>
            Create First Scenario
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {estimations.map((e, idx) => {
            const color = scenarioColors[idx] || 'text-blue-600 bg-blue-50 border-blue-100';
            const displayName = getDisplayName(e, idx);
            const detail = e.details?.breakdown || {};
            const inputs = e.details?.inputs   || {};
            return (
              <div key={e.id} className="bg-surface rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  {/* Name badge + rename icon */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border truncate max-w-[150px] ${color}`}>
                      {displayName}
                    </span>
                    <button
                      onClick={() => setRenamingId(e.id)}
                      title="Rename scenario"
                      className="p-1 rounded-lg text-slate-300 hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
                    >
                      <span className="material-symbols-outlined text-sm">edit_note</span>
                    </button>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => navigate(`/estimations/${e.id}`)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Open &amp; edit">
                      <span className="material-symbols-outlined text-base">edit</span>
                    </button>
                    <button onClick={() => onDelete(e.id)} disabled={deletingId === e.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete">
                      <span className="material-symbols-outlined text-base">{deletingId === e.id ? 'hourglass_empty' : 'delete'}</span>
                    </button>
                  </div>
                </div>

                {/* Grand total — left: excl GST, right: incl GST */}
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Excl. GST</p>
                    <p className="text-2xl font-black text-slate-900">{fmtCurrency(detail.subtotal || e.total_cost)}</p>
                    {/* Smart unit rate chip */}
                    {(() => {
                      const ur = getUnitRateInfo(inputs, detail.subtotal || Number(e.total_cost));
                      if (!ur) return null;
                      return (
                        <span className="inline-flex items-center gap-1 mt-1 bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[9px] font-bold">
                          <span className="material-symbols-outlined text-[10px]">calculate</span>
                          {fmtCurrency(ur.value)} / {ur.label}
                        </span>
                      );
                    })()}
                  </div>
                  {detail.subtotal != null && (
                    <div className="text-right pb-0.5">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Incl. GST</p>
                      <p className="text-sm font-black text-slate-500">{fmtCurrency(e.total_cost)}</p>
                    </div>
                  )}
                </div>

                {/* Mini breakdown */}
                <div className="space-y-1 text-xs">
                  {[
                    ['Project Type', (inputs.project_type || e.project_type || '').replace(/_/g, ' ')],
                    ['Flight Days',  inputs.days || detail.days || '—'],
                    ['Margin',       inputs.margin_percent ? `${inputs.margin_percent}%` : '—'],
                    ['Tax',          inputs.tax_percent    ? `${inputs.tax_percent}%`    : '—'],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between">
                      <span className="text-slate-400 font-semibold">{l}</span>
                      <span className="text-slate-700 font-bold capitalize">{v || '—'}</span>
                    </div>
                  ))}
                </div>

                {/* Cost bar */}
                {detail.directCost > 0 && e.total_cost > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                      <span>Direct Cost</span>
                      <span>{fmtCurrency(detail.directCost)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-violet-500 rounded-full"
                        style={{ width: `${Math.min(100, Math.round((detail.directCost / e.total_cost) * 100))}%` }} />
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-slate-400 mt-auto">
                  Created {e.created_at ? new Date(e.created_at).toLocaleDateString('en-IN') : '—'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Scenario comparison if ≥2 estimations */}
      {estimations.length >= 2 && (
        <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Scenario Comparison</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Scenario</th>
                  <th className="text-right py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Direct Cost</th>
                  <th className="text-right py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Margin</th>
                  <th className="text-right py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Tax</th>
                  <th className="text-right py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {estimations.map((e, idx) => {
                  const b = e.details?.breakdown || {};
                  return (
                    <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-2.5 font-bold text-slate-700">{getDisplayName(e, idx)}</td>
                      <td className="py-2.5 text-right text-slate-600">{fmtCurrency(b.directCost)}</td>
                      <td className="py-2.5 text-right text-indigo-600 font-semibold">{fmtCurrency(e.margin)}</td>
                      <td className="py-2.5 text-right text-emerald-600 font-semibold">{fmtCurrency(e.tax)}</td>
                      <td className="py-2.5 text-right font-black text-slate-900 text-sm">{fmtCurrency(e.total_cost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── DocumentsTab component ───────────────────────────────────────────────────

// Which pipeline stage this default document is typically collected at — display-only reference.
const DOC_STAGE_HINT = {
  'Quotation':                       { stage: 'inquiry',             label: 'Inquiry' },
  'Confirmation (Email / WhatsApp)': { stage: 'commercial_proposal', label: 'Proposal' },
  'Agreement':                       { stage: 'pre_confirmation',    label: 'Pre-Confirm' },
  'Purchase Order (PO)':             { stage: 'onboarding',          label: 'Onboarding' },
  'Work Order (WO)':                 { stage: 'onboarding',          label: 'Onboarding' },
};

const DOC_ICON = (fileName) => {
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  const map = {
    pdf: ['picture_as_pdf', 'text-red-500'], jpg: ['image', 'text-sky-500'], jpeg: ['image', 'text-sky-500'],
    png: ['image', 'text-sky-500'], doc: ['description', 'text-blue-500'], docx: ['description', 'text-blue-500'],
    xls: ['table_chart', 'text-emerald-500'], xlsx: ['table_chart', 'text-emerald-500'], csv: ['table_chart', 'text-emerald-500'],
    zip: ['folder_zip', 'text-amber-500'],
  };
  const [icon, cls] = map[ext] || ['draft', 'text-slate-400'];
  return <span className={`material-symbols-outlined text-lg ${cls}`}>{icon}</span>;
};

const DocumentsTab = ({ docs, loading, busyId, readOnly, onAttach, onAdd, onEdit, onDelete, onRevoke }) => {
  return (
    <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-5 border-b border-slate-100">
        <div>
          <p className="text-sm font-black text-slate-900">Documents</p>
          <p className="text-xs text-slate-500 mt-0.5">Attach and download lead documents. The standard set is listed by default — add your own as needed.</p>
        </div>
        {!readOnly && (
          <button onClick={onAdd}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm shrink-0">
            <span className="material-symbols-outlined text-base">add</span>
            Add Document
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-5 space-y-2">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : docs.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">No documents yet</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {docs.map(d => {
            const busy = busyId === d.id;
            return (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                {DOC_ICON(d.file_name)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-slate-800 truncate">{d.name}</p>
                    {d.is_default && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-400 shrink-0">DEFAULT</span>}
                    {DOC_STAGE_HINT[d.name] && (() => {
                      const hint = DOC_STAGE_HINT[d.name];
                      const meta = STAGE_META[hint.stage];
                      return (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${meta.soft} ${meta.text}`}
                          title={`Typically collected at: ${meta.label} stage`}
                        >
                          {hint.label}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {d.file_key
                      ? `${d.file_name || 'Attached'}${d.file_size ? ` · ${(d.file_size / 1e6).toFixed(2)} MB` : ''}`
                      : 'No file attached'}
                  </p>
                </div>

                {/* Status pill */}
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 ${
                  d.file_key ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {d.file_key ? 'Attached' : 'Pending'}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {d.file_key && d.url && (
                    <a href={d.url} target="_blank" rel="noreferrer" title="Download"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors">
                      <span className="material-symbols-outlined text-base">download</span>
                    </a>
                  )}
                  {!readOnly && d.file_key && onRevoke && (
                    <button onClick={() => onRevoke(d.id)} title="Remove attached file"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors">
                      <span className="material-symbols-outlined text-base">link_off</span>
                    </button>
                  )}
                  {!readOnly && (
                    <label title={d.file_key ? 'Replace file' : 'Attach file'}
                      className={`p-1.5 rounded-lg cursor-pointer transition-colors ${busy ? 'opacity-50 cursor-wait text-slate-300' : 'text-slate-400 hover:text-primary hover:bg-primary/10'}`}>
                      <span className="material-symbols-outlined text-base">{busy ? 'hourglass_empty' : (d.file_key ? 'sync' : 'upload_file')}</span>
                      <input type="file" className="hidden" disabled={busy}
                        onChange={e => { const f = e.target.files?.[0]; if (f) onAttach(d.id, f); e.target.value = ''; }} />
                    </label>
                  )}
                  {!readOnly && (
                    <button onClick={() => onEdit(d)} title="Edit document (rename / replace file)"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                      <span className="material-symbols-outlined text-base">edit</span>
                    </button>
                  )}
                  {!readOnly && !d.is_default && (
                    <button onClick={() => onDelete(d.id)} disabled={busy} title="Delete"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stage legend */}
      {!loading && docs.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-50 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <p className="text-[10px] text-slate-400 font-semibold shrink-0">Collected at stage →</p>
          {[
            { stage: 'inquiry',             label: 'Inquiry' },
            { stage: 'commercial_proposal', label: 'Proposal' },
            { stage: 'pre_confirmation',    label: 'Pre-Confirm' },
            { stage: 'onboarding',          label: 'Onboarding' },
          ].map(({ stage, label }) => {
            const meta = STAGE_META[stage];
            return (
              <span key={stage} className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.soft} ${meta.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {label}
              </span>
            );
          })}
          <p className="text-[10px] text-slate-300 ml-auto">reference only · does not affect stage changes</p>
        </div>
      )}
    </div>
  );
};

export default PipelineDetail;
