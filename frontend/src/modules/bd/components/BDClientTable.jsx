import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../../components/ui/Card';
import { TablePageSkeleton } from '../../../components/ui/Skeletons';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Button } from '../../../components/ui/Button';
import { clientLogoUrl } from '../api/bd.api';
import { BDInlinePriority } from './BDInlinePriority';
import { BDInlineStatus } from './BDInlineStatus';
import { BDEngagementStepper } from './BDEngagementStepper';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

const LogoCell = ({ client }) => {
  const [error, setError] = useState(false);
  if (!client.logo_url || error) {
    return (
      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
        {(client.name || '?')[0].toUpperCase()}
      </div>
    );
  }
  return <img src={clientLogoUrl(client.id)} onError={() => setError(true)} className="w-8 h-8 rounded-lg object-contain shrink-0" alt="" />;
};

export const BDClientTable = ({ clients, loading, hasFilters, onDelete, onClientChanged }) => {
  const navigate = useNavigate();

  if (loading) return <Card className="border-slate-200 overflow-hidden !p-0"><TablePageSkeleton rows={6} /></Card>;

  if (clients.length === 0) {
    return (
      <Card className="border-slate-200 overflow-hidden !p-0">
        <EmptyState
          icon="handshake"
          title={hasFilters ? 'No clients match these filters' : 'No leads yet'}
          description={hasFilters ? undefined : 'Start building your pipeline — add your first client.'}
          action={!hasFilters ? <Button size="sm" icon="add" onClick={() => navigate('/bd/clients/new')}>Add your first client</Button> : undefined}
        />
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 !p-0">
      <div className="overflow-x-auto min-h-[260px]">
        <table className="w-full text-sm min-w-[960px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Client</th>
              <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Priority</th>
              <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Progress</th>
              <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
              <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hidden lg:table-cell">Next follow-up</th>
              <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hidden md:table-cell">Owner</th>
              <th className="text-right px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {clients.map((c) => {
              const overdue = c.next_follow_up_at && new Date(c.next_follow_up_at) < new Date();
              return (
                <tr key={c.id} onClick={() => navigate(`/bd/clients/${c.id}`)} className="hover:bg-slate-50/60 transition-colors cursor-pointer">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <LogoCell client={c} />
                      <p className="font-semibold text-slate-900 truncate max-w-[220px]" title={c.name}>{c.name}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><BDInlinePriority client={c} onChanged={onClientChanged} /></td>
                  <td className="px-5 py-3.5"><BDEngagementStepper client={c} /></td>
                  <td className="px-5 py-3.5"><BDInlineStatus client={c} onChanged={onClientChanged} /></td>
                  <td className="px-5 py-3.5 hidden lg:table-cell">
                    <span className={`text-xs font-semibold ${overdue ? 'text-red-600' : 'text-slate-500'}`}>
                      {overdue && <span className="material-symbols-outlined text-xs align-middle mr-0.5">warning</span>}
                      {fmtDate(c.next_follow_up_at)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 hidden md:table-cell text-xs text-slate-500">{c.bd_owner_name || '—'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/bd/clients/${c.id}/edit`); }}
                        title="Edit client"
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm leading-none">edit</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(c); }}
                        title="Delete client"
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm leading-none">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default BDClientTable;
