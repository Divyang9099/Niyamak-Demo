import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../context/ToastContext';
import { useDialog } from '../../../context/DialogContext';
import { getTouchpoints, createTouchpoint, getContacts, deleteTouchpoint } from '../api/bd.api';
import { BD_INTERACTION_TYPES, BD_RESPONSE_STATUSES } from '../../../utils/constants';
import { LogResponseModal } from './LogResponseModal';
import { EditTouchpointModal } from './EditTouchpointModal';
import { FilterDropdown } from './BDFilterBar';

const ICON = { 
  email: 'mail', 
  call: 'call', 
  linkedin: 'work', 
  whatsapp: 'chat', 
  meeting: 'groups', 
  site_visit: 'location_on', 
  other: 'more_horiz' 
};

const RING = {
  email: 'bg-blue-50 text-blue-600 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-400 dark:ring-blue-900/50',
  call: 'bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900/50',
  linkedin: 'bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400 dark:ring-indigo-900/50',
  whatsapp: 'bg-teal-50 text-teal-600 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-400 dark:ring-teal-900/50',
  meeting: 'bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900/50',
  site_visit: 'bg-purple-50 text-purple-600 ring-purple-100 dark:bg-purple-950/40 dark:text-purple-400 dark:ring-purple-900/50',
  other: 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700',
};

const RESPONSE_BADGE_STYLE = {
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
  negative: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  bounced: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50',
  no_response: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50',
};

const RESPONSE_LABEL = {
  positive: 'Positive Response', 
  negative: 'Negative / Not Interested', 
  neutral: 'Neutral Response', 
  no_response: 'No Response / Closed', 
  bounced: 'Bounced',
};

const daysSince = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

/**
 * Comprehensive Modal to log any new touchpoint (Meeting, Call, Email, Site visit, etc.)
 */
const CreateTouchpointModal = ({ isOpen, onClose, clientId, onLogged }) => {
  const { showToast } = useToast();
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({
    contact_id: '',
    interaction_type: 'call',
    direction: 'outbound',
    subject: '',
    summary: '',
    response_status: 'awaiting',
    response_summary: '',
    outcome: '',
    remark: '',
    next_follow_up_at: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && clientId) {
      getContacts(clientId).then(r => setContacts(r.data.data || [])).catch(() => {});
      setForm({
        contact_id: '',
        interaction_type: 'call',
        direction: 'outbound',
        subject: '',
        summary: '',
        response_status: 'awaiting',
        response_summary: '',
        outcome: '',
        remark: '',
        next_follow_up_at: '',
      });
    }
  }, [isOpen, clientId]);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await createTouchpoint({
        client_id: clientId,
        contact_id: form.contact_id || undefined,
        interaction_type: form.interaction_type,
        direction: form.direction,
        subject: form.subject || undefined,
        summary: form.summary || undefined,
        response_status: form.response_status,
        response_summary: form.response_status !== 'awaiting' ? form.response_summary || undefined : undefined,
        outcome: form.outcome || undefined,
        remark: form.remark || undefined,
        next_follow_up_at: form.response_status === 'awaiting' && form.next_follow_up_at ? form.next_follow_up_at : undefined,
      });
      showToast(
        form.response_status === 'awaiting'
          ? `Touchpoint logged — follow-up scheduled for ${new Date(res.data.data.followup?.due_at || res.data.data.next_follow_up_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
          : 'Touchpoint logged successfully'
      );
      onLogged?.(res.data.data);
      onClose();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to log touchpoint', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Log Communication Touchpoint"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} icon="check" isLoading={saving}>
            {saving ? 'Logging…' : 'Log Touchpoint'}
          </Button>
        </div>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
        {contacts.length > 0 && (
          <div>
            <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">
              Contact Person (Optional)
            </label>
            <select
              value={form.contact_id}
              onChange={set('contact_id')}
              className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl px-4 py-2.5 text-sm text-slate-900 transition-all duration-200"
            >
              <option value="">— General Client Outreach —</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.designation ? `(${c.designation})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">Channel / Type</label>
            <select
              value={form.interaction_type}
              onChange={set('interaction_type')}
              className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl px-3 py-2.5 text-sm text-slate-900 transition-all duration-200"
            >
              {BD_INTERACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">Direction</label>
            <select
              value={form.direction}
              onChange={set('direction')}
              className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl px-3 py-2.5 text-sm text-slate-900 transition-all duration-200"
            >
              <option value="outbound">Outbound (We reached out)</option>
              <option value="inbound">Inbound (They contacted us)</option>
            </select>
          </div>
        </div>

        <Input 
          label="Subject / Purpose" 
          value={form.subject} 
          onChange={set('subject')} 
          placeholder="e.g. Introductory discovery call" 
          icon="label"
        />

        <div>
          <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">Summary / Notes</label>
          <textarea
            value={form.summary}
            onChange={set('summary')}
            rows={2}
            className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl p-3 text-sm text-slate-900 resize-none transition-all duration-200"
            placeholder="Key discussion points or meeting overview..."
          />
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
          <div>
            <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">Response Status</label>
            <select
              value={form.response_status}
              onChange={set('response_status')}
              className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl px-4 py-2.5 text-sm text-slate-900 transition-all duration-200"
            >
              <option value="awaiting">Awaiting Response</option>
              {BD_RESPONSE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {form.response_status === 'awaiting' && (
            <div>
              <Input
                label="Next Follow-up Date (optional)"
                type="date"
                value={form.next_follow_up_at}
                onChange={set('next_follow_up_at')}
                icon="event"
              />
              <p className="text-[11px] text-slate-400 mt-1">Leave blank to auto-schedule using the default follow-up settings.</p>
            </div>
          )}

          {form.response_status !== 'awaiting' && (
            <div>
              <label className="text-xs font-semibold tracking-wide text-slate-600 mb-1.5 block">Response Details</label>
              <textarea
                value={form.response_summary}
                onChange={set('response_summary')}
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl p-3 text-sm text-slate-900 resize-none transition-all duration-200"
                placeholder="What they responded..."
              />
            </div>
          )}

          <Input 
            label="Next Step / Outcome" 
            value={form.outcome} 
            onChange={set('outcome')} 
            placeholder="e.g. Send technical brochure" 
            icon="flag"
          />
        </div>
      </form>
    </Modal>
  );
};

const CHANNEL_OPTIONS = [
  { value: '', label: 'All Channels' },
  ...BD_INTERACTION_TYPES.map(t => ({ value: t.value, label: t.label }))
];

const DIRECTION_OPTIONS = [
  { value: '', label: 'Any Direction' },
  { value: 'outbound', label: 'Outbound' },
  { value: 'inbound', label: 'Inbound' }
];

const RESPONSE_OPTIONS = [
  { value: '', label: 'Any Response' },
  { value: 'awaiting', label: 'Awaiting Reply' },
  ...BD_RESPONSE_STATUSES.map(s => ({ value: s.value, label: s.label }))
];

/**
 * End-to-End Communication Log with interactive timeline cards, direct response logging, and edit actions.
 */
export const BDTimeline = ({ clientId, onActivityChanged }) => {
  const { showToast } = useToast();
  const { confirmDialog } = useDialog();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ interaction_type: '', direction: '', response_status: '', search: '' });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [replyTouchpoint, setReplyTouchpoint] = useState(null);
  const [editTouchpoint, setEditTouchpoint] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  const handleDeleteTouchpoint = async (touchpoint) => {
    setOpenMenuId(null);
    if (!(await confirmDialog({
      title: 'Delete Timeline Log',
      message: 'Are you sure you want to delete this communication log? This will revert any automated follow-ups and counters related to it.',
      danger: true,
      confirmLabel: 'Delete',
    }))) return;

    try {
      await deleteTouchpoint(touchpoint.id);
      showToast('Timeline log deleted');
      handleLoggedOrUpdated();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to delete touchpoint', 'error');
    }
  };

  const load = useCallback(async (p = 1) => {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = await getTouchpoints(clientId, {
        interaction_type: filters.interaction_type || undefined,
        direction: filters.direction || undefined,
        response_status: filters.response_status || undefined,
        page: p, limit: 30,
      });
      setRows(prev => p === 1 ? res.data.data : [...prev, ...res.data.data]);
      setTotal(res.data.pagination?.total || 0);
      setPage(p);
    } catch {
      showToast('Failed to load communication log', 'error');
    } finally {
      setLoading(false);
    }
  }, [clientId, filters, showToast]);

  useEffect(() => { load(1); }, [load]);

  const handleLoggedOrUpdated = () => {
    load(1);
    onActivityChanged?.();
  };

  const filteredRows = rows.filter(r => {
    if (!filters.search) return true;
    const q = filters.search.toLowerCase();
    return (
      (r.subject && r.subject.toLowerCase().includes(q)) ||
      (r.summary && r.summary.toLowerCase().includes(q)) ||
      (r.contact_name && r.contact_name.toLowerCase().includes(q)) ||
      (r.channel_value && r.channel_value.toLowerCase().includes(q)) ||
      (r.response_summary && r.response_summary.toLowerCase().includes(q)) ||
      (r.outcome && r.outcome.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-5">
      {/* Top Filter & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-slate-200/80 shadow-soft">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <span className={`material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none transition-colors duration-200 ${
              isSearchFocused ? 'text-primary' : 'text-slate-400'
            }`}>
              search
            </span>
            <input
              type="text"
              value={filters.search}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              placeholder="Search logs..."
              className="w-full pl-9 pr-9 py-2 bg-surface border border-slate-200 text-slate-900 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all shadow-soft"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => setFilters(f => ({ ...f, search: '' }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center p-0.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="material-symbols-outlined text-xs">close</span>
              </button>
            )}
          </div>

          <FilterDropdown
            label="Channel"
            icon="chat"
            placeholder="All Channels"
            options={CHANNEL_OPTIONS}
            value={filters.interaction_type}
            onChange={val => setFilters(f => ({ ...f, interaction_type: val }))}
          />

          <FilterDropdown
            label="Direction"
            icon="sync_alt"
            placeholder="Any Direction"
            options={DIRECTION_OPTIONS}
            value={filters.direction}
            onChange={val => setFilters(f => ({ ...f, direction: val }))}
          />

          <FilterDropdown
            label="Response"
            icon="quickreply"
            placeholder="Any Response"
            options={RESPONSE_OPTIONS}
            value={filters.response_status}
            onChange={val => setFilters(f => ({ ...f, response_status: val }))}
          />
        </div>

        <div className="shrink-0">
          <Button size="sm" icon="add" onClick={() => setCreateOpen(true)}>
            Log Touchpoint
          </Button>
        </div>
      </div>

      {/* Timeline List */}
      {loading && rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12 font-medium">Loading communication history…</p>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <span className="material-symbols-outlined text-4xl text-slate-300">chat_bubble_outline</span>
          <p className="text-sm text-slate-400 font-semibold">No communication logged yet matching your filters.</p>
          <Button size="sm" icon="add" onClick={() => setCreateOpen(true)}>Log First Touchpoint</Button>
        </div>
      ) : (
        <div className="relative animate-fade-in pl-2 sm:pl-4">
          {/* Vertical Connecting Line */}
          <div className="absolute left-6 sm:left-8 top-3 bottom-3 w-0.5 bg-slate-200/80 dark:bg-slate-800" aria-hidden="true" />

          <div className="space-y-4">
            {filteredRows.map(t => {
              const isAwaiting = t.response_status === 'awaiting';
              return (
                <div key={t.id} className="relative pl-12 sm:pl-14 group">
                  {/* Circular Interaction Emblem */}
                  <div className={clsx(
                    'absolute left-0 top-1 w-9 h-9 rounded-2xl flex items-center justify-center ring-4 ring-surface shadow-soft transition-transform group-hover:scale-110',
                    RING[t.interaction_type] || RING.other
                  )}>
                    <span className="material-symbols-outlined text-base">
                      {ICON[t.interaction_type] || 'circle'}
                    </span>
                  </div>

                  {/* Timeline Card */}
                  <div className={clsx(
                    'bg-surface border rounded-2xl p-4 transition-all duration-200 shadow-soft hover:shadow-card',
                    isAwaiting 
                      ? 'border-amber-200/80 bg-gradient-to-br from-amber-500/[0.015] to-surface dark:border-amber-900/50' 
                      : 'border-slate-200/80'
                  )}>
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-500">
                          {new Date(t.occurred_at).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {t.direction}
                        </span>
                        {t.is_corrected && (
                          <span className="text-[9px] font-black uppercase text-amber-600 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 px-1.5 py-0.5 rounded">
                            Corrected
                          </span>
                        )}
                      </div>

                      <div className="relative flex items-center gap-2">
                        {isAwaiting && (
                          <Button 
                            size="sm" 
                            icon="reply" 
                            onClick={() => setReplyTouchpoint(t)}
                            className="!py-1 !px-2.5 !text-xs !bg-amber-500 hover:!bg-amber-600 !text-white !shadow-sm"
                          >
                            Log Reply
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
                          className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-base">more_vert</span>
                        </button>

                        {openMenuId === t.id && (
                          <div className="absolute right-0 top-8 z-20 bg-surface border border-slate-200 rounded-xl shadow-pop py-1 w-36 animate-scale-in">
                            {isAwaiting && (
                              <button
                                type="button"
                                onClick={() => { setReplyTouchpoint(t); setOpenMenuId(null); }}
                                className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <span className="material-symbols-outlined text-sm text-primary">reply</span>
                                Log Reply
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setEditTouchpoint(t); setOpenMenuId(null); }}
                              className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <span className="material-symbols-outlined text-sm">edit</span>
                              Edit / Correct
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTouchpoint(t)}
                              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-red-50 text-red-600 flex items-center gap-2 border-t border-slate-100"
                            >
                              <span className="material-symbols-outlined text-sm text-red-500">delete</span>
                              Delete Log
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Contact & Channel Badges */}
                    {(t.contact_name || t.channel_value) && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {t.contact_name && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-primary-light/50 text-primary border border-primary/20">
                            <span className="material-symbols-outlined text-xs">person</span>
                            {t.contact_name}
                          </span>
                        )}
                        {t.channel_value && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                            <span className="material-symbols-outlined text-xs text-slate-400">
                              {ICON[t.interaction_type] || 'link'}
                            </span>
                            {t.channel_value}
                          </span>
                        )}
                        {t.created_by_name && (
                          <span className="text-[11px] text-slate-400 font-medium">
                            Initiated by <strong className="text-slate-600">{t.created_by_name}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Subject & Summary */}
                    {t.subject && (
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-2.5">
                        {t.subject}
                      </h4>
                    )}
                    {t.summary && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed whitespace-pre-wrap">
                        {t.summary}
                      </p>
                    )}

                    {/* Response Sub-Card */}
                    {isAwaiting ? (
                      <div className="mt-3 p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                            Awaiting reply · {daysSince(t.occurred_at)} days since outreach
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyTouchpoint(t)}
                          className="text-xs font-bold text-amber-700 dark:text-amber-300 hover:underline flex items-center gap-1 shrink-0"
                        >
                          <span className="material-symbols-outlined text-sm">reply</span> Log Response
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className={clsx(
                            'text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border select-none',
                            RESPONSE_BADGE_STYLE[t.response_status] || RESPONSE_BADGE_STYLE.neutral
                          )}>
                            ↳ {RESPONSE_LABEL[t.response_status] || t.response_status}
                          </span>
                          {t.response_at && (
                            <span className="text-[11px] text-slate-400 font-semibold">
                              Replied {new Date(t.response_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                            </span>
                          )}
                        </div>

                        {t.response_summary && (
                          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                            {t.response_summary}
                          </p>
                        )}

                        {t.outcome && (
                          <div className="flex items-center gap-1.5 pt-1 text-xs text-primary font-bold">
                            <span className="material-symbols-outlined text-sm">flag</span>
                            <span>Outcome: {t.outcome}</span>
                          </div>
                        )}

                        {t.remark && (
                          <p className="text-[11px] text-slate-400 italic pt-0.5">
                            Note: {t.remark}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredRows.length < total && (
            <div className="text-center mt-6">
              <Button size="sm" variant="ghost" onClick={() => load(page + 1)} disabled={loading}>
                {loading ? 'Loading…' : 'Load More Timeline Items'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <CreateTouchpointModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        clientId={clientId}
        onLogged={handleLoggedOrUpdated}
      />

      <LogResponseModal
        isOpen={!!replyTouchpoint}
        onClose={() => setReplyTouchpoint(null)}
        touchpoint={replyTouchpoint}
        onLogged={handleLoggedOrUpdated}
      />

      <EditTouchpointModal
        isOpen={!!editTouchpoint}
        onClose={() => setEditTouchpoint(null)}
        touchpoint={editTouchpoint}
        onUpdated={handleLoggedOrUpdated}
      />
    </div>
  );
};

export default BDTimeline;
