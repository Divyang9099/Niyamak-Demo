import { useEffect, useState, useCallback } from 'react';
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
import { Badge } from '../../components/ui/Badge';
import { formatDate } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { useSocket } from '../../context/SocketContext';
import useAuth from '../../hooks/useAuth';
import { ROLES, ROUTES } from '../../utils/constants';

const BLANK_FORM = {
    name: '',
    email: '',
    license_number: '',
    phone: '',
    contact_number: '',
    status: 'active',
    license_expiry: '',
    employee_id: '',
    per_day_rate: '',
    base_location: '',
    certification: '',
    employment_type: 'full_time',
    crew_role: 'co_pilot',
};

const BLANK_ASSIGN = { project_id: '', start_date: '', end_date: '', is_primary: true };

const CoPilots = () => {
    const [copilots, setCopilots] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

    useEffect(() => { setSearchTerm(searchParams.get('search') || ''); }, [searchParams]);

    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);

    const [showAdd, setShowAdd] = useState(false);
    const [addForm, setAddForm] = useState({ ...BLANK_FORM });
    const [addLoading, setAddLoading] = useState(false);

    const [editCopilot, setEditCopilot] = useState(null);
    const [editForm, setEditForm] = useState({ ...BLANK_FORM });
    const [editLoading, setEditLoading] = useState(false);

    const [deleteCopilot, setDeleteCopilot] = useState(null);

    // Assign-to-project
    const [assignCopilot, setAssignCopilot] = useState(null);
    const [assignForm, setAssignForm]       = useState({ ...BLANK_ASSIGN });
    const [projects, setProjects]           = useState([]);
    const [assigning, setAssigning]         = useState(false);

    const isAdmin = user?.role === ROLES.ADMIN;
    const { socket } = useSocket();

    const fetchCopilots = useCallback(async (nextPage = 1, search = searchTerm) => {
        setLoading(true);
        try {
            const params = { page: nextPage, limit: 25, crew_role: 'co_pilot' };
            if (search) params.search = search;
            const res = await axiosInstance.get(ENDPOINTS.RESOURCES.PILOTS, { params });
            const rows = Array.isArray(res.data.data) ? res.data.data : [];
            setCopilots(prev => nextPage === 1 ? rows : [...prev, ...rows]);
            const p = res.data.pagination;
            setHasMore(p ? p.page < p.pages : false);
            setPage(nextPage);
        } catch {
            showToast("Failed to load co-pilot roster", "error");
        } finally {
            setLoading(false);
        }
    }, [searchTerm, showToast]);

    useEffect(() => {
        fetchCopilots(1, searchTerm);
    }, [fetchCopilots, searchTerm]);

    // Socket real-time updates
    useEffect(() => {
        if (!socket) return;
        const refresh = () => fetchCopilots(1, searchTerm);
        socket.on('pilot:created', refresh);
        socket.on('pilot:updated', refresh);
        socket.on('pilot:deleted', refresh);
        return () => {
            socket.off('pilot:created', refresh);
            socket.off('pilot:updated', refresh);
            socket.off('pilot:deleted', refresh);
        };
    }, [socket, fetchCopilots, searchTerm]);

    const handleCreate = async (e) => {
        e.preventDefault();
        setAddLoading(true);
        try {
            const payload = {
                ...addForm,
                crew_role: 'co_pilot',
                role: 'co_pilot',
            };
            await axiosInstance.post(ENDPOINTS.RESOURCES.PILOTS, payload);
            showToast('Co-Pilot created successfully');
            setShowAdd(false);
            setAddForm({ ...BLANK_FORM });
            fetchCopilots(1);
        } catch (err) {
            showToast(err.userMessage || 'Failed to create co-pilot', 'error');
        } finally {
            setAddLoading(false);
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        if (!editCopilot) return;
        setEditLoading(true);
        try {
            await axiosInstance.put(ENDPOINTS.RESOURCES.PILOT(editCopilot.id), editForm);
            showToast('Co-Pilot updated successfully');
            setEditCopilot(null);
            fetchCopilots(page);
        } catch (err) {
            showToast(err.userMessage || 'Failed to update co-pilot', 'error');
        } finally {
            setEditLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteCopilot) return;
        try {
            await axiosInstance.delete(ENDPOINTS.RESOURCES.PILOT(deleteCopilot.id));
            showToast('Co-Pilot removed successfully');
            setDeleteCopilot(null);
            fetchCopilots(1);
        } catch (err) {
            showToast(err.userMessage || 'Failed to delete co-pilot', 'error');
        }
    };

    const handleOpenAssign = async (cp) => {
        setAssignCopilot(cp);
        setAssignForm({ ...BLANK_ASSIGN });
        try {
            const res = await axiosInstance.get(ENDPOINTS.PROJECTS.GET_ALL);
            setProjects(Array.isArray(res.data.data) ? res.data.data : []);
        } catch {
            setProjects([]);
        }
    };

    const handleAssign = async (e) => {
        e.preventDefault();
        if (!assignCopilot || !assignForm.project_id) return;
        setAssigning(true);
        try {
            await axiosInstance.post(ENDPOINTS.PROJECTS.RESOURCES(assignForm.project_id), {
                copilot_id: assignCopilot.id,
                start_date: assignForm.start_date,
                end_date: assignForm.end_date,
                is_primary: assignForm.is_primary,
            });
            showToast(`Co-Pilot assigned to project`);
            setAssignCopilot(null);
            fetchCopilots(page);
        } catch (err) {
            showToast(err.userMessage || 'Assignment failed', 'error');
        } finally {
            setAssigning(false);
        }
    };

    const columns = [
        {
            header: 'Co-Pilot',
            cell: (row) => (
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center text-violet-700 font-bold text-xs">
                        {row.name ? row.name.slice(0, 2).toUpperCase() : 'CP'}
                    </div>
                    <div>
                        <span
                            onClick={() => navigate(`${ROUTES.COPILOTS}/${row.id}`)}
                            className="font-bold text-slate-900 hover:text-violet-600 cursor-pointer block text-sm transition-colors"
                        >
                            {row.name}
                        </span>
                        <span className="text-[11px] text-slate-500">{row.email}</span>
                    </div>
                </div>
            )
        },
        {
            header: 'Status',
            cell: (row) => (
                <Badge variant={row.status === 'active' ? 'success' : row.status === 'on_leave' ? 'warning' : 'neutral'}>
                    {row.status ? row.status.replace('_', ' ') : 'Active'}
                </Badge>
            )
        },
        {
            header: 'License Number',
            cell: (row) => (
                <span className="font-mono text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {row.license_number || '—'}
                </span>
            )
        },
        {
            header: 'License Expiry',
            cell: (row) => row.license_expiry ? (
                <span className="text-xs text-slate-600">{formatDate(row.license_expiry)}</span>
            ) : <span className="text-slate-400 text-xs">—</span>
        },
        {
            header: 'Base Location',
            cell: (row) => <span className="text-xs text-slate-600">{row.base_location || '—'}</span>
        },
        {
            header: 'Day Rate',
            cell: (row) => row.per_day_rate ? (
                <span className="text-xs font-semibold text-slate-700">₹{Number(row.per_day_rate).toLocaleString()}</span>
            ) : <span className="text-slate-400 text-xs">—</span>
        },
        {
            header: 'Actions',
            cell: (row) => (
                <div className="flex items-center gap-1.5 justify-end">
                    <Button
                        size="sm"
                        variant="secondary"
                        icon="assignment_ind"
                        onClick={() => handleOpenAssign(row)}
                        title="Assign to Project"
                    >
                        Assign
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        icon="edit"
                        onClick={() => {
                            setEditCopilot(row);
                            setEditForm({
                                name:            row.name || '',
                                email:           row.email || '',
                                license_number:  row.license_number || '',
                                phone:           row.phone || '',
                                contact_number:  row.contact_number || '',
                                status:          row.status || 'active',
                                license_expiry:  row.license_expiry ? String(row.license_expiry).slice(0, 10) : '',
                                employee_id:     row.employee_id || '',
                                per_day_rate:    row.per_day_rate || '',
                                base_location:   row.base_location || '',
                                certification:   row.certification || '',
                                employment_type: row.employment_type || 'full_time',
                                crew_role:       'co_pilot',
                            });
                        }}
                        title="Edit Co-Pilot"
                    />
                    {isAdmin && (
                        <Button
                            size="sm"
                            variant="danger"
                            icon="delete"
                            onClick={() => setDeleteCopilot(row)}
                            title="Delete Co-Pilot"
                        />
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Co-Pilots"
                description="Manage flight co-pilots, licenses, deployment status, and project assignments."
                icon="group"
                action={
                    isAdmin && (
                        <Button icon="add" onClick={() => setShowAdd(true)}>
                            Add Co-Pilot
                        </Button>
                    )
                }
            />

            <Card>
                <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-sm">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
                        <input
                            type="text"
                            placeholder="Search co-pilots by name, license, employee ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                        />
                    </div>
                </div>

                {loading && copilots.length === 0 ? (
                    <SkeletonTable rows={5} columns={6} />
                ) : copilots.length === 0 ? (
                    <div className="py-16 text-center">
                        <span className="material-symbols-outlined text-4xl text-slate-300 block mb-2">group</span>
                        <p className="text-slate-700 font-bold text-sm mb-1">No Co-Pilots Found</p>
                        <p className="text-slate-400 text-xs mb-4">Add your co-pilot crew records to allocate them to operational flights.</p>
                        {isAdmin && <Button icon="add" onClick={() => setShowAdd(true)}>Add Co-Pilot</Button>}
                    </div>
                ) : (
                    <>
                        <Table columns={columns} data={copilots} />
                        {hasMore && (
                            <div className="p-4 text-center border-t border-slate-100">
                                <Button variant="secondary" onClick={() => fetchCopilots(page + 1)} disabled={loading}>
                                    {loading ? 'Loading...' : 'Load More Co-Pilots'}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </Card>

            {/* Create Co-Pilot Modal */}
            <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add New Co-Pilot">
                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Full Name *"
                            value={addForm.name}
                            onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                            placeholder="e.g. Rahul Sharma"
                            required
                        />
                        <Input
                            label="Email Address *"
                            type="email"
                            value={addForm.email}
                            onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                            placeholder="rahul.sharma@example.com"
                            required
                        />
                        <Input
                            label="License Number"
                            value={addForm.license_number}
                            onChange={e => setAddForm({ ...addForm, license_number: e.target.value })}
                            placeholder="CP-2024-001"
                        />
                        <Input
                            label="License Expiry"
                            type="date"
                            value={addForm.license_expiry}
                            onChange={e => setAddForm({ ...addForm, license_expiry: e.target.value })}
                        />
                        <Input
                            label="Employee ID"
                            value={addForm.employee_id}
                            onChange={e => setAddForm({ ...addForm, employee_id: e.target.value })}
                            placeholder="EMP-CP-001"
                        />
                        <Input
                            label="Contact Number"
                            value={addForm.contact_number}
                            onChange={e => setAddForm({ ...addForm, contact_number: e.target.value })}
                            placeholder="+91 9876543210"
                        />
                        <Input
                            label="Base Location"
                            value={addForm.base_location}
                            onChange={e => setAddForm({ ...addForm, base_location: e.target.value })}
                            placeholder="e.g. Ahmedabad, Gujarat"
                        />
                        <Input
                            label="Day Rate (₹)"
                            type="number"
                            value={addForm.per_day_rate}
                            onChange={e => setAddForm({ ...addForm, per_day_rate: e.target.value })}
                            placeholder="10000"
                        />
                    </div>

                    <p className="text-xs text-violet-600 bg-violet-50 p-2.5 rounded-lg border border-violet-200 flex items-center gap-1.5 font-medium">
                        <span className="material-symbols-outlined text-sm text-violet-500">info</span>
                        Co-pilot records have no login access. No credentials email will be sent.
                    </p>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
                        <Button type="submit" disabled={addLoading}>{addLoading ? 'Creating…' : 'Create Co-Pilot'}</Button>
                    </div>
                </form>
            </Modal>

            {/* Edit Co-Pilot Modal */}
            <Modal isOpen={!!editCopilot} onClose={() => setEditCopilot(null)} title="Edit Co-Pilot">
                <form onSubmit={handleUpdate} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Full Name *"
                            value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            required
                        />
                        <Input
                            label="Email Address *"
                            type="email"
                            value={editForm.email}
                            onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                            disabled
                        />
                        <Input
                            label="License Number"
                            value={editForm.license_number}
                            onChange={e => setEditForm({ ...editForm, license_number: e.target.value })}
                        />
                        <Input
                            label="License Expiry"
                            type="date"
                            value={editForm.license_expiry}
                            onChange={e => setEditForm({ ...editForm, license_expiry: e.target.value })}
                        />
                        <Input
                            label="Employee ID"
                            value={editForm.employee_id}
                            onChange={e => setEditForm({ ...editForm, employee_id: e.target.value })}
                        />
                        <Input
                            label="Contact Number"
                            value={editForm.contact_number}
                            onChange={e => setEditForm({ ...editForm, contact_number: e.target.value })}
                        />
                        <Input
                            label="Base Location"
                            value={editForm.base_location}
                            onChange={e => setEditForm({ ...editForm, base_location: e.target.value })}
                        />
                        <Input
                            label="Day Rate (₹)"
                            type="number"
                            value={editForm.per_day_rate}
                            onChange={e => setEditForm({ ...editForm, per_day_rate: e.target.value })}
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Status</label>
                        <select
                            className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm"
                            value={editForm.status}
                            onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                        >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="on_leave">On Leave</option>
                        </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setEditCopilot(null)}>Cancel</Button>
                        <Button type="submit" disabled={editLoading}>{editLoading ? 'Saving…' : 'Save Changes'}</Button>
                    </div>
                </form>
            </Modal>

            {/* Assign Modal */}
            <Modal isOpen={!!assignCopilot} onClose={() => setAssignCopilot(null)} title={`Assign ${assignCopilot?.name || 'Co-Pilot'} to Project`}>
                <form onSubmit={handleAssign} className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Project *</label>
                        <select
                            className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm"
                            value={assignForm.project_id}
                            onChange={e => setAssignForm({ ...assignForm, project_id: e.target.value })}
                            required
                        >
                            <option value="">— Select a project —</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Start Date *"
                            type="date"
                            value={assignForm.start_date}
                            onChange={e => setAssignForm({ ...assignForm, start_date: e.target.value })}
                            required
                        />
                        <Input
                            label="End Date *"
                            type="date"
                            value={assignForm.end_date}
                            onChange={e => setAssignForm({ ...assignForm, end_date: e.target.value })}
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setAssignCopilot(null)}>Cancel</Button>
                        <Button type="submit" disabled={assigning || !assignForm.project_id}>{assigning ? 'Assigning…' : 'Assign to Project'}</Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Modal */}
            <Modal isOpen={!!deleteCopilot} onClose={() => setDeleteCopilot(null)} title="Delete Co-Pilot">
                <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                        Are you sure you want to remove co-pilot <strong className="text-slate-900">{deleteCopilot?.name}</strong>? This action cannot be undone.
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setDeleteCopilot(null)}>Cancel</Button>
                        <Button variant="danger" onClick={handleDelete}>Delete</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default CoPilots;
