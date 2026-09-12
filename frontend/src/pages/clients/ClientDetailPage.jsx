import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import ClientFormModal from '../../components/ui/ClientFormModal';
import { useToast } from '../../context/ToastContext';
import { useSetBreadcrumb } from '../../context/BreadcrumbContext';
import { formatDateOnly } from '../../utils/dateUtils';

// ── Status / stage meta (kept local so the page is self-contained) ────────────
const PROJECT_STATUS = {
  initiate:        { label: 'Initiate',        cls: 'bg-slate-100 text-slate-600' },
  planned:         { label: 'Planned',         cls: 'bg-blue-50 text-blue-700' },
  on_going:        { label: 'On Going',        cls: 'bg-amber-50 text-amber-700' },
  executed:        { label: 'Executed',        cls: 'bg-violet-50 text-violet-700' },
  post_processing: { label: 'Post Processing', cls: 'bg-orange-50 text-orange-700' },
  complete:        { label: 'Complete',        cls: 'bg-emerald-100 text-emerald-700' },
  cancelled:       { label: 'Cancelled',       cls: 'bg-red-50 text-red-600' },
};
const PIPELINE_STAGE = {
  inquiry:             { label: 'Inquiry',             cls: 'bg-blue-50 text-blue-700' },
  commercial_proposal: { label: 'Commercial Proposal', cls: 'bg-amber-50 text-amber-700' },
  pre_confirmation:    { label: 'Pre-Confirmation',    cls: 'bg-violet-50 text-violet-700' },
  onboarding:          { label: 'Onboarding',          cls: 'bg-teal-50 text-teal-700' },
  converted:           { label: 'Converted',           cls: 'bg-emerald-100 text-emerald-700' },
  cancelled:           { label: 'Cancelled',           cls: 'bg-red-50 text-red-600' },
};
const TYPE_LABEL = {
  solar_pv: 'Solar PV', wind: 'Wind', td_lines: 'T&D Lines',
  tower: 'Tower', pipeline: 'Pipeline', volumetric: 'Volumetric', other: 'Other',
};

const fmtMoney = (v) => {
  const n = Number(v || 0);
  if (!n) return '—';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
};

const PROJECT_ACTIVE = ['initiate', 'planned', 'on_going', 'executed', 'post_processing'];

const StatChip = ({ label, value, accent = 'text-slate-900' }) => (
  <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
    <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black mb-1">{label}</p>
    <p className={`text-lg font-black ${accent}`}>{value}</p>
  </div>
);

const InfoRow = ({ icon, label, value, href }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="material-symbols-outlined text-slate-400 text-lg mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</p>
        {href
          ? <a href={href} target="_blank" rel="noreferrer" className="text-sm text-primary font-semibold break-all hover:underline">{value}</a>
          : <p className="text-sm text-slate-800 font-semibold break-words">{value}</p>}
      </div>
    </div>
  );
};

const ClientDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  useSetBreadcrumb(client?.name);

  const fetchClient = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(ENDPOINTS.CLIENTS.GET_BY_ID(id));
      setClient(res.data.data);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to load client', 'error');
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => { fetchClient(); }, [fetchClient]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-300">
        <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <span className="material-symbols-outlined text-4xl text-slate-300">person_off</span>
        <p className="text-base font-semibold text-slate-400">Client not found</p>
        <Button variant="secondary" icon="arrow_back" onClick={() => navigate('/clients')}>Back to Clients</Button>
      </div>
    );
  }

  const projects  = client.projects  || [];
  const pipelines = client.pipelines || [];

  const activeProjects    = projects.filter(p => PROJECT_ACTIVE.includes(p.status)).length;
  const completeProjects  = projects.filter(p => p.status === 'complete').length;
  const cancelledProjects = projects.filter(p => p.status === 'cancelled').length;
  const livePipelines     = pipelines.filter(p => !['converted', 'cancelled'].includes(p.stage)).length;
  const convertedPipes    = pipelines.filter(p => p.stage === 'converted').length;
  const totalProjectValue = projects.reduce((s, p) => s + Number(p.project_value || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <PageHeader
        eyebrow="Operations"
        title={client.name}
        description={client.company_name || 'Client overview — projects & pipeline'}
        actions={<Button icon="edit" variant="secondary" onClick={() => setEditOpen(true)}>Edit Client</Button>}
      />

      {/* Status + stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
          <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black mb-1">Status</p>
          <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full ${client.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
            {client.status === 'active' ? 'Active' : 'Inactive'}
          </span>
        </div>
        <StatChip label="Projects" value={projects.length} accent="text-indigo-600" />
        <StatChip label="Active" value={activeProjects} accent="text-amber-600" />
        <StatChip label="Completed" value={completeProjects} accent="text-emerald-600" />
        <StatChip label="Pipeline (Live)" value={livePipelines} accent="text-purple-600" />
        <StatChip label="Total Value" value={fmtMoney(totalProjectValue)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Client details ─────────────────────────────────────────────── */}
        <Card className="lg:col-span-1 p-6 h-fit">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-2">Client Details</h3>
          <div className="divide-y divide-slate-50">
            <InfoRow icon="badge"        label="Contact Person" value={client.contact_person} />
            <InfoRow icon="mail"         label="Email"          value={client.contact_email} href={client.contact_email ? `mailto:${client.contact_email}` : null} />
            <InfoRow icon="call"         label="Phone"          value={client.contact_number} href={client.contact_number ? `tel:${client.contact_number}` : null} />
            <InfoRow icon="language"     label="Website"        value={client.website} href={client.website ? (client.website.startsWith('http') ? client.website : `https://${client.website}`) : null} />
            <InfoRow icon="receipt_long" label="GSTIN"          value={client.gstin} />
            <InfoRow icon="location_on"  label="Location"       value={[client.city, client.state].filter(Boolean).join(', ')} />
            <InfoRow icon="home_work"    label="Address"        value={client.address} />
            <InfoRow icon="sticky_note_2" label="Notes"         value={client.notes} />
          </div>
        </Card>

        {/* ── Projects + Pipelines ───────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Projects */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-indigo-500">folder_open</span>
                Projects <span className="text-slate-400">({projects.length})</span>
              </h3>
              {cancelledProjects > 0 && (
                <span className="text-[10px] font-bold text-red-500">{cancelledProjects} cancelled</span>
              )}
            </div>
            {projects.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No projects for this client yet.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {projects.map(p => {
                  const meta = PROJECT_STATUS[p.status] || { label: p.status, cls: 'bg-slate-100 text-slate-600' };
                  return (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50/70 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-primary transition-colors">{p.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {TYPE_LABEL[p.project_type] || p.project_type || '—'}
                          {(p.start_date || p.end_date) && ` · ${formatDateOnly(p.start_date)} → ${formatDateOnly(p.end_date)}`}
                        </p>
                      </div>
                      <span className="text-xs font-mono text-slate-500 hidden sm:block shrink-0">{fmtMoney(p.project_value)}</span>
                      <span className={`shrink-0 inline-flex items-center text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${meta.cls}`}>{meta.label}</span>
                      <span className="material-symbols-outlined text-slate-300 text-lg shrink-0 group-hover:text-primary transition-colors">chevron_right</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Pipelines */}
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-purple-500">trending_up</span>
                Pipeline <span className="text-slate-400">({pipelines.length})</span>
              </h3>
              {convertedPipes > 0 && (
                <span className="text-[10px] font-bold text-emerald-600">{convertedPipes} converted</span>
              )}
            </div>
            {pipelines.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No pipeline opportunities for this client yet.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {pipelines.map(p => {
                  const meta = PIPELINE_STAGE[p.stage] || { label: p.stage, cls: 'bg-slate-100 text-slate-600' };
                  return (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/pipeline/${p.id}`)}
                      className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50/70 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate group-hover:text-primary transition-colors">{p.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {TYPE_LABEL[p.project_type] || p.project_type || '—'}
                          {(p.estimated_start || p.estimated_end) && ` · ${formatDateOnly(p.estimated_start)} → ${formatDateOnly(p.estimated_end)}`}
                        </p>
                      </div>
                      <span className="text-xs font-mono text-slate-500 hidden sm:block shrink-0">{fmtMoney(p.estimated_value)}</span>
                      <span className={`shrink-0 inline-flex items-center text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${meta.cls}`}>{meta.label}</span>
                      <span className="material-symbols-outlined text-slate-300 text-lg shrink-0 group-hover:text-primary transition-colors">chevron_right</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ClientFormModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        client={client}
        onSaved={fetchClient}
      />
    </div>
  );
};

export default ClientDetailPage;
