import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../context/ToastContext';
import { useDialog } from '../../../context/DialogContext';
import { getChannels, createChannel, updateChannel, deleteChannel, getTouchpoints } from '../api/bd.api';
import { LogOutreachModal } from './LogOutreachModal';
import { LogResponseModal } from './LogResponseModal';

// One component drives Email / Phone / LinkedIn / WhatsApp — only the column
// labels change (BD_MODULE_PLAN.md §7.2/D3).
const LABELS = {
  email:    { address: 'Email address',  sent: 'Sent',      date: 'Sent date', reply: 'Reply',    icon: 'mail',  placeholder: 'name@company.com' },
  phone:    { address: 'Phone number',   sent: 'Called',    date: 'Call date', reply: 'Answered', icon: 'call',  placeholder: '98765 43210' },
  linkedin: { address: 'LinkedIn profile', sent: 'Connected', date: 'Sent date', reply: 'Replied', icon: 'work', placeholder: 'linkedin.com/in/… or lnkd.in/…' },
  whatsapp: { address: 'WhatsApp number', sent: 'Sent',     date: 'Sent date', reply: 'Reply',    icon: 'chat',  placeholder: '98765 43210' },
};

const STATUS_LABEL = {
  not_contacted:     '—',
  contacted:         'Contacted',
  awaiting_response: 'Awaiting reply',
  responded:         'Responded',
  bounced:           'Bounced',
  unreachable:       'Unreachable',
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

// Small custom-styled checkbox (not a raw browser checkbox) with a check-draw
// animation on tick — BD_MODULE_PLAN.md §14.4.
const CheckCell = ({ checked, pending, disabled, onClick, title }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={clsx(
      'w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all shrink-0',
      disabled && 'opacity-40 cursor-not-allowed border-slate-200',
      !disabled && checked && 'bg-emerald-500 border-emerald-500 hover:bg-emerald-600',
      !disabled && !checked && pending && 'border-amber-400 bg-amber-50 animate-pulse',
      !disabled && !checked && !pending && 'border-slate-300 hover:border-primary bg-surface'
    )}
  >
    {checked && (
      <span className="material-symbols-outlined text-white text-sm animate-scale-in" style={{ fontVariationSettings: "'FILL' 1" }}>
        check
      </span>
    )}
  </button>
);

const HistoryModal = ({ isOpen, onClose, channel }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !channel) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getTouchpoints(channel.client_id, { channel_id: channel.id, limit: 50 });
        if (!cancelled) setRows(res.data.data || []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, channel]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`History — ${channel?.value || ''}`}>
      {loading ? (
        <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">No outreach logged on this address yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(t => (
            <div key={t.id} className="border border-slate-100 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{new Date(t.occurred_at).toLocaleString('en-IN')}</span>
                {t.is_corrected && <span className="text-amber-600 font-semibold">corrected</span>}
              </div>
              {t.subject && <p className="text-sm font-semibold text-slate-800 mt-1">{t.subject}</p>}
              {t.summary && <p className="text-xs text-slate-500 mt-0.5">{t.summary}</p>}
              <div className="mt-2 pl-3 border-l-2 border-slate-100">
                {t.response_status === 'awaiting' ? (
                  <p className="text-xs text-amber-600 font-semibold">Awaiting reply</p>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-slate-700">↳ {STATUS_LABEL[t.response_status] || t.response_status}</p>
                    {t.response_summary && <p className="text-xs text-slate-500 mt-0.5">{t.response_summary}</p>}
                  </>
                )}
                {t.remark && <p className="text-[11px] text-slate-400 italic mt-1">{t.remark}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

/**
 * The checkbox grid you get when you tick "Sent" / "Reply" on a client's or
 * contact's channels. See BD_MODULE_PLAN.md §7.2 — this is D2/D3 made visible:
 * the row shows the ROLLUP, ticking a box writes a real touchpoint underneath.
 */
export const ChannelLogTable = ({ clientId, ownerType, contactId = null, channelType, title, onActivityChanged }) => {
  const { showToast } = useToast();
  const { confirmDialog } = useDialog();
  const L = LABELS[channelType];

  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [openMenuId, setOpenMenuId] = useState(null);

  const [outreachChannel, setOutreachChannel] = useState(null);
  const [responseChannel, setResponseChannel] = useState(null);
  const [historyChannel, setHistoryChannel] = useState(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = await getChannels(clientId, { owner_type: ownerType, contact_id: contactId || undefined, channel_type: channelType });
      setChannels(res.data.data || []);
    } catch {
      showToast('Failed to load channels', 'error');
    } finally {
      setLoading(false);
    }
  }, [clientId, ownerType, contactId, channelType, showToast]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newValue.trim()) return;
    try {
      await createChannel(clientId, {
        owner_type: ownerType, contact_id: contactId || undefined, channel_type: channelType,
        value: newValue.trim(), label: newLabel.trim() || undefined, sort_order: channels.length,
      });
      setNewValue(''); setNewLabel(''); setAdding(false);
      load();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to add', 'error');
    }
  };

  const startEdit = (ch) => { setEditingId(ch.id); setEditValue(ch.value); setEditLabel(ch.label || ''); setOpenMenuId(null); };
  const saveEdit = async (ch) => {
    try {
      await updateChannel(ch.id, { value: editValue.trim(), label: editLabel.trim() || null });
      setEditingId(null);
      load();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to update', 'error');
    }
  };

  const handleDelete = async (ch) => {
    setOpenMenuId(null);
    if (!(await confirmDialog({ title: 'Remove address', message: `Remove "${ch.value}"? Its history is kept, but it will no longer appear here.`, danger: true, confirmLabel: 'Remove' }))) return;
    try {
      await deleteChannel(ch.id);
      load();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to remove', 'error');
    }
  };

  const withClientId = (ch) => ({ ...ch, client_id: clientId });

  return (
    <div>
      {title && <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{title}</h4>}

      {/* Desktop table */}
      <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              <th className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{L.address}</th>
              <th className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Label</th>
              <th className="text-center px-2 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{L.sent}</th>
              <th className="text-left px-2 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{L.date}</th>
              <th className="text-center px-2 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{L.reply}</th>
              <th className="text-left px-2 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Response</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-6 text-slate-400 text-xs">Loading…</td></tr>
            ) : channels.length === 0 && !adding ? (
              <tr><td colSpan={7} className="text-center py-6 text-slate-300 text-xs">No {L.address.toLowerCase()}s yet</td></tr>
            ) : channels.map(ch => (
              <tr key={ch.id} className="group hover:bg-slate-50/40">
                {editingId === ch.id ? (
                  <td colSpan={6} className="px-3 py-2">
                    <div className="flex gap-2">
                      <input value={editValue} onChange={e => setEditValue(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" placeholder={L.placeholder} autoFocus onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(ch); } }} />
                      <input value={editLabel} onChange={e => setEditLabel(e.target.value)} className="w-28 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" placeholder="Label" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(ch); } }} />
                      <Button type="button" size="sm" onClick={() => saveEdit(ch)}>Save</Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-2.5 text-slate-800 font-medium truncate max-w-[220px]" title={ch.value}>{ch.value}</td>
                    <td className="px-3 py-2.5 text-slate-400 text-xs">{ch.label || '—'}</td>
                    <td className="px-2 py-2.5 text-center">
                      <div className="flex justify-center">
                        <CheckCell
                          checked={ch.outreach_count > 0}
                          onClick={() => setOutreachChannel(withClientId(ch))}
                          title={ch.outreach_count > 0 ? `Log another outreach (${ch.outreach_count} so far)` : 'Log outreach'}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-slate-500">{fmtDate(ch.last_outreach_at)}</td>
                    <td className="px-2 py-2.5 text-center">
                      <div className="flex justify-center">
                        <CheckCell
                          checked={!!ch.last_response_at && !ch.latest_open_touchpoint_id}
                          pending={!!ch.latest_open_touchpoint_id}
                          disabled={ch.outreach_count === 0}
                          onClick={() => ch.latest_open_touchpoint_id
                            ? setResponseChannel(withClientId(ch))
                            : showToast(ch.outreach_count === 0 ? 'Log outreach first' : 'No reply awaiting on this address', 'error')}
                          title={ch.latest_open_touchpoint_id ? 'Log the reply' : ch.last_response_at ? 'Already replied — see history' : 'Log outreach first'}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-xs">
                      <span className={clsx(
                        'font-semibold',
                        ch.channel_status === 'responded' && 'text-emerald-600',
                        ch.channel_status === 'bounced' && 'text-red-600',
                        ch.channel_status === 'unreachable' && 'text-slate-400',
                        ch.channel_status === 'awaiting_response' && 'text-amber-600',
                        (ch.channel_status === 'not_contacted' || ch.channel_status === 'contacted') && 'text-slate-400',
                      )}>
                        {STATUS_LABEL[ch.channel_status] || ch.channel_status}
                      </span>
                    </td>
                    <td className="px-1 relative">
                      <button type="button" onClick={() => setOpenMenuId(openMenuId === ch.id ? null : ch.id)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-slate-700 p-1 rounded transition-opacity">
                        <span className="material-symbols-outlined text-base">more_vert</span>
                      </button>
                      {openMenuId === ch.id && (
                        <div className="absolute right-0 top-8 z-10 bg-surface border border-slate-200 rounded-xl shadow-pop py-1 w-40 animate-scale-in">
                          <button type="button" onClick={() => { setHistoryChannel(withClientId(ch)); setOpenMenuId(null); }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2"><span className="material-symbols-outlined text-sm">history</span>View history</button>
                          <button type="button" onClick={() => startEdit(ch)} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2"><span className="material-symbols-outlined text-sm">edit</span>Edit</button>
                          <button type="button" onClick={() => handleDelete(ch)} className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-600 flex items-center gap-2"><span className="material-symbols-outlined text-sm">delete</span>Remove</button>
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
            {adding && (
              <tr>
                <td colSpan={6} className="px-3 py-2">
                  <div className="flex gap-2">
                    <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder={L.placeholder} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" autoFocus onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }} />
                    <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label (optional)" className="w-28 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }} />
                    <Button type="button" size="sm" onClick={handleAdd}>Add</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => { setAdding(false); setNewValue(''); setNewLabel(''); }}>Cancel</Button>
                  </div>
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="md:hidden space-y-2">
        {loading ? (
          <p className="text-center py-4 text-slate-400 text-xs">Loading…</p>
        ) : channels.length === 0 && !adding ? (
          <p className="text-center py-4 text-slate-300 text-xs">No {L.address.toLowerCase()}s yet</p>
        ) : channels.map(ch => (
          <div key={ch.id} className="border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm truncate">{ch.value}</p>
                {ch.label && <p className="text-[11px] text-slate-400">{ch.label}</p>}
              </div>
              <button type="button" onClick={() => setOpenMenuId(openMenuId === ch.id ? null : ch.id)} className="text-slate-400 p-1"><span className="material-symbols-outlined text-base">more_vert</span></button>
            </div>
            {openMenuId === ch.id && (
              <div className="flex gap-2 mb-2 text-xs">
                <button type="button" onClick={() => { setHistoryChannel(withClientId(ch)); setOpenMenuId(null); }} className="px-2 py-1 bg-slate-50 rounded-lg">History</button>
                <button type="button" onClick={() => startEdit(ch)} className="px-2 py-1 bg-slate-50 rounded-lg">Edit</button>
                <button type="button" onClick={() => handleDelete(ch)} className="px-2 py-1 bg-red-50 text-red-600 rounded-lg">Remove</button>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs">
              <CheckCell checked={ch.outreach_count > 0} onClick={() => setOutreachChannel(withClientId(ch))} title={L.sent} />
              <span>{L.sent} {ch.last_outreach_at ? `· ${fmtDate(ch.last_outreach_at)}` : ''}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs mt-2">
              <CheckCell
                checked={!!ch.last_response_at && !ch.latest_open_touchpoint_id}
                pending={!!ch.latest_open_touchpoint_id}
                disabled={ch.outreach_count === 0}
                onClick={() => ch.latest_open_touchpoint_id && setResponseChannel(withClientId(ch))}
                title={L.reply}
              />
              <span className={clsx('font-semibold', ch.channel_status === 'responded' && 'text-emerald-600', ch.channel_status === 'awaiting_response' && 'text-amber-600')}>
                {STATUS_LABEL[ch.channel_status] || ch.channel_status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {!adding && (
        <button type="button" onClick={() => setAdding(true)} className="mt-2 text-xs font-semibold text-primary hover:underline flex items-center gap-1">
          <span className="material-symbols-outlined text-sm">add</span> Add {L.address.toLowerCase()}
        </button>
      )}

      <LogOutreachModal isOpen={!!outreachChannel} onClose={() => setOutreachChannel(null)} channel={outreachChannel} onLogged={() => { load(); onActivityChanged?.(); }} />
      <LogResponseModal isOpen={!!responseChannel} onClose={() => setResponseChannel(null)} channel={responseChannel} onLogged={() => { load(); onActivityChanged?.(); }} />
      <HistoryModal isOpen={!!historyChannel} onClose={() => setHistoryChannel(null)} channel={historyChannel} />
    </div>
  );
};

export default ChannelLogTable;
