import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { SectionSkeleton } from '../../components/ui/Skeletons';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import { useSocket } from '../../context/SocketContext';
import useAuth from '../../hooks/useAuth';
import { ROLES } from '../../utils/constants';
import { formatDateOnly } from '../../utils/dateUtils';
import {
  PieChart, Pie, Cell,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, LabelList,
  Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Forward-only funnel ──────────────────────────────────────────────────────
const STAGE_FLOW = ['inquiry', 'commercial_proposal', 'pre_confirmation', 'onboarding'];
const STAGE_META = {
  inquiry:             { label: 'Inquiry',             short: 'Inquiry',   icon: 'help',            dot: 'bg-blue-500',   ring: 'ring-blue-200',   text: 'text-blue-600',   soft: 'bg-blue-50' },
  commercial_proposal: { label: 'Commercial Proposal', short: 'Proposal',  icon: 'request_quote',   dot: 'bg-amber-500',  ring: 'ring-amber-200',  text: 'text-amber-600',  soft: 'bg-amber-50',  artifact: 'Quotation document (PDF/image)' },
  pre_confirmation:    { label: 'Pre-Confirmation',    short: 'Pre-Conf',  icon: 'mark_email_read', dot: 'bg-violet-500', ring: 'ring-violet-200', text: 'text-violet-600', soft: 'bg-violet-50', artifact: 'Email / WhatsApp confirmation screenshot' },
  onboarding:          { label: 'Onboarding',          short: 'Onboarding',icon: 'handshake',       dot: 'bg-emerald-500',ring: 'ring-emerald-200',text: 'text-emerald-600',soft: 'bg-emerald-50',artifact: 'Agreement document' },
};
const nextStage = (stage) => {
  const i = STAGE_FLOW.indexOf(stage);
  return i >= 0 && i < STAGE_FLOW.length - 1 ? STAGE_FLOW[i + 1] : null;
};

const fmtMoney = (v) => {
  const n = Number(v || 0);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
};

// Compact: 60000 → ₹60K, 150000 → ₹1.5L, 10000000 → ₹1Cr
const fmtCompact = (v) => {
  const n = Number(v || 0);
  if (n === 0) return '₹0';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(0)}K`;
  return `₹${n}`;
};

const TYPE_ICON = { solar_pv: 'solar_power', wind: 'wind_power', td_lines: 'electric_bolt', tower: 'cell_tower', pipeline: 'valve', volumetric: 'landscape' };

// Project-type metadata for the distribution pie chart (label + chart colour)
const TYPE_META = {
  solar_pv:   { label: 'Solar PV',   color: '#F59E0B' },
  wind:       { label: 'Wind',       color: '#06B6D4' },
  td_lines:   { label: 'T&D Lines',  color: '#8B5CF6' },
  tower:      { label: 'Tower',      color: '#3B82F6' },
  pipeline:   { label: 'Pipeline',   color: '#10B981' },
  volumetric: { label: 'Volumetric',color: '#F43F5E' },
  other:      { label: 'Other',      color: '#94A3B8' },
};
const prettyType = (t) => TYPE_META[t]?.label || String(t || 'Other').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Vibrant categorical palette — slices & bars are coloured by index so both charts pop
const PALETTE = ['#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6', '#EC4899', '#0EA5E9'];

// White percentage label drawn inside each pie slice (hidden for slivers < 5%)
const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.05) return null;
  const RAD = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.62;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 13, fontWeight: 800, textShadow: '0 1px 2px rgba(0,0,0,0.25)' }}>
      {Math.round(percent * 100)}%
    </text>
  );
};

// Shared tooltip for both charts — small white card matching the UI
const ChartTooltip = ({ active, payload, suffix = '' }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-surface border border-slate-200 shadow-lg rounded-lg px-3 py-2">
      <p className="text-xs font-bold text-slate-900">{p.payload.label}</p>
      <p className="text-[11px] text-slate-500">{p.value} {suffix || (p.value === 1 ? 'lead' : 'leads')}</p>
    </div>
  );
};

// ── Area chart helpers ────────────────────────────────────────────────────────
const AreaDot = ({ cx, cy, value }) => {
  if (!value) return null;
  return (
    <g key={`dot-${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r={8} fill="#0D9488" opacity={0.12} />
      <circle cx={cx} cy={cy} r={5.5} fill="#0D9488" />
      <circle cx={cx} cy={cy} r={2.5} fill="white" />
    </g>
  );
};

// Only show label on the peak value to avoid clutter and clipping
const makeAreaValueLabel = (maxVal) => ({ x, y, value, viewBox }) => {
  if (!value || Number(value) !== maxVal) return null;
  const n = Number(value);
  let text;
  if (n >= 1e7) text = `₹${(n / 1e7).toFixed(1)}Cr`;
  else if (n >= 1e5) text = `₹${(n / 1e5).toFixed(1)}L`;
  else if (n >= 1e3) text = `₹${(n / 1e3).toFixed(0)}K`;
  else text = `₹${n}`;
  const w = text.length * 6.4 + 14;
  // Position badge to the left of the dot when near the right edge, else center above
  const rightEdge = viewBox ? viewBox.x + viewBox.width : 9999;
  const wouldClip = x + w / 2 + 6 > rightEdge;
  const bx = wouldClip ? x - w - 8 : x - w / 2;
  const tx = bx + w / 2;
  return (
    <g>
      <rect x={bx} y={y - 28} width={w} height={18} rx={4}
        fill="white" stroke="#0D9488" strokeWidth={1.5} />
      <text x={tx} y={y - 17} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 10, fontWeight: 800, fill: '#0D9488' }}>
        {text}
      </text>
    </g>
  );
};

const PipelineBoard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pipelineItems, setPipelineItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [convertTarget, setConvertTarget] = useState(null);
  const [convertingId, setConvertingId] = useState(null);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  // Sync when Topbar navigates here with ?search= param
  useEffect(() => { setSearch(searchParams.get('search') || ''); }, [searchParams]);

  const [advanceTarget, setAdvanceTarget] = useState(null);
  const [advanceFile, setAdvanceFile] = useState(null);
  const [advancePONumber, setAdvancePONumber] = useState('');
  const [advanceWONumber, setAdvanceWONumber] = useState('');
  const [advancing, setAdvancing] = useState(false);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // pipeline history (cancelled + converted leads)
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // table controls
  const [stageFilter, setStageFilter] = useState('all');
  const [activeKpi, setActiveKpi] = useState(null); // null | 'hot'|'follow_up_due'|'proposal_sent'|'po_awaited'|'ready_to_convert'
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const toggleSort = (field) => {
    if (sortBy === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortDir('asc'); }
  };

  const { showToast } = useToast();
  const { confirmDialog } = useDialog();
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const { socket } = useSocket();

  useEffect(() => { fetchPipeline(); fetchHistory(); }, []);

  const handleDeleteHistory = async (h) => {
    const ok = await confirmDialog({
      title: 'Delete Lead Permanently',
      message: `Permanently delete "${h.name}" from pipeline history? ${h.outcome === 'converted' ? 'The converted project is kept — only the lead record is removed.' : ''}This cannot be undone.`,
      danger: true,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await axiosInstance.delete(ENDPOINTS.PIPELINE.DELETE(h.id));
      setHistory(prev => prev.filter(x => x.id !== h.id));
      showToast('Lead deleted from history');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Delete failed', 'error');
    }
  };

  const fetchHistory = async () => {
    try {
      const r = await axiosInstance.get(ENDPOINTS.PIPELINE.HISTORY);
      setHistory(Array.isArray(r.data.data) ? r.data.data : []);
    } catch (_) { /* non-fatal */ }
  };

  useEffect(() => {
    if (!socket) return;
    const onCreated      = (item) => setPipelineItems(prev => [item, ...prev]);
    const onUpdated      = (item) => setPipelineItems(prev => prev.map(p => p.id === item.id ? { ...p, ...item } : p));
    const onStageChanged = (item) => { setPipelineItems(prev => prev.map(p => p.id === item.id ? { ...p, ...item } : p).filter(p => p.stage !== 'cancelled')); if (item.stage === 'cancelled') fetchHistory(); };
    const onDeleted      = ({ id }) => setPipelineItems(prev => prev.filter(p => p.id !== id));
    const onConverted    = ({ id }) => { setPipelineItems(prev => prev.filter(p => p.id !== id)); fetchHistory(); };
    socket.on('pipeline:created',       onCreated);
    socket.on('pipeline:updated',       onUpdated);
    socket.on('pipeline:stage_changed', onStageChanged);
    socket.on('pipeline:deleted',       onDeleted);
    socket.on('pipeline:converted',     onConverted);
    return () => {
      socket.off('pipeline:created',       onCreated);
      socket.off('pipeline:updated',       onUpdated);
      socket.off('pipeline:stage_changed', onStageChanged);
      socket.off('pipeline:deleted',       onDeleted);
      socket.off('pipeline:converted',     onConverted);
    };
  }, [socket]);

  // Load stage documents whenever the detail modal opens for a lead
  useEffect(() => {
    if (!isEditModalOpen || !selectedItem?.id) { setDocs([]); return; }
    let active = true;
    setDocsLoading(true);
    axiosInstance.get(ENDPOINTS.PIPELINE.DOCUMENTS(selectedItem.id))
      .then(r => { if (active) setDocs(Array.isArray(r.data.data) ? r.data.data : []); })
      .catch(() => { if (active) setDocs([]); })
      .finally(() => { if (active) setDocsLoading(false); });
    return () => { active = false; };
  }, [isEditModalOpen, selectedItem?.id]);

  const fetchPipeline = async () => {
    try {
      const res = await axiosInstance.get(ENDPOINTS.PIPELINE.GET_ALL);
      setPipelineItems(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to load pipeline', 'error');
    } finally { setLoading(false); }
  };

  // ── Derived metrics ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pipelineItems;
    return pipelineItems.filter(i =>
      [i.name, i.client_name, i.project_type, i.state, i.sales_executive].filter(Boolean).some(v => String(v).toLowerCase().includes(q))
    );
  }, [pipelineItems, search]);

  const metrics = useMemo(() => {
    const total = filtered.length;
    const totalValue = filtered.reduce((s, i) => s + Number(i.estimated_value || 0), 0);
    const ready = filtered.filter(i => i.stage === 'onboarding').length;
    return { total, totalValue, ready };
  }, [filtered]);

  // Pie chart — count of leads per project type, largest slice first
  const typeData = useMemo(() => {
    const counts = {};
    filtered.forEach(i => {
      const t = i.project_type || 'other';
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, value]) => ({ type, value, label: prettyType(type) }))
      .sort((a, b) => b.value - a.value)
      .map((d, i) => ({ ...d, color: PALETTE[i % PALETTE.length] }));
  }, [filtered]);

  // Area chart — leads per month, including history (all-time resolved leads)
  const [chartYear, setChartYear] = useState(new Date().getFullYear());

  const availableYears = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    [...pipelineItems, ...history].forEach(i => {
      const raw = i.enquiry_date || i.created_at;
      if (raw) { const y = new Date(raw).getFullYear(); if (!isNaN(y)) years.add(y); }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [pipelineItems, history]);

  const monthData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, m) => ({
      key: `${chartYear}-${String(m + 1).padStart(2, '0')}`,
      label: new Date(chartYear, m, 1).toLocaleString('en-US', { month: 'short' }),
      month: m,
      count: 0,
      value: 0,
    }));
    // Only active pipeline leads — keeps value consistent with pipeline KPI
    pipelineItems.forEach(i => {
      const raw = i.enquiry_date || i.created_at;
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d.getTime()) || d.getFullYear() !== chartYear) return;
      months[d.getMonth()].count += 1;
      months[d.getMonth()].value += Number(i.estimated_value || 0);
    });
    return months;
  }, [pipelineItems, chartYear]);

  // Show months up to current month for current year; all 12 for past years
  const displayMonthData = useMemo(() => {
    const now = new Date();
    const cutoff = chartYear === now.getFullYear() ? now.getMonth() : 11;
    return monthData.filter((_, i) => i <= cutoff);
  }, [monthData, chartYear]);

  const totalMonthValue = useMemo(() => monthData.reduce((s, m) => s + m.value, 0), [monthData]);
  const totalMonthCount = useMemo(() => monthData.reduce((s, m) => s + m.count, 0), [monthData]);

  // Bar chart: all-leads (active + history) vs converted per month
  const conversionBarData = useMemo(() => {
    // Start from active leads per month
    const months = displayMonthData.map(m => ({
      label:          m.label,
      month:          m.month,
      allValue:       m.value,   // active pipeline leads
      allCount:       m.count,
      convertedValue: 0,
      convertedCount: 0,
    }));

    // Add history items (converted + cancelled) to allValue/allCount,
    // and separately tally converted ones
    history.forEach(h => {
      const raw = h.enquiry_date || h.created_at;
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d.getTime()) || d.getFullYear() !== chartYear) return;
      const mIdx = months.findIndex(m => m.month === d.getMonth());
      if (mIdx < 0) return;
      months[mIdx].allValue += Number(h.estimated_value || 0);
      months[mIdx].allCount += 1;
      if (h.outcome === 'converted') {
        months[mIdx].convertedValue += Number(h.estimated_value || 0);
        months[mIdx].convertedCount += 1;
      }
    });

    return months;
  }, [displayMonthData, history, chartYear]);

  // Sankey flow — cumulative throughput per stage + drop-offs
  const convertedCount = useMemo(() => history.filter(h => h.outcome === 'converted').length, [history]);
  const cancelledCount = useMemo(() => history.filter(h => h.outcome === 'cancelled').length, [history]);

  const sankeyData = useMemo(() => {
    const active = {};
    STAGE_FLOW.forEach(s => { active[s] = 0; });
    pipelineItems.forEach(i => { if (active[i.stage] != null) active[i.stage] += 1; });
    const inq  = active.inquiry;
    const prop = active.commercial_proposal;
    const pre  = active.pre_confirmation;
    const onb  = active.onboarding;
    const conv = convertedCount;
    // Cumulative throughput at each stage
    const inquiryTotal  = inq + prop + pre + onb + conv;
    const proposalTotal = prop + pre + onb + conv;
    const preconfTotal  = pre + onb + conv;
    const onbTotal      = onb + conv;
    const MIN = 1;
    return {
      nodes: [
        { name: 'Inquiry',    count: Math.max(0, inquiryTotal),  color: '#3B82F6' },
        { name: 'Proposal',   count: Math.max(0, proposalTotal), color: '#F59E0B' },
        { name: 'Pre-Conf',   count: Math.max(0, preconfTotal),  color: '#8B5CF6' },
        { name: 'Onboarding', count: Math.max(0, onbTotal),      color: '#10B981' },
        { name: 'Converted',  count: conv,                       color: '#22C55E' },
      ],
      links: [
        { source: 0, target: 1, value: Math.max(MIN, proposalTotal), realValue: proposalTotal },
        { source: 1, target: 2, value: Math.max(MIN, preconfTotal),  realValue: preconfTotal },
        { source: 2, target: 3, value: Math.max(MIN, onbTotal),      realValue: onbTotal },
        { source: 3, target: 4, value: Math.max(MIN, conv),          realValue: conv },
      ],
    };
  }, [pipelineItems, convertedCount]);

  const byStage = useMemo(() => {
    const m = {};
    STAGE_FLOW.forEach(s => { m[s] = { items: [], value: 0 }; });
    filtered.forEach(i => { if (m[i.stage]) { m[i.stage].items.push(i); m[i.stage].value += Number(i.estimated_value || 0); } });
    return m;
  }, [filtered]);

  // ── Pipeline KPI tiles (computed from live pipelineItems) ─────────────────
  const pipelineKpis = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return [
      {
        key: 'hot',
        label: 'Hot Leads',
        sub: 'Pre-Conf & Onboarding',
        icon: 'local_fire_department',
        color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500',
        ...(() => { const s = pipelineItems.filter(i => ['pre_confirmation','onboarding'].includes(i.stage)); return { count: s.length, value: s.reduce((a,i)=>a+Number(i.estimated_value||0),0) }; })(),
      },
      {
        key: 'follow_up_due',
        label: 'Follow-up Due',
        sub: 'Est. close overdue',
        icon: 'alarm',
        color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500',
        ...(() => { const s = pipelineItems.filter(i => i.estimated_end && new Date(i.estimated_end) < today); return { count: s.length, value: s.reduce((a,i)=>a+Number(i.estimated_value||0),0) }; })(),
      },
      {
        key: 'proposal_sent',
        label: 'Proposal Sent',
        sub: 'Awaiting response',
        icon: 'description',
        color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500',
        ...(() => { const s = pipelineItems.filter(i => i.stage === 'commercial_proposal'); return { count: s.length, value: s.reduce((a,i)=>a+Number(i.estimated_value||0),0) }; })(),
      },
      {
        key: 'po_awaited',
        label: 'PO Awaited',
        sub: 'Onboarding, no PO yet',
        icon: 'receipt_long',
        color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500',
        ...(() => { const s = pipelineItems.filter(i => i.stage === 'onboarding' && !i.onboarding_po_number); return { count: s.length, value: s.reduce((a,i)=>a+Number(i.estimated_value||0),0) }; })(),
      },
      {
        key: 'ready_to_convert',
        label: 'Ready to Convert',
        sub: 'Onboarding with PO',
        icon: 'rocket_launch',
        color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500',
        ...(() => { const s = pipelineItems.filter(i => i.stage === 'onboarding' && i.onboarding_po_number); return { count: s.length, value: s.reduce((a,i)=>a+Number(i.estimated_value||0),0) }; })(),
      },
    ];
  }, [pipelineItems]);

  // table rows: stage-filtered + kpi-filtered + sorted
  const rows = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let arr;
    if (activeKpi) {
      if (activeKpi === 'hot')             arr = filtered.filter(i => ['pre_confirmation','onboarding'].includes(i.stage));
      else if (activeKpi === 'follow_up_due') arr = filtered.filter(i => i.estimated_end && new Date(i.estimated_end) < today);
      else if (activeKpi === 'proposal_sent') arr = filtered.filter(i => i.stage === 'commercial_proposal');
      else if (activeKpi === 'po_awaited')    arr = filtered.filter(i => i.stage === 'onboarding' && !i.onboarding_po_number);
      else if (activeKpi === 'ready_to_convert') arr = filtered.filter(i => i.stage === 'onboarding' && i.onboarding_po_number);
      else arr = filtered;
    } else {
      arr = stageFilter === 'all' ? filtered : filtered.filter(i => i.stage === stageFilter);
    }
    if (sortBy) {
      arr = [...arr].sort((a, b) => {
        let av, bv;
        if (sortBy === 'estimated_value') {
          av = Number(a[sortBy] || 0); bv = Number(b[sortBy] || 0);
        } else if (sortBy === 'enquiry_date') {
          av = a.enquiry_date || a.created_at || ''; bv = b.enquiry_date || b.created_at || '';
        } else if (sortBy === 'stage') {
          av = STAGE_FLOW.indexOf(a.stage); bv = STAGE_FLOW.indexOf(b.stage);
        } else {
          av = String(a[sortBy] || '').toLowerCase(); bv = String(b[sortBy] || '').toLowerCase();
        }
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return arr;
  }, [filtered, stageFilter, activeKpi, sortBy, sortDir]);

  const resetAdvanceState = () => { setAdvanceTarget(null); setAdvanceFile(undefined); setAdvancePONumber(''); setAdvanceWONumber(''); };

  // ── Advance stage (free, no document required) ──
  const submitAdvance = async () => {
    if (!advanceTarget) return;
    const target = nextStage(advanceTarget.stage);
    if (!target) return;
    setAdvancing(true);
    try {
      const fd = new FormData();
      fd.append('stage', target);
      const res = await axiosInstance.put(ENDPOINTS.PIPELINE.UPDATE_STAGE(advanceTarget.id), fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPipelineItems(prev => prev.map(p => p.id === advanceTarget.id ? { ...p, ...res.data.data } : p));
      showToast(`Moved to ${STAGE_META[target].label}`);
      resetAdvanceState();
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally { setAdvancing(false); }
  };

  // ── Cancel (reason required) ──
  const submitCancel = async () => {
    if (!cancelTarget) return;
    if (!cancelReason.trim()) { showToast('A cancellation reason is required', 'error'); return; }
    setCancelling(true);
    try {
      const fd = new FormData();
      fd.append('stage', 'cancelled');
      fd.append('reason', cancelReason.trim());
      await axiosInstance.put(ENDPOINTS.PIPELINE.UPDATE_STAGE(cancelTarget.id), fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPipelineItems(prev => prev.filter(p => p.id !== cancelTarget.id));
      showToast('Opportunity cancelled & archived');
      setCancelTarget(null); setCancelReason('');
      fetchHistory();
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally { setCancelling(false); }
  };

  const advanceTargetNext = advanceTarget ? nextStage(advanceTarget.stage) : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-400">
      {/* ── Header ── */}
      <PageHeader
        eyebrow="Lead Generation"
        title="Sales Pipeline"
        description="Track opportunities from enquiry through to confirmed projects."
        actions={
          <>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">search</span>
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search leads, clients…"
                className="pl-9 pr-4 py-2.5 w-full sm:w-64 bg-surface border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <Button variant="secondary" icon="history" onClick={() => setHistoryOpen(true)}>
              History{history.length ? ` (${history.length})` : ''}
            </Button>
            <Button icon="add" onClick={() => navigate('/pipeline/new')}>New Lead</Button>
          </>
        }
      />

      {/* ── Analytics Row: KPIs + Area chart (2/3) + Pie + Funnel stacked (1/3) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">

      {/* Left column: KPI tiles + area chart */}
      <div className="lg:col-span-2 flex flex-col gap-3">

      {/* Pipeline KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {pipelineKpis.map(kpi => {
          const active = activeKpi === kpi.key;
          return (
            <button
              key={kpi.key}
              onClick={() => { setActiveKpi(active ? null : kpi.key); setStageFilter('all'); }}
              className={`rounded-xl border p-3 text-left transition-all hover:shadow-md ${kpi.bg} ${kpi.border} ${active ? 'shadow-md ring-2 ring-offset-1 ring-current scale-[1.03]' : 'hover:scale-[1.02]'}`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`material-symbols-outlined text-[18px] ${kpi.color}`}>{kpi.icon}</span>
                <span className={`w-2 h-2 rounded-full ${kpi.dot}`} />
              </div>
              <p className={`text-xl font-black leading-none mb-1 ${kpi.color}`}>{kpi.count}</p>
              <p className={`text-xs font-bold leading-tight ${kpi.color}`}>{kpi.label}</p>
              <p className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">{kpi.sub}</p>
              {kpi.value > 0 && (
                <p className={`text-xs font-black mt-1.5 border-t pt-1 ${kpi.color} border-current/20`}>{fmtCompact(kpi.value)}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Charts row: area chart + bar chart side by side */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* Leads by Month — area chart (right on desktop) */}
        <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col min-h-[280px] md:order-2">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Lead Generation</p>
              <h3 className="text-sm font-black text-slate-900">Leads by Month</h3>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                  <p className="text-xs font-black text-teal-600">{fmtMoney(totalMonthValue)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
                  <p className="text-xs font-black text-violet-600">{totalMonthCount} leads</p>
                </div>
              </div>
            </div>
            <select
              value={chartYear}
              onChange={e => setChartYear(Number(e.target.value))}
              className="bg-surface border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-none"
            >
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="flex-1 min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={displayMonthData} margin={{ top: 50, right: 12, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#14B8A6" stopOpacity={0.32} />
                  <stop offset="95%" stopColor="#14B8A6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                interval={0}
                height={36}
                tick={({ x, y, payload, index }) => (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={0} dy={10} textAnchor="middle" fontSize={9} fontWeight={700} fill="#334155">
                      {payload.value}
                    </text>
                    <text x={0} y={0} dy={20} textAnchor="middle" fontSize={8} fill="#94A3B8">
                      ({displayMonthData[index]?.count ?? 0})
                    </text>
                  </g>
                )}
              />
              <YAxis tickFormatter={v => v > 0 ? fmtCompact(v) : '₹0'} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 9, fill: '#94A3B8' }} />
              <Tooltip
                cursor={{ stroke: '#14B8A6', strokeWidth: 1, strokeDasharray: '4 4' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-surface border border-slate-200 shadow-xl rounded-xl p-3 min-w-[160px]">
                      <p className="text-xs font-black text-slate-900 mb-2">{label} {chartYear}</p>
                      <p className="text-[9px] text-slate-400">Value: <span className="font-black text-teal-600">{fmtMoney(d?.value ?? 0)}</span></p>
                      <p className="text-[9px] text-slate-400">Leads: <span className="font-black text-violet-600">{d?.count ?? 0}</span></p>
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="value" stroke="#0D9488" strokeWidth={2} fill="url(#areaGrad)"
                dot={<AreaDot />} activeDot={{ r: 6, fill: '#0D9488', stroke: 'white', strokeWidth: 2 }}
                animationBegin={200} animationDuration={1200}>
                <LabelList dataKey="value" content={makeAreaValueLabel(Math.max(...displayMonthData.map(m => m.value)))} />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* Leads vs Converted — bar chart (left on desktop) */}
        <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col min-h-[280px] md:order-1">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Conversion</p>
              <h3 className="text-sm font-black text-slate-900">Leads vs Converted</h3>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-indigo-400 shrink-0" />
                  <p className="text-[9px] font-semibold text-slate-500">All Leads</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-emerald-500 shrink-0" />
                  <p className="text-[9px] font-semibold text-slate-500">Converted</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={conversionBarData} margin={{ top: 20, right: 8, left: 0, bottom: 8 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                interval={0}
                tick={{ fontSize: 9, fontWeight: 700, fill: '#334155' }}
              />
              <YAxis tickFormatter={v => v > 0 ? fmtCompact(v) : '₹0'} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 9, fill: '#94A3B8' }} />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-surface border border-slate-200 shadow-xl rounded-xl p-3 min-w-[170px]">
                      <p className="text-xs font-black text-slate-900 mb-2">{label} {chartYear}</p>
                      <div className="space-y-1">
                        <p className="text-[9px] text-slate-500">All Leads: <span className="font-black text-indigo-600">{fmtMoney(d?.allValue ?? 0)}</span> ({d?.allCount ?? 0})</p>
                        <p className="text-[9px] text-slate-500">Converted: <span className="font-black text-emerald-600">{fmtMoney(d?.convertedValue ?? 0)}</span> ({d?.convertedCount ?? 0})</p>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="allValue" name="All Leads" fill="#818CF8" radius={[3, 3, 0, 0]} maxBarSize={28}>
                <LabelList
                  content={({ x, y, width, value, index }) => {
                    const count = conversionBarData[index]?.allCount;
                    if (!count) return null;
                    return <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={8} fontWeight={700} fill="#6366F1">{count}</text>;
                  }}
                />
              </Bar>
              <Bar dataKey="convertedValue" name="Converted" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={28}>
                <LabelList
                  content={({ x, y, width, value, index }) => {
                    const count = conversionBarData[index]?.convertedCount;
                    if (!count) return null;
                    return <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={8} fontWeight={700} fill="#059669">{count}</text>;
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </div>

      </div>{/* end charts row */}
      </div>{/* end left column (KPIs + area chart) */}

      {/* Right column: Lead Types pie + Pipeline Funnel stacked */}
      <div className="flex flex-col gap-3">
        {/* Lead Types pie */}
        <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Pipeline</p>
              <h3 className="text-sm font-black text-slate-900">Lead Types</h3>
            </div>
            <span className="material-symbols-outlined text-base text-slate-300">insights</span>
          </div>
          {typeData.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 flex-1 py-8 text-slate-300">
              <span className="material-symbols-outlined text-3xl">pie_chart</span>
              <p className="text-[11px] font-medium text-slate-400">No leads yet</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-2" style={{ height: 110 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeData} dataKey="value" nameKey="label" cx="50%" cy="50%"
                      outerRadius={48} labelLine={false} label={renderPieLabel}
                      stroke="#fff" strokeWidth={2} animationBegin={150} animationDuration={1000}>
                      {typeData.map((d) => <Cell key={d.type} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 mt-1">
                {typeData.map((t) => {
                  const tot = typeData.reduce((s, x) => s + x.value, 0);
                  return (
                    <div key={t.type} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color }} />
                      <span className="text-slate-600 font-medium flex-1 truncate">{t.label}</span>
                      <span className="font-bold text-slate-800 tabular-nums">{t.value}</span>
                      <span className="text-slate-400 text-[10px] tabular-nums">{tot > 0 ? Math.round(t.value / tot * 100) : 0}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Pipeline Funnel (2/3 width) */}
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-slate-200 shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Conversion Journey</p>
              <h3 className="text-sm font-black text-slate-900">Pipeline Funnel</h3>
            </div>
            <span className="material-symbols-outlined text-base text-slate-300">filter_alt</span>
          </div>
          {sankeyData.nodes[0].count === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-300">
              <span className="material-symbols-outlined text-4xl">filter_alt</span>
              <p className="text-sm font-medium text-slate-400">No funnel data yet — add leads to see the pipeline</p>
            </div>
          ) : (() => {
            const nodes = sankeyData.nodes;
            const max = nodes[0].count || 1;
            // Full-width funnel: CX is dead centre, bars stretch wall-to-wall
            const W = 500; const CX = W / 2;
            const sH = 32; const gH = 12;
            const totalH = nodes.length * sH + (nodes.length - 1) * gH;
            const maxHalf = CX - 4;          // almost full width at top
            const minHalf = 0.30 * maxHalf;  // narrowest bar still 30% of max
            const halfW = nodes.map(n => minHalf + (maxHalf - minHalf) * Math.max(n.count / max, 0.30));
            return (
              <svg viewBox={`0 0 ${W} ${totalH}`} width="100%" height={totalH} style={{ display: 'block' }}>
                <defs>
                  <style>{`@keyframes fIn{from{opacity:0;transform:scaleX(0.05)}to{opacity:1;transform:scaleX(1)}}`}</style>
                </defs>
                {nodes.map((stage, i) => {
                  const y = i * (sH + gH);
                  const tH = halfW[i];
                  const bH = i < nodes.length - 1 ? halfW[i + 1] : halfW[i];
                  const prev = nodes[i - 1];
                  const cr = prev && prev.count > 0 ? Math.round((stage.count / prev.count) * 100) : null;
                  return (
                    <g key={stage.name}>
                      {cr !== null && (
                        <text x={CX} y={y - gH / 2} textAnchor="middle" dominantBaseline="central"
                          style={{ fontSize: 8, fontWeight: 700, fill: '#94A3B8' }}>
                          ↓ {cr}%
                        </text>
                      )}
                      <polygon
                        points={`${CX - tH},${y} ${CX + tH},${y} ${CX + bH},${y + sH} ${CX - bH},${y + sH}`}
                        fill={stage.color}
                        style={{ transformOrigin: `${CX}px ${y + sH / 2}px`, animation: `fIn 0.42s cubic-bezier(0.22,1,0.36,1) ${i * 0.09}s both` }}
                      />
                      {/* Centered label: "Stage Name — Count" */}
                      <text x={CX} y={y + sH / 2} textAnchor="middle" dominantBaseline="central"
                        style={{ fontSize: 11, fontWeight: 800, fill: 'white', pointerEvents: 'none', letterSpacing: '0.3px' }}>
                        {stage.name} — {stage.count}
                      </text>
                    </g>
                  );
                })}
              </svg>
            );
          })()}
        </div>
      </div>
      </div>{/* end outer analytics grid */}

      {/* ── Leads table (CRM-style) ── */}
      {loading ? (
        <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm"><SectionSkeleton rows={8} /></div>
      ) : (
        <div className="bg-surface rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Table toolbar */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[{ k: 'all', label: 'All' }, ...STAGE_FLOW.map(s => ({ k: s, label: STAGE_META[s].short }))].map(t => (
                <button key={t.k} onClick={() => { setStageFilter(t.k); setActiveKpi(null); }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all border ${stageFilter === t.k && !activeKpi ? 'bg-primary text-on-primary border-primary' : 'bg-surface text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                  {t.label}
                  <span className={`ml-1.5 ${stageFilter === t.k ? 'text-white/80' : 'text-slate-400'}`}>
                    {t.k === 'all' ? filtered.length : (byStage[t.k]?.items.length || 0)}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 font-medium">{rows.length} lead{rows.length === 1 ? '' : 's'}</p>
          </div>

          {/* Table */}
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-300">
              <span className="material-symbols-outlined text-5xl">groups</span>
              <p className="text-sm font-medium text-slate-400">No leads {stageFilter !== 'all' ? 'in this stage' : 'yet'}</p>
              <Button size="sm" icon="add" onClick={() => navigate('/pipeline/new')}>Add your first lead</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                    {[
                      { key: 'name',            label: 'Lead' },
                      { key: 'client_name',     label: 'Company' },
                      { key: 'sales_executive', label: 'Lead By' },
                      { key: 'stage',           label: 'Stage' },
                      { key: 'estimated_value', label: 'Value',  align: 'right' },
                      { key: 'enquiry_date',    label: 'Enquiry Date' },
                      { key: null,              label: 'Action', align: 'right' },
                    ].map((c) => (
                      <th key={c.label} className={`py-3 px-4 whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''} ${c.w || ''}`}>
                        {c.key ? (
                          <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors uppercase tracking-widest">
                            {c.label}
                            <span className="material-symbols-outlined text-[14px] leading-none">
                              {sortBy === c.key ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                            </span>
                          </button>
                        ) : c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((item) => {
                    const meta = STAGE_META[item.stage] || STAGE_META.inquiry;
                    const next = nextStage(item.stage);
                    const close = item.estimated_end || item.estimated_start;
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors group">
                        {/* Lead */}
                        <td className="py-3 px-4">
                          <button onClick={() => navigate(`/pipeline/${item.id}`)} className="flex items-center gap-3 text-left">
                            <span className={`w-9 h-9 rounded-xl ${meta.soft} flex items-center justify-center shrink-0`}>
                              <span className={`material-symbols-outlined text-base ${meta.text}`}>{TYPE_ICON[item.project_type] || 'business_center'}</span>
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate group-hover:text-primary transition-colors max-w-[200px]">{item.name}</p>
                              <p className="text-[10px] text-slate-400 capitalize">{(item.project_type || '—').replace(/_/g, ' ')}{item.state ? ` · ${item.state}` : ''}</p>
                            </div>
                          </button>
                        </td>
                        {/* Company */}
                        <td className="py-3 px-4 text-sm text-slate-600 truncate max-w-[160px]">{item.client_name || '—'}</td>
                        {/* Sales executive */}
                        <td className="py-3 px-4">
                          {item.sales_executive ? (
                            <span className="inline-flex items-center gap-1.5 text-sm text-slate-600 truncate max-w-[150px]">
                              <span className="material-symbols-outlined text-sm text-slate-400">badge</span>
                              {item.sales_executive}
                            </span>
                          ) : <span className="text-sm text-slate-300">—</span>}
                        </td>
                        {/* Stage badge */}
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${meta.soft} ${meta.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                            {meta.short}
                          </span>
                        </td>
                        {/* Value */}
                        <td className="py-3 px-4 text-right text-sm font-bold text-slate-900 whitespace-nowrap">{fmtMoney(item.estimated_value)}</td>
                        {/* Enquiry Date */}
                        <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                          {item.enquiry_date ? formatDateOnly(item.enquiry_date) : (item.created_at ? formatDateOnly(item.created_at) : '—')}
                        </td>
                        {/* Action */}
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {next ? (
                              <button onClick={() => { setAdvanceTarget(item); setAdvanceFile(undefined); }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-slate-100 text-slate-600 hover:bg-primary hover:text-on-primary transition-all whitespace-nowrap">
                                <span className="material-symbols-outlined text-xs">arrow_forward</span>
                                {STAGE_META[next].short}
                              </button>
                            ) : (
                              <button disabled={convertingId === item.id} onClick={() => setConvertTarget(item)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all whitespace-nowrap disabled:opacity-50">
                                <span className="material-symbols-outlined text-xs">rocket_launch</span>
                                {convertingId === item.id ? '…' : 'Convert'}
                              </button>
                            )}
                            <button onClick={() => setCancelTarget(item)} title="Cancel lead"
                              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                              <span className="material-symbols-outlined text-base">cancel</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Detail modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={selectedItem?.name || 'Lead'}>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${STAGE_META[selectedItem?.stage]?.soft} ${STAGE_META[selectedItem?.stage]?.text}`}>
              {STAGE_META[selectedItem?.stage]?.label || selectedItem?.stage}
            </span>
            {selectedItem?.project_type && <span className="text-xs text-slate-500 capitalize">{selectedItem.project_type.replace(/_/g, ' ')}</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Client', selectedItem?.client_name || '—'],
              ['Lead By', selectedItem?.sales_executive || '—'],
              ['Est. Value', fmtMoney(selectedItem?.estimated_value)],
              ['State', selectedItem?.state || '—'],
              ['Contact', selectedItem?.contact_number || '—'],
              ['Email', selectedItem?.contact_email || '—'],
            ].map(([l, v]) => (
              <div key={l} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">{l}</p>
                <p className="text-sm font-bold text-slate-900 truncate">{v}</p>
              </div>
            ))}
          </div>
          {selectedItem?.requirement && (
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1">Client Requirement</p>
              <p className="text-xs text-slate-600 leading-relaxed">{selectedItem.requirement}</p>
            </div>
          )}

          {/* Documents (attached files from the lead's Documents tab) */}
          <div>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-1.5">Documents</p>
            {docsLoading ? (
              <p className="text-xs text-slate-400">Loading documents…</p>
            ) : docs.filter(d => d.file_key && d.url).length === 0 ? (
              <p className="text-xs text-slate-400 italic">No files attached yet. Manage them from the lead's Documents tab.</p>
            ) : (
              <div className="space-y-1.5">
                {docs.filter(d => d.file_key && d.url).map((d) => (
                  <a key={d.id} href={d.url} target="_blank" rel="noreferrer"
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors group/doc">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-base text-primary shrink-0">description</span>
                      <span className="text-xs font-semibold text-slate-700 truncate">{d.name}</span>
                    </span>
                    <span className="material-symbols-outlined text-sm text-slate-400 group-hover/doc:text-primary shrink-0">download</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button className="flex-1" onClick={() => { if (selectedItem?.id) navigate(`/pipeline/${selectedItem.id}/edit`); }}>Edit Lead</Button>
            <Button variant="secondary" className="flex-1" onClick={() => setIsEditModalOpen(false)}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* Stage advance modal */}
      <Modal isOpen={!!advanceTarget} onClose={() => { if (!advancing) resetAdvanceState(); }}
             title={advanceTargetNext ? `Move to ${STAGE_META[advanceTargetNext].label}` : 'Advance Stage'}>
        {advanceTarget && advanceTargetNext && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Move <span className="font-bold text-slate-900">{advanceTarget.name}</span> to
              <span className="font-bold text-slate-900"> {STAGE_META[advanceTargetNext].label}</span>?
              No document is required — you can attach documents anytime from the lead's Documents tab.
            </p>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" icon="arrow_forward" onClick={submitAdvance} disabled={advancing}>
                {advancing ? 'Saving…' : `Move to ${STAGE_META[advanceTargetNext].label}`}
              </Button>
              <Button className="flex-1" variant="secondary" onClick={resetAdvanceState} disabled={advancing}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Convert modal */}
      <Modal isOpen={!!convertTarget} onClose={() => setConvertTarget(null)} title="Convert to Project">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Convert <span className="font-bold text-slate-900">{convertTarget?.name}</span> into a project?
            A new project is created in the <span className="font-bold">Initiate</span> stage and flagged for attention until
            core details and resource allocation are completed.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setConvertTarget(null)}>Cancel</Button>
            <Button disabled={convertingId === convertTarget?.id} icon="rocket_launch"
              onClick={async () => {
                const item = convertTarget;
                setConvertingId(item.id);
                setConvertTarget(null);
                try {
                  const res = await axiosInstance.post(ENDPOINTS.PIPELINE.CONVERT(item.id));
                  showToast('Lead converted to project.');
                  navigate(`/projects/${res.data.data.id}`);
                } catch (err) {
                  showToast(err.userMessage, 'error');
                  setConvertingId(null);
                }
              }}>
              {convertingId === convertTarget?.id ? 'Converting…' : 'Confirm Convert'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel modal */}
      <Modal isOpen={!!cancelTarget} onClose={() => { if (!cancelling) { setCancelTarget(null); setCancelReason(''); } }} title="Cancel Lead">
        <div className="space-y-4">
          <div className="flex gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
            <span className="material-symbols-outlined text-red-400 text-xl shrink-0 mt-0.5">warning</span>
            <p className="text-xs text-red-600 leading-relaxed">
              Cancelling moves <span className="font-bold">{cancelTarget?.name}</span> out of the funnel and archives it. This cannot be undone.
            </p>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Cancellation Reason <span className="text-red-500">*</span></label>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3}
              placeholder="Why is this lead being cancelled?"
              className="w-full bg-surface border border-slate-200 rounded-lg p-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setCancelTarget(null); setCancelReason(''); }} disabled={cancelling}>Keep</Button>
            <Button variant="danger" onClick={submitCancel} disabled={cancelling || !cancelReason.trim()}>
              {cancelling ? 'Cancelling…' : 'Confirm Cancellation'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* History modal — cancelled & converted leads */}
      <Modal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} title="Pipeline History">
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-300">
              <span className="material-symbols-outlined text-4xl">history</span>
              <p className="text-sm font-medium text-slate-400">No cancelled or converted leads yet</p>
            </div>
          ) : history.map((h) => {
            const converted = h.outcome === 'converted';
            return (
              <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${converted ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-500'}`}>
                  <span className="material-symbols-outlined text-base">{converted ? 'rocket_launch' : 'cancel'}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">{h.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {(h.project_type || '—').replace(/_/g, ' ')}{h.client_name ? ` · ${h.client_name}` : ''} · {h.outcome_at ? formatDateOnly(h.outcome_at) : '—'}
                  </p>
                  {!converted && h.cancel_reason && (
                    <p className="text-[11px] text-red-500 truncate">Reason: {h.cancel_reason}</p>
                  )}
                  {converted && h.converted_project_name && (
                    <p className="text-[11px] text-emerald-600 truncate">→ {h.converted_project_name}</p>
                  )}
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${converted ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                  {converted ? 'Converted' : 'Cancelled'}
                </span>
                {converted && h.converted_project_id && (
                  <button onClick={() => { setHistoryOpen(false); navigate(`/projects/${h.converted_project_id}`); }}
                    title="Open project"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-surface transition-colors shrink-0">
                    <span className="material-symbols-outlined text-base">open_in_new</span>
                  </button>
                )}
                {isAdmin && (
                  <button onClick={() => handleDeleteHistory(h)}
                    title="Delete permanently"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
};

export default PipelineBoard;
