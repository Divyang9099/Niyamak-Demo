import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { Table } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { capitalize } from '../../utils/helpers';
import { formatDateOnly } from '../../utils/dateUtils';
import useAuth from '../../hooks/useAuth';
import { ROLES, DRONE_MAKES } from '../../utils/constants';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import { useSocket } from '../../context/SocketContext';
import ResourceGantt from '../../components/ui/ResourceGantt';

const Drones = () => {
    const { showToast } = useToast();
const { confirmDialog } = useDialog();
    const { socket } = useSocket();
    const [drones, setDrones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    // Sync when Topbar navigates here with ?search= param
    useEffect(() => { setSearchTerm(searchParams.get('search') || ''); }, [searchParams]);
    const [maintenanceDrone, setMaintenanceDrone] = useState(null);
    const [showMaintenance, setShowMaintenance] = useState(false);
    const [maintenanceList, setMaintenanceList] = useState([]);
    const [form, setForm] = useState({
      maintenance_type: '',
      description: '',
      performed_by: '',
      performed_at: '',
      next_due: '',
      cost: ''
    });

    const [showRegister, setShowRegister] = useState(false);
    const BLANK_REGISTER = { serial_number: '', name: '', model: '', make: '', day_rate: '', next_maintenance: '', status: 'active' };
    const [registerForm, setRegisterForm] = useState({ ...BLANK_REGISTER });

    const [editDrone,  setEditDrone]  = useState(null);
    const [editForm,   setEditForm]   = useState({ serial_number: '', name: '', model: '', status: 'active' });

    // Assign-to-project
    const BLANK_ASSIGN = { project_id: '', start_date: '', end_date: '', is_primary: true };
    const [assignDrone,  setAssignDrone]  = useState(null);
    const [assignForm,   setAssignForm]   = useState({ ...BLANK_ASSIGN });
    const [projects,     setProjects]     = useState([]);
    const [assigning,    setAssigning]    = useState(false);

    // ── Gantt chart state ─────────────────────────────────────────────────────
    const [ganttData,    setGanttData]    = useState([]);
    const [ganttLoading, setGanttLoading] = useState(true);
    const [ganttDays,    setGanttDays]    = useState(90);

    const loadGantt = useCallback(async (days) => {
        setGanttLoading(true);
        try {
            const res = await axiosInstance.get(ENDPOINTS.DASHBOARD.DRONE_GANTT, { params: { days: days || ganttDays } });
            setGanttData(Array.isArray(res.data.data) ? res.data.data : []);
        } catch { setGanttData([]); }
        finally { setGanttLoading(false); }
    }, [ganttDays]);

    useEffect(() => { loadGantt(ganttDays); }, [ganttDays]);

    const handleExportGantt = () => {
        if (!ganttData.length) { showToast('No schedule data to export', 'error'); return; }
        const today = new Date().toISOString().split('T')[0];
        const headers = ['Drone', 'Serial', 'Active Allocations', 'Projects', 'Pipeline Items'];
        const rows = ganttData.map(u => {
            const allocs = (u.allocations || []).map(a => `${a.project_name}(${a.start_date}→${a.end_date})`).join('; ');
            const pipes  = (u.pipeline  || []).map(p => p.project_name).join('; ');
            return [
                `"${(u.drone_name || u.name || '').replace(/"/g, '""')}"`,
                `"${(u.drone_serial || u.serial_number || '').replace(/"/g, '""')}"`,
                u.allocations?.length ?? 0,
                `"${allocs.replace(/"/g, '""')}"`,
                `"${pipes.replace(/"/g, '""')}"`,
            ];
        });
        const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.setAttribute('download', `Niyamak_Drone_Schedule_${today}.csv`);
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    };

    const fetchDrones = async (nextPage = 1, search = searchTerm) => {
        setLoading(true);
        try {
            const params = { page: nextPage, limit: 25 };
            if (search && search.trim()) params.search = search.trim();
            const res = await axiosInstance.get(ENDPOINTS.RESOURCES.DRONES, { params });
            const rows = Array.isArray(res.data.data) ? res.data.data : [];
            setDrones(prev => nextPage === 1 ? rows : [...prev, ...rows]);
            const p = res.data.pagination;
            setHasMore(p ? p.page < p.pages : false);
            setPage(nextPage);
        } catch (err) {
            showToast("Failed to fetch drone inventory", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDrones(1);
    }, []);

    // Re-fetch when searchTerm changes (300ms debounce)
    useEffect(() => {
        const t = setTimeout(() => fetchDrones(1, searchTerm), 300);
        return () => clearTimeout(t);
    }, [searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!socket) return;
        const refresh = () => fetchDrones(1);
        socket.on('drone:created', refresh);
        socket.on('drone:updated', refresh);
        socket.on('drone:deleted', refresh);
        return () => {
            socket.off('drone:created', refresh);
            socket.off('drone:updated', refresh);
            socket.off('drone:deleted', refresh);
        };
    }, [socket]);

    const handleRegister = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...registerForm,
                day_rate: registerForm.day_rate ? Number(registerForm.day_rate) : null,
                next_maintenance: registerForm.next_maintenance || null,
            };
            await axiosInstance.post(ENDPOINTS.RESOURCES.DRONES, payload);
            showToast("Drone registered successfully");
            setShowRegister(false);
            setRegisterForm({ ...BLANK_REGISTER });
            fetchDrones(1);
        } catch (err) {
            showToast(err.userMessage, "error");
        }
    };

    const openEdit = (drone) => {
        setEditDrone(drone);
        setEditForm({ serial_number: drone.serial_number || '', name: drone.name || '', model: drone.model || '', status: drone.status || 'active' });
    };

    const handleEdit = async (e) => {
        e.preventDefault();
        if (!editDrone) return;
        try {
            await axiosInstance.put(ENDPOINTS.RESOURCES.DRONE(editDrone.id), editForm);
            showToast("Drone updated successfully");
            setEditDrone(null);
            fetchDrones(1);
        } catch (err) {
            showToast(err.userMessage, "error");
        }
    };

    const handleDelete = async (drone) => {
        if (!(await confirmDialog({ message: `Delete drone "${drone.serial_number || drone.name}"? This cannot be undone.`, danger: true }))) return;
        try {
            await axiosInstance.delete(ENDPOINTS.RESOURCES.DRONE(drone.id));
            showToast("Drone removed from inventory");
            fetchDrones(1);
        } catch (err) {
            showToast(err.userMessage, "error");
        }
    };

    const loadMaintenance = async (drone) => {
        try {
            const res = await axiosInstance.get(ENDPOINTS.RESOURCES.DRONE_MAINT(drone.id));
            // Backend returns plain array in res.data.data
            const maintData = Array.isArray(res.data.data) ? res.data.data : [];
            const list = maintData.sort((a, b) => new Date(b.performed_at) - new Date(a.performed_at));
            setMaintenanceList(list);
        } catch (e) {
            showToast("Failed to load maintenance history", "error");
            setMaintenanceList([]);
        }
    };

    const openMaintenance = (drone) => {
        setMaintenanceList([]);
        setMaintenanceDrone(drone);
        setForm({ maintenance_type: '', description: '', performed_by: '', performed_at: '', next_due: '', cost: '' });
        loadMaintenance(drone);
        setShowMaintenance(true);
    };

    const closeMaintenance = () => {
        setShowMaintenance(false);
        setMaintenanceDrone(null);
        setMaintenanceList([]);
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const submitMaintenance = async (e) => {
        e.preventDefault();
        if (!maintenanceDrone) return;
        try {
            await axiosInstance.post(ENDPOINTS.RESOURCES.DRONE_MAINT(maintenanceDrone.id), form);
            showToast("Maintenance record saved successfully");
            await loadMaintenance(maintenanceDrone);
            setForm({ maintenance_type: '', description: '', performed_by: '', performed_at: '', next_due: '', cost: '' });
        } catch (err) {
            showToast(err.userMessage, "error");
        }
    };

    const openAssign = async (drone) => {
        setAssignDrone(drone);
        setAssignForm({ ...BLANK_ASSIGN });
        try {
            const res = await axiosInstance.get(ENDPOINTS.PROJECTS.GET_ALL, { params: { limit: 100 } });
            const all = Array.isArray(res.data.data) ? res.data.data : [];
            setProjects(all.filter(p => p.status !== 'cancelled' && p.status !== 'complete'));
        } catch { setProjects([]); }
    };

    const handleAssign = async (e) => {
        e.preventDefault();
        if (!assignForm.project_id) { showToast('Select a project', 'error'); return; }
        if (!assignForm.start_date || !assignForm.end_date) { showToast('Dates are required', 'error'); return; }
        setAssigning(true);
        try {
            await axiosInstance.post(ENDPOINTS.PROJECTS.RESOURCES(assignForm.project_id), {
                drone_id: assignDrone.id,
                start_date: assignForm.start_date,
                end_date: assignForm.end_date,
                is_primary: assignForm.is_primary,
            });
            showToast(`${assignDrone.name || assignDrone.serial_number} assigned to project`);
            setAssignDrone(null);
        } catch (err) {
            const msg = err.userMessage;
            showToast(msg, 'error');
        } finally { setAssigning(false); }
    };

    const columns = useMemo(() => [
        {
            header: 'Drone',
            cell: (row) => (
                <div 
                    className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 p-1 -m-1 rounded transition-colors" 
                    onClick={() => navigate(`/resources/drones/${row.id}`)}
                >
                    <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center">
                        <span className="material-symbols-outlined text-xs">precision_manufacturing</span>
                    </div>
                    <div>
                        <p className="font-bold text-slate-900 text-sm hover:text-slate-500 transition-colors">{row.name || row.serial_number || 'Unknown'}</p>
                        <p className="text-[10px] text-slate-400 font-mono tracking-wide">{row.serial_number}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">{row.model || 'Standard Unit'}</p>
                    </div>
                </div>
            )
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: (row) => (
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                    row.status === 'active' ? 'bg-green-500/10 text-green-400' : 
                    row.status === 'maintenance' ? 'bg-amber-500/10 text-amber-400' : 
                    'bg-red-500/10 text-red-400'
                }`}
                >
                    {row.status || 'OFFLINE'}
                </span>
            )
        },
        {
            header: 'Maintenance',
            cell: (row) => (
                <Button size="sm" onClick={() => openMaintenance(row)} icon="build">
                    Log / View
                </Button>
            )
        },
        {
            header: 'Assign',
            cell: (row) => (
                <Button size="sm" variant="secondary" icon="flight_takeoff"
                    onClick={() => openAssign(row)}
                    title="Assign to project">
                    Assign
                </Button>
            )
        },
        ...(user?.role === ROLES.ADMIN ? [{
            header: 'Actions',
            cell: (row) => (
                <div className="flex gap-2">
                    <Button size="sm" variant="secondary" icon="edit" onClick={() => openEdit(row)} title="Edit" />
                    <Button size="sm" variant="danger" icon="delete" onClick={() => handleDelete(row)} title="Delete" />
                </div>
            )
        }] : [])
    ], [navigate, user?.role]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <PageHeader
                eyebrow="Resources"
                title="Drone Fleet"
                description="Registered aircraft, sensor payloads and maintenance schedules."
                actions={user?.role === ROLES.ADMIN && (
                    <Button icon="add_box" onClick={() => setShowRegister(true)}>Register Drone</Button>
                )}
            />

            {/* Search bar */}
            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base pointer-events-none">search</span>
                    <input
                        type="text"
                        placeholder="Search drones…"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <span className="material-symbols-outlined text-base">close</span>
                        </button>
                    )}
                </div>
            </div>

            <Card>
                {loading && page === 1 ? (
                    <SkeletonTable cols={columns.length} />
                ) : (
                    <Table
                        columns={columns}
                        data={drones}
                        empty={{
                            icon: 'flight',
                            title: searchTerm ? 'No drones match your search' : 'No drones registered',
                            description: searchTerm ? `No results for "${searchTerm}". Try a different name or serial number.` : 'Register your first aircraft to start tracking the fleet.',
                            action: user?.role === ROLES.ADMIN
                                ? <Button icon="add_box" size="sm" onClick={() => setShowRegister(true)}>Register Drone</Button>
                                : null,
                        }}
                    />
                )}
            </Card>
            {hasMore && (
                <div className="flex justify-center">
                    <Button variant="secondary" onClick={() => fetchDrones(page + 1)} disabled={loading}>
                        {loading ? 'Loading...' : 'Load More'}
                    </Button>
                </div>
            )}

            {/* Registration Modal */}
            <Modal
                title="Register New Drone"
                isOpen={showRegister}
                onClose={() => { setShowRegister(false); setRegisterForm({ ...BLANK_REGISTER }); }}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => { setShowRegister(false); setRegisterForm({ ...BLANK_REGISTER }); }}>Cancel</Button>
                        <Button type="submit" form="drone-register-form">Register Drone</Button>
                    </div>
                }
            >
                <form id="drone-register-form" onSubmit={handleRegister} className="space-y-4">
                    <Input label="Serial Number" icon="tag" value={registerForm.serial_number} onChange={e => setRegisterForm({ ...registerForm, serial_number: e.target.value })} required placeholder="M300-SN-20210891" />
                    <Input label="Friendly Name" icon="flight" value={registerForm.name} onChange={e => setRegisterForm({ ...registerForm, name: e.target.value })} required placeholder="DJI Matrice 300 RTK" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Model" value={registerForm.model} onChange={e => setRegisterForm({ ...registerForm, model: e.target.value })} required placeholder="Matrice 300 RTK" />
                        <Input label="Make" list="drone-makes" value={registerForm.make} onChange={e => setRegisterForm({ ...registerForm, make: e.target.value })} placeholder="DJI" />
                        <datalist id="drone-makes">
                            {DRONE_MAKES.map(m => <option key={m} value={m} />)}
                        </datalist>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Per Day Rate (₹)" type="number" icon="currency_rupee" value={registerForm.day_rate} onChange={e => setRegisterForm({ ...registerForm, day_rate: e.target.value })} placeholder="25000" />
                        <Input label="Next Maintenance" type="date" value={registerForm.next_maintenance} onChange={e => setRegisterForm({ ...registerForm, next_maintenance: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</label>
                        <select value={registerForm.status} onChange={e => setRegisterForm({ ...registerForm, status: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-900 focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none">
                            <option value="active">Active</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="offline">Offline</option>
                        </select>
                    </div>
                    <p className="text-xs text-slate-400 flex items-start gap-1.5 pt-1">
                        <span className="material-symbols-outlined text-sm text-slate-300 flex-shrink-0 mt-px">info</span>
                        If "Next Maintenance" is within 7 days, all admins get a maintenance-due alert on the next backend run.
                    </p>
                </form>
            </Modal>

            {/* Edit Modal */}
            <Modal title="Edit Drone" isOpen={!!editDrone} onClose={() => setEditDrone(null)}>
                <form onSubmit={handleEdit} className="space-y-4">
                    <Input label="Serial Number" value={editForm.serial_number} onChange={e => setEditForm({ ...editForm, serial_number: e.target.value })} required placeholder="e.g. M300-SN-20210891" />
                    <Input label="Friendly Name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required placeholder="e.g. DJI Matrice 300 RTK" />
                    <Input label="Model" value={editForm.model} onChange={e => setEditForm({ ...editForm, model: e.target.value })} placeholder="e.g. Matrice 300 RTK" />
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</label>
                        <select value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                            className="w-full bg-surface border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-900">
                            <option value="active">Active</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="offline">Offline</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <Button type="button" variant="secondary" onClick={() => setEditDrone(null)}>Cancel</Button>
                        <Button type="submit">Save Changes</Button>
                    </div>
                </form>
            </Modal>

            {/* Maintenance Modal */}
            {showMaintenance && maintenanceDrone && (
                <Modal title={`Maintenance for ${maintenanceDrone.serial_number}`} isOpen={showMaintenance} onClose={closeMaintenance}>
                    <form onSubmit={submitMaintenance} className="space-y-4 text-slate-900">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input name="maintenance_type" value={form.maintenance_type} onChange={handleFormChange} placeholder="e.g. Routine Inspection, Repair" className="bg-slate-200 p-2 rounded text-sm" required />
                            <input name="performed_by" value={form.performed_by} onChange={handleFormChange} placeholder="e.g. Ravi Kumar (Technician)" className="bg-slate-200 p-2 rounded text-sm" required />
                        </div>
                        <textarea name="description" value={form.description} onChange={handleFormChange} placeholder="e.g. Replaced motor, calibrated gimbal, cleaned sensors..." className="bg-slate-200 p-2 rounded min-h-[6rem] resize-none w-full text-sm" />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input type="date" name="performed_at" value={form.performed_at} onChange={handleFormChange} className="bg-slate-200 p-2 rounded" required />
                            <input type="date" name="next_due" value={form.next_due} onChange={handleFormChange} className="bg-slate-200 p-2 rounded" />
                            <input type="number" step="0.01" name="cost" value={form.cost} onChange={handleFormChange} placeholder="e.g. 5000" className="bg-slate-200 p-2 rounded" />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="secondary" onClick={closeMaintenance}>Cancel</Button>
                            <Button type="submit">Save</Button>
                        </div>
                    </form>
                    <hr className="border-slate-200 my-4" />
                    <h3 className="text-sm font-bold text-slate-500 mb-2">History</h3>
                    <Table
                        columns={[
                            { header: 'Type', accessorKey: 'maintenance_type' },
                            { header: 'Description', accessorKey: 'description' },
                            { header: 'Performed By', accessorKey: 'performed_by' },
                            { header: 'Date', accessorKey: 'performed_at', cell: (row) => formatDateOnly(row.performed_at) },
                            { header: 'Next Due', accessorKey: 'next_due', cell: (row) => formatDateOnly(row.next_due) },
                            { header: 'Cost', accessorKey: 'cost', cell: (row) => `₹ ${Number(row.cost).toLocaleString('en-IN')}` }
                        ]}
                        data={maintenanceList}
                    />
                </Modal>
            )}

            {/* ── Drone Schedule Gantt ───────────────────────────────────────── */}
            <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Fleet</p>
                        <h3 className="text-sm font-bold text-slate-900">Drone Schedule</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Day-range toggle */}
                        <div className="flex items-center gap-1">
                            {[30, 60, 90, 180].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setGanttDays(d)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                                        ganttDays === d
                                            ? 'bg-primary text-on-primary border-primary'
                                            : 'bg-surface text-slate-500 border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    {d}d
                                </button>
                            ))}
                        </div>
                        {/* Export */}
                        <button
                            onClick={handleExportGantt}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all"
                        >
                            <span className="material-symbols-outlined text-sm">download</span>
                            Export CSV
                        </button>
                    </div>
                </div>

                {/* Legend */}
                <div className="px-6 py-2 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-500 inline-block"></span>Project</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border-2 border-dashed border-purple-500 bg-purple-100 inline-block"></span>Pipeline</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200 inline-block"></span>Maintenance</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-violet-300 inline-block"></span>Expo</span>
                </div>

                {/* Chart */}
                <div className="overflow-hidden">
                    <ResourceGantt
                        rows={ganttData}
                        loading={ganttLoading}
                        days={ganttDays}
                        emptyIcon="flight"
                        emptyText="No drone allocations in this period"
                    />
                </div>
            </div>

            {/* Assign to Project Modal */}
            <Modal title={`Assign ${assignDrone?.name || assignDrone?.serial_number || 'Drone'} to Project`} isOpen={!!assignDrone} onClose={() => setAssignDrone(null)}>
                <form onSubmit={handleAssign} className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Project</label>
                        <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                            value={assignForm.project_id} onChange={e => setAssignForm({ ...assignForm, project_id: e.target.value })} required>
                            <option value="">— Select project —</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Input label="Start Date" type="date" value={assignForm.start_date} onChange={e => setAssignForm({ ...assignForm, start_date: e.target.value })} required />
                        <Input label="End Date" type="date" value={assignForm.end_date} onChange={e => setAssignForm({ ...assignForm, end_date: e.target.value })} required />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Allocation Type</label>
                        <div className="flex gap-2">
                            {[true, false].map(val => (
                                <button key={String(val)} type="button"
                                    onClick={() => setAssignForm({ ...assignForm, is_primary: val })}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${assignForm.is_primary === val ? 'bg-primary text-on-primary border-primary' : 'bg-transparent text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                                    {val ? 'Primary' : 'Secondary'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" variant="ghost" onClick={() => setAssignDrone(null)}>Cancel</Button>
                        <Button type="submit" icon="flight_takeoff" disabled={assigning}>
                            {assigning ? 'Assigning…' : 'Assign to Project'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Drones;
