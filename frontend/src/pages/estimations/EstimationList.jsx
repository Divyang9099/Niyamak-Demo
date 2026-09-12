import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { downloadFile } from '../../utils/download';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { SkeletonTable } from '../../components/ui/Skeleton';
import { Table } from '../../components/ui/Table';
import { formatDate } from '../../utils/helpers';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';

const EstimationList = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { socket } = useSocket();
    const { showToast } = useToast();
const { confirmDialog } = useDialog();
    const [estimations, setEstimations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [exportingId, setExportingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
    // Sync when Topbar navigates here with ?search= param
    useEffect(() => { setSearchTerm(searchParams.get('search') || ''); }, [searchParams]);

    useEffect(() => {
        fetchEstimations(1);
    }, []);

    useEffect(() => {
        if (!socket) return;
        const refresh = () => fetchEstimations(1);
        socket.on('estimation:created', refresh);
        socket.on('estimation:updated', refresh);
        socket.on('estimation:deleted', refresh);
        return () => {
            socket.off('estimation:created', refresh);
            socket.off('estimation:updated', refresh);
            socket.off('estimation:deleted', refresh);
        };
    }, [socket]);

    const fetchEstimations = async (nextPage = 1) => {
        setLoading(true);
        try {
            const res = await axiosInstance.get(ENDPOINTS.ESTIMATIONS.GET_ALL, { params: { page: nextPage, limit: 25 } });
            const rows = Array.isArray(res.data.data) ? res.data.data : [];
            setEstimations(prev => nextPage === 1 ? rows : [...prev, ...rows]);
            const p = res.data.pagination;
            setHasMore(p ? p.page < p.pages : false);
            setPage(nextPage);
        } catch (err) {
            showToast(err.userMessage ||'Failed to load estimations', 'error');
        } finally {
            setLoading(false);
        }
    };

    const pollJob = async (jobId, queue, onComplete, onFail, maxMs = 60000) => {
        const start = Date.now();
        const check = async () => {
            if (Date.now() - start > maxMs) {
                onFail('Export timed out. Please try again.');
                return;
            }
            try {
                const res = await axiosInstance.get(ENDPOINTS.JOBS.STATUS(jobId, queue));
                const { status, result, reason } = res.data.data;
                if (status === 'completed') { onComplete(result); return; }
                if (status === 'failed')    { onFail(reason || 'Export failed'); return; }
                setTimeout(check, 2000);
            } catch {
                setTimeout(check, 3000);
            }
        };
        setTimeout(check, 1500);
    };

    const handleExportPDF = async (id, clientName) => {
        if (exportingId) return;
        setExportingId(id);
        try {
            const res = await axiosInstance.get(ENDPOINTS.ESTIMATIONS.EXPORT_PDF(id));
            if (res.status === 202) {
                showToast('Generating PDF — please wait…', 'info');
                const { jobId, queue } = res.data.data;
                pollJob(
                    jobId, queue,
                    (result) => { setExportingId(null); showToast('PDF ready — downloading', 'success'); window.open(result.url, '_blank'); },
                    (msg)    => { setExportingId(null); showToast(msg, 'error'); }
                );
            } else {
                // Redis disabled — response is a blob
                setExportingId(null);
                await downloadFile(ENDPOINTS.ESTIMATIONS.EXPORT_PDF(id), `VH_EST_${id.slice(0,6)}_${clientName || 'PROJECT'}.pdf`);
            }
        } catch (err) {
            setExportingId(null);
            showToast(err.userMessage ||'PDF export failed', 'error');
        }
    };

    const handleExportExcel = async (id, clientName) => {
        if (exportingId) return;
        setExportingId(id);
        try {
            const res = await axiosInstance.get(ENDPOINTS.ESTIMATIONS.EXPORT_XLS(id), { responseType: 'blob' });
            const url  = window.URL.createObjectURL(new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            const link = document.createElement('a');
            link.href  = url;
            link.setAttribute('download', `VH_DATA_${id.slice(0,6)}_${clientName || 'REPORT'}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            showToast(err.userMessage ||'Excel export failed', 'error');
        } finally {
            setExportingId(null);
        }
    };

    const cloneEstimation = async (id) => {
      try {
        const res = await axiosInstance.post(ENDPOINTS.ESTIMATIONS.CLONE(id));
        navigate(`/estimations/${res.data.data.id}`);
      } catch (err) {
        showToast(err.userMessage ||'Clone operation failed', 'error');
      }
    };

    const deleteEstimation = async (id) => {
      if (!(await confirmDialog({ message: 'Delete this estimation? This cannot be undone.', danger: true }))) return;
      try {
        await axiosInstance.delete(ENDPOINTS.ESTIMATIONS.DELETE(id));
        setEstimations(prev => prev.filter(e => e.id !== id));
        showToast('Estimation deleted');
      } catch (err) {
        showToast(err.userMessage ||'Failed to delete estimation', 'error');
      }
    };

    const columns = [
        {
            header: 'Financial Title',
            accessorKey: 'project_name',
            cell: (row) => (
                <div 
                    className="flex items-center gap-3 cursor-pointer group" 
                    onClick={() => navigate(`/estimations/${row.id}`)}
                >
                    <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary border border-primary/20 transition-all group-hover:bg-primary group-hover:text-slate-900">
                        <span className="material-symbols-outlined text-xs">payments</span>
                    </div>
                    <div>
                        <p className="font-bold text-slate-900 text-sm group-hover:text-primary transition-colors">
                          {row.name || row.project_name || row.client_name || 'Untitled Estimate'}
                        </p>
                        <p className="text-[10px] text-slate-500 uppercase tracking-[0.15em]">
                          {row.name
                            ? (row.project_name || row.client_name || (row.project_type || '').replace(/_/g, ' ') || 'Unbound estimate')
                            : (row.project_name ? (row.client_name || 'Generic Client') : ((row.project_type || '').replace(/_/g, ' ') || 'Unbound estimate'))
                          }
                        </p>
                    </div>
                </div>
            )
        },
        {
            header: 'Valuation',
            accessorKey: 'total_cost',
            cell: (row) => {
                // total_cost is stored WITH GST (cost.total). Show the pre-GST value as the
                // headline (what the user quotes), with the GST-inclusive grand total beneath.
                const grand = Number(row.total_cost || 0);                 // incl. GST
                const tax   = Number(row.tax || 0);
                const exGst = row.details?.breakdown?.subtotal != null
                    ? Number(row.details.breakdown.subtotal)
                    : Math.max(0, grand - tax);                            // pre-GST
                const taxPct = row.details?.inputs?.tax_percent ?? row.tax_percentage ?? 18;
                const inr = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
                return (
                    <div className="flex flex-col">
                        <span className="text-slate-900 font-black text-sm">₹{inr(exGst)}</span>
                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">+ {taxPct}% GST · ₹{inr(grand)} incl.</span>
                    </div>
                );
            }
        },
        {
            header: 'Status',
            accessorKey: 'status',
            cell: (row) => (
                <span className={`px-2.5 py-1 rounded-sm text-[9px] font-black uppercase tracking-widest ${
                    row.status === 'draft' ? 'bg-slate-200 text-slate-500' : 
                    row.status === 'sent' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 
                    row.status === 'approved' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
                    'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                    {row.status || 'Draft'}
                </span>
            )
        },
        {
            header: 'Last Sync',
            accessorKey: 'created_at',
            cell: (row) => <span className="text-slate-500 text-xs font-mono">{formatDate(row.created_at)}</span>
        },
        {
            header: 'Operations',
            cell: (row) => (
                <div className="flex gap-1.5">
                    <Button variant="secondary" size="sm" icon={exportingId === row.id ? 'hourglass_top' : 'picture_as_pdf'}
                        disabled={!!exportingId}
                        onClick={() => handleExportPDF(row.id, row.client_name)} />
                    <Button variant="secondary" size="sm" icon={exportingId === row.id ? 'hourglass_top' : 'table_chart'}
                        disabled={!!exportingId}
                        onClick={() => handleExportExcel(row.id, row.client_name)} />
                    <Button variant="ghost" size="sm" icon="content_copy"
                        onClick={() => cloneEstimation(row.id)} />
                    <Button variant="danger" size="sm" icon="delete"
                        onClick={() => deleteEstimation(row.id)} />
                </div>
            )
        }
    ];

    const filteredEstimations = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return estimations;
        return estimations.filter(e =>
            (e.project_name || '').toLowerCase().includes(q) ||
            (e.client_name  || '').toLowerCase().includes(q) ||
            (e.status       || '').toLowerCase().includes(q)
        );
    }, [estimations, searchTerm]);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <PageHeader
                eyebrow="Fiscal Records"
                title="Estimations"
                description="Cost models and quotations across your projects."
                actions={<Button icon="add_box" onClick={() => navigate('/estimations/new')}>New Estimation</Button>}
            />

            <Card className="border-slate-200">
                <div className="p-4 border-b border-slate-100">
                    <div className="relative w-full sm:max-w-sm">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">search</span>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search estimations…"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-sm placeholder:text-slate-400 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                    </div>
                </div>
                {loading && page === 1 ? (
                    <SkeletonTable cols={columns.length} />
                ) : (
                    <Table
                        columns={columns}
                        data={filteredEstimations}
                        empty={{
                            icon: 'request_quote',
                            title: 'No estimations yet',
                            description: 'Build your first cost model to quote a project.',
                            action: <Button icon="add_box" size="sm" onClick={() => navigate('/estimations/new')}>New Estimation</Button>,
                        }}
                    />
                )}
            </Card>
            {hasMore && (
                <div className="flex justify-center">
                    <Button variant="secondary" onClick={() => fetchEstimations(page + 1)} disabled={loading}>
                        {loading ? 'Loading...' : 'Load More'}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default EstimationList;
