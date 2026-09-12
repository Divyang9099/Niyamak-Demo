import { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { API_BASE_URL, ENDPOINTS } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import useAuth from '../../hooks/useAuth';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';

const Users = () => {
    const [searchParams] = useSearchParams();
    const [users, setUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    // Sync when Topbar navigates here with ?search= param
    useEffect(() => { setSearchTerm(searchParams.get('search') || ''); }, [searchParams]);

    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState(null);
    const { user: currentUser } = useAuth();
    const { showToast } = useToast();
const { confirmDialog } = useDialog();

    // Filtered rows — declared at top level so the hook order is stable across
    // the loading → loaded transition (calling useMemo inside JSX breaks the
    // Rules of Hooks: "Rendered more hooks than during the previous render").
    const filteredUsers = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return users;
        return users.filter(u =>
            (u.name  || '').toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q) ||
            (u.role  || '').toLowerCase().includes(q) ||
            (u.phone || '').toLowerCase().includes(q)
        );
    }, [users, searchTerm]);
    
    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
    const [step, setStep] = useState('details');        // 'details' | 'photo' (add flow only)

    // Optional profile-picture step (for newly created PM / pilot users)
    const [createdUser, setCreatedUser] = useState(null); // { id, name, role }
    const [avatarFile, setAvatarFile]   = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const avatarInputRef = useRef(null);
    const [fieldErrors, setFieldErrors] = useState({});

    // Form state
    const [formData, setFormData] = useState({
        id: null,
        name: '',
        email: '',
        password: '',
        role: 'pilot',
        phone: '',
        // Pilot-specific (only sent when role === 'pilot')
        license_number: '',
        license_expiry: '',
        employee_id:    '',
        per_day_rate:   '',
    });

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get(ENDPOINTS.USERS.GET_ALL);
            const data = res.data.data;
            setUsers(Array.isArray(data) ? data : (data.users || []));
        } catch (err) {
            setError("Failed to load users.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const resetForm = () => {
        setFormData({ id: null, name: '', email: '', password: '', role: 'pilot', phone: '',
                      license_number: '', license_expiry: '', employee_id: '', per_day_rate: '' });
        setError(null);
        setStep('details');
        setCreatedUser(null);
        setAvatarFile(null);
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarPreview(null);
        setFieldErrors({});
    };

    const handleOpenAdd = () => {
        resetForm();
        setModalMode('add');
        setIsModalOpen(true);
    };

    // ── Optional profile-picture step ──────────────────────────────────────
    const handleAvatarSelect = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) { showToast('Please choose an image file', 'error'); return; }
        if (file.size > 5 * 1024 * 1024)     { showToast('Image is too large (max 5 MB)', 'error'); return; }
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    };

    // Finish the add flow — refresh the table and close the modal.
    const finishAdd = async () => {
        await fetchUsers();
        setIsModalOpen(false);
        resetForm();
    };

    const handleAvatarUpload = async () => {
        if (!avatarFile || !createdUser) return finishAdd();
        setActionLoading(true);
        try {
            const fd = new FormData();
            fd.append('avatar', avatarFile);
            await axiosInstance.post(ENDPOINTS.USERS.AVATAR(createdUser.id), fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            showToast('Profile picture saved.');
            await finishAdd();
        } catch (err) {
            setError(err?.response?.data?.message || 'Failed to upload picture.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleOpenEdit = (user, e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        resetForm();
        setFormData({
            id: user.id || user._id,
            name: user.name || '',
            email: user.email || '',
            password: '',
            role: user.role || 'pilot',
            phone: user.phone || '',
        });
        setModalMode('edit');
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (id === currentUser?.id) {
            showToast("You cannot delete your own account.", "error");
            return;
        }
        if (!(await confirmDialog({ message: "Are you sure you want to delete this user? This action cannot be undone.", danger: true }))) return;
        
        try {
            await axiosInstance.delete(ENDPOINTS.USERS.DELETE(id));
            setUsers(users.filter(u => (u.id || u._id) !== id));
            showToast("User access revoked successfully.");
        } catch (err) {
            showToast(err?.response?.data?.message || "Failed to delete user", "error");
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        // Inline field validation (add mode) — surfaced under each field.
        if (modalMode === 'add') {
            const errs = {};
            if (!formData.name.trim())  errs.name = 'Full name is required.';
            if (!formData.email.trim()) errs.email = 'Email is required.';
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) errs.email = 'Enter a valid email address.';
            if (formData.role !== 'co_pilot' && (!formData.password || formData.password.length < 8)) {
                errs.password = 'Password must be at least 8 characters.';
            }
            setFieldErrors(errs);
            if (Object.keys(errs).length) return;
        }

        setActionLoading(true);

        try {
            if (modalMode === 'add') {
                const payload = {
                    name:     formData.name,
                    email:    formData.email,
                    password: formData.password || undefined,
                    role:     formData.role,
                    phone:    formData.phone,
                };
                // Include pilot/co-pilot-specific fields so backend creates the pilots record in one shot
                if (formData.role === 'pilot' || formData.role === 'co_pilot') {
                    if (formData.license_number) payload.license_number = formData.license_number;
                    if (formData.license_expiry) payload.license_expiry = formData.license_expiry;
                    if (formData.employee_id)    payload.employee_id    = formData.employee_id;
                    if (formData.per_day_rate)   payload.per_day_rate   = Number(formData.per_day_rate);
                }
                const res = await axiosInstance.post(ENDPOINTS.AUTH.REGISTER, payload);
                showToast(formData.role === 'co_pilot' ? "Co-Pilot crew record created successfully." : "Access credentials provisioned successfully.");

                // Profile pictures are for PMs, pilots, and co-pilots — admins skip the photo step.
                const newUser = res.data?.data;
                if (newUser?.id && formData.role !== 'admin') {
                    setCreatedUser({ id: newUser.id, name: newUser.name, role: newUser.role });
                    setStep('photo');
                    return; // keep modal open for the optional picture step
                }

                await fetchUsers();
                setIsModalOpen(false);
                resetForm();
                return;
            } else {
                await axiosInstance.put(ENDPOINTS.USERS.UPDATE(formData.id), {
                    name: formData.name,
                    role: formData.role,
                    phone: formData.phone
                });
                showToast("User permissions updated.");
                await fetchUsers();
                setIsModalOpen(false);
            }
        } catch (err) {
            setError(err?.response?.data?.message || "An error occurred. Please try again.");
        } finally {
            setActionLoading(false);
        }
    };

    const columns = [
        {
            header: 'Name',
            cell: (row) => {
                const id = row.id || row._id;
                const src = row.avatar_url
                    ? `${API_BASE_URL}/users/${id}/avatar`
                    : `https://ui-avatars.com/api/?name=${encodeURIComponent(row.name || 'User')}&background=1E3A8A&color=fff`;
                return (
                    <div className="flex items-center gap-3">
                        <img
                            src={src}
                            className="w-8 h-8 rounded-full object-cover border border-outline-variant/30 bg-slate-100"
                            alt={row.name || 'user'}
                            onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(row.name || 'User')}&background=1E3A8A&color=fff`; }}
                        />
                        <div>
                            <p className="font-bold text-slate-900 text-sm">{row.name}</p>
                        </div>
                    </div>
                );
            }
        },
        {
            header: 'Email',
            accessorKey: 'email',
            cell: (row) => <span className="text-sm text-slate-500">{row.email}</span>
        },
        {
            header: 'Role',
            accessorKey: 'role',
            cell: (row) => {
                const role = row.role || 'pilot';
                let badgeClasses = '';
                let label = role.replace('_', ' ');
                
                if (role.toLowerCase() === 'admin') {
                    // Dark/Navy
                    badgeClasses = 'bg-slate-800 text-slate-100 border border-slate-700';
                } else if (role.toLowerCase() === 'project_manager') {
                    // Blue
                    badgeClasses = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
                } else if (role.toLowerCase() === 'co_pilot') {
                    // Violet
                    badgeClasses = 'bg-violet-100 text-violet-700 border border-violet-200';
                    label = 'Co-Pilot';
                } else {
                    // Neutral/Gray (Pilot)
                    badgeClasses = 'bg-slate-200 text-slate-500 border border-slate-200';
                }
                
                return (
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${badgeClasses}`}>
                        {label}
                    </span>
                );
            }
        },
        {
            header: 'Phone',
            accessorKey: 'phone',
            cell: (row) => <span className="text-sm text-slate-500">{row.phone || '-'}</span>
        },
        {
            header: 'Created Date',
            accessorKey: 'created_at',
            cell: (row) => <span className="text-sm text-slate-500">{row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'}</span>
        },
        {
            header: 'Actions',
            cell: (row) => {
                const id = row.id || row._id;
                const isSelf = id === (currentUser?.id || currentUser?._id);
                return (
                    <div className="flex gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            icon="edit"
                            onClick={(e) => handleOpenEdit(row, e)}
                            title="Edit User"
                        />
                        {!isSelf && (
                            <Button
                                variant="danger"
                                size="sm"
                                icon="delete"
                                onClick={(e) => { e.stopPropagation(); handleDelete(id); }}
                                title="Delete User"
                            />
                        )}
                    </div>
                );
            }
        }
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-500 font-['Space_Grotesk']">
            <PageHeader
                eyebrow="Authorization Layer"
                title="User Management"
                description="Provision access, assign roles, and manage team members."
                actions={<Button icon="person_add" onClick={handleOpenAdd}>Grant New Access</Button>}
            />

            {error && !isModalOpen && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm">
                    {error}
                </div>
            )}

            <Card>
                <div className="p-4 border-b border-slate-100">
                    <div className="relative w-full sm:max-w-sm">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">search</span>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search users…"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm placeholder:text-slate-400 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                    </div>
                </div>
                {loading ? (
                    <SkeletonTable cols={6} />
                ) : (
                    <Table
                        columns={columns}
                        data={filteredUsers}
                        onRowClick={(row, e) => handleOpenEdit(row, e)}
                        empty={{
                            icon: 'group',
                            title: 'No users yet',
                            description: 'Grant access to add your first team member.',
                            action: <Button icon="person_add" size="sm" onClick={handleOpenAdd}>Grant New Access</Button>,
                        }}
                    />
                )}
            </Card>

            <Modal
                isOpen={isModalOpen}
                onClose={() => { if (step === 'photo') { finishAdd(); } else { setIsModalOpen(false); resetForm(); } }}
                title={step === 'photo' ? 'Add Profile Picture' : (modalMode === 'add' ? 'Grant New Access' : 'Edit Access Controls')}
                footer={
                    step === 'photo' ? (
                        <div className="flex justify-end gap-3">
                            <Button type="button" variant="secondary" onClick={finishAdd} disabled={actionLoading}>
                                Skip
                            </Button>
                            <Button type="button" onClick={handleAvatarUpload} disabled={actionLoading || !avatarFile}>
                                {actionLoading ? 'Saving…' : 'Save Picture'}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex justify-end gap-3">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => { setIsModalOpen(false); resetForm(); }}
                                disabled={actionLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                form="user-form"
                                disabled={actionLoading}
                            >
                                {actionLoading
                                    ? 'Processing…'
                                    : modalMode === 'add' ? 'Create User' : 'Save Changes'}
                            </Button>
                        </div>
                    )
                }
            >
                {step === 'photo' ? (
                    <div className="flex flex-col items-center text-center py-2">
                        <p className="text-sm text-slate-500 mb-5 max-w-xs">
                            Account for <span className="font-semibold text-slate-700">{createdUser?.name}</span> created successfully.
                            Add a profile picture now, or skip — this is optional and can be set later.
                        </p>
                        <div className="w-28 h-28 rounded-full overflow-hidden bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center mb-4">
                            {avatarPreview ? (
                                <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <span className="material-symbols-outlined text-4xl text-slate-300">add_a_photo</span>
                            )}
                        </div>
                        <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarSelect} />
                        <Button type="button" variant="secondary" icon="upload" onClick={() => avatarInputRef.current?.click()} disabled={actionLoading}>
                            {avatarPreview ? 'Choose a different image' : 'Choose Image'}
                        </Button>
                        <p className="text-[11px] text-slate-400 mt-3">JPG, PNG or WEBP · up to 5 MB</p>
                        {error && (
                            <div className="mt-4 w-full flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                                <span className="material-symbols-outlined text-base flex-shrink-0">error</span>
                                {error}
                            </div>
                        )}
                    </div>
                ) : (
                <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                            <span className="material-symbols-outlined text-base flex-shrink-0">error</span>
                            {error}
                        </div>
                    )}

                    <Input
                        label="Full Name"
                        id="name"
                        icon="person"
                        value={formData.name}
                        onChange={(e) => { setFormData({...formData, name: e.target.value}); if (fieldErrors.name) setFieldErrors(f => ({ ...f, name: undefined })); }}
                        error={fieldErrors.name}
                        required
                        placeholder="e.g. Arjun Mehta"
                    />

                    <Input
                        label="Email Address"
                        id="email"
                        type="email"
                        icon="mail"
                        value={formData.email}
                        onChange={(e) => { setFormData({...formData, email: e.target.value}); if (fieldErrors.email) setFieldErrors(f => ({ ...f, email: undefined })); }}
                        error={fieldErrors.email}
                        required={modalMode === 'add'}
                        disabled={modalMode === 'edit'}
                        placeholder="user@company.com"
                    />

                    {modalMode === 'add' && formData.role !== 'co_pilot' && (
                        <Input
                            label="Password"
                            id="password"
                            type="password"
                            icon="lock"
                            value={formData.password}
                            onChange={(e) => { setFormData({...formData, password: e.target.value}); if (fieldErrors.password) setFieldErrors(f => ({ ...f, password: undefined })); }}
                            error={fieldErrors.password}
                            required
                            minLength={8}
                            placeholder="Min 8 characters"
                        />
                    )}

                    <Input
                        label="Phone Number"
                        id="phone"
                        type="tel"
                        icon="call"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        placeholder="Optional"
                    />

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold tracking-wide uppercase text-slate-500">
                            Role / Permission Level
                        </label>
                        <select
                            className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl py-2.5 px-4 text-sm text-slate-900 transition-all"
                            value={formData.role}
                            onChange={(e) => setFormData({...formData, role: e.target.value})}
                            required
                        >
                            <option value="admin">Admin</option>
                            <option value="project_manager">Project Manager</option>
                            <option value="pilot">Pilot</option>
                            <option value="co_pilot">Co-Pilot</option>
                        </select>
                    </div>

                    {/* Pilot / Co-Pilot specific fields — shown when role is pilot or co_pilot */}
                    {modalMode === 'add' && (formData.role === 'pilot' || formData.role === 'co_pilot') && (
                        <div className={`border rounded-xl p-4 space-y-4 ${formData.role === 'co_pilot' ? 'border-violet-100 bg-violet-50/60' : 'border-indigo-100 bg-indigo-50/60'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`material-symbols-outlined text-base ${formData.role === 'co_pilot' ? 'text-violet-600' : 'text-primary'}`}>
                                    {formData.role === 'co_pilot' ? 'group' : 'flight'}
                                </span>
                                <p className={`text-xs font-bold uppercase tracking-widest ${formData.role === 'co_pilot' ? 'text-violet-700' : 'text-primary'}`}>
                                    {formData.role === 'co_pilot' ? 'Co-Pilot Details' : 'Pilot Details'}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <Input
                                    label="License Number"
                                    icon="badge"
                                    value={formData.license_number}
                                    onChange={e => setFormData({...formData, license_number: e.target.value})}
                                    placeholder={formData.role === 'co_pilot' ? "CP-2024-001" : "DGCA-MH-2024-001"}
                                />
                                <Input
                                    label="License Expiry"
                                    type="date"
                                    value={formData.license_expiry}
                                    onChange={e => setFormData({...formData, license_expiry: e.target.value})}
                                />
                                <Input
                                    label="Employee ID"
                                    icon="tag"
                                    value={formData.employee_id}
                                    onChange={e => setFormData({...formData, employee_id: e.target.value})}
                                    placeholder={formData.role === 'co_pilot' ? "EMP-CP-001" : "EMP-001"}
                                />
                                <Input
                                    label="Per Day Rate (₹)"
                                    type="number"
                                    icon="currency_rupee"
                                    value={formData.per_day_rate}
                                    onChange={e => setFormData({...formData, per_day_rate: e.target.value})}
                                    placeholder="10000"
                                />
                            </div>
                        </div>
                    )}

                    {modalMode === 'add' && (
                        formData.role === 'co_pilot' ? (
                            <p className="text-xs text-violet-600 flex items-start gap-1.5 pt-1 font-medium">
                                <span className="material-symbols-outlined text-sm text-violet-500 flex-shrink-0 mt-px">info</span>
                                Co-pilot records have no login access. No credentials email will be sent.
                            </p>
                        ) : (
                            <p className="text-xs text-slate-400 flex items-start gap-1.5 pt-1">
                                <span className="material-symbols-outlined text-sm text-slate-300 flex-shrink-0 mt-px">info</span>
                                Login credentials will be emailed to the user automatically after account creation.
                            </p>
                        )
                    )}
                </form>
                )}
            </Modal>
        </div>
    );
};

export default Users;
