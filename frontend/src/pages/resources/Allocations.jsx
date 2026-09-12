import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { API_BASE_URL, ENDPOINTS } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../context/SocketContext';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { formatDateOnly } from '../../utils/helpers';

const TYPE_TABS = [
    { key: 'all',     label: 'All' },
    { key: 'pilot',   label: 'Pilots' },
    { key: 'copilot', label: 'Co-Pilots' },
    { key: 'drone',   label: 'Drones' },
];

// Pilots and co-pilots are both crew rows out of the pilots table - they share the
// same columns (licence, day rate, base) and differ only in which roster they belong to.
const isCrew = (type) => type === 'pilot' || type === 'copilot';

const statusBadge = (status) => {
    if (!status) return <span className="text-slate-300 text-xs">—</span>;
    const map = {
        active:      'bg-green-500/10 text-green-600 border-green-500/20',
        inactive:    'bg-slate-100   text-slate-500  border-slate-200',
        maintenance: 'bg-amber-500/10 text-amber-600  border-amber-500/20',
        grounded:    'bg-red-500/10   text-red-600    border-red-500/20',
        available:   'bg-blue-500/10  text-blue-600   border-blue-500/20',
    };
    const cls = map[status?.toLowerCase()] || 'bg-slate-100 text-slate-500 border-slate-200';
    return (
        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${cls}`}>
            {status}
        </span>
    );
};

const expiryBadge = (dateStr) => {
    if (!dateStr) return <span className="text-slate-300 text-[11px]">—</span>;
    const d     = new Date(dateStr);
    const now   = new Date();
    const days  = Math.floor((d - now) / 86400000);
    const label = formatDateOnly(dateStr);
    if (days < 0)   return <span className="text-[10px] font-bold text-red-500 flex items-center gap-1"><span className="material-symbols-outlined text-xs">error</span>{label}</span>;
    if (days < 30)  return <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1"><span className="material-symbols-outlined text-xs">warning</span>{label}</span>;
    return <span className="text-[10px] text-slate-500 font-bold">{label}</span>;
};

const Allocations = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { socket } = useSocket();
    const [resources, setResources] = useState([]);
    const [loading, setLoading]     = useState(true);
    const [search, setSearch]       = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [showUnassigned, setShowUnassigned] = useState(false);

    const fetchResources = useCallback(async () => {
        try {
            setLoading(true);
            const res = await axiosInstance.get(ENDPOINTS.RESOURCES.ALLOCATIONS);
            setResources(Array.isArray(res.data.data) ? res.data.data : []);
        } catch (err) {
            showToast(err?.response?.data?.message || 'Failed to load resources', 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchResources(); }, [fetchResources]);

    // Real-time refresh when any allocation changes.
    // Uses a timer to deduplicate rapid duplicate events (project-room + global broadcast).
    useEffect(() => {
        if (!socket) return;
        let timer = null;
        const refresh = () => {
            clearTimeout(timer);
            timer = setTimeout(() => fetchResources(), 300);
        };
        socket.on('allocation:created', refresh);
        socket.on('allocation:updated', refresh);
        socket.on('allocation:deleted', refresh);
        return () => {
            clearTimeout(timer);
            socket.off('allocation:created', refresh);
            socket.off('allocation:updated', refresh);
            socket.off('allocation:deleted', refresh);
        };
    }, [socket, fetchResources]);

    const filtered = resources.filter(r => {
        const matchTab        = activeTab === 'all' || r.resource_type === activeTab;
        const matchUnassigned = !showUnassigned || !r.project_id;
        const q               = search.toLowerCase();
        const matchSearch     = !q ||
            r.resource_name?.toLowerCase().includes(q) ||
            r.resource_detail?.toLowerCase().includes(q) ||
            r.make?.toLowerCase().includes(q) ||
            r.serial_number?.toLowerCase().includes(q) ||
            r.project_name?.toLowerCase().includes(q);
        return matchTab && matchUnassigned && matchSearch;
    });

    const handleRowClick = (row) => {
        if (row.resource_type === 'copilot') {
            navigate(`/resources/copilots/${row.resource_id}`);
        } else if (row.resource_type === 'pilot') {
            navigate(`/resources/pilots/${row.resource_id}`);
        } else {
            navigate(`/resources/drones/${row.resource_id}`);
        }
    };

    const columns = [
        {
            header: 'Type',
            sortable: false,
            cell: (row) => (
                <div className="flex items-center gap-2">
                    <span className={`material-symbols-outlined text-base ${
                        row.resource_type === 'pilot'   ? 'text-blue-400'
                      : row.resource_type === 'copilot' ? 'text-violet-400'
                      : 'text-indigo-400'
                    }`}>
                        {row.resource_type === 'pilot' ? 'person' : row.resource_type === 'copilot' ? 'group' : 'flight'}
                    </span>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                        row.resource_type === 'pilot'
                            ? 'bg-blue-50 text-blue-500 border-blue-200'
                            : row.resource_type === 'copilot'
                            ? 'bg-violet-50 text-violet-500 border-violet-200'
                            : 'bg-indigo-50 text-indigo-500 border-indigo-200'
                    }`}>
                        {row.resource_type === 'copilot' ? 'co-pilot' : row.resource_type}
                    </span>
                </div>
            ),
        },
        {
            header: 'Resource',
            cell: (row) => {
                // Pilots: avatar via /users/:userId/avatar (user table ID, not pilot table ID)
                const avatarId  = isCrew(row.resource_type) ? row.pilot_user_id : null;
                const avatarSrc = row.avatar_url && avatarId
                    ? `${API_BASE_URL}/users/${avatarId}/avatar`
                    : isCrew(row.resource_type)
                        ? `https://ui-avatars.com/api/?name=${encodeURIComponent(row.resource_name || 'P')}&background=${row.resource_type === 'copilot' ? '8B5CF6' : '3B82F6'}&color=fff&size=64`
                        : null;

                return (
                    <div className="flex items-center gap-3">
                        {avatarSrc ? (
                            <img
                                src={avatarSrc}
                                className="w-9 h-9 rounded-full object-cover border border-slate-200 bg-slate-100 flex-shrink-0"
                                alt={row.resource_name}
                                onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(row.resource_name || 'R')}&background=6366f1&color=fff&size=64`; }}
                            />
                        ) : (
                            <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center flex-shrink-0">
                                <span className="material-symbols-outlined text-indigo-500 text-base">flight</span>
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-sm truncate">{row.resource_name}</p>
                            {isCrew(row.resource_type) && row.resource_detail && (
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    {row.resource_detail}
                                </p>
                            )}
                            {row.resource_type === 'drone' && (
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                    {[row.make, row.resource_detail].filter(Boolean).join(' · ')}
                                </p>
                            )}
                        </div>
                    </div>
                );
            },
        },
        {
            header: 'Status',
            accessorKey: 'resource_status',
            cell: (row) => statusBadge(row.resource_status),
        },
        {
            header: 'Details',
            sortable: false,
            cell: (row) => {
                if (isCrew(row.resource_type)) {
                    return (
                        <div className="space-y-1">
                            {row.license_expiry && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expiry:</span>
                                    {expiryBadge(row.license_expiry)}
                                </div>
                            )}
                            {row.per_day_rate && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rate:</span>
                                    <span className="text-[10px] font-bold text-slate-600">₹{Number(row.per_day_rate).toLocaleString('en-IN')}/day</span>
                                </div>
                            )}
                            {row.base_location && (
                                <div className="flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[11px] text-slate-300">location_on</span>
                                    <span className="text-[10px] text-slate-400 font-bold">{row.base_location}</span>
                                </div>
                            )}
                            {!row.license_expiry && !row.per_day_rate && !row.base_location && (
                                <span className="text-[11px] text-slate-300 italic">No details</span>
                            )}
                        </div>
                    );
                }
                // Drone
                return (
                    <div className="space-y-1">
                        {row.serial_number && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">S/N:</span>
                                <span className="text-[10px] font-bold text-slate-600 font-mono">{row.serial_number}</span>
                            </div>
                        )}
                        {row.day_rate && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rate:</span>
                                <span className="text-[10px] font-bold text-slate-600">₹{Number(row.day_rate).toLocaleString('en-IN')}/day</span>
                            </div>
                        )}
                        {row.next_maintenance && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Maint:</span>
                                {expiryBadge(row.next_maintenance)}
                            </div>
                        )}
                        {!row.serial_number && !row.day_rate && !row.next_maintenance && (
                            <span className="text-[11px] text-slate-300 italic">No details</span>
                        )}
                    </div>
                );
            },
        },
        {
            header: 'Current Project',
            cell: (row) => row.project_name ? (
                <div
                    className="flex flex-col gap-1 cursor-pointer group"
                    onClick={(e) => { e.stopPropagation(); navigate(`/projects/${row.project_id}`); }}
                >
                    <span className="font-bold text-slate-900 text-sm group-hover:text-primary transition-colors truncate max-w-[160px]">
                        {row.project_name}
                    </span>
                    <div className="flex items-center gap-1.5">
                        {row.allocation_id ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[9px] font-black uppercase tracking-widest bg-indigo-50 text-indigo-600 border border-indigo-200">
                                <span className="material-symbols-outlined text-[10px]">verified</span> Allocated
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[9px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 border border-slate-200">
                                <span className="material-symbols-outlined text-[10px]">group</span> Member
                            </span>
                        )}
                        {row.project_status && (
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{row.project_status?.replace('_', ' ')}</span>
                        )}
                    </div>
                </div>
            ) : (
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-widest italic">Unassigned</span>
            ),
        },
        {
            header: 'Deployment Window',
            cell: (row) => row.start_date ? (
                <div className="flex flex-col gap-0.5">
                    <p className="text-[10px] text-slate-900 font-bold tracking-widest uppercase">{formatDateOnly(row.start_date)}</p>
                    <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase flex items-center gap-1">
                        <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                        {formatDateOnly(row.end_date)}
                    </p>
                </div>
            ) : (
                <span className="text-[11px] text-slate-300 font-bold uppercase tracking-widest">—</span>
            ),
        },
        {
            header: 'Conflict',
            sortable: false,
            cell: (row) => {
                if (!row.allocation_id) return (
                    <span className="text-[11px] text-slate-200 font-bold uppercase tracking-widest">—</span>
                );
                const has = Number(row.conflict_count) > 0;
                return has ? (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-500 animate-pulse">
                        <span className="material-symbols-outlined text-xs">warning</span>
                        <span className="text-[9px] font-black uppercase tracking-widest">Conflict</span>
                    </div>
                ) : (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-600">
                        <span className="material-symbols-outlined text-xs text-green-500">verified</span>
                        <span className="text-[9px] font-black uppercase tracking-widest">Clear</span>
                    </div>
                );
            },
        },
        {
            header: 'Actions',
            stickyRight: true,
            sortable: false,
            cell: (row) => (
                <div className="flex gap-1.5">
                    <Button
                        variant="secondary"
                        size="sm"
                        icon={row.resource_type === 'pilot' ? 'person' : row.resource_type === 'copilot' ? 'group' : 'flight'}
                        title={`View ${row.resource_type}`}
                        onClick={(e) => { e.stopPropagation(); handleRowClick(row); }}
                    />
                </div>
            ),
        },
    ];

    const pilotCount    = resources.filter(r => r.resource_type === 'pilot').length;
    const copilotCount  = resources.filter(r => r.resource_type === 'copilot').length;
    const droneCount    = resources.filter(r => r.resource_type === 'drone').length;
    const allocCount    = resources.filter(r => r.allocation_id).length;
    const freeCount     = resources.filter(r => !r.project_id).length;

    return (
        <div className="space-y-8 animate-in fade-in duration-500 font-['Space_Grotesk']">
            <PageHeader
                eyebrow="Resources"
                title="All Resources"
                description="Every pilot, co-pilot and drone — with their current project assignment."
                actions={
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative group">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 group-focus-within:text-primary transition-colors text-sm">search</span>
                            <input
                                type="text"
                                placeholder="Find resource or project..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="bg-surface border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary/50 w-full md:w-56 transition-all"
                            />
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-500 select-none whitespace-nowrap">
                            <input
                                type="checkbox"
                                checked={showUnassigned}
                                onChange={e => setShowUnassigned(e.target.checked)}
                                className="rounded border-slate-300 text-primary focus:ring-primary/30"
                            />
                            Unassigned only
                        </label>
                        <Button variant="secondary" icon="refresh" title="Refresh" onClick={fetchResources} />
                        <Button
                            variant="secondary"
                            icon="flight"
                            onClick={() => navigate('/resources/drones')}
                        >
                            Add Drone
                        </Button>
                        <Button
                            icon="person_add"
                            onClick={() => navigate('/resources')}
                        >
                            Add Pilot
                        </Button>
                    </div>
                }
            />

            {/* Stats row */}
            {!loading && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {[
                        { label: 'Total Pilots',      value: pilotCount,   icon: 'person',      color: 'text-blue-400' },
                        { label: 'Total Co-Pilots',   value: copilotCount, icon: 'group',       color: 'text-violet-400' },
                        { label: 'Total Drones',      value: droneCount,   icon: 'flight',      color: 'text-indigo-400' },
                        { label: 'Formally Allocated',value: allocCount,   icon: 'hub',         color: 'text-green-400' },
                        { label: 'Unassigned',        value: freeCount,    icon: 'person_off',  color: 'text-amber-400' },
                    ].map(s => (
                        <Card key={s.label} className="py-4 px-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
                                    <p className="text-2xl font-black text-slate-900 mt-0.5">{s.value}</p>
                                </div>
                                <span className={`material-symbols-outlined text-4xl ${s.color} opacity-20`}>{s.icon}</span>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Card className="p-0 overflow-hidden">
                {/* Tab bar */}
                <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-slate-100">
                    {TYPE_TABS.map(t => {
                        const count = t.key === 'all'
                            ? resources.length
                            : resources.filter(r => r.resource_type === t.key).length;
                        return (
                            <button
                                key={t.key}
                                onClick={() => setActiveTab(t.key)}
                                className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest rounded-t transition-colors border-b-2 -mb-px ${
                                    activeTab === t.key
                                        ? 'text-primary border-primary bg-primary/5'
                                        : 'text-slate-400 border-transparent hover:text-slate-600'
                                }`}
                            >
                                {t.label}
                                <span className={`ml-1.5 text-[10px] ${activeTab === t.key ? 'text-primary' : 'text-slate-300'}`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {loading ? (
                    <SkeletonTable cols={columns.length} />
                ) : (
                    <Table
                        columns={columns}
                        data={filtered}
                        onRowClick={handleRowClick}
                        empty={{
                            icon: 'hub',
                            title: search ? 'No matching resources' : 'No resources found',
                            description: search
                                ? 'Try a different name, model or project.'
                                : 'Add pilots or drones using the buttons above.',
                            action: (
                                <div className="flex gap-3 justify-center">
                                    <Button size="sm" icon="person_add" onClick={() => navigate('/resources')}>Add Pilot</Button>
                                    <Button size="sm" variant="secondary" icon="flight" onClick={() => navigate('/resources/drones')}>Add Drone</Button>
                                </div>
                            ),
                        }}
                    />
                )}
            </Card>
        </div>
    );
};

export default Allocations;
