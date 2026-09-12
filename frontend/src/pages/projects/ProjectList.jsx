import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { SkeletonRow } from '../../components/ui/Skeleton';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { ExportMenu } from '../../components/ui/ExportMenu';
import { statusColor as getStatusColor } from '../../utils/status';
import { formatDate, capitalize } from '../../utils/helpers';
import { formatForExport } from '../../utils/dateUtils';
import useAuth from '../../hooks/useAuth';
import { ROLES } from '../../utils/constants';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import DashboardMap from '../../components/ui/DashboardMap';

const STARRED_KEY = 'niyamak_starred_projects';

const getStarred = () => {
  try { return new Set(JSON.parse(localStorage.getItem(STARRED_KEY) || '[]')); } catch { return new Set(); }
};
const saveStarred = (set) => {
  try { localStorage.setItem(STARRED_KEY, JSON.stringify([...set])); } catch {}
};


// A converted-from-pipeline project still missing its core details (dates/scope/contact +
// pilot/drone allocation). Backend sets needs_attention=TRUE on conversion and clears it once
// a start date is filled in. Terminal projects are never flagged.
const needsAttention = (row) =>
    row?.needs_attention === true && !['complete', 'cancelled'].includes(row.status);

const BULK_STATUS_OPTIONS = [
  { value: 'initiate',        label: 'Initiate' },
  { value: 'planned',         label: 'Planned' },
  { value: 'on_going',        label: 'On Going' },
  { value: 'executed',        label: 'Executed' },
  { value: 'post_processing', label: 'Post Processing' },
  { value: 'complete',        label: 'Complete' },
  { value: 'cancelled',       label: 'Cancelled' },
];

const ProjectList = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
const { confirmDialog } = useDialog();
    const [projects, setProjects] = useState([]);
    const [mapProjects, setMapProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [bulkStatus, setBulkStatus] = useState('');
    const [bulkSaving, setBulkSaving] = useState(false);
    const [starred, setStarred] = useState(() => getStarred());
    const { user } = useAuth();
    const isAdmin = user?.role === ROLES.ADMIN;
    const isPM = user?.role === ROLES.PROJECT_MANAGER;

    // Seed filters from URL params (e.g. from Topbar global search or Dashboard KPI cards)
    const [searchParams, setSearchParams] = useSearchParams();
    // Filter states
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
    const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
    const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || '');
    const [overdueFilter, setOverdueFilter] = useState(searchParams.get('overdue') === 'true');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);

    // Set by the dashboard KPI cards (Total / Complete) so the list can surface
    // archived projects — otherwise completed-and-archived work is invisible here.
    const includeArchived = searchParams.get('include_archived') === 'true';

    // Sync local state when Topbar navigates here with ?search= param
    useEffect(() => { setSearchQuery(searchParams.get('search') || ''); }, [searchParams]);

    // Project history (completed + cancelled projects)
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyRows, setHistoryRows] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const openHistory = async () => {
        setHistoryOpen(true);
        setHistoryLoading(true);
        try {
            // Completed/cancelled projects are usually archived too (archiving only sets
            // archived_at, it doesn't change status) — so History must include them or it
            // shows nothing.
            const res = await axiosInstance.get(ENDPOINTS.PROJECTS.GET_ALL, { params: { status: 'complete,cancelled', include_archived: 'true', limit: 100 } });
            setHistoryRows(Array.isArray(res.data.data) ? res.data.data : []);
        } catch (err) {
            showToast('Failed to load project history', 'error');
        } finally {
            setHistoryLoading(false);
        }
    };


    const ACTIVE_STATUSES = 'initiate,planned,on_going,executed,post_processing';

    const fetchProjects = async (nextPage = 1) => {
        setLoading(true);
        try {
            const params = { page: nextPage, limit: 25 };
            if (searchQuery) params.search = searchQuery;
            if (includeArchived) {
                // Caller explicitly wants archived work too (e.g. the dashboard's Total /
                // Complete KPI cards). Show archived rows, and honour the requested status
                // as-is instead of clamping to the active-only set.
                params.include_archived = 'true';
                if (statusFilter) params.status = statusFilter;
            } else {
                // Terminal projects (complete/cancelled) live exclusively in History — always exclude them from the main list
                params.status = statusFilter || ACTIVE_STATUSES;
            }
            if (typeFilter) params.type = typeFilter;
            if (overdueFilter) params.overdue = 'true';

            const res = await axiosInstance.get(ENDPOINTS.PROJECTS.GET_ALL, { params });
            const rows = Array.isArray(res.data.data) ? res.data.data : [];
            setProjects(prev => nextPage === 1 ? rows : [...prev, ...rows]);
            const p = res.data.pagination;
            setHasMore(p ? p.page < p.pages : false);
            setPage(nextPage);
        } catch (err) {
            showToast("Failed to fetch projects", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            fetchProjects(1);
        }, 300);
        return () => clearTimeout(debounceTimer);
    }, [searchQuery, statusFilter, typeFilter, overdueFilter, includeArchived]);

    // Map data source — always every active-stage project (any stage except
    // complete/cancelled, which live in History), independent of the table's
    // search/type/status filters and its 25-per-page pagination.
    const fetchMapProjects = async () => {
        try {
            const res = await axiosInstance.get(ENDPOINTS.PROJECTS.GET_ALL, { params: { status: ACTIVE_STATUSES, limit: 100 } });
            setMapProjects(Array.isArray(res.data.data) ? res.data.data : []);
        } catch {
            setMapProjects([]);
        }
    };

    useEffect(() => { fetchMapProjects(); }, []);


    const exportColumns = [
        { header: 'Project ID',  key: 'id',           format: (v) => `PRJ-${String(v).substring(0,6).toUpperCase()}` },
        { header: 'Name',        key: 'name' },
        { header: 'Client',      key: 'client_name' },
        { header: 'Type',        key: 'project_type' },
        { header: 'Status',      key: 'status' },
        { header: 'State',       key: 'state' },
        { header: 'Start Date',  key: 'start_date',   format: (v) => formatForExport(v) },
        { header: 'End Date',    key: 'end_date',     format: (v) => formatForExport(v) },
        { header: 'Value (₹)',   key: 'project_value' },
    ];

    const toggleStar = (id, e) => {
        e?.stopPropagation();
        setStarred(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            saveStarred(next);
            return next;
        });
    };

    // Pinned projects float to top, then alphabetical
    const sortedProjects = useMemo(() => {
        if (!starred.size) return projects;
        const pinned = projects.filter(p => starred.has(p.id));
        const rest   = projects.filter(p => !starred.has(p.id));
        return [...pinned, ...rest];
    }, [projects, starred]);

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        setSelectedIds(prev => {
            if (prev.size === projects.length) return new Set();
            return new Set(projects.map(p => p.id));
        });
    };

    const handleBulkStatusApply = async () => {
        if (!bulkStatus || selectedIds.size === 0) return;
        setBulkSaving(true);
        try {
            const res = await axiosInstance.patch(ENDPOINTS.PROJECTS.BULK_STATUS, {
                ids: Array.from(selectedIds),
                status: bulkStatus,
            });
            showToast(res.data?.message || `Updated ${selectedIds.size} projects`);
            setSelectedIds(new Set());
            setBulkStatus('');
            fetchProjects(1);
            fetchMapProjects();
        } catch (err) {
            showToast(err.userMessage, 'error');
        } finally {
            setBulkSaving(false);
        }
    };

    const handleStatusChange = async (id, newStatus) => {
        try {
            await axiosInstance.put(ENDPOINTS.PROJECTS.UPDATE(id), { status: newStatus });
            showToast("Status updated");
            fetchProjects(1);
            fetchMapProjects();
        } catch(e) {
            showToast("Failed to update status", "error");
        }
    };

    const handleDeleteProject = async (row) => {
        if (!(await confirmDialog({ message: `Permanently delete "${row.name}"? This cannot be undone.`, danger: true }))) return;
        try {
            await axiosInstance.delete(ENDPOINTS.PROJECTS.DELETE(row.id));
            showToast("Project deleted");
            fetchProjects(1);
        } catch (e) {
            showToast(e?.response?.data?.message || "Failed to delete project", "error");
        }
    };

    const columns = [
        // Star / pin column
        {
            header: '',
            accessorKey: '__star',
            sortable: false,
            cell: (row) => (
                <button
                    onClick={(e) => toggleStar(row.id, e)}
                    title={starred.has(row.id) ? 'Unpin' : 'Pin to top'}
                    className={`transition-colors ${starred.has(row.id) ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'}`}
                    aria-label={starred.has(row.id) ? 'Unpin project' : 'Pin project to top'}
                >
                    <span className="material-symbols-outlined text-base leading-none" style={{ fontVariationSettings: starred.has(row.id) ? "'FILL' 1" : "'FILL' 0" }}>
                        star
                    </span>
                </button>
            ),
        },
        ...((isAdmin || isPM) ? [{
            header: (
                <input
                    type="checkbox"
                    aria-label="Select all visible"
                    checked={projects.length > 0 && selectedIds.size === projects.length}
                    ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < projects.length; }}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 text-primary focus:ring-primary/30"
                />
            ),
            accessorKey: '__select',
            sortable: false,
            cell: (row) => (
                <input
                    type="checkbox"
                    aria-label={`Select ${row.name}`}
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleSelect(row.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-slate-300 text-primary focus:ring-primary/30"
                />
            )
        }] : []),
        {
            header: 'Project ID',
            accessorKey: 'id',
            cell: (row) => <span className="text-slate-500 font-mono text-xs">PRJ-{row.id.substring(0,6).toUpperCase()}</span>
        },
        {
            header: 'Project Name',
            accessorKey: 'name',
            cell: (row) => (
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded flex items-center justify-center ${needsAttention(row) ? 'bg-red-100 text-red-500' : 'bg-slate-200'}`}>
                        <span className="material-symbols-outlined text-xs">folder</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                        <Link to={`/projects/${row.id}`} className="font-bold text-slate-900 hover:underline truncate max-w-[150px]">
                            {row.name}
                        </Link>
                        {needsAttention(row) && (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-600 uppercase tracking-wide" title="Converted from pipeline — core details (dates, scope, contact) and pilot/drone allocation are missing">
                                <span className="material-symbols-outlined text-[13px] leading-none">priority_high</span>
                                Needs details
                            </span>
                        )}
                        {row.archived_at && (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide" title="This project is archived — it lives in the Archive, and is shown here because archived work was requested">
                                <span className="material-symbols-outlined text-[13px] leading-none">inventory_2</span>
                                Archived
                            </span>
                        )}
                    </div>
                </div>
            )
        },
        {
            header: 'Client',
            accessorKey: 'client_name',
            cell: (row) => <span className="text-slate-500 truncate max-w-[100px] block">{row.client_name || 'Internal'}</span>
        },
        {
            header: 'Type & Location',
            accessorKey: 'project_type',
            cell: (row) => (
                <div className="flex flex-col">
                    <span className="text-slate-900 text-xs capitalize">{row.project_type}</span>
                    <span className="text-slate-500 text-[10px]">{row.state || 'N/A'}</span>
                </div>
            )
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: (row) => (
                <Badge status={row.status}>{row.status?.replace('_', ' ') || 'Unknown'}</Badge>
            )
        },
        {
            header: 'Timeline',
            accessorKey: 'start_date',
            cell: (row) => (
                <div className="flex flex-col text-[10px]">
                    <span className="text-slate-500">S: {row.start_date ? formatDate(row.start_date) : '-'}</span>
                    <span className="text-slate-500">E: {row.end_date ? formatDate(row.end_date) : '-'}</span>
                </div>
            )
        },
        {
            header: 'Actions',
            stickyRight: true,
            cell: (row) => (
                <div className="flex gap-2 items-center">
                    <Button variant="secondary" size="sm" icon="visibility" onClick={() => navigate(`/projects/${row.id}`)} title="View" />
                    {(isAdmin || isPM) && (
                        <>
                            <select
                                className="bg-surface text-slate-500 text-[10px] border border-slate-200 rounded p-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                value={row.status || ''}
                                onChange={(e) => handleStatusChange(row.id, e.target.value)}
                                title="Change status"
                            >
                                <option value="initiate">Initiate</option>
                                <option value="planned">Planned</option>
                                <option value="on_going">On Going</option>
                                <option value="executed">Executed</option>
                                <option value="post_processing">Post Processing</option>
                            </select>
                            <Button variant="secondary" size="sm" icon="edit" onClick={() => navigate(`/projects/${row.id}/edit`)} title="Edit" />
                        </>
                    )}
                    {isAdmin && (
                        <Button
                            variant="danger"
                            size="sm"
                            icon="delete"
                            onClick={(e) => { e.stopPropagation(); handleDeleteProject(row); }}
                            title="Delete project"
                        />
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <PageHeader
                eyebrow="Central Registry"
                title="Project Portfolio"
                description="Active survey projects. Completed and cancelled projects are in History."
                actions={
                    <>
                        <Button variant="secondary" icon="history" onClick={openHistory}>History</Button>
                        <ExportMenu
                            data={projects}
                            columns={exportColumns}
                            filename="niyamak_projects"
                            label="Export"
                        />
                        {(isAdmin || isPM) && (
                            <Button icon="add" onClick={() => navigate('/projects/new')}>New Project</Button>
                        )}
                    </>
                }
            />

            {/* Map + Ongoing Projects */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* Left: India Map */}
                <Card className="lg:col-span-3 p-0 overflow-hidden shadow-lg border-slate-200">
                    <div className="bg-surface px-4 py-3 border-b border-slate-200">
                        <h3 className="text-slate-900 font-bold text-sm flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">map</span> India Geospatial Overview
                        </h3>
                    </div>
                    <div className="h-[300px] md:h-[380px] w-full relative z-0">
                        <DashboardMap projects={mapProjects} />
                    </div>
                </Card>

                {/* Right: Ongoing Projects */}
                <Card className="lg:col-span-2 p-0 overflow-hidden border-slate-200">
                    <div className="bg-surface px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                        <h3 className="text-slate-900 font-bold text-sm flex items-center gap-2">
                            <span className="material-symbols-outlined text-base text-amber-500">construction</span> Ongoing Projects
                        </h3>
                        <span className="text-[10px] font-black text-amber-500 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            {projects.filter(p => p.status === 'on_going').length}
                        </span>
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
                        {projects.filter(p => p.status === 'on_going').length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-300">
                                <span className="material-symbols-outlined text-3xl">construction</span>
                                <p className="text-xs font-medium">No ongoing projects</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {projects.filter(p => p.status === 'on_going').map(proj => (
                                    <Link key={proj.id} to={`/projects/${proj.id}`}
                                        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${needsAttention(proj) ? 'bg-red-100 text-red-500' : 'bg-amber-100 text-amber-600'}`}>
                                            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                                                {needsAttention(proj) ? 'priority_high' : 'construction'}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-900 truncate group-hover:text-primary transition-colors">{proj.name}</p>
                                            <p className="text-[10px] text-slate-400 truncate">{proj.client_name}</p>
                                            {proj.state && <p className="text-[10px] text-slate-400 truncate">{proj.state}</p>}
                                        </div>
                                        <span className="material-symbols-outlined text-sm text-slate-300 group-hover:text-primary transition-colors shrink-0">chevron_right</span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Filter Panel */}
            <Card className="p-4 bg-slate-50">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex-1 w-full">
                        <Input 
                            placeholder="Search by Name, Client, or PO Number..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            icon="search"
                        />
                    </div>
                    <div className="w-full md:w-48">
                        <select className="w-full bg-surface border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                            <option value="">All Types</option>
                            <option value="solar_pv">Solar PV</option>
                            <option value="wind">Wind</option>
                            <option value="td_lines">T&D Lines</option>
                            <option value="tower">Tower</option>
                            <option value="pipeline">Pipeline</option>
                            <option value="volumetric">Volumetric</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div className="w-full md:w-48">
                        <select className="w-full bg-surface border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setOverdueFilter(false); }}>
                            <option value="">All Active</option>
                            <option value="initiate,planned">Open / New (Initiate + Planned)</option>
                            <option value="initiate">Initiate</option>
                            <option value="planned">Planned</option>
                            <option value="on_going">On Going</option>
                            <option value="executed">Executed</option>
                            <option value="post_processing">Post Processing</option>
                            <option value="complete">Complete</option>
                        </select>
                    </div>
                </div>

                {/* Active filter chips (overdue / clear-all) */}
                {(overdueFilter || statusFilter || typeFilter) && (
                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-200">
                        <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">Active:</span>
                        {overdueFilter && (
                            <button
                                onClick={() => setOverdueFilter(false)}
                                className="flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full hover:bg-red-100 transition-colors"
                            >
                                Overdue <span className="material-symbols-outlined text-sm leading-none">close</span>
                            </button>
                        )}
                        <button
                            onClick={() => { setStatusFilter(''); setTypeFilter(''); setOverdueFilter(false); }}
                            className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline underline-offset-2"
                        >
                            Clear all
                        </button>
                    </div>
                )}
            </Card>

            {/* Bulk action bar — sticky above table when ≥1 selected */}
            {(isAdmin || isPM) && selectedIds.size > 0 && (
                <div className="sticky top-16 md:top-20 z-30 bg-surface border border-primary/30 rounded-2xl shadow-pop p-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-slate-700">
                        {selectedIds.size} project{selectedIds.size > 1 ? 's' : ''} selected
                    </span>
                    <span className="text-xs text-slate-400 hidden sm:inline">·</span>
                    <select
                        value={bulkStatus}
                        onChange={(e) => setBulkStatus(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
                    >
                        <option value="">Change status to…</option>
                        {BULK_STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    <Button
                        size="sm"
                        onClick={handleBulkStatusApply}
                        disabled={!bulkStatus || bulkSaving}
                        isLoading={bulkSaving}
                    >
                        Apply
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setSelectedIds(new Set()); setBulkStatus(''); }}
                    >
                        Clear
                    </Button>
                </div>
            )}

            {/* Data Table */}
            <Card className="overflow-hidden">
                {loading && page === 1 ? (
                    <div className="w-full overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200/70 uppercase tracking-widest text-[10px] text-slate-500 font-bold">
                                    {columns.map((col, i) => (
                                        <th key={i} className="py-4 px-4 whitespace-nowrap">{col.header}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <SkeletonRow key={i} cols={columns.length} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Table
                        columns={columns}
                        data={sortedProjects}
                        visibilityKey="projects"
                        allowDensity
                        rowClassName={(row) => {
                            const attn = needsAttention(row) ? 'bg-red-50/70 hover:bg-red-50' : '';
                            const pin  = starred.has(row.id) ? 'border-l-2 border-l-amber-400' : '';
                            return [attn, pin].filter(Boolean).join(' ');
                        }}
                        empty={{
                            icon: 'folder_open',
                            title: 'No projects found',
                            description: (searchQuery || statusFilter || typeFilter)
                                ? 'No projects match your current filters. Try clearing them.'
                                : 'Create your first survey project to get started.',
                            action: (isAdmin || isPM) && !(searchQuery || statusFilter || typeFilter)
                                ? <Button icon="add" size="sm" onClick={() => navigate('/projects/new')}>New Project</Button>
                                : null,
                        }}
                    />
                )}
            </Card>
            {hasMore && (
                <div className="flex justify-center">
                    <Button variant="secondary" onClick={() => fetchProjects(page + 1)} disabled={loading}>
                        {loading ? 'Loading...' : 'Load More'}
                    </Button>
                </div>
            )}

            {/* Project History modal — completed & cancelled projects */}
            <Modal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} title="Project History">
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                    {historyLoading ? (
                        <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
                    ) : historyRows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-300">
                            <span className="material-symbols-outlined text-4xl">history</span>
                            <p className="text-sm font-medium text-slate-400">No completed or cancelled projects yet</p>
                        </div>
                    ) : historyRows.map((p) => {
                        const done = p.status === 'complete';
                        return (
                            <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
                                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${done ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                                    <span className="material-symbols-outlined text-base">{done ? 'verified' : 'cancel'}</span>
                                </span>
                                <div className="min-w-0 flex-1">
                                    <Link to={`/projects/${p.id}`} onClick={() => setHistoryOpen(false)} className="text-sm font-bold text-slate-900 hover:underline truncate block">{p.name}</Link>
                                    <p className="text-[11px] text-slate-400">
                                        {(p.client_name || 'Internal')}{p.project_type ? ` · ${String(p.project_type).replace(/_/g, ' ')}` : ''}
                                        {p.end_date ? ` · ${formatDate(p.end_date)}` : ''}
                                    </p>
                                    {!done && p.cancel_reason && (
                                        <p className="text-[11px] text-red-500 truncate">Reason: {p.cancel_reason}</p>
                                    )}
                                </div>
                                <Badge status={p.status}>{p.status?.replace('_', ' ')}</Badge>
                            </div>
                        );
                    })}
                </div>
            </Modal>
        </div>
    );
};

export default ProjectList;
