import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import clsx from 'clsx';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { PageHeader } from '../../../components/ui/PageHeader';
import { UnsavedChangesModal } from '../../../components/ui/UnsavedChangesModal';
import { useUnsavedGuard } from '../../../hooks/useUnsavedGuard';
import { useToast } from '../../../context/ToastContext';
import useAuth from '../../../hooks/useAuth';
import axiosInstance from '../../../api/axios';
import {
  getClient, createClient, updateClient, updateClientStatus,
  getSectors, getDepartments, createContact, uploadClientLogo,
} from '../api/bd.api';
import { ClientLogoUpload } from '../components/ClientLogoUpload';
import { ChannelLogTable } from '../components/ChannelLogTable';
import { ContactCard } from '../components/ContactCard';
import { BD_PRIORITIES, BD_STATUSES, INDIAN_STATES } from '../../../utils/constants';

const BLANK = { name: '', details: '', bd_owner_id: '', priority: 'C', sectors: [], website: '', city: '', state: '', notes: '' };

export const BDClientForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const isEdit = !!id;

  const [form, setForm] = useState(BLANK);
  const [client, setClient] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: 'to_be_initiated', status_reason: '' });
  const [statusSaving, setStatusSaving] = useState(false);
  const [pendingLogoFile, setPendingLogoFile] = useState(null);

  const blocker = useUnsavedGuard(isDirty);
  const currentClientId = client?.id || id;

  useEffect(() => {
    getSectors({ active_only: 'true' }).then(r => setSectors(r.data.data || [])).catch(() => {});
    getDepartments({ active_only: 'true' }).then(r => setDepartments(r.data.data || [])).catch(() => {});
    axiosInstance.get('/users').then(r => setAdmins((r.data.data || []).filter(u => u.role === 'admin' || u.role === 'super_admin'))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) {
      setForm(f => ({ ...f, bd_owner_id: user?.id || '' }));
      return;
    }
    setLoading(true);
    getClient(id).then(res => {
      const d = res.data.data;
      setClient(d);
      setForm({
        name: d.name || '', details: d.details || '', bd_owner_id: d.bd_owner_id || '',
        priority: d.priority || 'C', sectors: d.sectors || [], website: d.website || '',
        city: d.city || '', state: d.state || '', notes: d.notes || '',
      });
      setStatusForm({ status: d.status, status_reason: d.status_reason || '' });
      setContacts(d.contacts || []);
    }).catch(() => showToast('Failed to load client', 'error'))
      .finally(() => setLoading(false));
  }, [id, isEdit, user?.id, showToast]);

  const set = (field) => (e) => { setForm(f => ({ ...f, [field]: e.target.value })); setIsDirty(true); };

  const toggleSector = (key) => {
    setForm(f => ({ ...f, sectors: f.sectors.includes(key) ? f.sectors.filter(s => s !== key) : [...f.sectors, key] }));
    setIsDirty(true);
  };

  // Sector board shows a client under one column only — its primary sector.
  // Convention: sectors[0] is primary, order among the rest doesn't matter.
  const makePrimarySector = (e, key) => {
    e.stopPropagation();
    setForm(f => ({ ...f, sectors: [key, ...f.sectors.filter(s => s !== key)] }));
    setIsDirty(true);
  };

  const handlePendingLogo = (file) => { setPendingLogoFile(file); setIsDirty(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { showToast('Client name is required', 'error'); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const res = await updateClient(id, form);
        setClient(c => ({ ...c, ...res.data.data }));
        showToast('Client updated');
        setIsDirty(false);
      } else {
        const res = await createClient(form);
        const newClient = res.data.data;

        if (pendingLogoFile) {
          try {
            const logoRes = await uploadClientLogo(newClient.id, pendingLogoFile);
            newClient.logo_url = logoRes.data.data.logo_url;
          } catch (err) {
            showToast(err?.response?.data?.message || 'Client created, but logo failed to upload', 'error');
          }
        }

        setClient(newClient);
        showToast('Client created — add contacts and follow-up details below');
        setIsDirty(false);
        setPendingLogoFile(null);
        navigate(`/bd/clients/${newClient.id}`, { replace: true });
      }
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to save client', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusSave = async () => {
    if (statusForm.status === 'closed_cancelled' && !statusForm.status_reason.trim()) {
      showToast('A reason is required when cancelling', 'error');
      return;
    }
    setStatusSaving(true);
    try {
      const res = await updateClientStatus(id, statusForm);
      setClient(c => ({ ...c, ...res.data.data }));
      showToast('Status updated');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to update status', 'error');
    } finally {
      setStatusSaving(false);
    }
  };

  const handleAddContact = async () => {
    if (!currentClientId) return;
    try {
      const res = await createContact(currentClientId, { name: 'New Contact' });
      setContacts(c => [...c, res.data.data]);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to add contact', 'error');
    }
  };

  if (loading) return <div className="py-24 text-center text-slate-400 text-sm">Loading…</div>;

  return (
    <div className="space-y-6 animate-fade-in pb-24 max-w-4xl">
      {/* Top Back Navigation */}
      <div>
        <Link 
          to="/bd/clients" 
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-slate-200 text-xs font-bold text-slate-600 hover:text-primary hover:border-primary/40 hover:bg-primary-light/40 transition-all duration-200 shadow-soft"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span> Back to Clients
        </Link>
      </div>

      <PageHeader
        eyebrow="Business Development"
        title={isEdit ? form.name || 'Edit Client' : 'New Client'}
        description="Lead identification, pipeline classification, target sectors, and contact mapping."
      />

      {/* 1 — Company Profile */}
      <Card>
        <div className="space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="material-symbols-outlined text-primary text-xl">domain</span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Company Profile</h2>
              <p className="text-xs text-slate-400">Core identification and brand assets</p>
            </div>
          </div>

          <ClientLogoUpload
            clientId={currentClientId}
            name={form.name}
            logoUrl={client?.logo_url}
            onChange={(key) => setClient(c => ({ ...c, logo_url: key }))}
            pendingFile={pendingLogoFile}
            onFileSelected={handlePendingLogo}
          />

          <Input 
            label="Client / Company Name" 
            value={form.name} 
            onChange={set('name')} 
            required 
            placeholder="e.g. NTPC Limited, Adani Power..." 
            autoFocus 
            icon="business"
          />

          <div>
            <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-slate-400">description</span>
              Company Overview / Scope
            </label>
            <textarea
              value={form.details}
              onChange={set('details')}
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl p-3 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-200 font-body resize-none"
              placeholder="Brief description of the prospect's operations, requirements, and background..."
            />
          </div>

          <Input 
            label="Official Website" 
            value={form.website} 
            onChange={set('website')} 
            placeholder="https://company.com" 
            icon="language"
          />
        </div>
      </Card>

      {/* 2 — Pipeline & Assignment */}
      <Card>
        <div className="space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="material-symbols-outlined text-primary text-xl">leaderboard</span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Pipeline & Ownership</h2>
              <p className="text-xs text-slate-400">Account ownership and urgency tier</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-slate-400">person</span>
                Assigned BD Lead
              </label>
              <select 
                className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl px-3.5 py-2.5 text-sm text-slate-900 transition-all duration-200"
                value={form.bd_owner_id} 
                onChange={set('bd_owner_id')}
              >
                <option value="">— Unassigned —</option>
                {admins.map(a => <option key={a.id} value={a.id}>{a.name} ({a.email})</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-slate-400">flag</span>
                Priority Grade
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'A', label: 'Priority A', sub: 'High Impact' },
                  { id: 'B', label: 'Priority B', sub: 'Medium' },
                  { id: 'C', label: 'Priority C', sub: 'Standard' },
                ].map(p => {
                  const isSelected = form.priority === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, priority: p.id })); setIsDirty(true); }}
                      className={clsx(
                        'p-2.5 rounded-xl border text-left transition-all duration-200 select-none flex flex-col justify-between',
                        isSelected
                          ? 'bg-primary text-on-primary border-primary shadow-glow scale-[1.02]'
                          : 'bg-surface border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm">{p.id}</span>
                        {isSelected && <span className="material-symbols-outlined text-sm">check</span>}
                      </div>
                      <span className={clsx('text-[10px] font-bold mt-1 opacity-80', isSelected ? 'text-on-primary' : 'text-slate-400')}>
                        {p.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 3 — Target Sectors */}
      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="material-symbols-outlined text-primary text-xl">category</span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Target Sectors</h2>
              <p className="text-xs text-slate-400">Industry verticals applicable to this prospective client</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            {sectors.map(s => {
              const isSelected = form.sectors.includes(s.key);
              const isPrimary = form.sectors[0] === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleSector(s.key)}
                  className={clsx(
                    'group px-3.5 py-2 rounded-xl text-xs font-bold border transition-all duration-200 flex items-center gap-2 select-none',
                    isSelected
                      ? 'bg-primary-light border-primary/40 text-primary shadow-glow scale-[1.02]'
                      : 'bg-surface border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                  )}
                >
                  {s.icon && <span className="material-symbols-outlined text-base">{s.icon}</span>}
                  <span>{s.label}</span>
                  {isSelected ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => makePrimarySector(e, s.key)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') makePrimarySector(e, s.key); }}
                      title={isPrimary ? 'Primary sector — shown on the board under this column' : 'Make this the primary sector'}
                      className={clsx(
                        'flex items-center gap-1 -mr-1 pl-1 rounded-lg transition-colors',
                        isPrimary ? 'text-amber-500' : 'text-primary/30 hover:text-amber-400'
                      )}
                    >
                      <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: isPrimary ? "'FILL' 1" : "'FILL' 0" }}>
                        star
                      </span>
                      {isPrimary && <span className="text-[9px] font-black uppercase tracking-wider">Primary</span>}
                    </span>
                  ) : (
                    <span className="material-symbols-outlined text-sm text-slate-300 opacity-0 group-hover:opacity-100">add</span>
                  )}
                </button>
              );
            })}
          </div>
          {form.sectors.length > 1 && (
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-0.5">
              <span className="material-symbols-outlined text-sm text-slate-300">info</span>
              This client appears on the dashboard board only under its primary (starred) sector.
            </p>
          )}
        </div>
      </Card>

      {/* 4 — Location & Internal Remarks */}
      <Card>
        <div className="space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="material-symbols-outlined text-primary text-xl">pin_drop</span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Location & Internal Remarks</h2>
              <p className="text-xs text-slate-400">Headquarters location and team-facing notes</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input 
              label="City" 
              value={form.city} 
              onChange={set('city')} 
              placeholder="e.g. Bengaluru, Mumbai..." 
              icon="location_city"
            />
            <div>
              <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-slate-400">map</span>
                State
              </label>
              <select 
                className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl px-3.5 py-2.5 text-sm text-slate-900 transition-all duration-200"
                value={form.state} 
                onChange={set('state')}
              >
                <option value="">— Select State —</option>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm text-slate-400">sticky_note_2</span>
              Internal Notes / Strategic Directives
            </label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl p-3 text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-200 font-body resize-none"
              placeholder="Key strategic insights, historical interactions, deal context..."
            />
          </div>
        </div>
      </Card>

      {/* Edit Mode Additions: Status Lifecycle */}
      {isEdit && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="material-symbols-outlined text-primary text-xl">update</span>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Status Lifecycle</h2>
                <p className="text-xs text-slate-400">Manage pipeline progression stage</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">Pipeline Stage</label>
              <select 
                className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl px-3.5 py-2.5 text-sm text-slate-900 transition-all duration-200"
                value={statusForm.status} 
                onChange={(e) => setStatusForm(f => ({ ...f, status: e.target.value }))}
              >
                {BD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {statusForm.status === 'closed_cancelled' && (
              <Input
                label="Reason for Cancellation"
                required
                value={statusForm.status_reason}
                onChange={(e) => setStatusForm(f => ({ ...f, status_reason: e.target.value }))}
                placeholder="Explain why this lead is being cancelled..."
                icon="report"
              />
            )}

            <div className="flex justify-end">
              <Button onClick={handleStatusSave} disabled={statusSaving} variant="secondary" icon="update" isLoading={statusSaving}>
                Update Stage
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Edit Mode: General Contact Details */}
      {isEdit && (
        <Card title="General Contact Channels">
          <div className="space-y-5">
            <ChannelLogTable clientId={currentClientId} ownerType="client" channelType="email" title="Direct Emails" />
            <ChannelLogTable clientId={currentClientId} ownerType="client" channelType="phone" title="Phone Numbers" />
          </div>
        </Card>
      )}

      {/* Edit Mode: Key Stakeholders */}
      {isEdit && (
        <Card title="Persons Involved">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">Stakeholder Contacts ({contacts.length})</h2>
              <Button size="sm" icon="add" onClick={handleAddContact}>Add Person</Button>
            </div>
            {contacts.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No individual contacts linked yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {contacts.map(c => (
                  <ContactCard
                    key={c.id}
                    clientId={currentClientId}
                    contact={c}
                    departments={departments}
                    onUpdated={(updated) => setContacts(cs => cs.map(x => x.id === updated.id ? updated : x))}
                    onDeleted={(cid) => setContacts(cs => cs.filter(x => x.id !== cid))}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Sticky Bottom Actions Bar */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-slate-200/80 shadow-card sticky bottom-6 z-20 backdrop-blur-sm">
        <Button 
          type="button" 
          variant="secondary" 
          icon="arrow_back" 
          onClick={() => navigate('/bd/clients')}
        >
          Cancel
        </Button>
        <div className="flex items-center gap-3">
          <Button 
            onClick={handleSave} 
            disabled={saving} 
            icon={saving ? undefined : 'check'} 
            isLoading={saving}
          >
            {isEdit ? 'Save Changes' : 'Create Client'}
          </Button>
        </div>
      </div>

      <UnsavedChangesModal blocker={blocker} />
    </div>
  );
};

export default BDClientForm;
