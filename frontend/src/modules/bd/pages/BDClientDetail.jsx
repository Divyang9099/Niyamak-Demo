import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import clsx from 'clsx';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Table } from '../../../components/ui/Table';
import { useToast } from '../../../context/ToastContext';
import { useDialog } from '../../../context/DialogContext';
import {
  getClient, getSectors, getDepartments, deleteContact, deleteClient,
  getFollowups, completeFollowup, snoozeFollowup, cancelFollowup, getActivity, clientLogoUrl,
} from '../api/bd.api';
import { BDPriorityChip } from '../components/BDPriorityChip';
import { BDStatusBadge } from '../components/BDStatusBadge';
import { BDInlineStatus } from '../components/BDInlineStatus';
import { BDPipelineStepper } from '../components/BDPipelineStepper';
import { ContactFormModal } from '../components/ContactFormModal';
import { BDTimeline } from '../components/BDTimeline';

const TABS = [
  { key: 'Overview', label: 'Overview', icon: 'info' },
  { key: 'Contacts', label: 'Contacts', icon: 'group', badgeKey: 'contacts' },
  { key: 'Communication Log', label: 'Communication Log', icon: 'chat' },
  { key: 'Follow-ups', label: 'Follow-ups', icon: 'calendar_month', badgeKey: 'followups' },
  { key: 'Activity', label: 'Activity', icon: 'history' },
];

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const AVATAR_COLORS = [
  'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md',
  'bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-md',
  'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md',
  'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md',
  'bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-md',
  'bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md',
];
const colorFor = (name = '') => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];

const FOLLOWUP_STATUS_STYLE = {
  pending: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
  sent: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
  escalated: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
};

const FollowupRow = ({ f, onChange }) => {
  const { showToast } = useToast();
  const [snoozing, setSnoozing] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState('');
  const isOpen = ['pending', 'sent', 'escalated'].includes(f.status);
  const overdue = isOpen && new Date(f.due_at) < new Date();

  const act = async (fn) => {
    try { await fn(); onChange(); }
    catch (err) { showToast(err?.response?.data?.message || 'Action failed', 'error'); }
  };

  return (
    <div className="border border-slate-200/80 rounded-2xl p-4 bg-surface shadow-soft hover:shadow-card transition-all duration-200">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className={clsx('text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border select-none', FOLLOWUP_STATUS_STYLE[f.status])}>
            {f.status}
          </span>
          {overdue && (
            <span className="text-[10px] font-black text-red-600 bg-red-50 border border-red-200/50 dark:bg-red-950/40 dark:text-red-400 px-2 py-0.5 rounded-md uppercase tracking-wider animate-pulse select-none">
              OVERDUE
            </span>
          )}
          <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-slate-400">calendar_today</span>
            {fmtDate(f.due_at)}
          </span>
        </div>
        {isOpen && (
          <div className="flex items-center gap-1.5">
            {snoozing ? (
              <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
                <input type="date" value={snoozeDate} onChange={e => setSnoozeDate(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-surface text-slate-900" />
                <Button size="sm" onClick={() => act(() => snoozeFollowup(f.id, { due_at: new Date(snoozeDate).toISOString() })).then(() => setSnoozing(false))} disabled={!snoozeDate}>Save</Button>
                <Button size="sm" variant="secondary" onClick={() => setSnoozing(false)}>Cancel</Button>
              </div>
            ) : (
              <>
                <Button size="sm" variant="secondary" icon="check" onClick={() => act(() => completeFollowup(f.id))}>Complete</Button>
                <Button size="sm" variant="secondary" icon="schedule" onClick={() => setSnoozing(true)}>Snooze</Button>
                <Button size="sm" variant="danger" icon="close" onClick={() => act(() => cancelFollowup(f.id))}>Cancel</Button>
              </>
            )}
          </div>
        )}
      </div>
      {(f.contact_name || f.channel_value || f.touchpoint_subject || f.note) && (
        <div className="text-xs text-slate-600 mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-1.5 flex-wrap">
          {f.contact_name && <span className="font-bold text-slate-800">{f.contact_name}</span>}
          {f.channel_value && <span className="text-slate-400">({f.channel_value})</span>}
          {f.touchpoint_subject || f.note ? <span className="text-slate-500">— {f.touchpoint_subject || f.note}</span> : null}
        </div>
      )}
    </div>
  );
};

export const BDClientDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirmDialog } = useDialog();

  const [client, setClient] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Overview');
  const [imgError, setImgError] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactBeingEdited, setContactBeingEdited] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await getClient(id);
      setClient(res.data.data);
      setContacts(res.data.data.contacts || []);
      getFollowups({ client_id: id }).then(r => setFollowups(r.data.data || [])).catch(() => {});
    } catch {
      showToast('Failed to load client', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getSectors({ active_only: 'true' }).then(r => setSectors(r.data.data || [])).catch(() => {});
    getDepartments({ active_only: 'true' }).then(r => setDepartments(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'Follow-ups') getFollowups({ client_id: id }).then(r => setFollowups(r.data.data || [])).catch(() => {});
    if (tab === 'Activity') getActivity({ client_id: id }).then(r => setActivity(r.data.data || [])).catch(() => {});
  }, [tab, id]);

  const openAddContact = () => { setContactBeingEdited(null); setContactModalOpen(true); };
  const openEditContact = (contact) => { setContactBeingEdited(contact); setContactModalOpen(true); };

  const handleContactSaved = (saved, isEdit) => {
    setContacts(cs => isEdit ? cs.map(x => x.id === saved.id ? saved : x) : [...cs, saved]);
  };

  const handleDeleteContact = async (contact) => {
    if (!(await confirmDialog({
      title: 'Remove contact',
      message: `Remove ${contact.name}? Their logged history is kept, but they'll no longer appear on this client.`,
      danger: true,
      confirmLabel: 'Remove',
    }))) return;
    try {
      await deleteContact(contact.id);
      setContacts(cs => cs.filter(x => x.id !== contact.id));
      load(true);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to remove contact', 'error');
    }
  };

  const contactColumns = [
    {
      header: 'Name',
      cell: (c) => (
        <button type="button" onClick={() => openEditContact(c)} className="flex items-center gap-3 text-left group">
          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
            {(c.name || '?').trim().charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate group-hover:text-primary transition-colors">{c.name || 'Unnamed contact'}</p>
            {c.designation && <p className="text-[11px] text-slate-400 truncate">{c.designation}</p>}
          </div>
        </button>
      ),
    },
    {
      header: 'Department',
      cell: (c) => <span className="text-slate-600">{departments.find(d => d.key === c.department)?.label || '—'}</span>,
    },
    {
      header: 'Role',
      cell: (c) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          {c.is_decision_maker && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Decision maker</span>
          )}
          {c.is_primary && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary-light border border-primary/20 px-2 py-0.5 rounded-full">Primary</span>
          )}
          {!c.is_decision_maker && !c.is_primary && <span className="text-slate-300">—</span>}
        </div>
      ),
    },
    {
      header: 'Actions',
      cell: (c) => (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon="edit" onClick={() => openEditContact(c)} title="Edit" />
          <Button size="sm" variant="danger" icon="delete" onClick={() => handleDeleteContact(c)} title="Remove" />
        </div>
      ),
    },
  ];

  const handleDelete = async () => {
    if (!(await confirmDialog({
      title: 'Delete Client',
      message: `Delete "${client.name}"? This removes it from the pipeline — contacts, touchpoints, and follow-ups are kept but no longer reachable from this list.`,
      danger: true,
      confirmLabel: 'Delete',
    }))) return;
    try {
      await deleteClient(id);
      showToast('Client deleted');
      navigate('/bd/clients');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to delete client', 'error');
    }
  };

  if (loading) return <div className="py-24 text-center text-slate-400 text-sm">Loading…</div>;
  if (!client) return <EmptyState icon="error" title="Client not found" />;

  const sectorLabels = (client.sectors || []).map(key => sectors.find(s => s.key === key)?.label || key);

  const overdue = client.next_follow_up_at && new Date(client.next_follow_up_at) < new Date();
  const dueSoonDays = client.next_follow_up_at ? Math.ceil((new Date(client.next_follow_up_at).getTime() - Date.now()) / 86400000) : null;
  const dueSoon = !overdue && dueSoonDays !== null && dueSoonDays <= 2;

  const badgeCounts = {
    contacts: contacts.length,
    followups: followups.length,
  };

  return (
    <div className="space-y-6 animate-fade-in pb-24">
      {/* Top Breadcrumb link */}
      <div>
        <Link 
          to="/bd/clients" 
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-slate-200 text-xs font-bold text-slate-600 hover:text-primary hover:border-primary/40 hover:bg-primary-light/40 transition-all duration-200 shadow-soft"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span> Back to Clients
        </Link>
      </div>

      {/* Hero Profile Card */}
      <div className="bg-surface border border-slate-200/80 rounded-2xl p-6 shadow-soft flex flex-wrap items-center justify-between gap-6 relative overflow-hidden">
        <div className="flex items-center gap-5">
          {client.logo_url && !imgError ? (
            <img 
              src={clientLogoUrl(client.id)} 
              onError={() => setImgError(true)} 
              className="w-16 h-16 rounded-2xl object-contain p-1.5 bg-surface border border-slate-200 shadow-sm"
              alt="" 
            />
          ) : (
            <div className={clsx('w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0 select-none shadow-card', colorFor(client.name))}>
              {(client.name || '?')[0].toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{client.name}</h1>
              <div className="flex items-center gap-2">
                <BDPriorityChip priority={client.priority} />
                <BDInlineStatus 
                  client={client} 
                  onChanged={(updated) => { 
                    setClient(c => ({ ...c, ...updated })); 
                    load(true); 
                  }} 
                />
              </div>
            </div>
            {([client.city, client.state].filter(Boolean).length > 0 || client.website) && (
              <div className="flex items-center gap-4 mt-2 text-xs font-semibold text-slate-500 flex-wrap">
                {[client.city, client.state].filter(Boolean).length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm text-slate-400">location_on</span>
                    {[client.city, client.state].filter(Boolean).join(', ')}
                  </span>
                )}
                {client.website && (
                  <a 
                    href={client.website.startsWith('http') ? client.website : `https://${client.website}`} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex items-center gap-1 text-primary hover:underline font-semibold"
                  >
                    <span className="material-symbols-outlined text-sm">link</span>
                    {client.website.replace(/^https?:\/\//, '')}
                    <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="secondary" icon="edit" onClick={() => navigate(`/bd/clients/${id}/edit`)}>Edit</Button>
          <Button variant="danger" icon="delete" onClick={handleDelete}>Delete</Button>
        </div>
      </div>

      {/* Interactive Pipeline Lifecycle Stepper */}
      <BDPipelineStepper
        client={client}
        onClientChanged={(updated) => {
          setClient(c => ({ ...c, ...updated }));
          load(true);
        }}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-slate-200/80 rounded-2xl p-5 shadow-soft hover:shadow-card transition-all duration-200 flex items-center justify-between">
          <div>
            <p className="text-3xl font-black text-slate-900 tracking-tight">{client.contact_count || 0}</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1">Key Contacts</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center dark:bg-blue-950/30 dark:text-blue-400">
            <span className="material-symbols-outlined text-2xl">people</span>
          </div>
        </div>

        <div className="bg-surface border border-slate-200/80 rounded-2xl p-5 shadow-soft hover:shadow-card transition-all duration-200 flex items-center justify-between">
          <div>
            <p className="text-3xl font-black text-slate-900 tracking-tight">{client.touchpoint_count || 0}</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mt-1">Touchpoints</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center dark:bg-violet-950/30 dark:text-violet-400">
            <span className="material-symbols-outlined text-2xl">forum</span>
          </div>
        </div>

        <div className={clsx(
          'bg-surface border rounded-2xl p-5 shadow-soft hover:shadow-card transition-all duration-200 flex items-center justify-between',
          overdue 
            ? 'border-red-200 bg-gradient-to-br from-red-500/[0.03] to-surface dark:border-red-900/50' 
            : dueSoon 
              ? 'border-amber-200 bg-gradient-to-br from-amber-500/[0.03] to-surface dark:border-amber-900/50' 
              : 'border-slate-200/80'
        )}>
          <div>
            <p className={clsx(
              'text-2xl font-black tracking-tight',
              overdue ? 'text-red-600 animate-pulse' : dueSoon ? 'text-amber-600' : 'text-slate-900'
            )}>
              {fmtDate(client.next_follow_up_at)}
            </p>
            <p className={clsx(
              'text-[11px] font-bold uppercase tracking-wider mt-1',
              overdue ? 'text-red-500 font-extrabold' : dueSoon ? 'text-amber-500 font-extrabold' : 'text-slate-400'
            )}>
              {overdue ? 'Overdue Follow-up' : dueSoon ? `Due in ${Math.max(dueSoonDays, 0)}d` : 'Next Follow-up'}
            </p>
          </div>
          <div className={clsx(
            'w-12 h-12 rounded-xl flex items-center justify-center',
            overdue 
              ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400' 
              : dueSoon 
                ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' 
                : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
          )}>
            <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: overdue ? "'FILL' 1" : "'FILL' 0" }}>
              {overdue ? 'warning' : 'calendar_today'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto pb-0.5">
        {TABS.map(t => {
          const isActive = tab === t.key;
          const count = t.badgeKey ? badgeCounts[t.badgeKey] : null;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all duration-200 -mb-px rounded-t-xl select-none',
                isActive 
                  ? 'border-primary text-primary bg-primary-light/30' 
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              )}
            >
              <span className="material-symbols-outlined text-base leading-none">{t.icon}</span>
              <span>{t.label}</span>
              {typeof count === 'number' && count > 0 && (
                <span className={clsx(
                  'text-[10px] font-extrabold px-1.5 py-0.5 rounded-full',
                  isActive ? 'bg-primary text-on-primary' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {tab === 'Overview' && (
        <div className="space-y-4">
          <Card>
            <div className="space-y-6">
              {client.details && (
                <div className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Company Description</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed">{client.details}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-800/20">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    <span className="material-symbols-outlined text-xs">person</span> BD Owner
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{client.bd_owner_name || '—'}</p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-800/20">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    <span className="material-symbols-outlined text-xs">language</span> Website
                  </div>
                  {client.website ? (
                    <a 
                      href={client.website.startsWith('http') ? client.website : `https://${client.website}`} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-sm font-bold text-primary hover:underline truncate block"
                    >
                      {client.website.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">—</p>
                  )}
                </div>

                <div className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-800/20">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    <span className="material-symbols-outlined text-xs">pin_drop</span> Location
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{[client.city, client.state].filter(Boolean).join(', ') || '—'}</p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-800/20">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    <span className="material-symbols-outlined text-xs">calendar_add_on</span> Added On
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{fmtDate(client.created_at)}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-xs">domain</span> Target Sectors
                </p>
                <div className="flex flex-wrap gap-2">
                  {sectorLabels.length ? sectorLabels.map((l, i) => (
                    <span key={l} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-primary-light border border-primary/20 text-primary shadow-soft">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      {l}
                      {i === 0 && sectorLabels.length > 1 && (
                        <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 border-l border-primary/20 pl-1.5 ml-0.5">Primary</span>
                      )}
                    </span>
                  )) : <span className="text-slate-400 text-xs">—</span>}
                </div>
              </div>

              {client.notes && (
                <div className="p-4 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">sticky_note_2</span> Additional Notes
                  </p>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{client.notes}</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === 'Contacts' && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Direct Key People ({contacts.length})</h2>
              <Button size="sm" icon="add" onClick={openAddContact}>Add Person</Button>
            </div>
            <Table
              columns={contactColumns}
              data={contacts}
              empty={{
                icon: 'group',
                title: 'No contacts recorded yet',
                description: 'Add the people you deal with at this client to start logging outreach.',
                action: <Button size="sm" icon="add" onClick={openAddContact}>Add Person</Button>,
              }}
            />
          </div>
        </Card>
      )}

      {tab === 'Communication Log' && (
        <Card>
          <BDTimeline clientId={id} onActivityChanged={() => load(true)} />
        </Card>
      )}

      {tab === 'Follow-ups' && (
        <Card>
          {followups.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No follow-ups for this client yet.</p>
          ) : (
            <div className="space-y-3">
              {followups.map(f => (
                <FollowupRow key={f.id} f={f} onChange={() => getFollowups({ client_id: id }).then(r => setFollowups(r.data.data || []))} />
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'Activity' && (
        <Card>
          {activity.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No activity recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {activity.map(a => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/40 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-slate-700 dark:text-slate-300">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{a.user_name || 'System'}</span>
                      {' '}{a.action.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </div>
                  <span className="text-slate-400 text-[11px] font-semibold">{fmtDateTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <ContactFormModal
        isOpen={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        clientId={id}
        contact={contactBeingEdited}
        departments={departments}
        onSaved={handleContactSaved}
        onActivityChanged={() => load(true)}
      />
    </div>
  );
};

export default BDClientDetail;
