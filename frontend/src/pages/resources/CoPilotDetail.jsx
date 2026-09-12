import { useEffect, useRef, useState } from 'react';
import useScrollLock from '../../hooks/useScrollLock';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { useSetBreadcrumb } from '../../context/BreadcrumbContext';
import { API_BASE_URL, ENDPOINTS } from '../../api/endpoints';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/helpers';
import useAuth from '../../hooks/useAuth';
import { ROLES, ROUTES } from '../../utils/constants';
import { DetailSkeleton } from '../../components/ui/Skeletons';

const CoPilotDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();

    const [copilot, setCopilot] = useState(null);
    useSetBreadcrumb(copilot?.name);
    const [allocations, setAllocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusSaving, setStatusSaving] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '', email: '', license_number: '', phone: '', contact_number: '',
        status: 'active', license_expiry: '', employee_id: '', per_day_rate: '', base_location: ''
    });
    const [editErrors, setEditErrors] = useState({});

    // Avatar (profile picture)
    const avatarInputRef = useRef(null);
    const [avatarBusy, setAvatarBusy] = useState(false);
    const [avatarBuster, setAvatarBuster] = useState(() => Date.now());
    const [lightboxOpen, setLightboxOpen] = useState(false);
    useScrollLock(lightboxOpen);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [pilotRes, allocRes] = await Promise.all([
                axiosInstance.get(ENDPOINTS.RESOURCES.PILOT(id)),
                axiosInstance.get(ENDPOINTS.RESOURCES.PILOT_HISTORY(id))
            ]);
            const p = pilotRes.data.data;
            setCopilot(p);
            setEditForm({
                name:           p.name || '',
                email:          p.email || '',
                license_number: p.license_number || '',
                phone:          p.phone || '',
                contact_number: p.contact_number || '',
                status:         p.status || 'active',
                license_expiry: p.license_expiry ? p.license_expiry.split('T')[0] : '',
                employee_id:    p.employee_id || '',
                per_day_rate:   p.per_day_rate || '',
                base_location:  p.base_location || '',
            });
            setAllocations(Array.isArray(allocRes.data.data) ? allocRes.data.data : []);
        } catch (err) {
            showToast(err.userMessage, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    const handleStatusChange = async (newStatus) => {
        setStatusSaving(true);
        try {
            await axiosInstance.put(ENDPOINTS.RESOURCES.PILOT(id), { status: newStatus });
            setCopilot(p => ({ ...p, status: newStatus }));
            showToast('Status updated');
        } catch (err) {
            showToast(err.userMessage, 'error');
        } finally {
            setStatusSaving(false);
        }
    };

    const handleEdit = async (e) => {
        e.preventDefault();
        const errs = {};
        if (!editForm.name.trim())           errs.name = 'Name is required.';
        if (!editForm.email.trim())          errs.email = 'Email is required.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email.trim())) errs.email = 'Enter a valid email address.';
        setEditErrors(errs);
        if (Object.keys(errs).length) return;
        try {
            await axiosInstance.put(ENDPOINTS.RESOURCES.PILOT(id), { ...editForm, crew_role: 'co_pilot' });
            showToast('Co-Pilot record updated');
            setEditOpen(false);
            fetchData();
        } catch (err) {
            showToast(err.userMessage, 'error');
        }
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) return showToast('Please choose an image file', 'error');
        if (file.size > 5 * 1024 * 1024)    return showToast('Image is too large (max 5 MB)', 'error');
        setAvatarBusy(true);
        try {
            const fd = new FormData();
            fd.append('avatar', file);
            const res = await axiosInstance.post(ENDPOINTS.USERS.AVATAR(copilot.user_id), fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const key = res.data?.data?.avatar_url || 'set';
            setCopilot(p => ({ ...p, avatar_url: key }));
            setAvatarBuster(Date.now());
            showToast('Profile picture updated');
        } catch (err) {
            showToast(err.userMessage, 'error');
        } finally { setAvatarBusy(false); }
    };

    const handleAvatarRemove = async () => {
        setAvatarBusy(true);
        try {
            await axiosInstance.delete(ENDPOINTS.USERS.AVATAR(copilot.user_id));
            setCopilot(p => ({ ...p, avatar_url: null }));
            setAvatarBuster(Date.now());
            showToast('Profile picture removed');
        } catch (err) {
            showToast(err.userMessage, 'error');
        } finally { setAvatarBusy(false); }
    };

    if (loading) {
        return <DetailSkeleton />;
    }

    if (!copilot) {
        return <div className="text-slate-900 text-center py-20">Co-Pilot not found.</div>;
    }

    const canEdit = user?.role === ROLES.ADMIN;
    const isExpiringSoon = copilot.license_expiry && (new Date(copilot.license_expiry) - Date.now()) < 1000 * 60 * 60 * 24 * 30;
    const isExpired = copilot.license_expiry && new Date(copilot.license_expiry) < new Date();
    const initials = (copilot.name || 'CP').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const avatarSrc = copilot.avatar_url ? `${API_BASE_URL}/users/${copilot.user_id}/avatar?t=${avatarBuster}` : null;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <Button variant="ghost" size="sm" icon="arrow_back" className="mb-2 -ml-2" onClick={() => navigate(ROUTES.COPILOTS)}>Back to Co-Pilots</Button>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-['Space_Grotesk'] uppercase tracking-[0.2em] text-[11px] text-violet-600 font-bold">Co-Pilot Profile</span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-violet-100 text-violet-700">Flight Crew</span>
                    </div>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-[-0.03em]">{copilot.name}</h2>
                </div>
                <div className="flex items-center gap-3">
                    {canEdit && (
                        <select
                            value={copilot.status}
                            disabled={statusSaving}
                            onChange={e => handleStatusChange(e.target.value)}
                            className="bg-surface border border-slate-200 text-slate-900 text-xs rounded-lg px-3 py-2 disabled:opacity-50"
                        >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="on_leave">On Leave</option>
                        </select>
                    )}
                    {canEdit && (
                        <Button icon="edit" onClick={() => setEditOpen(true)}>Edit Profile</Button>
                    )}
                </div>
            </div>

            {/* Co-Pilot Info Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 p-6">
                    <div className="flex items-start gap-6 mb-6">
                        <div className="relative shrink-0 group">
                            <button
                                type="button"
                                onClick={() => avatarSrc && setLightboxOpen(true)}
                                title={avatarSrc ? 'View full picture' : 'No profile picture'}
                                className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-gradient-to-br from-violet-700 to-indigo-900 grid place-items-center text-white text-2xl font-bold select-none"
                            >
                                {avatarSrc ? (
                                    <img
                                        src={avatarSrc}
                                        alt={`${copilot.name} profile`}
                                        className="w-full h-full object-cover"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                ) : initials}
                            </button>
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={() => avatarInputRef.current?.click()}
                                    disabled={avatarBusy}
                                    title={avatarSrc ? 'Change picture' : 'Add picture'}
                                    className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-violet-600 text-white grid place-items-center shadow-md ring-2 ring-surface hover:bg-violet-700 transition-colors disabled:opacity-60"
                                >
                                    {avatarBusy
                                        ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        : <span className="material-symbols-outlined text-[15px] leading-none">photo_camera</span>}
                                </button>
                            )}
                            {canEdit && (
                                <input
                                    ref={avatarInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={handleAvatarChange}
                                />
                            )}
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-bold text-slate-900">{copilot.name}</h3>
                                <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-full ${
                                    copilot.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                    {copilot.status}
                                </span>
                            </div>
                            <p className="text-sm text-slate-500">{copilot.email}</p>
                            <p className="text-xs text-slate-400 font-mono">{copilot.contact_number || copilot.phone || 'No phone set'}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-100 pt-6">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">License Number</p>
                            <p className="font-mono text-sm font-bold text-slate-900">{copilot.license_number || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">License Expiry</p>
                            <p className={`text-sm font-bold ${isExpired ? 'text-red-500' : isExpiringSoon ? 'text-amber-500' : 'text-slate-900'}`}>
                                {copilot.license_expiry ? formatDate(copilot.license_expiry) : '—'}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Employee ID</p>
                            <p className="text-sm font-bold text-slate-900">{copilot.employee_id || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Base Location</p>
                            <p className="text-sm font-bold text-slate-900">{copilot.base_location || '—'}</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-6 flex flex-col justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Operational Information</p>
                        <div className="space-y-3">
                            <div>
                                <span className="text-xs text-slate-500 block">Day Rate</span>
                                <span className="text-lg font-bold text-slate-900">
                                    {copilot.per_day_rate ? `₹${Number(copilot.per_day_rate).toLocaleString()}` : '—'}
                                </span>
                            </div>
                            <div>
                                <span className="text-xs text-slate-500 block">Software Access</span>
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                    <span className="material-symbols-outlined text-sm text-slate-400">lock</span>
                                    No Login (Crew Record)
                                </span>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Deployment History */}
            <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900">Project Deployment History</h3>
                <Card>
                    {allocations.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-400">
                            No project deployments recorded for this co-pilot yet.
                        </div>
                    ) : (
                        <Table
                            columns={[
                                {
                                    header: 'Project',
                                    cell: (r) => (
                                        <span
                                            onClick={() => navigate(`/projects/${r.project_id}`)}
                                            className="font-bold text-slate-900 hover:text-violet-600 cursor-pointer"
                                        >
                                            {r.project_name}
                                        </span>
                                    )
                                },
                                {
                                    header: 'Status',
                                    cell: (r) => (
                                        <span className="text-xs uppercase tracking-wider font-semibold text-slate-600">
                                            {r.project_status}
                                        </span>
                                    )
                                },
                                {
                                    header: 'Drone',
                                    cell: (r) => r.drone_name ? (
                                        <span className="text-xs text-slate-700">{r.drone_name} ({r.drone_model || '—'})</span>
                                    ) : <span className="text-xs text-slate-400">—</span>
                                },
                                {
                                    header: 'Start Date',
                                    cell: (r) => <span className="text-xs text-slate-600">{r.start_date ? formatDate(r.start_date) : '—'}</span>
                                },
                                {
                                    header: 'End Date',
                                    cell: (r) => <span className="text-xs text-slate-600">{r.end_date ? formatDate(r.end_date) : '—'}</span>
                                },
                            ]}
                            data={allocations}
                        />
                    )}
                </Card>
            </div>

            {/* Edit Modal */}
            <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Co-Pilot Profile">
                <form onSubmit={handleEdit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="Full Name *"
                            value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            error={editErrors.name}
                            required
                        />
                        <Input
                            label="Email Address *"
                            type="email"
                            value={editForm.email}
                            onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                            error={editErrors.email}
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
                            label="Per Day Rate (₹)"
                            type="number"
                            value={editForm.per_day_rate}
                            onChange={e => setEditForm({ ...editForm, per_day_rate: e.target.value })}
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
                        <Button type="submit">Save Changes</Button>
                    </div>
                </form>
            </Modal>

            {/* Lightbox for avatar */}
            {lightboxOpen && avatarSrc && createPortal(
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setLightboxOpen(false)}
                >
                    <div className="relative max-w-lg max-h-[80vh]">
                        <img src={avatarSrc} alt={copilot.name} className="max-w-full max-h-[80vh] rounded-xl object-contain" />
                        <button
                            onClick={() => setLightboxOpen(false)}
                            className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-surface text-slate-900 grid place-items-center shadow-lg hover:bg-slate-100"
                        >
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default CoPilotDetail;
