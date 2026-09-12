import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { API_BASE_URL, ENDPOINTS } from '../../api/endpoints';
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
import { ROLES } from '../../utils/constants';
import ResourceGantt from '../../components/ui/ResourceGantt';

const BLANK_FORM = { name: '', email: '', license_number: '', phone: '', contact_number: '', status: 'active', license_expiry: '', employee_id: '', per_day_rate: '', base_location: '', certification: '', employment_type: 'full_time' };
const BLANK_FILES = { aadhaar: null, passport: null, certificate: null };
const BLANK_ASSIGN = { project_id: '', start_date: '', end_date: '', is_primary: true };

const Pilots = () => {
    const [pilots, setPilots] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    // Sync when Topbar navigates here with ?search= param
    useEffect(() => { setSearchTerm(searchParams.get('search') || ''); }, [searchParams]);

    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);

    const [showAdd, setShowAdd] = useState(false);
    const [addForm, setAddForm] = useState({ ...BLANK_FORM });
    const [addFiles, setAddFiles] = useState({ ...BLANK_FILES });

    const [editPilot, setEditPilot] = useState(null);
    const [editForm, setEditForm] = useState({ ...BLANK_FORM });
    const [editFiles, setEditFiles] = useState({ ...BLANK_FILES });

    const [deletePilot, setDeletePilot] = useState(null);

    // Assign-to-project
    const [assignPilot, setAssignPilot]   = useState(null);
    const [assignForm,  setAssignForm]    = useState({ ...BLANK_ASSIGN });
    const [projects,    setProjects]      = useState([]);
    const [assigning,   setAssigning]     = useState(false);

    const isAdmin = user?.role === ROLES.ADMIN;
    const { socket } = useSocket();

    // ── Gantt chart state ────────────────────────────────────────────────────
    const [ganttData,    setGanttData]    = useState([]);
    const [ganttLoading, setGanttLoading] = useState(true);
    const [ganttDays,    setGanttDays]    = useState(90);

    const loadGantt = useCallback(async (days) => {
        setGanttLoading(true);
        try {
            const res = await axiosInstance.get(ENDPOINTS.DASHBOARD.PILOT_GANTT, { params: { days: days || ganttDays } });
            setGanttData(Array.isArray(res.data.data) ? res.data.data : []);
        } catch { setGanttData([]); }
        finally { setGanttLoading(false); }
    }, [ganttDays]);

    useEffect(() => { loadGantt(ganttDays); }, [ganttDays]);

    const handleExportGantt = () => {
        if (!ganttData.length) { showToast('No schedule data to export', 'error'); return; }
        const today = new Date().toISOString().split('T')[0];
        const headers = ['Pilot', 'Active Allocations', 'Projects', 'Pipeline Items', 'Conflicts'];
        const rows = ganttData.map(u => {
            const allocs = (u.allocations || []).map(a => `${a.project_name}(${a.start_date}→${a.end_date})`).join('; ');
            const pipes  = (u.pipeline  || []).map(p => p.project_name).join('; ');
            return [
                `"${(u.pilot_name || '').replace(/"/g, '""')}"`,
                u.allocations?.length ?? 0,
                `"${allocs.replace(/"/g, '""')}"`,
                `"${pipes.replace(/"/g, '""')}"`,
                u.allocations?.length > 1 ? 'Check' : 'OK',
            ];
        });
        const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.setAttribute('download', `Niyamak_Pilot_Schedule_${today}.csv`);
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    };

    const fetchPilots = useCallback(async (nextPage = 1, search = searchTerm) => {
        setLoading(true);
        try {
            const params = { page: nextPage, limit: 25, crew_role: 'pilot' };
            if (search) params.search = search;
            const res = await axiosInstance.get(ENDPOINTS.RESOURCES.PILOTS, { params });
            const rows = Array.isArray(res.data.data) ? res.data.data : [];
            setPilots(prev => nextPage === 1 ? rows : [...prev, ...rows]);
            const p = res.data.pagination;
            setHasMore(p ? p.page < p.pages : false);
            setPage(nextPage);
        } catch {
            showToast("Failed to load pilot roster", "error");
        } finally {
            setLoading(false);
        }
    }, [searchTerm, showToast]);

    // Socket: refresh list when pilots change
    useEffect(() => {
        if (!socket) return;
        const refresh = () => fetchPilots(1);
        socket.on('pilot:created', refresh);
        socket.on('pilot:updated', refresh);
        socket.on('pilot:deleted', refresh);
        return () => {
            socket.off('pilot:created', refresh);
            socket.off('pilot:updated', refresh);
            socket.off('pilot:deleted', refresh);
        };
    }, [socket, fetchPilots]);

    useEffect(() => {
        const timer = setTimeout(() => fetchPilots(1, searchTerm), 300);
        return () => clearTimeout(timer);
    }, [searchTerm, fetchPilots]);

    const handleAdd = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            Object.entries(addForm).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
            if (addFiles.aadhaar)     fd.append('aadhaar',     addFiles.aadhaar);
            if (addFiles.passport)    fd.append('passport',    addFiles.passport);
            if (addFiles.certificate) fd.append('certificate', addFiles.certificate);
            await axiosInstance.post(ENDPOINTS.RESOURCES.PILOTS, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showToast("Pilot deployed successfully");
            setShowAdd(false);
            setAddForm({ ...BLANK_FORM });
            setAddFiles({ ...BLANK_FILES });
            fetchPilots(1);
        } catch (err) {
            showToast(err.userMessage, "error");
        }
    };

    const handleEdit = async (e) => {
        e.preventDefault();
        try {
            const fd = new FormData();
            // Send every field (including blanks) so an edit can CLEAR a value, e.g.
            // removing a licence expiry. The backend coerces '' → NULL for date/numeric
            // columns. (Add form still skips blanks — nothing to clear on create.)
            Object.entries(editForm).forEach(([k, v]) => fd.append(k, v ?? ''));
            if (editFiles.aadhaar)     fd.append('aadhaar',     editFiles.aadhaar);
            if (editFiles.passport)    fd.append('passport',    editFiles.passport);
            if (editFiles.certificate) fd.append('certificate', editFiles.certificate);
            await axiosInstance.put(ENDPOINTS.RESOURCES.PILOT(editPilot.id), fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            showToast("Pilot record updated");
            setEditPilot(null);
            setEditFiles({ ...BLANK_FILES });
            fetchPilots(1);
        } catch (err) {
            showToast(err.userMessage, "error");
        }
    };

    const handleDelete = async () => {
        try {
            await axiosInstance.delete(ENDPOINTS.RESOURCES.PILOT(deletePilot.id));
            showToast("Pilot record removed");
            setDeletePilot(null);
            fetchPilots(1);
        } catch (err) {
            showToast(err.userMessage, "error");
        }
    };

    const openEdit = (pilot) => {
        setEditPilot(pilot);
        setEditFiles({ ...BLANK_FILES });
        setEditForm({
            name:           pilot.name || '',
            email:          pilot.email || '',
            license_number: pilot.license_number || '',
            phone:          pilot.phone || '',
            contact_number: pilot.contact_number || '',
            status:         pilot.status || 'active',
            license_expiry: pilot.license_expiry ? pilot.license_expiry.split('T')[0] : '',
            employee_id:    pilot.employee_id || '',
            per_day_rate:   pilot.per_day_rate || '',
            base_location:  pilot.base_location || '',
            certification:  pilot.certification || '',
            employment_type: pilot.employment_type || 'full_time',
        });
    };

    const openAssign = async (pilot) => {
        setAssignPilot(pilot);
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
                pilot_id: assignPilot.id,
                start_date: assignForm.start_date,
                end_date: assignForm.end_date,
                is_primary: assignForm.is_primary,
            });
            showToast(`${assignPilot.name} assigned to project`);
            setAssignPilot(null);
        } catch (err) {
            const msg = err.userMessage;
            showToast(msg, 'error');
        } finally { setAssigning(false); }
    };

    const columns = useMemo(() => [
        {
            header: 'Resource Identity',
            cell: (row) => (
                <div className="flex items-center gap-3">
                    <img
                        src={row.avatar_url
                            ? `${API_BASE_URL}/users/${row.user_id}/avatar`
                            : `https://ui-avatars.com/api/?name=${encodeURIComponent(row.name || 'U')}&background=353535&color=fff`}
                        className="w-8 h-8 rounded-full object-cover border border-outline-variant/30 bg-slate-100"
                        alt={row.name || 'pilot'}
                        onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(row.name || 'U')}&background=353535&color=fff`; }}
                    />
                    <div>
                        <p className="font-bold text-slate-900 text-sm">{row.name}</p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">{row.license_number || 'UNLICENSED'}</p>
                    </div>
                </div>
            )
        },
        {
            header: 'Contact',
            cell: (row) => (
                <div className="flex flex-col">
                    <span className="text-slate-900 text-xs">{row.email || '—'}</span>
                    <span className="text-slate-500 text-[10px]">{row.phone || '—'}</span>
                </div>
            )
        },
        {
            header: 'License Expiry',
            cell: (row) => {
                if (!row.license_expiry) return <span className="text-slate-500 text-xs">&mdash;</span>;
                const exp = new Date(row.license_expiry);
                const soon = (exp - Date.now()) < 1000 * 60 * 60 * 24 * 30;
                return (
                    <span className={`text-xs font-mono ${soon ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
                        {formatDate(row.license_expiry)}{soon ? ' ⚠' : ''}
                    </span>
                );
            }
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: (row) => (
                <Badge status={row.status}>{row.status || 'OFFLINE'}</Badge>
            )
        },
        {
            header: 'Assign',
            cell: (row) => (
                <Button size="sm" variant="secondary" icon="assignment_ind"
                    onClick={(e) => { e.stopPropagation(); openAssign(row); }}
                    title="Assign to project">
                    Assign
                </Button>
            )
        },
        ...(isAdmin ? [{
            header: 'Actions',
            cell: (row) => (
                <div className="flex gap-2">
                    <Button size="sm" variant="ghost" icon="edit" onClick={(e) => { e.stopPropagation(); openEdit(row); }} />
                    <Button size="sm" variant="ghost" icon="delete" onClick={(e) => { e.stopPropagation(); setDeletePilot(row); }}
                        className="text-red-400 hover:text-red-300" />
                </div>
            )
        }] : [])
    ], [isAdmin, navigate]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <PageHeader
                eyebrow="Resources"
                title="Pilot Roster"
                description="Certified drone pilots, their licenses and availability."
                actions={isAdmin && (
                    <Button icon="person_add" onClick={() => setShowAdd(true)}>Add Pilot</Button>
                )}
            />

            <div className="flex flex-col md:flex-row gap-6 lg:gap-8">
                <Card className="flex-1 min-w-0">
                    <div className="mb-6 relative group">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
                        <input
                            type="text"
                            placeholder="Locate pilot by name or license..."
                            className="w-full bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-primary rounded-lg py-3 pl-10 text-slate-900 outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {loading && page === 1 ? (
                        <SkeletonTable cols={5} />
                    ) : (
                        <>
                            <Table columns={columns} data={pilots} onRowClick={row => navigate(`/resources/pilots/${row.id}`)} />
                            {hasMore && (
                                <div className="flex justify-center mt-4">
                                    <Button variant="secondary" size="sm" onClick={() => fetchPilots(page + 1)} disabled={loading}>
                                        {loading ? 'Loading...' : 'Load More'}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </Card>

                <div className="w-full md:w-72 lg:w-80 shrink-0 space-y-4">
                    <Card title="Roster Stats">
                        <div className="space-y-6">
                            {[
                                { label: 'Active Deployments', val: pilots.filter(p => p.status === 'active').length, icon: 'flight_takeoff' },
                                { label: 'On Leave', val: pilots.filter(p => p.status === 'on_leave').length, icon: 'beach_access' },
                                { label: 'Total Assets', val: pilots.length, icon: 'verified' }
                            ].map((s, idx) => (
                                <div key={idx} className="flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-200 rounded-lg group-hover:bg-primary transition-colors">
                                            <span className="material-symbols-outlined text-sm text-slate-900 group-hover:text-slate-900">{s.icon}</span>
                                        </div>
                                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{s.label}</p>
                                    </div>
                                    <p className="text-sm font-black text-slate-900">{s.val}</p>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>

            {/* Add Modal */}
            <Modal title="Deploy New Pilot" isOpen={showAdd} onClose={() => { setShowAdd(false); setAddForm({ ...BLANK_FORM }); setAddFiles({ ...BLANK_FILES }); }}>
                <form onSubmit={handleAdd} className="space-y-4">
                    <Input label="Full Name" value={addForm.name} onChange={e => setAddForm({ ...addForm, name: e.target.value })} required placeholder="e.g. Arjun Mehta" />
                    <Input label="Email Address" type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} required placeholder="pilot@varuna.com" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Phone Number" value={addForm.phone} onChange={e => setAddForm({ ...addForm, phone: e.target.value })} placeholder="+91 98765 43210" />
                        <Input label="Contact Number" value={addForm.contact_number} onChange={e => setAddForm({ ...addForm, contact_number: e.target.value })} placeholder="+91 98765 43210" />
                    </div>
                    <Input label="License Number" value={addForm.license_number} onChange={e => setAddForm({ ...addForm, license_number: e.target.value })} required placeholder="DGCA-MH-2024-001" />
                    <Input label="License Expiry" type="date" value={addForm.license_expiry} onChange={e => setAddForm({ ...addForm, license_expiry: e.target.value })} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Employee ID" value={addForm.employee_id} onChange={e => setAddForm({ ...addForm, employee_id: e.target.value })} placeholder="EMP-001" />
                        <Input label="Per Day Rate (₹)" type="number" value={addForm.per_day_rate} onChange={e => setAddForm({ ...addForm, per_day_rate: e.target.value })} placeholder="15000" />
                    </div>
                    <Input label="Base Location" value={addForm.base_location} onChange={e => setAddForm({ ...addForm, base_location: e.target.value })} placeholder="e.g. Ahmedabad, Gujarat" />
                    <Input label="Certification / Type Rating" value={addForm.certification} onChange={e => setAddForm({ ...addForm, certification: e.target.value })} placeholder="e.g. RPAS Category A, Multi-rotor" />
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Employment Type</label>
                        <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm"
                            value={addForm.employment_type} onChange={e => setAddForm({ ...addForm, employment_type: e.target.value })}>
                            <option value="full_time">Full Time</option>
                            <option value="contract">Contractual</option>
                            <option value="freelance">Freelance</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Status</label>
                        <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm"
                            value={addForm.status} onChange={e => setAddForm({ ...addForm, status: e.target.value })}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="on_leave">On Leave</option>
                        </select>
                    </div>

                    {/* Identity Documents */}
                    <div className="border-t border-slate-100 pt-4 space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Identity Documents</p>
                        {[
                            { key: 'aadhaar',     label: 'Aadhaar Card' },
                            { key: 'passport',    label: 'Passport' },
                            { key: 'certificate', label: 'Pilot Certificate' },
                        ].map(({ key, label }) => (
                            <div key={key}>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">{label}</label>
                                <label className={`flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-colors ${addFiles[key] ? 'border-primary/40 bg-primary/5' : 'border-slate-200 hover:border-primary/40 bg-slate-50'}`}>
                                    <span className="material-symbols-outlined text-slate-400 text-xl">{addFiles[key] ? 'description' : 'upload_file'}</span>
                                    <span className="text-sm text-slate-600 truncate">{addFiles[key] ? addFiles[key].name : `Attach ${label} (PDF / image)`}</span>
                                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
                                        onChange={e => setAddFiles(f => ({ ...f, [key]: e.target.files?.[0] || null }))} />
                                </label>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={() => { setShowAdd(false); setAddForm({ ...BLANK_FORM }); setAddFiles({ ...BLANK_FILES }); }}>Cancel</Button>
                        <Button type="submit">Deploy Asset</Button>
                    </div>
                </form>
            </Modal>

            {/* Edit Modal */}
            <Modal title="Update Pilot Record" isOpen={!!editPilot} onClose={() => { setEditPilot(null); setEditFiles({ ...BLANK_FILES }); }}>
                <form onSubmit={handleEdit} className="space-y-4">
                    <Input label="Full Name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required placeholder="e.g. Arjun Mehta" />
                    <Input label="Email Address" type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} required placeholder="pilot@varuna.com" />
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Phone Number" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+91 98765 43210" />
                        <Input label="Contact Number" value={editForm.contact_number} onChange={e => setEditForm({ ...editForm, contact_number: e.target.value })} placeholder="+91 98765 43210" />
                    </div>
                    <Input label="License Number" value={editForm.license_number} onChange={e => setEditForm({ ...editForm, license_number: e.target.value })} required placeholder="DGCA-MH-2024-001" />
                    <Input label="License Expiry" type="date" value={editForm.license_expiry} onChange={e => setEditForm({ ...editForm, license_expiry: e.target.value })} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Employee ID" value={editForm.employee_id} onChange={e => setEditForm({ ...editForm, employee_id: e.target.value })} placeholder="EMP-001" />
                        <Input label="Per Day Rate (₹)" type="number" value={editForm.per_day_rate} onChange={e => setEditForm({ ...editForm, per_day_rate: e.target.value })} placeholder="15000" />
                    </div>
                    <Input label="Base Location" value={editForm.base_location} onChange={e => setEditForm({ ...editForm, base_location: e.target.value })} placeholder="e.g. Ahmedabad, Gujarat" />
                    <Input label="Certification / Type Rating" value={editForm.certification} onChange={e => setEditForm({ ...editForm, certification: e.target.value })} placeholder="e.g. RPAS Category A, Multi-rotor" />
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Employment Type</label>
                        <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm"
                            value={editForm.employment_type} onChange={e => setEditForm({ ...editForm, employment_type: e.target.value })}>
                            <option value="full_time">Full Time</option>
                            <option value="contract">Contractual</option>
                            <option value="freelance">Freelance</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 block">Status</label>
                        <select className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-900 text-sm"
                            value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="on_leave">On Leave</option>
                        </select>
                    </div>

                    {/* Identity Documents — only upload if replacing */}
                    <div className="border-t border-slate-100 pt-4 space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Identity Documents <span className="normal-case font-normal text-slate-400">(leave blank to keep existing)</span></p>
                        {[
                            { key: 'aadhaar',     label: 'Aadhaar Card',      existing: editPilot?.aadhaar_doc_key },
                            { key: 'passport',    label: 'Passport',          existing: editPilot?.passport_doc_key },
                            { key: 'certificate', label: 'Pilot Certificate', existing: editPilot?.certificate_doc_key },
                        ].map(({ key, label, existing }) => (
                            <div key={key}>
                                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">{label}</label>
                                <label className={`flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-colors ${editFiles[key] ? 'border-primary/40 bg-primary/5' : 'border-slate-200 hover:border-primary/40 bg-slate-50'}`}>
                                    <span className="material-symbols-outlined text-slate-400 text-xl">{editFiles[key] ? 'description' : existing ? 'task_alt' : 'upload_file'}</span>
                                    <span className="text-sm text-slate-600 truncate">
                                        {editFiles[key] ? editFiles[key].name : existing ? 'Uploaded — click to replace' : `Attach ${label} (PDF / image)`}
                                    </span>
                                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
                                        onChange={e => setEditFiles(f => ({ ...f, [key]: e.target.files?.[0] || null }))} />
                                </label>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={() => { setEditPilot(null); setEditFiles({ ...BLANK_FILES }); }}>Cancel</Button>
                        <Button type="submit">Save Changes</Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Confirm */}
            <Modal title="Confirm Removal" isOpen={!!deletePilot} onClose={() => setDeletePilot(null)}>
                <div className="space-y-4">
                    <p className="text-slate-500 text-sm">Remove pilot <span className="text-slate-900 font-bold">{deletePilot?.name}</span> from the roster? This action cannot be undone.</p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="secondary" onClick={() => setDeletePilot(null)}>Cancel</Button>
                        <Button variant="danger" onClick={handleDelete}>Confirm Removal</Button>
                    </div>
                </div>
            </Modal>

            {/* ── Pilot Schedule Gantt ───────────────────────────────────────── */}
            <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Resources</p>
                        <h3 className="text-sm font-bold text-slate-900">Pilot Schedule</h3>
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
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-300 inline-block"></span>Leave</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-300 inline-block"></span>Training</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200 inline-block"></span>Maintenance</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-violet-300 inline-block"></span>Expo</span>
                </div>

                {/* Chart */}
                <div className="overflow-hidden">
                    <ResourceGantt
                        rows={ganttData}
                        loading={ganttLoading}
                        days={ganttDays}
                        emptyIcon="people"
                        emptyText="No pilot allocations in this period"
                    />
                </div>
            </div>

            {/* Assign to Project Modal */}
            <Modal title={`Assign ${assignPilot?.name || 'Pilot'} to Project`} isOpen={!!assignPilot} onClose={() => setAssignPilot(null)}>
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
                        <Button type="button" variant="ghost" onClick={() => setAssignPilot(null)}>Cancel</Button>
                        <Button type="submit" icon="assignment_ind" disabled={assigning}>
                            {assigning ? 'Assigning…' : 'Assign to Project'}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Pilots;
