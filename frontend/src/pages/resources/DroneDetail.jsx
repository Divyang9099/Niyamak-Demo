import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { useSetBreadcrumb } from '../../context/BreadcrumbContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useToast } from '../../context/ToastContext';
import { formatDateOnly } from '../../utils/dateUtils';
import useAuth from '../../hooks/useAuth';
import { ROLES } from '../../utils/constants';
import { DetailSkeleton } from '../../components/ui/Skeletons';

const DroneDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();

    const [drone, setDrone] = useState(null);
    useSetBreadcrumb(drone?.name);
    const [maintenanceLogs, setMaintenanceLogs] = useState([]);
    const [allocations, setAllocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusSaving, setStatusSaving] = useState(false);

    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState({
        maintenance_type: '',
        description: '',
        performed_by: '',
        performed_at: '',
        next_due: '',
        cost: ''
    });

    const fetchData = async () => {
        try {
            setLoading(true);
            const [droneRes, maintRes, allocRes] = await Promise.all([
                axiosInstance.get(ENDPOINTS.RESOURCES.DRONE(id)),
                axiosInstance.get(ENDPOINTS.RESOURCES.DRONE_MAINT(id)),
                axiosInstance.get(ENDPOINTS.RESOURCES.DRONE_HISTORY(id))
            ]);
            setDrone(droneRes.data.data);
            setMaintenanceLogs(maintRes.data.data?.maintenance || maintRes.data.data || []);
            setAllocations(Array.isArray(allocRes.data.data) ? allocRes.data.data : []);
        } catch (err) {
            showToast(err?.response?.data?.message || 'Failed to load drone data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (newStatus) => {
        setStatusSaving(true);
        try {
            await axiosInstance.put(ENDPOINTS.RESOURCES.DRONE(id), { status: newStatus });
            setDrone(d => ({ ...d, status: newStatus }));
            showToast('Status updated');
        } catch (err) {
            showToast(err.userMessage, 'error');
        } finally {
            setStatusSaving(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        try {
            await axiosInstance.post(ENDPOINTS.RESOURCES.DRONE_MAINT(id), form);
            setModalOpen(false);
            setForm({ maintenance_type: '', description: '', performed_by: '', performed_at: '', next_due: '', cost: '' });
            fetchData();
        } catch (err) {
            showToast(err.userMessage, 'error');
        }
    };

    if (loading) {
        return <DetailSkeleton />;
    }

    if (!drone) {
        return <div className="text-slate-900 text-center py-20">Drone not found.</div>;
    }

    const columns = [
        { header: 'Type', accessorKey: 'maintenance_type' },
        { header: 'Description', accessorKey: 'description' },
        { header: 'Performed By', accessorKey: 'performed_by' },
        { header: 'Date', accessorKey: 'performed_at', cell: (row) => formatDateOnly(row.performed_at) },
        { header: 'Next Due', accessorKey: 'next_due', cell: (row) => formatDateOnly(row.next_due) },
        { header: 'Cost', accessorKey: 'cost', cell: (row) => `₹${Number(row.cost || 0).toLocaleString('en-IN')}` }
    ];

    const canEdit = user?.role === ROLES.ADMIN || user?.role === ROLES.PROJECT_MANAGER;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <Button variant="ghost" size="sm" icon="arrow_back" className="mb-2 -ml-2" onClick={() => navigate('/resources/drones')}>Back to Fleet</Button>
                    <p className="font-['Space_Grotesk'] uppercase tracking-[0.2em] text-[11px] text-slate-500 mb-1">Details & History</p>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-[-0.03em]">{drone.serial_number || drone.id}</h2>
                </div>
                <div className="flex items-center gap-3">
                    {canEdit && (
                        <select
                            value={drone.status}
                            disabled={statusSaving}
                            onChange={e => handleStatusChange(e.target.value)}
                            className="bg-surface border border-slate-200 text-slate-900 text-xs rounded-lg px-3 py-2 disabled:opacity-50"
                        >
                            <option value="active">Active</option>
                            <option value="maintenance">Maintenance</option>
                            <option value="offline">Offline</option>
                        </select>
                    )}
                    {canEdit && (
                        <Button icon="build" onClick={() => setModalOpen(true)}>Log Maintenance</Button>
                    )}
                </div>
            </div>

            {/* Drone Info Card */}
            <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Specifications</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Asset Name</p>
                        <p className="text-sm text-slate-900 font-medium">{drone.name || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Model</p>
                        <p className="text-sm text-slate-900 font-medium">{drone.model || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Serial Number</p>
                        <p className="text-sm text-slate-900 font-medium">{drone.serial_number || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Status</p>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                            drone.status === 'active' ? 'bg-green-500/10 text-green-400' : 
                            drone.status === 'maintenance' ? 'bg-amber-500/10 text-amber-400' : 
                            'bg-red-500/10 text-red-400'
                        }`}>
                            {drone.status || 'OFFLINE'}
                        </span>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">UIN</p>
                        <p className="text-sm text-slate-900 font-medium">{drone.uin || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Sensor Type</p>
                        <p className="text-sm text-slate-900 font-medium">{drone.sensor_type || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Insurance Expiry</p>
                        <p className="text-sm text-slate-900 font-medium">{formatDateOnly(drone.insurance_expiry)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Next Maintenance</p>
                        <p className="text-sm text-slate-900 font-medium">{formatDateOnly(drone.next_maintenance)}</p>
                    </div>
                </div>
            </Card>

            {/* Maintenance History */}
            <Card className="overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-900">Maintenance History</h3>
                </div>
                {maintenanceLogs.length > 0 ? (
                    <Table columns={columns} data={maintenanceLogs} />
                ) : (
                    <div className="text-center py-12">
                        <p className="text-slate-500">No maintenance logs found for this asset.</p>
                    </div>
                )}
            </Card>

            {/* Allocation History */}
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
                                    <div>
                                        <span className="text-slate-900 font-bold text-sm">{row.project_name}</span>
                                        {row.is_pipeline && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/10 text-purple-400">PIPELINE</span>}
                                    </div>
                                )
                            },
                            { header: 'Pilot', accessorKey: 'pilot_name', cell: (row) => <span className="text-slate-500 text-xs">{row.pilot_name || '—'}</span> },
                            { header: 'Start', accessorKey: 'start_date', cell: (row) => <span className="text-xs font-mono text-slate-500">{formatDateOnly(row.start_date)}</span> },
                            { header: 'End', accessorKey: 'end_date', cell: (row) => <span className="text-xs font-mono text-slate-500">{formatDateOnly(row.end_date)}</span> },
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
                        <p className="text-slate-500">No deployment records found for this asset.</p>
                    </div>
                )}
            </Card>

            {/* Maintenance Modal */}
            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Log Maintenance">
                <form onSubmit={handleFormSubmit} className="space-y-4">
                    <Input label="Maintenance Type" required value={form.maintenance_type} onChange={(e) => setForm({...form, maintenance_type: e.target.value})} placeholder="e.g., Routine Inspection, Repair" />
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Description</label>
                        <textarea 
                            required 
                            value={form.description} 
                            onChange={(e) => setForm({...form, description: e.target.value})} 
                            className="w-full bg-surface border border-slate-200 rounded-lg p-3 text-slate-900 text-sm focus:outline-none focus:border-white/30 min-h-[80px]"
                            placeholder="Details regarding tasks performed..."
                        />
                    </div>
                    <Input label="Performed By" required value={form.performed_by} onChange={(e) => setForm({...form, performed_by: e.target.value})} placeholder="Technician Name" />
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="Date Performed" type="date" required value={form.performed_at} onChange={(e) => setForm({...form, performed_at: e.target.value})} />
                        <Input label="Next Due Date" type="date" value={form.next_due} onChange={(e) => setForm({...form, next_due: e.target.value})} />
                    </div>
                    <Input label="Cost (INR)" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({...form, cost: e.target.value})} placeholder="Total service cost" />
                    <div className="flex gap-3 pt-4">
                        <Button type="submit" className="flex-1">Save Log</Button>
                        <Button type="button" variant="ghost" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default DroneDetail;
