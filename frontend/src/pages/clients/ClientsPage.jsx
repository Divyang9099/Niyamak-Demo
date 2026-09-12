import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { TablePageSkeleton } from '../../components/ui/Skeletons';
import ClientFormModal from '../../components/ui/ClientFormModal';
import { ExportMenu } from '../../components/ui/ExportMenu';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import useAuth from '../../hooks/useAuth';
import { ROLES } from '../../utils/constants';

const EXPORT_COLS = [
  { header: 'Name',           key: 'name' },
  { header: 'Company',        key: 'company_name' },
  { header: 'Contact Person', key: 'contact_person' },
  { header: 'Email',          key: 'contact_email' },
  { header: 'Phone',          key: 'contact_number' },
  { header: 'GSTIN',         key: 'gstin' },
  { header: 'City',           key: 'city' },
  { header: 'State',          key: 'state' },
  { header: 'Status',         key: 'status' },
  { header: 'Projects',       key: 'project_count' },
  { header: 'Pipeline',       key: 'pipeline_count' },
];

const ClientsPage = () => {
  const { showToast } = useToast();
  const { confirmDialog } = useDialog();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === ROLES.ADMIN;

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchClients = useCallback(async (term = '') => {
    setLoading(true);
    try {
      const res = await axiosInstance.get(ENDPOINTS.CLIENTS.GET_ALL, {
        params: { search: term || undefined, limit: 200 },
      });
      setClients(Array.isArray(res.data.data) ? res.data.data : []);
    } catch {
      showToast('Failed to load clients', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const t = setTimeout(() => fetchClients(search), 300);
    return () => clearTimeout(t);
  }, [search, fetchClients]);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (c) => { setEditing(c); setModalOpen(true); };

  const handleDelete = async (c) => {
    const linked = (c.project_count || 0) + (c.pipeline_count || 0);
    const warn = linked > 0
      ? ` It is linked to ${c.project_count} project(s) and ${c.pipeline_count} pipeline(s); those keep their client name but lose the live link.`
      : '';
    if (!(await confirmDialog({
      title: 'Delete Client',
      message: `Delete "${c.name}"?${warn}`,
      danger: true,
      confirmLabel: 'Delete',
    }))) return;
    try {
      await axiosInstance.delete(ENDPOINTS.CLIENTS.DELETE(c.id));
      showToast('Client deleted');
      fetchClients(search);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Delete failed', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <PageHeader
        eyebrow="Operations"
        title="Clients"
        description="Central registry of clients used across Projects and Pipeline."
        actions={
          <>
            <ExportMenu data={clients} columns={EXPORT_COLS} filename="niyamak_clients" label="Export" />
            <Button icon="add" onClick={openCreate}>Add Client</Button>
          </>
        }
      />

      {/* Search */}
      <div className="relative max-w-sm">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none">search</span>
        <input
          type="text"
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        )}
      </div>

      <Card className="border-slate-200 overflow-hidden">
        {loading ? (
          <TablePageSkeleton rows={6} />
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-slate-300">contacts</span>
            </div>
            <p className="text-base font-semibold text-slate-400">
              {search ? 'No clients match your search' : 'No clients yet'}
            </p>
            {!search && <Button size="sm" icon="add" onClick={openCreate}>Add your first client</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Client</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hidden md:table-cell">Contact</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hidden lg:table-cell">Location</th>
                  <th className="text-center px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Projects</th>
                  <th className="text-center px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Pipeline</th>
                  <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                  <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/clients/${c.id}`)}
                    className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-black">
                          {(c.name || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate max-w-[220px]" title={c.name}>{c.name}</p>
                          {c.company_name && <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{c.company_name}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <div className="flex flex-col gap-0.5">
                        {c.contact_person && <span className="text-[12px] text-slate-700">{c.contact_person}</span>}
                        {c.contact_number && <span className="text-[11px] text-slate-400">{c.contact_number}</span>}
                        {c.contact_email && <span className="text-[11px] text-slate-400 truncate max-w-[180px]">{c.contact_email}</span>}
                        {!c.contact_person && !c.contact_number && !c.contact_email && <span className="text-[11px] text-slate-300">—</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <span className="text-[12px] text-slate-500">
                        {[c.city, c.state].filter(Boolean).join(', ') || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {c.project_count > 0
                        ? <Link onClick={(e) => e.stopPropagation()} to={`/projects?search=${encodeURIComponent(c.name)}`} className="inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100">{c.project_count}</Link>
                        : <span className="text-slate-300 text-xs">0</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {c.pipeline_count > 0
                        ? <Link onClick={(e) => e.stopPropagation()} to={`/pipeline?search=${encodeURIComponent(c.name)}`} className="inline-flex items-center justify-center min-w-[24px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-bold hover:bg-purple-100">{c.pipeline_count}</Link>
                        : <span className="text-slate-300 text-xs">0</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-full ${c.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {c.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                          title="Edit client"
                          className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm leading-none">edit</span>
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                        {isAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(c); }}
                            title="Delete client"
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
                          >
                            <span className="material-symbols-outlined text-sm leading-none">delete</span>
                            <span className="hidden sm:inline">Delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ClientFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        client={editing}
        onSaved={() => fetchClients(search)}
      />
    </div>
  );
};

export default ClientsPage;
