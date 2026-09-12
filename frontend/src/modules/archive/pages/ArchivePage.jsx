import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../../../api/axios';
import { ENDPOINTS } from '../../../api/endpoints';
import { useToast } from '../../../context/ToastContext';
import { useDialog } from '../../../context/DialogContext';
import { formatDateOnly } from '../../../utils/dateUtils';
import useAuth from '../../../hooks/useAuth';
import { ROLES } from '../../../utils/constants';
import { TablePageSkeleton } from '../../../components/ui/Skeletons';

// ── Helpers ───────────────────────────────────────────────────────────────────
const TYPE_META = {
  library_document: {
    label:    'Library Document',
    icon:     'library_books',
    color:    'text-indigo-600',
    bg:       'bg-indigo-50',
    chip:     'text-indigo-700 bg-indigo-100',
  },
  project: {
    label:    'Project',
    icon:     'folder_open',
    color:    'text-amber-600',
    bg:       'bg-amber-50',
    chip:     'text-amber-700 bg-amber-100',
  },
  pipeline: {
    label:    'Pipeline',
    icon:     'trending_up',
    color:    'text-purple-600',
    bg:       'bg-purple-50',
    chip:     'text-purple-700 bg-purple-100',
  },
};

const fileSizeFmt = (bytes) => {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const TABS = [
  { key: 'all',              label: 'All',                icon: 'inventory_2'   },
  { key: 'library_document', label: 'Library Documents',  icon: 'library_books' },
  { key: 'project',          label: 'Projects',           icon: 'folder_open'   },
  { key: 'pipeline',         label: 'Pipelines',          icon: 'trending_up'   },
];

const PIPELINE_TYPE_LABEL = {
  solar_pv: 'Solar PV', wind: 'Wind', td_lines: 'T&D Lines',
  tower: 'Tower', pipeline: 'Pipeline', volumetric: 'Volumetric',
};

const fmtMoney = (v) => {
  const n = Number(v || 0);
  if (!n) return null;
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
};

const PROJECT_STATUS_CHIP = {
  initiate:        'bg-slate-100 text-slate-600',
  planned:         'bg-blue-50 text-blue-700',
  on_going:        'bg-amber-50 text-amber-700',
  executed:        'bg-violet-50 text-violet-700',
  post_processing: 'bg-orange-50 text-orange-700',
  complete:        'bg-emerald-100 text-emerald-700',
  cancelled:       'bg-red-50 text-red-600',
};
const PROJECT_STATUS_LABEL = {
  initiate: 'Initiate', planned: 'Planned', on_going: 'On Going',
  executed: 'Executed', post_processing: 'Post Processing',
  complete: 'Complete', cancelled: 'Cancelled',
};

// ── Component ─────────────────────────────────────────────────────────────────
const ArchivePage = () => {
  const { showToast }  = useToast();
const { confirmDialog } = useDialog();
  const { user }       = useAuth();
  const isAdmin        = user?.role === ROLES.ADMIN;

  const [items,       setItems]       = useState([]);
  const [total,       setTotal]       = useState(0);
  const [isLoading,   setIsLoading]   = useState(true);
  const [activeTab,   setActiveTab]   = useState('all');
  const [searchTerm,  setSearchTerm]  = useState('');
  const [page,        setPage]        = useState(1);
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId,  setDeletingId]  = useState(null);

  const LIMIT = 20;

  const fetchArchive = useCallback(async (tab, search, pg) => {
    setIsLoading(true);
    try {
      const res = await axiosInstance.get(ENDPOINTS.ARCHIVE.LIST, {
        params: { type: tab, search: search || undefined, page: pg, limit: LIMIT },
      });
      const data = res.data.data;
      setItems(data.items  || []);
      setTotal(data.total  || 0);
    } catch {
      showToast('Failed to load archive', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); fetchArchive(activeTab, searchTerm, 1); }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, activeTab, fetchArchive]);

  useEffect(() => {
    fetchArchive(activeTab, searchTerm, page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestore = async (item) => {
    const key = `${item.entity_type}::${item.entity_id}`;
    setRestoringId(key);
    try {
      await axiosInstance.post(ENDPOINTS.ARCHIVE.RESTORE(item.entity_type, item.entity_id));
      showToast(`"${item.name}" restored successfully`);
      fetchArchive(activeTab, searchTerm, page);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Restore failed';
      showToast(msg, 'error');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async (item) => {
    if (!(await confirmDialog({ message: `Permanently delete "${item.name}"? This cannot be undone.`, danger: true }))) return;
    const key = `${item.entity_type}::${item.entity_id}`;
    setDeletingId(key);
    try {
      await axiosInstance.delete(ENDPOINTS.ARCHIVE.DELETE(item.entity_type, item.entity_id));
      showToast(`"${item.name}" permanently deleted`);
      fetchArchive(activeTab, searchTerm, page);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Delete failed';
      showToast(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const typeCount  = (type) => type === 'all' ? total : items.filter(i => i.entity_type === type).length;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">

      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="bg-surface border-b border-slate-200 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-xl text-slate-500">inventory_2</span>
              </div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Archive</h1>
            </div>
            <p className="text-sm text-slate-500 ml-12">
              All archived items across your workspace. Restore or permanently delete them here.
            </p>
          </div>

          {/* Stats chips */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
              {total} item{total !== 1 ? 's' : ''} archived
            </span>
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 mt-4 border-b border-slate-100 -mb-5 pb-0 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPage(1); }}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <span className="material-symbols-outlined text-base leading-none">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="px-6 py-3 bg-surface border-b border-slate-100 flex items-center gap-3">
        <div className="flex-1 max-w-sm relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
          <input
            type="text"
            placeholder="Search archived items…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
          />
        </div>
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
            Clear
          </button>
        )}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <TablePageSkeleton rows={6} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-4xl text-slate-300">inventory_2</span>
            </div>
            <p className="text-base font-semibold text-slate-400">
              {searchTerm ? 'No archived items match your search' : 'No archived items yet'}
            </p>
            <p className="text-sm text-slate-400">
              Items archived from Projects or the Library will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* ── Archive Table ─────────────────────────────────────────── */}
            <div className="bg-surface border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 w-8">#</th>
                      <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Name</th>
                      <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hidden sm:table-cell">Type</th>
                      <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hidden md:table-cell">Details</th>
                      <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hidden lg:table-cell">Archived By</th>
                      <th className="text-left px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hidden md:table-cell">Date</th>
                      {isAdmin && <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map((item, idx) => {
                      const meta  = TYPE_META[item.entity_type] || TYPE_META.library_document;
                      const rowKey = `${item.entity_type}::${item.entity_id}`;
                      const isRestoring = restoringId === rowKey;
                      const isDeleting  = deletingId  === rowKey;
                      const isBusy      = isRestoring || isDeleting;

                      return (
                        <tr key={rowKey} className={`hover:bg-slate-50/60 transition-colors ${isBusy ? 'opacity-60' : ''}`}>

                          {/* Row number */}
                          <td className="px-5 py-3.5 text-xs text-slate-300 font-mono">
                            {(page - 1) * LIMIT + idx + 1}
                          </td>

                          {/* Name + icon */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${meta.bg}`}>
                                <span className={`material-symbols-outlined text-base ${meta.color}`}>{meta.icon}</span>
                              </div>
                              <div className="min-w-0">
                                {item.entity_type === 'project' ? (
                                  <Link to={`/projects/${item.entity_id}`} className="font-semibold text-slate-900 hover:text-primary hover:underline truncate block max-w-[200px] md:max-w-[300px]" title={item.name}>
                                    {item.name}
                                  </Link>
                                ) : (
                                  <p className="font-semibold text-slate-900 truncate max-w-[200px] md:max-w-[300px]" title={item.name}>
                                    {item.name}
                                  </p>
                                )}
                                {item.description && (
                                  <p className="text-[11px] text-slate-400 truncate max-w-[200px] mt-0.5">{item.description}</p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Type chip */}
                          <td className="px-5 py-3.5 hidden sm:table-cell">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${meta.chip}`}>
                              {meta.label}
                            </span>
                          </td>

                          {/* Entity-specific details */}
                          <td className="px-5 py-3.5 hidden md:table-cell">
                            <div className="flex flex-col gap-0.5">
                              {item.entity_type === 'library_document' && (
                                <>
                                  {item.metadata?.category_name && (
                                    <span className="text-[11px] text-indigo-600 font-semibold">{item.metadata.category_name}</span>
                                  )}
                                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                    {item.metadata?.version  && <span className="font-mono bg-slate-100 px-1.5 rounded">{item.metadata.version}</span>}
                                    {item.metadata?.file_size && <span>{fileSizeFmt(item.metadata.file_size)}</span>}
                                  </div>
                                </>
                              )}
                              {item.entity_type === 'project' && (
                                <>
                                  {item.metadata?.status && (
                                    <span className={`inline-flex items-center text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider w-fit ${PROJECT_STATUS_CHIP[item.metadata.status] || 'bg-slate-100 text-slate-600'}`}>
                                      {PROJECT_STATUS_LABEL[item.metadata.status] || item.metadata.status}
                                    </span>
                                  )}
                                  {item.metadata?.project_type && (
                                    <span className="text-[11px] text-slate-500 capitalize">{item.metadata.project_type.replace(/_/g, ' ')}</span>
                                  )}
                                  {item.metadata?.location && (
                                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[11px]">location_on</span>
                                      {item.metadata.location}
                                    </span>
                                  )}
                                </>
                              )}
                              {item.entity_type === 'pipeline' && (
                                <>
                                  {/* Outcome badge */}
                                  {item.metadata?.outcome === 'converted' ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider w-fit bg-emerald-100 text-emerald-700">
                                      <span className="material-symbols-outlined text-[10px]">check_circle</span>
                                      Converted
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider w-fit bg-red-100 text-red-700">
                                      <span className="material-symbols-outlined text-[10px]">cancel</span>
                                      Cancelled
                                    </span>
                                  )}
                                  {/* Cancel reason */}
                                  {item.metadata?.cancel_reason && (
                                    <span className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded px-1.5 py-0.5 leading-snug max-w-[220px] truncate" title={item.metadata.cancel_reason}>
                                      Reason: {item.metadata.cancel_reason}
                                    </span>
                                  )}
                                  {/* Converted → project link */}
                                  {item.metadata?.converted_project_id && (
                                    <a
                                      href={`/projects/${item.metadata.converted_project_id}`}
                                      className="text-[11px] text-indigo-600 hover:underline flex items-center gap-0.5"
                                    >
                                      <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                                      {item.metadata.converted_project_name || 'View Project'}
                                    </a>
                                  )}
                                  {/* Client + type + value */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {item.metadata?.client_name && (
                                      <span className="text-[11px] text-slate-500">{item.metadata.client_name}</span>
                                    )}
                                    {item.metadata?.project_type && (
                                      <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-px rounded">
                                        {PIPELINE_TYPE_LABEL[item.metadata.project_type] || item.metadata.project_type}
                                      </span>
                                    )}
                                    {item.metadata?.estimated_value && (
                                      <span className="text-[11px] text-slate-500 font-mono">{fmtMoney(item.metadata.estimated_value)}</span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </td>

                          {/* Archived by */}
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            <span className="text-xs text-slate-500">{item.archived_by_name || '—'}</span>
                          </td>

                          {/* Date */}
                          <td className="px-5 py-3.5 hidden md:table-cell">
                            <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateOnly(item.archived_at)}</span>
                          </td>

                          {/* Actions */}
                          {isAdmin && (
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-1.5 justify-end">
                                {/* Restore — hidden for converted pipelines (project already exists) */}
                                {!(item.entity_type === 'pipeline' && item.metadata?.outcome === 'converted') && (
                                <button
                                  onClick={() => handleRestore(item)}
                                  disabled={isBusy}
                                  title="Restore to active"
                                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-40"
                                >
                                  <span className={`material-symbols-outlined text-sm leading-none ${isRestoring ? 'animate-spin' : ''}`}>
                                    {isRestoring ? 'progress_activity' : 'restore'}
                                  </span>
                                  <span className="hidden sm:inline">{isRestoring ? 'Restoring…' : 'Restore'}</span>
                                </button>
                                )}

                                {/* Permanent delete */}
                                <button
                                  onClick={() => handlePermanentDelete(item)}
                                  disabled={isBusy}
                                  title="Delete permanently"
                                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-40"
                                >
                                  <span className={`material-symbols-outlined text-sm leading-none ${isDeleting ? 'animate-spin' : ''}`}>
                                    {isDeleting ? 'progress_activity' : 'delete_forever'}
                                  </span>
                                  <span className="hidden sm:inline">{isDeleting ? 'Deleting…' : 'Delete'}</span>
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Pagination ─────────────────────────────────────────────── */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                  <span className="text-xs text-slate-500">
                    Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30"
                    >
                      <span className="material-symbols-outlined text-base leading-none">chevron_left</span>
                    </button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      const pg = totalPages <= 7 ? i + 1
                        : page <= 4 ? i + 1
                        : page >= totalPages - 3 ? totalPages - 6 + i
                        : page - 3 + i;
                      return (
                        <button
                          key={pg}
                          onClick={() => setPage(pg)}
                          className={`w-7 h-7 text-xs font-bold rounded-lg transition-colors ${
                            pg === page ? 'bg-primary text-on-primary' : 'text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          {pg}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-30"
                    >
                      <span className="material-symbols-outlined text-base leading-none">chevron_right</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Info banner for non-admins */}
            {!isAdmin && (
              <p className="mt-4 text-center text-xs text-slate-400">
                Only admins can restore or permanently delete archived items.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ArchivePage;
