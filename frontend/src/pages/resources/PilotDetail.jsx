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
import { formatDateOnly } from '../../utils/dateUtils';
import useAuth from '../../hooks/useAuth';
import { ROLES } from '../../utils/constants';
import { DetailSkeleton } from '../../components/ui/Skeletons';

const PilotDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();

    const [pilot, setPilot] = useState(null);
    useSetBreadcrumb(pilot?.name);
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
            setPilot(p);
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
            setPilot(p => ({ ...p, status: newStatus }));
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
        if (!editForm.license_number.trim()) errs.license_number = 'License number is required.';
        setEditErrors(errs);
        if (Object.keys(errs).length) return;
        try {
            await axiosInstance.put(ENDPOINTS.RESOURCES.PILOT(id), editForm);
            showToast('Pilot record updated');
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
            const res = await axiosInstance.post(ENDPOINTS.USERS.AVATAR(pilot.user_id), fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const key = res.data?.data?.avatar_url || 'set';
            setPilot(p => ({ ...p, avatar_url: key }));
            setAvatarBuster(Date.now());
            showToast('Profile picture updated');
        } catch (err) {
            showToast(err.userMessage, 'error');
        } finally { setAvatarBusy(false); }
    };

    const handleAvatarRemove = async () => {
        setAvatarBusy(true);
        try {
            await axiosInstance.delete(ENDPOINTS.USERS.AVATAR(pilot.user_id));
            setPilot(p => ({ ...p, avatar_url: null }));
            setAvatarBuster(Date.now());
            showToast('Profile picture removed');
        } catch (err) {
            showToast(err.userMessage, 'error');
        } finally { setAvatarBusy(false); }
    };

    if (loading) {
        return <DetailSkeleton />;
    }

    if (!pilot) {
        return <div className="text-slate-900 text-center py-20">Pilot not found.</div>;
    }

    const canEdit = user?.role === ROLES.ADMIN;
    const isExpiringSoon = pilot.license_expiry && (new Date(pilot.license_expiry) - Date.now()) < 1000 * 60 * 60 * 24 * 30;
    const isExpired = pilot.license_expiry && new Date(pilot.license_expiry) < new Date();
    const initials = (pilot.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const avatarSrc = pilot.avatar_url ? `${API_BASE_URL}/users/${pilot.user_id}/avatar?t=${avatarBuster}` : null;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <Button variant="ghost" size="sm" icon="arrow_back" className="mb-2 -ml-2" onClick={() => navigate('/resources')}>Back to Roster</Button>
                    <p className="font-['Space_Grotesk'] uppercase tracking-[0.2em] text-[11px] text-slate-500 mb-1">Pilot Profile</p>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-[-0.03em]">{pilot.name}</h2>
                </div>
                <div className="flex items-center gap-3">
                    {canEdit && (
                        <select
                            value={pilot.status}
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

            {/* Pilot Info Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 p-6">
                    <div className="flex items-start gap-6 mb-6">
                        <div className="relative shrink-0 group">
                            <button
                                type="button"
                                onClick={() => avatarSrc && setLightboxOpen(true)}
                                title={avatarSrc ? 'View full picture' : 'No profile picture'}
                                className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-gradient-to-br from-slate-700 to-slate-900 grid place-items-center text-white text-2xl font-bold select-none"
                            >
                                {avatarSrc ? (
                                    <img
                                        src={avatarSrc}
                                        alt={`${pilot.name} profile`}
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
                                    className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-primary text-on-primary grid place-items-center shadow-md ring-2 ring-surface hover:bg-primary/90 transition-colors disabled:opacity-60"
                                >
                                    {avatarBusy
                                        ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        : <span className="material-symbols-outlined text-[15px] leading-none">photo_camera</span>}
                                </button>
                            )}
                            {canEdit && (
                                <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarChange} />
                            )}
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 mb-1">{pilot.name}</h3>
                            <p className="text-sm text-slate-500 mb-2">{pilot.email || '—'}</p>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                pilot.status === 'active' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                pilot.status === 'inactive' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                                {pilot.status || 'Unknown'}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Phone</p>
                            <p className="text-sm text-slate-900 font-medium">{pilot.phone || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">License Number</p>
                            <p className="text-sm text-slate-900 font-medium font-mono">{pilot.license_number || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">License Expiry</p>
                            <p className={`text-sm font-medium ${isExpired ? 'text-red-400' : isExpiringSoon ? 'text-amber-400' : 'text-slate-900'}`}>
                                {pilot.license_expiry ? formatDate(pilot.license_expiry) : '—'}
                                {isExpired && ' (Expired)'}
                                {!isExpired && isExpiringSoon && ' ⚠'}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Per Day Rate</p>
                            <p className="text-sm text-slate-900 font-medium">
                                {pilot.per_day_rate ? `₹${Number(pilot.per_day_rate).toLocaleString('en-IN')}` : '—'}
                            </p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Base Location</p>
                            <p className="text-sm text-slate-900 font-medium">{pilot.base_location || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Total Deployments</p>
                            <p className="text-sm text-slate-900 font-medium">{allocations.length}</p>
                        </div>
                    </div>
                </Card>

                <Card className="p-6">
                    <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">Identity Documents</h3>
                    <div className="space-y-2">
                        {[
                            { key: 'aadhaar_doc_url',     label: 'Aadhaar Card',      icon: 'badge' },
                            { key: 'passport_doc_url',    label: 'Passport',          icon: 'travel_explore' },
                            { key: 'certificate_doc_url', label: 'Pilot Certificate', icon: 'workspace_premium' },
                        ].map(({ key, label, icon }) => (
                            <div key={key} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-100 bg-slate-50/60">
                                <span className={`material-symbols-outlined text-base ${pilot[key] ? 'text-primary' : 'text-slate-300'}`}>{icon}</span>
                                <span className="flex-1 text-sm text-slate-700 font-medium">{label}</span>
                                {pilot[key] ? (
                                    <a href={pilot[key]} target="_blank" rel="noreferrer"
                                        className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                                        <span className="material-symbols-outlined text-sm">download</span>
                                        View
                                    </a>
                                ) : (
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Not uploaded</span>
                                )}
                            </div>
                        ))}
                    </div>
                    {pilot.certification && (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Other Certifications</p>
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-green-400 text-sm">verified</span>
                                <span className="text-sm text-slate-500">{pilot.certification}</span>
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            {/* Deployment History */}
            <Card className="overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-900">Deployment History</h3>
                </div>
                {allocations.length > 0 ? (
                    <Table
                        columns={[
                            {
                                header: 'Project',
                                accessorKey: 'project_name',
                                cell: (row) => (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-slate-900 font-bold text-sm">{row.project_name}</span>
                                        {row.is_pipeline && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/10 text-purple-400">PIPELINE</span>}
                                        {row.source === 'member' && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 text-slate-500">MEMBER</span>}
                                    </div>
                                )
                            },
                            {
                                header: 'Drone',
                                accessorKey: 'drone_name',
                                cell: (row) => <span className="text-slate-500 text-xs">{row.drone_name || row.drone_model || '—'}</span>
                            },
                            {
                                header: 'Start',
                                accessorKey: 'start_date',
                                cell: (row) => <span className="text-xs font-mono text-slate-500">{formatDateOnly(row.start_date)}</span>
                            },
                            {
                                header: 'End',
                                accessorKey: 'end_date',
                                cell: (row) => <span className="text-xs font-mono text-slate-500">{formatDateOnly(row.end_date)}</span>
                            },
                            {
                                header: 'Status',
                                accessorKey: 'project_status',
                                cell: (row) => (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-500/10 text-blue-400">
                                        {row.project_status?.replace(/_/g, ' ')}
                                    </span>
                                )
                            }
                        ]}
                        data={allocations}
                    />
                ) : (
                    <div className="text-center py-12">
                        <p className="text-slate-500">No deployment records found for this pilot.</p>
                    </div>
                )}
            </Card>

            {/* Profile picture lightbox — full-size view (portaled to body so it
                covers the true viewport, escaping any transformed ancestor) */}
            {lightboxOpen && avatarSrc && createPortal(
                <div
                    className="fixed inset-0 z-[1400] backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in duration-200 bg-slate-950/85"
                    onClick={() => setLightboxOpen(false)}
                >
                    <img
                        src={avatarSrc}
                        alt={`${pilot.name} profile`}
                        className="max-w-[90vw] max-h-[80vh] object-contain rounded-2xl shadow-2xl ring-1 ring-white/10"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <div className="mt-4 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <span className="text-white/80 text-sm font-medium">{pilot.name}</span>
                        {canEdit && (
                            <Button variant="danger" size="sm" icon="delete" disabled={avatarBusy}
                                onClick={() => { handleAvatarRemove(); setLightboxOpen(false); }}>
                                Remove
                            </Button>
                        )}
                        <Button variant="secondary" size="sm" onClick={() => setLightboxOpen(false)}>Close</Button>
                    </div>
                </div>,
                document.body
            )}

            {/* Edit Modal */}
            <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Edit Pilot Profile">
                <form onSubmit={handleEdit} className="space-y-4">
                    <Input label="Full Name" required value={editForm.name} error={editErrors.name} onChange={e => { setEditForm({ ...editForm, name: e.target.value }); if (editErrors.name) setEditErrors(x => ({ ...x, name: undefined })); }} placeholder="e.g. Arjun Mehta" />
                    <Input label="Email Address" type="email" required value={editForm.email} error={editErrors.email} onChange={e => { setEditForm({ ...editForm, email: e.target.value }); if (editErrors.email) setEditErrors(x => ({ ...x, email: undefined })); }} placeholder="pilot@varuna.com" />
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Phone Number" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="+91 98765 43210" />
                        <Input label="Contact Number" value={editForm.contact_number} onChange={e => setEditForm({ ...editForm, contact_number: e.target.value })} placeholder="+91 98765 43210" />
                    </div>
                    <Input label="License Number" required value={editForm.license_number} error={editErrors.license_number} onChange={e => { setEditForm({ ...editForm, license_number: e.target.value }); if (editErrors.license_number) setEditErrors(x => ({ ...x, license_number: undefined })); }} placeholder="DGCA-MH-2024-001" />
                    <Input label="License Expiry" type="date" value={editForm.license_expiry} onChange={e => setEditForm({ ...editForm, license_expiry: e.target.value })} />
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Employee ID" value={editForm.employee_id} onChange={e => setEditForm({ ...editForm, employee_id: e.target.value })} placeholder="EMP-001" />
                        <Input label="Per Day Rate (₹)" type="number" value={editForm.per_day_rate} onChange={e => setEditForm({ ...editForm, per_day_rate: e.target.value })} placeholder="15000" />
                    </div>
                    <Input label="Base Location" value={editForm.base_location} onChange={e => setEditForm({ ...editForm, base_location: e.target.value })} placeholder="e.g. Ahmedabad, Gujarat" />
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Status</label>
                        <select
                            value={editForm.status}
                            onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                            className="w-full bg-surface border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-900"
                        >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="on_leave">On Leave</option>
                        </select>
                    </div>
                    <div className="flex gap-3 pt-4">
                        <Button type="submit" className="flex-1">Save Changes</Button>
                        <Button type="button" variant="ghost" className="flex-1" onClick={() => setEditOpen(false)}>Cancel</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default PilotDetail;
