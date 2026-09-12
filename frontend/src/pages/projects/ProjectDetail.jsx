import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axios';
import { ENDPOINTS } from '../../api/endpoints';
import { useSetBreadcrumb } from '../../context/BreadcrumbContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Table } from '../../components/ui/Table';
import { DetailSkeleton, SectionSkeleton } from '../../components/ui/Skeletons';
import useAuth from '../../hooks/useAuth';
import { ROLES, DOCUMENT_CATEGORIES, isRestrictedDocCategory } from '../../utils/constants';
import { useProjectTypes } from '../../hooks/useProjectTypes';
import { formatDate } from '../../utils/helpers';
import { MapContainer, TileLayer, GeoJSON, LayersControl, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Fix Leaflet default marker icon broken by Vite asset hashing
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Distinct colors for multi-KML layers (cycled by index)
const KML_LAYER_COLORS = ['#F97316','#3B82F6','#10B981','#8B5CF6','#EF4444','#F59E0B','#06B6D4','#EC4899','#84CC16','#A855F7'];

// KML layer visibility is remembered per project so a reload keeps what the user
// chose to hide. We store the HIDDEN ids rather than the visible ones, so a KML
// added later shows up by default instead of silently staying off the map.
const kmlHiddenKey = (projectId) => `niyamak.kmlHidden.${projectId}`;

const readHiddenKmlIds = (projectId) => {
  try {
    const raw = JSON.parse(localStorage.getItem(kmlHiddenKey(projectId)) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch { return new Set(); }
};

// Project type → emoji + accent colour (used for map markers in Map tab + Overview)
const TYPE_META = {
  solar_pv:   { emoji: '☀️',  color: '#F59E0B', label: 'Solar PV'   },
  wind:        { emoji: '🌬️', color: '#3B82F6', label: 'Wind'        },
  td_lines:    { emoji: '⚡',  color: '#8B5CF6', label: 'T&D Lines'  },
  tower:       { emoji: '📡',  color: '#10B981', label: 'Tower'       },
  pipeline:    { emoji: '🛢️', color: '#6366F1', label: 'Pipeline'    },
  volumetric:  { emoji: '📐',  color: '#F97316', label: 'Volumetric' },
  other:       { emoji: '📍',  color: '#94A3B8', label: 'Other'       },
};
// Compact ₹ formatter (Cr / Lakh / raw) for the project value field
const fmtMoney = (v) => {
  const n = Number(v || 0);
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
};

const makeTypeIcon = (type, size = 36) => {
  const { emoji = '📍', color = '#6366F1' } = TYPE_META[type] || TYPE_META.other;
  const tail = Math.round(size * 0.32);
  return L.divIcon({
    html: `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.2));">
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:white;border:2.5px solid ${color};
        display:flex;align-items:center;justify-content:center;
        font-size:${Math.round(size*0.5)}px;line-height:1;
      ">${emoji}</div>
      <div style="
        width:0;height:0;
        border-left:${Math.round(tail*0.65)}px solid transparent;
        border-right:${Math.round(tail*0.65)}px solid transparent;
        border-top:${tail}px solid ${color};margin-top:-1px;
      "></div>
    </div>`,
    className: '',
    iconSize:   [size, size + tail],
    iconAnchor: [size / 2, size + tail],
    popupAnchor:[0, -(size + tail + 4)],
  });
};
import { downloadFile } from '../../utils/download';
import { useSocket } from '../../context/SocketContext';
import { ChunkedUploader } from '../../components/upload/ChunkedUploader';

// Flies to new center when KML data changes (Leaflet map doesn't re-center on prop change)
const MapRecenter = ({ lat, lng, zoom }) => {
  const map = useMap();
  React.useEffect(() => {
    if (lat && lng) map.flyTo([lat, lng], zoom || 13, { duration: 1.2 });
  }, [lat, lng, zoom, map]);
  return null;
};

// ─── Status badge config ─────────────────────────────────────
const STATUS_STYLES = {
  initiate:        'bg-slate-100 text-slate-600 border border-slate-300',
  planned:         'bg-blue-50 text-blue-700 border border-blue-200',
  on_going:        'bg-amber-50 text-amber-700 border border-amber-200',
  executed:        'bg-violet-50 text-violet-700 border border-violet-200',
  post_processing: 'bg-orange-50 text-orange-700 border border-orange-200',
  complete:        'bg-emerald-50 text-emerald-700 border border-emerald-200',
  cancelled:       'bg-red-50 text-red-700 border border-red-200',
};
const STATUS_LABEL = {
  initiate: 'Initiate', planned: 'Planned', on_going: 'On Going',
  executed: 'Executed', post_processing: 'Post Processing', complete: 'Complete', cancelled: 'Cancelled',
};
// Strictly-forward lifecycle for the non-gated steps (post_processing → complete is gated via completeProject)
const NEXT_STATUS = { initiate: 'planned', planned: 'on_going', on_going: 'executed', executed: 'post_processing' };
const StatusBadge = ({ status }) => (
  <span className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-widest ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600'}`}>
    {STATUS_LABEL[status] || status?.replace('_',' ') || 'Unknown'}
  </span>
);

// ─── TABS config ─────────────────────────────────────────────
const TABS = [
  { key: 'overview',    label: 'Overview',    icon: 'info' },
  { key: 'scope',       label: 'Scope',       icon: 'rule' },
  { key: 'resources',   label: 'Resources',   icon: 'precision_manufacturing' },
  { key: 'documents',   label: 'Documents',   icon: 'description' },
  { key: 'deliverables',label: 'Deliverables',icon: 'package_2' },
  { key: 'estimations', label: 'Estimations', icon: 'calculate' },
  { key: 'invoices',    label: 'Invoices',    icon: 'receipt_long' },
  { key: 'map',         label: 'Map',         icon: 'map' },
  { key: 'members',     label: 'Members',     icon: 'group' },
  { key: 'expenses',    label: 'Expenses',    icon: 'payments' },
];

import { useToast } from '../../context/ToastContext';
import { useDialog } from '../../context/DialogContext';
import InvoicesTab from './tabs/InvoicesTab';
import ExpensesTab from './tabs/ExpensesTab';

// ─── MAIN COMPONENT ──────────────────────────────────────────
const ProjectDetail = () => {
  const { showToast } = useToast();
const { confirmDialog } = useDialog();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();
  const projectTypes = useProjectTypes();
  const isAdmin = user?.role === ROLES.ADMIN;
  const isPM    = user?.role === ROLES.PROJECT_MANAGER;

  const [project,      setProject]      = useState(null);
  useSetBreadcrumb(project?.name);
  const [activeTab,    setActiveTab]     = useState('overview');
  const [loading,      setLoading]       = useState(true);

  // A Project Manager may only manage (edit/status/archive/approve) projects they
  // are a member of (TC-ROLE-02). Non-member PMs get read-only access. Admin always manages.
  const isMember = project?.is_member === true;
  const canEdit  = isAdmin || (isPM && isMember);
  const isArchived = Boolean(project?.archived_at || ['complete', 'cancelled'].includes(project?.status));
  // Any project member (incl. pilots) may contribute deliverables (TC-ROLE-06).
  const canContribute = isAdmin || isMember;

  // Tab-specific state with local caching
  const [scope,        setScope]         = useState(null);
  const [allocations,  setAllocations]   = useState(null);
  const [documents,    setDocuments]     = useState(null);
  const [deliverables, setDeliverables]  = useState(null);
  const [expandedFolders, setExpandedFolders] = useState([]); // deliverable folder ids that are expanded
  const [estimations,  setEstimations]   = useState(null);
  const [members,      setMembers]       = useState(null);
  const [mapData,      setMapData]       = useState(null);
  const [expenses,     setExpenses]      = useState(null);

  // Modals
  const [allocModal,  setAllocModal]  = useState(false);
  const [memberModal, setMemberModal] = useState(false);
  const [scopeModal,  setScopeModal]  = useState(false);
  const [pilots,      setPilots]      = useState([]);
  const [drones,      setDrones]      = useState([]);
  const [users,       setUsers]       = useState([]);

  // Team pilot add modal
  const [teamPilotModal,  setTeamPilotModal]  = useState(false);
  const [teamPilotUserId, setTeamPilotUserId] = useState('');
  const [teamPilotSaving, setTeamPilotSaving] = useState(false);
  const [allPilotUsers,   setAllPilotUsers]   = useState([]);

  // Team drone add modal
  const [teamDroneModal,  setTeamDroneModal]  = useState(false);
  const [teamDroneId,     setTeamDroneId]     = useState('');
  const [teamDroneSaving, setTeamDroneSaving] = useState(false);

  // Scope form state
  const [scopeForm, setScopeForm] = useState({
    scope_type: '', area_hectares: '', length_km: '',
    asset_count: '', special_instructions: ''
  });

  // Quick-add deliverables (scope tab)
  const EMPTY_ROW = () => ({ _id: Math.random().toString(36).slice(2), name: '', format: 'orthophoto' });
  const [quickRows,      setQuickRows]      = useState([EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()]);
  const [quickLoading,   setQuickLoading]   = useState(false);
  const [scopeDeliverables, setScopeDeliverables] = useState(null);
  const scopeFileRefs = useRef({});

  const loadScopeDeliverables = useCallback(async () => {
    try {
      const r = await axiosInstance.get(ENDPOINTS.PROJECTS.DELIVERABLES(id));
      setScopeDeliverables(r.data.data || []);
    } catch { setScopeDeliverables([]); }
  }, [id]);

  const handleQuickAddDeliverables = async () => {
    const rows = quickRows.filter(r => r.name.trim());
    if (!rows.length) { showToast('Enter at least one deliverable name', 'error'); return; }
    setQuickLoading(true);
    try {
      await Promise.all(rows.map(r =>
        axiosInstance.post(ENDPOINTS.PROJECTS.DELIVERABLES(id), { name: r.name.trim(), format: r.format })
      ));
      showToast(`${rows.length} deliverable${rows.length > 1 ? 's' : ''} created`);
      setQuickRows([EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW(), EMPTY_ROW()]);
      await loadScopeDeliverables();
    } catch (err) { showToast(err?.response?.data?.message || 'Failed to create deliverables', 'error'); }
    finally { setQuickLoading(false); }
  };

  const handleQuickFileUpload = async (deliverableId, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name', file.name.replace(/\.[^.]+$/, ''));
    try {
      await axiosInstance.put(ENDPOINTS.PROJECTS.DELIVERABLE(id, deliverableId), fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      showToast('File attached');
      await loadScopeDeliverables();
    } catch (err) { showToast(err?.response?.data?.message || 'Upload failed', 'error'); }
  };

  const handleQuickDeleteDeliverable = async (deliverableId) => {
    try {
      await axiosInstance.delete(ENDPOINTS.PROJECTS.DELIVERABLE(id, deliverableId));
      setScopeDeliverables(prev => prev.filter(d => d.id !== deliverableId));
    } catch (err) { showToast(err?.response?.data?.message || 'Delete failed', 'error'); }
  };

  // ── Scope submit (create or update) ───────────────────────
  const handleScopeSubmit = async () => {
    try {
      const method = scope ? 'put' : 'post';
      await axiosInstance[method](ENDPOINTS.PROJECTS.SCOPE(id), scopeForm);
      const res = await axiosInstance.get(ENDPOINTS.PROJECTS.SCOPE(id));
      setScope(res.data.data);
      setScopeModal(false);
      showToast(scope ? 'Scope updated' : 'Scope created');
    } catch (err) { showToast(err.userMessage, 'error'); }
  };

  // ── Fetch project ──────────────────────────────────────────
  const fetchProject = useCallback(async () => {
    try {
      const res = await axiosInstance.get(ENDPOINTS.PROJECTS.GET_BY_ID(id));
      setProject(res.data.data);
    } catch { navigate('/projects'); }
    finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { fetchProject(); }, [fetchProject]);

  // ── Join project room + socket listeners ───────────────────
  useEffect(() => {
    if (!socket || !id) return;

    socket.emit('join:project', id);

    // Project header refreshes
    const onProjectUpdate = (data) => {
      if (data?.id === id) setProject(p => ({ ...p, ...data }));
    };
    const onProjectDeleted = (data) => {
      if (data?.id === id) navigate('/projects');
    };

    // Invalidate tab caches so they reload on next visit
    const onScopeUpdate   = () => setScope(null);
    // Filter allocation events to only react when they concern this project
    const onAllocChange   = (data) => { if (!data?.project_id || data.project_id === id) setAllocations(null); };
    const onDocChange     = () => setDocuments(null);
    const onDelivChange   = () => setDeliverables(null);
    const onMemberChange  = () => setMembers(null);

    socket.on('project:updated',        onProjectUpdate);
    socket.on('project:status_changed', onProjectUpdate);
    socket.on('project:deleted',        onProjectDeleted);
    socket.on('project:scope_updated',  onScopeUpdate);
    socket.on('allocation:created',     onAllocChange);
    socket.on('allocation:updated',     onAllocChange);
    socket.on('allocation:deleted',     onAllocChange);
    socket.on('document:uploaded',      onDocChange);
    // Category edits change who may see a document (Commercial Documents are
    // hidden from pilots), so an open tab must drop its cached list.
    socket.on('document:updated',       onDocChange);
    socket.on('document:deleted',       onDocChange);
    socket.on('deliverable:created',    onDelivChange);
    socket.on('deliverable:updated',    onDelivChange);
    socket.on('deliverable:deleted',    onDelivChange);
    socket.on('deliverable:approved',   onDelivChange);
    socket.on('project:member_added',   onMemberChange);
    socket.on('project:member_removed', onMemberChange);

    // Bundle ready — show download button
    const onBundleReady = (data) => {
      if (data?.projectId !== id) return;
      setBundleState('ready');
      setBundleUrl(data.url);
      showToast(`ZIP ready — ${data.fileCount} files bundled`);
    };
    const onBundleFailed = (data) => {
      if (data?.projectId !== id) return;
      setBundleState('unavailable');
      showToast(data.reason || 'ZIP bundling failed', 'error');
    };
    // Map KML processed — refresh history so new layer appears with all others
    const onKmlProcessed = (data) => {
      if (data?.projectId !== id) return;
      setKmlVersion(v => v + 1);
      fetchKmlHistory();
      showToast(`KML processed — ${data.featureCount} feature(s) mapped`);
    };

    socket.on('bundle:ready',      onBundleReady);
    socket.on('bundle:failed',     onBundleFailed);
    socket.on('map:kml_processed', onKmlProcessed);

    return () => {
      socket.emit('leave:project', id);
      socket.off('project:updated',        onProjectUpdate);
      socket.off('project:status_changed', onProjectUpdate);
      socket.off('project:deleted',        onProjectDeleted);
      socket.off('project:scope_updated',  onScopeUpdate);
      socket.off('allocation:created',     onAllocChange);
      socket.off('allocation:updated',     onAllocChange);
      socket.off('allocation:deleted',     onAllocChange);
      socket.off('document:uploaded',      onDocChange);
      socket.off('document:updated',       onDocChange);
      socket.off('document:deleted',       onDocChange);
      socket.off('deliverable:created',    onDelivChange);
      socket.off('deliverable:updated',    onDelivChange);
      socket.off('deliverable:deleted',    onDelivChange);
      socket.off('deliverable:approved',   onDelivChange);
      socket.off('project:member_added',   onMemberChange);
      socket.off('project:member_removed', onMemberChange);
      socket.off('bundle:ready',           onBundleReady);
      socket.off('bundle:failed',          onBundleFailed);
      socket.off('map:kml_processed',      onKmlProcessed);
    };
  }, [socket, id, navigate]);

  // ── Tab data loaders with local caching ────────────────────
  useEffect(() => {
    if (!project) return;
    
    // Only load if not yet fetched
    const shouldLoad = (tab) => {
      if (tab === 'overview') return false;
      if (tab === 'scope') return scope === null;
      if (tab === 'resources') return allocations === null;
      if (tab === 'documents') return documents === null;
      if (tab === 'deliverables') return deliverables === null;
      if (tab === 'estimations') return estimations === null;
      if (tab === 'map') return mapData === null;
      if (tab === 'members') return members === null;
      if (tab === 'expenses') return expenses === null;
      return false;
    };

    if (!shouldLoad(activeTab)) return;

    // skipLoader: each tab has its own inline spinner, and these reload on socket
    // / upload-completion events — the global brand spinner would flash constantly.
    const SL = { skipLoader: true };
    const loaders = {
      scope:        () => axiosInstance.get(ENDPOINTS.PROJECTS.SCOPE(id), SL).then(r => setScope(r.data.data || false)),
      resources:    () => axiosInstance.get(ENDPOINTS.PROJECTS.RESOURCES(id), SL).then(r => setAllocations(r.data.data || [])),
      documents:    () => axiosInstance.get(ENDPOINTS.PROJECTS.DOCUMENTS(id), SL).then(r => setDocuments(r.data.data || [])),
      deliverables: () => axiosInstance.get(ENDPOINTS.PROJECTS.DELIVERABLES(id), SL).then(r => setDeliverables(r.data.data || [])),
      estimations:  () => axiosInstance.get(ENDPOINTS.ESTIMATIONS.GET_ALL, { params: { project_id: id }, ...SL }).then(r => setEstimations(r.data.data || [])),
      map:          () => axiosInstance.get(ENDPOINTS.PROJECTS.MAP(id), SL).then(r => {
        const d = r.data.data || {};
        setKmlDocuments(Array.isArray(d.kml_documents) ? d.kml_documents : []);
        const { kml_documents: _, ...mapOnly } = d;
        setMapData(Object.keys(mapOnly).length ? mapOnly : null);
        fetchKmlHistory();
      }),
      members:      () => axiosInstance.get(ENDPOINTS.PROJECTS.MEMBERS(id), SL).then(r => setMembers(r.data.data || [])),
      expenses:     () => axiosInstance.get(ENDPOINTS.PROJECTS.EXPENSES(id), SL).then(r => setExpenses(r.data.data || { expenses: [], total: 0, byCategory: {}, dailyChart: [] })),
    };

    if (loaders[activeTab]) {
      loaders[activeTab]().catch(err => {
        showToast(err?.response?.data?.message || `Failed to load ${activeTab}`, 'error');
        if (activeTab === 'map') setMapData({});
        if (activeTab === 'scope') setScope(false);
        if (activeTab === 'estimations') setEstimations([]);
      });
    }
    // Always load scope deliverables when scope tab is shown
    if (activeTab === 'scope') loadScopeDeliverables();
    // Pre-fetch members when on expenses tab (needed for the member dropdown)
    if (activeTab === 'expenses' && members === null) {
      axiosInstance.get(ENDPOINTS.PROJECTS.MEMBERS(id), SL).then(r => setMembers(r.data.data || [])).catch(() => {});
    }

  }, [activeTab, project, id, scope, allocations, documents, deliverables, estimations, mapData, members, expenses]);


  // ── Status update ──────────────────────────────────────────
  const handleStatusChange = async (newStatus) => {
    try {
      await axiosInstance.put(ENDPOINTS.PROJECTS.UPDATE(id), { status: newStatus });
      setProject(p => ({ ...p, status: newStatus }));
      showToast(`Project advanced to "${STATUS_LABEL[newStatus] || newStatus}"`);
    } catch (err) { showToast(err.userMessage, 'error'); }
  };

  // ── Complete (an invoice must be on file — uploaded now or already recorded) ──
  const [completeModal, setCompleteModal] = useState(false);
  const [invoiceFile,   setInvoiceFile]   = useState(null);
  const [completing,    setCompleting]    = useState(false);
  // null = still checking; a number = how many invoices already exist on this project.
  const [existingInvoiceCount, setExistingInvoiceCount] = useState(null);

  // When the modal opens, find out whether an invoice is already on file so we don't
  // force a re-upload of a document the project already has.
  useEffect(() => {
    if (!completeModal) return;
    let cancelled = false;
    setExistingInvoiceCount(null);
    axiosInstance.get(ENDPOINTS.PROJECTS.INVOICES(id))
      .then(r => { if (!cancelled) setExistingInvoiceCount((r.data?.data || []).length); })
      .catch(() => { if (!cancelled) setExistingInvoiceCount(0); });
    return () => { cancelled = true; };
  }, [completeModal, id]);

  const handleComplete = async () => {
    // A new file is only mandatory when the project has none on record.
    if (!invoiceFile && !existingInvoiceCount) {
      showToast('Please attach the invoice file', 'error');
      return;
    }
    setCompleting(true);
    try {
      const fd = new FormData();
      if (invoiceFile) fd.append('invoice', invoiceFile);
      const res = await axiosInstance.put(ENDPOINTS.PROJECTS.COMPLETE(id), fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setProject(p => ({ ...p, ...res.data.data }));
      setCompleteModal(false); setInvoiceFile(null);
      showToast('Project marked complete — invoice saved');
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally { setCompleting(false); }
  };

  // ── Cancel (reason required → archives) ────────────────────
  const [cancelModal,  setCancelModal]  = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling,   setCancelling]   = useState(false);

  const handleCancel = async () => {
    if (!cancelReason.trim()) { showToast('A cancellation reason is required', 'error'); return; }
    setCancelling(true);
    try {
      await axiosInstance.put(ENDPOINTS.PROJECTS.CANCEL(id), { reason: cancelReason.trim() });
      showToast('Project cancelled and archived');
      navigate('/projects');
    } catch (err) {
      showToast(err.userMessage, 'error');
      setCancelling(false);
    }
  };

  // ── Archive (non-destructive — moves out of the active list, keeps status) ──
  const [archiving, setArchiving] = useState(false);
  const handleArchive = async () => {
    if (!(await confirmDialog({ message: `Archive "${project.name}"? It moves to the Archive and out of the active projects list. You can restore it anytime.`, danger: true }))) return;
    setArchiving(true);
    try {
      await axiosInstance.put(ENDPOINTS.PROJECTS.ARCHIVE(id));
      showToast('Project archived');
      navigate('/projects');
    } catch (err) {
      showToast(err.userMessage, 'error');
      setArchiving(false);
    }
  };

  const handleUnarchive = async () => {
    if (!(await confirmDialog({ message: `Restore "${project.name}" from the archive? It will reappear in the active projects list.` }))) return;
    setArchiving(true);
    try {
      await axiosInstance.put(ENDPOINTS.PROJECTS.RESTORE(id));
      showToast('Project restored from archive', 'success');
      navigate('/projects');
    } catch (err) {
      showToast(err.userMessage || 'Failed to restore', 'error');
      setArchiving(false);
    }
  };

  // ── Bundle / ZIP state ─────────────────────────────────────
  const [bundleState,   setBundleState]   = useState(null);
  const [bundleUrl,     setBundleUrl]     = useState(null);
  const [kmlUploading,    setKmlUploading]    = useState(false);
  const [kmlHistory,      setKmlHistory]      = useState([]);
  const [visibleKmlIds,   setVisibleKmlIds]   = useState(new Set()); // all visible by default
  const [kmlDocuments,    setKmlDocuments]    = useState([]);   // KML/KMZ files in project_documents
  const [importingDocId,  setImportingDocId]  = useState(null); // doc id currently being imported
  const [kmlVersion,      setKmlVersion]      = useState(0);    // bumped on every KML change to force GeoJSON re-render

  // ── Reject modal state ─────────────────────────────────────
  const [rejectModal,   setRejectModal]   = useState(false);
  const [rejectTarget,  setRejectTarget]  = useState(null);
  const [rejectReason,  setRejectReason]  = useState('');
  const [rejectError,   setRejectError]   = useState('');

  // ── Document CRUD modal state ───────────────────────────────
  const [editDocModal,  setEditDocModal]  = useState(false);
  const [editDocTarget, setEditDocTarget] = useState(null);
  const [editDocForm,   setEditDocForm]   = useState({ file_name: '', category: '' });
  const [editDocSaving, setEditDocSaving] = useState(false);

  // ── Deliverable rename modal state ──────────────────────────
  const [renameDelModal,  setRenameDelModal]  = useState(false);
  const [renameDelTarget, setRenameDelTarget] = useState(null);
  const [renameDelName,   setRenameDelName]   = useState('');
  const [renameDelSaving, setRenameDelSaving] = useState(false);

  // Resubmit deliverable (PRD §4.4)
  const [resubmitting, setResubmitting] = useState(null); // deliverable id being resubmitted

  const handleResubmit = async (delId, file = null, isPending = false) => {
    setResubmitting(delId);
    try {
      const form = new FormData();
      if (file) form.append('file', file);
      await axiosInstance.put(ENDPOINTS.PROJECTS.DEL_RESUBMIT(id, delId), form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDeliverables(ds => (ds || []).map(d => d.id === delId
        ? { ...d, status: file ? 'approved' : 'pending', rejected_reason: null }
        : d
      ));
      showToast(isPending ? 'File attached' : 'Deliverable updated');
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setResubmitting(null);
    }
  };

  // ── Document upload category ───────────────────────────────
  const [uploadCategory, setUploadCategory] = useState('Miscellaneous');

  const handleApprove = async (delId) => {
    try {
      await axiosInstance.put(ENDPOINTS.PROJECTS.DEL_APPROVE(id, delId));
      setDeliverables(ds => (ds || []).map(d => d.id === delId ? { ...d, status: 'approved' } : d));
      showToast('Deliverable approved');
    } catch (err) { showToast(err.userMessage, 'error'); }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      setRejectError('Rejection reason is required');
      return;
    }
    setRejectError('');
    try {
      await axiosInstance.put(ENDPOINTS.PROJECTS.DEL_REJECT(id, rejectTarget), { reason: rejectReason.trim() });
      setDeliverables(ds => (ds || []).map(d =>
        d.id === rejectTarget ? { ...d, status: 'rejected', rejected_reason: rejectReason.trim() } : d
      ));
      showToast('Deliverable rejected');
      setRejectModal(false); setRejectReason(''); setRejectTarget(null); setRejectError('');
    } catch (err) { showToast(err.userMessage, 'error'); }
  };

  const handleBundleDeliverables = async () => {
    if (!deliverables || deliverables.length === 0) return;
    try {
      setBundleState('queued'); setBundleUrl(null);
      const res = await axiosInstance.get(ENDPOINTS.PROJECTS.DEL_DOWNLOAD_ALL(id), { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${id.slice(0, 8)}_deliverables.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBundleState(null);
    } catch (e) {
      setBundleState(null);
      showToast(e.response?.data?.message || 'Error downloading ZIP', 'error');
    }
  };

  // ── Document CRUD ─────────────────────────────────────────
  const handleDeleteDocument = async (docId, fileName) => {
    if (!(await confirmDialog({ message: `Delete "${fileName}"? This cannot be undone.`, danger: true }))) return;
    try {
      await axiosInstance.delete(ENDPOINTS.PROJECTS.DOCUMENT(id, docId));
      setDocuments(prev => (prev || []).filter(d => d.id !== docId));
      showToast('Document deleted');
    } catch (err) { showToast(err?.response?.data?.message || 'Delete failed', 'error'); }
  };

  const handleEditDocOpen = (doc) => {
    setEditDocTarget(doc);
    setEditDocForm({ file_name: doc.file_name || '', category: doc.category || 'Miscellaneous' });
    setEditDocModal(true);
  };

  const handleEditDocSave = async () => {
    if (!editDocTarget) return;
    setEditDocSaving(true);
    try {
      await axiosInstance.put(ENDPOINTS.PROJECTS.DOCUMENT(id, editDocTarget.id), editDocForm);
      setDocuments(prev => (prev || []).map(d =>
        d.id === editDocTarget.id ? { ...d, ...editDocForm } : d
      ));
      setEditDocModal(false);
      showToast('Document updated');
    } catch (err) { showToast(err?.response?.data?.message || 'Update failed', 'error'); }
    finally { setEditDocSaving(false); }
  };

  // ── Deliverable CRUD ───────────────────────────────────────
  const handleDeleteDeliverable = async (delId, name) => {
    if (!(await confirmDialog({ message: `Delete "${name}"? This cannot be undone.`, danger: true }))) return;
    try {
      await axiosInstance.delete(ENDPOINTS.PROJECTS.DELIVERABLE(id, delId));
      setDeliverables(prev => (prev || []).filter(d => d.id !== delId));
      showToast('Deliverable deleted');
    } catch (err) { showToast(err?.response?.data?.message || 'Delete failed', 'error'); }
  };

  const handleRenameDelOpen = (del) => {
    setRenameDelTarget(del);
    setRenameDelName(del.name || '');
    setRenameDelModal(true);
  };

  const handleRenameDelSave = async () => {
    if (!renameDelTarget || !renameDelName.trim()) return;
    setRenameDelSaving(true);
    try {
      await axiosInstance.put(ENDPOINTS.PROJECTS.DELIVERABLE(id, renameDelTarget.id), { name: renameDelName.trim() });
      setDeliverables(prev => (prev || []).map(d =>
        d.id === renameDelTarget.id ? { ...d, name: renameDelName.trim() } : d
      ));
      setRenameDelModal(false);
      showToast('Deliverable renamed');
    } catch (err) { showToast(err?.response?.data?.message || 'Rename failed', 'error'); }
    finally { setRenameDelSaving(false); }
  };

  // ── KML upload ────────────────────────────────────────────
  const handleKmlUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['kml', 'kmz'].includes(ext)) {
      showToast('Only .kml and .kmz files are supported', 'error');
      return;
    }
    setKmlUploading(true);
    try {
      const form = new FormData();
      form.append('kml', file);
      const res = await axiosInstance.post(ENDPOINTS.PROJECTS.MAP_KML(id), form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Update map immediately from HTTP response (socket event also fires but may race)
      const d = res.data?.data;
      if (d) {
        setKmlVersion(v => v + 1);
        setMapData(prev => ({
          ...(prev || {}),
          geojson_data: d.geojson_data,
          center_lat:   d.center_lat,
          center_lng:   d.center_lng,
          bbox:         d.bbox,
        }));
        showToast(`KML processed — ${d.featureCount || ''} feature(s) mapped`);
      } else {
        showToast('KML uploaded — processing…');
      }
      // Refresh history list and enable all layers
      fetchKmlHistory();
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setKmlUploading(false);
    }
  };

  // Load KML history, restoring the layers this user previously hid
  const fetchKmlHistory = useCallback(() => {
    axiosInstance.get(ENDPOINTS.PROJECTS.MAP_KML_HISTORY(id))
      .then(r => {
        const list = Array.isArray(r.data.data) ? r.data.data : [];
        setKmlHistory(list);
        const hidden = readHiddenKmlIds(id);
        setVisibleKmlIds(new Set(list.filter(k => !hidden.has(k.id)).map(k => k.id)));
      })
      .catch(() => {});
  }, [id]);

  // Persist the choice on every change. Guarded on a non-empty history so the
  // initial empty state can't wipe what was stored before the fetch resolves.
  useEffect(() => {
    if (!kmlHistory.length) return;
    const hidden = kmlHistory.filter(k => !visibleKmlIds.has(k.id)).map(k => k.id);
    try { localStorage.setItem(kmlHiddenKey(id), JSON.stringify(hidden)); } catch { /* storage blocked */ }
  }, [id, kmlHistory, visibleKmlIds]);

  // Load a KML/KMZ from project_documents onto the map
  const handleImportDoc = async (doc) => {
    setImportingDocId(doc.id);
    try {
      const res = await axiosInstance.post(ENDPOINTS.PROJECTS.MAP_IMPORT_DOC(id), { doc_id: doc.id });
      const d = res.data?.data;
      if (d) {
        setKmlVersion(v => v + 1);
        setMapData(prev => ({
          ...(prev || {}),
          geojson_data: d.geojson_data,
          center_lat:   d.center_lat,
          center_lng:   d.center_lng,
          bbox:         d.bbox,
          area_sqm:     d.area_sqm,
          kml_key:      d.kml_key,
          updated_at:   d.updated_at,
        }));
        showToast(`Map loaded — ${d.featureCount || ''} feature(s) from ${doc.file_name}`);
        fetchKmlHistory();
      }
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setImportingDocId(null);
    }
  };

  // ── Allocation & Member logic ─────────────────────────────────────────
  const [allocForm, setAllocForm] = useState({ pilot_id:'', copilot_id:'', drone_id:'', start_date:'', end_date:'', is_primary: true });
  const [pilotAvailability, setPilotAvailability] = useState({ status: null, reason: '' });
  const [copilotAvailability, setCopilotAvailability] = useState({ status: null, reason: '' });
  const [copilots, setCopilots] = useState([]);
  const [allCopilotUsers, setAllCopilotUsers] = useState([]);
  const [teamCopilotModal, setTeamCopilotModal] = useState(false);
  const [teamCopilotUserId, setTeamCopilotUserId] = useState('');
  const [teamCopilotSaving, setTeamCopilotSaving] = useState(false);

  // Conflict-override modal state (PRD §6.7)
  const [conflictModal, setConflictModal] = useState(null);   // { conflicts: [...], message }
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  // Edit allocation modal state
  const [editAllocModal, setEditAllocModal] = useState(false);
  const [editAllocId, setEditAllocId] = useState(null);
  const [editAllocForm, setEditAllocForm] = useState({ pilot_id: '', copilot_id: '', drone_id: '', start_date: '', end_date: '', is_primary: true });
  const [editAllocSaving, setEditAllocSaving] = useState(false);

  const _submitAllocation = async (extra = {}) => {
    const hadCrew = !!(allocForm.pilot_id || allocForm.copilot_id);
    await axiosInstance.post(ENDPOINTS.PROJECTS.RESOURCES(id), { ...allocForm, ...extra });
    const res = await axiosInstance.get(ENDPOINTS.PROJECTS.RESOURCES(id));
    setAllocations(res.data.data || []);
    // Backend auto-adds allocated crew to project_members — refresh Members tab
    if (hadCrew) {
      axiosInstance.get(ENDPOINTS.PROJECTS.MEMBERS(id))
        .then(r => setMembers(r.data.data || []))
        .catch(() => {});
    }
    setAllocModal(false);
    setAllocForm({ pilot_id:'', copilot_id:'', drone_id:'', start_date:'', end_date:'', is_primary: true });
  };

  const handleAddAllocation = async () => {
    if (!allocForm.pilot_id && !allocForm.copilot_id && !allocForm.drone_id) {
      showToast('Select at least a pilot, co-pilot, or drone', 'error'); return;
    }
    if (!allocForm.start_date || !allocForm.end_date) {
      showToast('Start and end dates are required', 'error'); return;
    }
    try {
      await _submitAllocation();
      showToast('Resource allocated');
    } catch (err) {
      const conflicts = err.response?.data?.conflict;
      if (err.response?.status === 409 && Array.isArray(conflicts) && conflicts.length) {
        setOverrideReason('');
        setConflictModal({ conflicts, message: err.response.data.message || 'Resource conflict detected' });
      } else {
        showToast(err.userMessage, 'error');
      }
    }
  };

  const handleOverrideAllocation = async () => {
    if (!overrideReason.trim() || overrideReason.trim().length < 5) {
      showToast('Override reason must be at least 5 characters', 'error');
      return;
    }
    setOverrideSubmitting(true);
    try {
      await _submitAllocation({ force: true, override_reason: overrideReason.trim() });
      setConflictModal(null);
      setOverrideReason('');
      showToast('Allocated with override — conflict logged', 'success');
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleEditAllocation = async () => {
    if (!editAllocForm.pilot_id && !editAllocForm.drone_id) {
      showToast('Select at least a pilot or a drone', 'error'); return;
    }
    if (!editAllocForm.start_date || !editAllocForm.end_date) {
      showToast('Start and end dates are required', 'error'); return;
    }
    if (editAllocSaving) return;
    setEditAllocSaving(true);
    try {
      await axiosInstance.put(ENDPOINTS.PROJECTS.RESOURCE(id, editAllocId), editAllocForm);
      const res = await axiosInstance.get(ENDPOINTS.PROJECTS.RESOURCES(id));
      setAllocations(res.data.data || []);
      setEditAllocModal(false);
      showToast('Allocation updated');
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setEditAllocSaving(false);
    }
  };

  // ── Team pilot handlers ───────────────────────────────────────────────────
  const handleAddTeamPilot = async () => {
    if (!teamPilotUserId) { showToast('Select a pilot', 'error'); return; }
    if (teamPilotSaving) return;
    setTeamPilotSaving(true);
    try {
      await axiosInstance.post(ENDPOINTS.PROJECTS.MEMBERS(id), { user_id: teamPilotUserId, role: 'pilot' });
      const res = await axiosInstance.get(ENDPOINTS.PROJECTS.RESOURCES(id));
      setAllocations(res.data.data || []);
      setTeamPilotModal(false);
      setTeamPilotUserId('');
      showToast('Pilot added to project team');
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setTeamPilotSaving(false);
    }
  };

  const handleRemoveTeamPilot = async (memberUserId, pilotName) => {
    if (!(await confirmDialog({ message: `Remove ${pilotName} from the project team? They will lose access to this project.`, danger: true }))) return;
    try {
      await axiosInstance.delete(ENDPOINTS.PROJECTS.MEMBER(id, memberUserId));
      setAllocations(as => (as || []).filter(a => !(a.is_member_only && a.pilot_member_user_id === memberUserId)));
      showToast('Team pilot removed');
    } catch (err) {
      showToast(err.userMessage, 'error');
    }S
  };

  // ── Team co-pilot handlers ────────────────────────────────────────────────
  const handleAddTeamCopilot = async () => {
    if (!teamCopilotUserId) { showToast('Select a co-pilot', 'error'); return; }
    if (teamCopilotSaving) return;
    setTeamCopilotSaving(true);
    try {
      await axiosInstance.post(ENDPOINTS.PROJECTS.MEMBERS(id), { user_id: teamCopilotUserId, role: 'pilot' });
      const res = await axiosInstance.get(ENDPOINTS.PROJECTS.RESOURCES(id));
      setAllocations(res.data.data || []);
      setTeamCopilotModal(false);
      setTeamCopilotUserId('');
      showToast('Co-Pilot added to project team');
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setTeamCopilotSaving(false);
    }
  };

  const handleRemoveTeamCopilot = async (memberUserId, copilotName) => {
    if (!(await confirmDialog({ message: `Remove ${copilotName} from the project team?`, danger: true }))) return;
    try {
      await axiosInstance.delete(ENDPOINTS.PROJECTS.MEMBER(id, memberUserId));
      setAllocations(as => (as || []).filter(a => !(a.is_member_only && a.pilot_member_user_id === memberUserId)));
      showToast('Team co-pilot removed');
    } catch (err) {
      showToast(err.userMessage, 'error');
    }
  };

  // ── Team drone handlers ───────────────────────────────────────────────────
  const handleAddTeamDrone = async () => {
    if (!teamDroneId) { showToast('Select a drone', 'error'); return; }
    if (teamDroneSaving) return;
    setTeamDroneSaving(true);
    try {
      await axiosInstance.post(ENDPOINTS.PROJECTS.TEAM_DRONES(id), { drone_id: teamDroneId });
      const res = await axiosInstance.get(ENDPOINTS.PROJECTS.RESOURCES(id));
      setAllocations(res.data.data || []);
      setTeamDroneModal(false);
      setTeamDroneId('');
      showToast('Drone added to project team');
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setTeamDroneSaving(false);
    }
  };

  const handleRemoveTeamDrone = async (droneId, droneName) => {
    if (!(await confirmDialog({ message: `Remove ${droneName} from the project team?`, danger: true }))) return;
    try {
      await axiosInstance.delete(ENDPOINTS.PROJECTS.TEAM_DRONE(id, droneId));
      setAllocations(as => (as || []).filter(a => !(a.is_member_only && a.drone_id === droneId && !a.pilot_id)));
      showToast('Team drone removed');
    } catch (err) {
      showToast(err.userMessage, 'error');
    }
  };

  useEffect(() => {
    if (teamPilotModal) {
      axiosInstance.get(ENDPOINTS.RESOURCES.PILOTS, { params: { crew_role: 'pilot' } }).then(r => setAllPilotUsers(r.data.data || []));
    }
  }, [teamPilotModal]);

  useEffect(() => {
    if (teamCopilotModal) {
      axiosInstance.get(ENDPOINTS.RESOURCES.PILOTS, { params: { crew_role: 'co_pilot' } }).then(r => setAllCopilotUsers(r.data.data || []));
    }
  }, [teamCopilotModal]);

  useEffect(() => {
    if (teamDroneModal) {
      axiosInstance.get(ENDPOINTS.RESOURCES.DRONES).then(r => setDrones(r.data.data || []));
    }
  }, [teamDroneModal]);

  // Pilot availability check
  useEffect(() => {
    if (!allocForm.pilot_id || !allocForm.start_date || !allocForm.end_date) {
      setPilotAvailability({ status: null, reason: '' });
      return;
    }
    const check = async () => {
      try {
        const res = await axiosInstance.get(ENDPOINTS.RESOURCES.PILOT_AVAIL(allocForm.pilot_id), {
          params: { start: allocForm.start_date, end: allocForm.end_date }
        });
        const data = res.data.data;
        let avStatus = 'available', avReason = '';
        if (data.license_expired) {
          avStatus = 'blocked';
          avReason = `License expired ${data.license_expiry_date} — allocation will be hard-blocked`;
        } else if (!data.is_available) {
          avStatus = 'conflict';
          avReason = 'Pilot is double-booked or on leave during this period';
        } else if (data.license_expiring_in_window) {
          avStatus = 'expiring';
          avReason = `License expires ${data.license_expiry_date} (during window) — override required`;
        }
        setPilotAvailability({ status: avStatus, reason: avReason });
      } catch (e) { setPilotAvailability({ status: 'error', reason: 'Error checking availability' }); }
    };
    check();
  }, [allocForm.pilot_id, allocForm.start_date, allocForm.end_date]);

  // Co-Pilot availability check
  useEffect(() => {
    if (!allocForm.copilot_id || !allocForm.start_date || !allocForm.end_date) {
      setCopilotAvailability({ status: null, reason: '' });
      return;
    }
    const check = async () => {
      try {
        const res = await axiosInstance.get(ENDPOINTS.RESOURCES.PILOT_AVAIL(allocForm.copilot_id), {
          params: { start: allocForm.start_date, end: allocForm.end_date }
        });
        const data = res.data.data;
        let avStatus = 'available', avReason = '';
        if (data.license_expired) {
          avStatus = 'blocked';
          avReason = `Co-pilot license expired ${data.license_expiry_date} — allocation will be hard-blocked`;
        } else if (!data.is_available) {
          avStatus = 'conflict';
          avReason = 'Co-pilot is double-booked or on leave during this period';
        } else if (data.license_expiring_in_window) {
          avStatus = 'expiring';
          avReason = `Co-pilot license expires ${data.license_expiry_date} (during window) — override required`;
        }
        setCopilotAvailability({ status: avStatus, reason: avReason });
      } catch (e) { setCopilotAvailability({ status: 'error', reason: 'Error checking availability' }); }
    };
    check();
  }, [allocForm.copilot_id, allocForm.start_date, allocForm.end_date]);

  const [memberForm, setMemberForm] = useState({ user_id:'', role:'project_manager' });
  const [addingMember, setAddingMember] = useState(false);

  // Role-edit state
  const [editRoleTarget, setEditRoleTarget] = useState(null); // { user_id, name, role }
  const [editRoleValue,  setEditRoleValue]  = useState('');
  const [editRoleSaving, setEditRoleSaving] = useState(false);

  const handleAddMember = async () => {
    if (!memberForm.user_id) { showToast('Please select a user', 'error'); return; }
    if (addingMember) return;
    setAddingMember(true);
    try {
      await axiosInstance.post(ENDPOINTS.PROJECTS.MEMBERS(id), memberForm);
      const res = await axiosInstance.get(ENDPOINTS.PROJECTS.MEMBERS(id));
      setMembers(res.data.data || []);
      setMemberModal(false);
      setMemberForm({ user_id:'', role:'project_manager' });
      showToast('Member added');
    } catch (err) {
      showToast(err.userMessage, 'error');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId) => {
    if (!(await confirmDialog({ message: 'Remove this member from the project?', danger: true }))) return;
    try {
      await axiosInstance.delete(ENDPOINTS.PROJECTS.MEMBER(id, userId));
      setMembers(members.filter(m => m.user_id !== userId));
      showToast('Member removed');
    } catch (err) {
      showToast(err.userMessage, 'error');
    }
  };

  const handleSaveMemberRole = async () => {
    if (!editRoleTarget || !editRoleValue) return;
    setEditRoleSaving(true);
    try {
      await axiosInstance.put(ENDPOINTS.PROJECTS.MEMBER(id, editRoleTarget.user_id), { role: editRoleValue });
      setMembers(ms => (ms || []).map(m =>
        m.user_id === editRoleTarget.user_id ? { ...m, role: editRoleValue } : m
      ));
      setEditRoleTarget(null);
      showToast('Role updated');
    } catch (err) { showToast(err?.response?.data?.message || 'Update failed', 'error'); }
    finally { setEditRoleSaving(false); }
  };

  useEffect(() => {
    if (allocModal) {
      setAllocForm({ pilot_id: '', drone_id: '', start_date: '', end_date: '', is_primary: true });
      setPilotAvailability({ status: null, reason: '' });
      axiosInstance.get(ENDPOINTS.RESOURCES.PILOTS).then(r => setPilots(r.data.data || []));
      axiosInstance.get(ENDPOINTS.RESOURCES.DRONES).then(r => setDrones(r.data.data || []));
    }
  }, [allocModal]);

  useEffect(() => {
    if (editAllocModal) {
      axiosInstance.get(ENDPOINTS.RESOURCES.PILOTS).then(r => setPilots(r.data.data || []));
      axiosInstance.get(ENDPOINTS.RESOURCES.DRONES).then(r => setDrones(r.data.data || []));
    }
  }, [editAllocModal]);

  useEffect(() => {
    if (memberModal) axiosInstance.get(ENDPOINTS.USERS.GET_ALL).then(r => setUsers(r.data.data || []));
  }, [memberModal]);

  if (loading) return <DetailSkeleton />;
  if (!project) return null;

  const resourceColumns = [
    { header: 'Pilot',      cell: r => r.pilot_name  || '—' },
    { header: 'Drone',      cell: r => r.drone_name  || '—' },
    { header: 'Start Date', cell: r => formatDate(r.start_date) },
    { header: 'End Date',   cell: r => formatDate(r.end_date) },
    { header: 'Actions', cell: r => canEdit ? (
      <Button size="sm" variant="danger" icon="delete"
        onClick={async () => {
          try {
            await axiosInstance.delete(ENDPOINTS.PROJECTS.RESOURCE(id, r.id));
            setAllocations(as => (as || []).filter(a => a.id !== r.id));
            showToast('Allocation removed');
          } catch (err) {
            showToast(err.userMessage, 'error');
          }
        }}
      />
    ) : null }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-400">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-400 -mb-2" aria-label="Breadcrumb">
        <button onClick={() => navigate('/projects')} className="hover:text-primary transition-colors font-medium">Projects</button>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <span className="text-slate-600 font-semibold truncate max-w-[200px]" title={project.name}>{project.name}</span>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <span className="text-slate-500 capitalize">{activeTab.replace('_', ' ')}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="uppercase tracking-[0.2em] text-[11px] text-slate-500 mb-1">{project.client_name}</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-[-0.03em]">{project.name}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <StatusBadge status={project.status} />
            <span className="text-xs text-slate-500 uppercase tracking-wider">{project.project_type}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {canEdit && (
            <>
              {/* Advance to the next non-gated stage */}
              {NEXT_STATUS[project.status] && (
                <Button size="sm" icon="arrow_forward"
                  onClick={() => handleStatusChange(NEXT_STATUS[project.status])}>
                  Move to {STATUS_LABEL[NEXT_STATUS[project.status]]}
                </Button>
              )}
              {/* Post Processing → Complete (invoice required) */}
              {project.status === 'post_processing' && (
                <Button size="sm" icon="task_alt" className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => setCompleteModal(true)}>
                  Mark Complete
                </Button>
              )}
              <Button size="sm" variant="secondary" icon="edit" onClick={() => navigate(`/projects/${id}/edit`)}>Edit</Button>
              {/* Archive / Unarchive toggle based on archived_at or cancelled status */}
              {isArchived ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon="unarchive"
                  onClick={handleUnarchive}
                  disabled={archiving}
                  className="border-teal-300 text-teal-700 hover:bg-teal-50"
                >
                  {archiving ? 'Restoring…' : 'Unarchive'}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon="inventory_2" onClick={handleArchive} disabled={archiving}>
                  {archiving ? 'Archiving…' : 'Archive'}
                </Button>
              )}
              {/* Cancel (reason required → archives) */}
              {!['complete', 'cancelled'].includes(project.status) && (
                <Button size="sm" variant="danger" icon="cancel" onClick={() => setCancelModal(true)}>Cancel</Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Needs-attention banner (converted-from-pipeline projects with missing details) */}
      {project.needs_attention && !['complete','cancelled'].includes(project.status) && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="material-symbols-outlined text-red-500 shrink-0">priority_high</span>
          <div>
            <p className="text-sm font-bold text-red-700">This project needs attention</p>
            <p className="text-xs text-red-600 leading-relaxed">
              Converted from a pipeline opportunity. Please complete the core details (dates, scope, contact) and allocate a pilot &amp; drone via <span className="font-semibold">Edit</span> and the <span className="font-semibold">Resources</span> tab.
            </p>
          </div>
        </div>
      )}

      {/* Cancelled reason banner */}
      {project.status === 'cancelled' && project.cancel_reason && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="material-symbols-outlined text-slate-400 shrink-0">cancel</span>
          <div>
            <p className="text-sm font-bold text-slate-700">Project cancelled</p>
            <p className="text-xs text-slate-500 leading-relaxed">Reason: {project.cancel_reason}</p>
          </div>
        </div>
      )}

      {/* Tab Nav */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto pb-0 sticky top-0 z-20 bg-background/95 backdrop-blur-sm -mx-1 px-1">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2
              ${activeTab === tab.key ? 'border-background text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-900'}
            `}
          >
            <span className="material-symbols-outlined text-sm">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tabs Content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <Card className="p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-5">Project Progression</p>
              {(() => {
                const PROJECT_STAGE_FLOW = [
                  { key: 'initiate',        label: 'Initiate',        icon: 'rocket_launch',   dot: 'bg-blue-500',    ring: 'ring-blue-300',    text: 'text-blue-600',    soft: 'bg-blue-50' },
                  { key: 'planned',         label: 'Planned',         icon: 'event_note',      dot: 'bg-violet-500',  ring: 'ring-violet-300',  text: 'text-violet-600',  soft: 'bg-violet-50' },
                  { key: 'on_going',        label: 'On Going',        icon: 'flight_takeoff',  dot: 'bg-amber-500',   ring: 'ring-amber-300',   text: 'text-amber-600',   soft: 'bg-amber-50' },
                  { key: 'executed',        label: 'Executed',        icon: 'task_alt',        dot: 'bg-indigo-500',  ring: 'ring-indigo-300',  text: 'text-indigo-600',  soft: 'bg-indigo-50' },
                  { key: 'post_processing', label: 'Post Processing', icon: 'auto_fix_high',   dot: 'bg-orange-500',  ring: 'ring-orange-300',  text: 'text-orange-600',  soft: 'bg-orange-50' },
                  { key: 'complete',        label: 'Complete',        icon: 'verified',        dot: 'bg-emerald-500', ring: 'ring-emerald-300', text: 'text-emerald-600', soft: 'bg-emerald-50' },
                ];
                const curIdx = PROJECT_STAGE_FLOW.findIndex(s => s.key === project.status);
                const pct    = curIdx < 0 ? 0 : Math.round((curIdx / (PROJECT_STAGE_FLOW.length - 1)) * 100);
                return (
                  <>
                    {/* Animated progress bar */}
                    <div className="relative h-2 bg-slate-100 rounded-full mb-6 overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-400 via-violet-500 to-emerald-400 transition-all duration-700 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                      {/* Shimmer animation on the filled portion */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-full opacity-40 bg-gradient-to-r from-transparent via-surface to-transparent animate-[shimmer_2s_ease-in-out_infinite]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {/* Stage nodes */}
                    <div className="flex items-start">
                      {PROJECT_STAGE_FLOW.map((s, i) => {
                        const done    = curIdx > i;
                        const active  = curIdx === i;
                        const pending = curIdx < i;
                        return (
                          <div key={s.key} className="flex items-center flex-1">
                            <div className="flex flex-col items-center flex-1">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${
                                done   ? `${s.dot} border-transparent shadow-md` :
                                active ? `bg-surface ring-4 ${s.ring} border-2 border-current ${s.text} shadow-lg` :
                                'bg-slate-50 border-slate-200'
                              } ${active ? 'animate-pulse' : ''}`}>
                                {done ? (
                                  <span className="material-symbols-outlined text-white text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                                ) : (
                                  <span className={`material-symbols-outlined text-base ${active ? s.text : 'text-slate-300'}`} style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>{s.icon}</span>
                                )}
                              </div>
                              <p className={`text-[10px] font-black uppercase tracking-wider mt-2 text-center max-w-[72px] leading-tight transition-colors ${active ? s.text : done ? 'text-slate-600' : 'text-slate-400'}`}>
                                {s.label}
                              </p>
                            </div>
                            {i < PROJECT_STAGE_FLOW.length - 1 && (
                              <div className={`h-0.5 w-full mx-1 rounded-full transition-all duration-500 ${done ? 'bg-slate-400' : 'bg-slate-100'}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </Card>

            {/* Project info card — mini map on left, details on right */}
            <Card className="overflow-hidden p-0">
              <div className={project.latitude && project.longitude
                ? 'grid grid-cols-1 lg:grid-cols-[340px_1fr]'
                : ''}>

                {/* ── Mini map (only when coordinates are set) ── */}
                {project.latitude && project.longitude && (() => {
                  const typeMeta = TYPE_META[project.project_type] || TYPE_META.other;
                  return (
                    <div className="relative h-[260px] lg:h-auto min-h-[260px] border-b lg:border-b-0 lg:border-r border-slate-100">
                      <MapContainer
                        key={`overview-map-${id}`}
                        center={[parseFloat(project.latitude), parseFloat(project.longitude)]}
                        zoom={12}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={false}
                        attributionControl={false}
                        scrollWheelZoom={false}
                        dragging={false}
                      >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
                        {mapData?.geojson_data && (
                          <GeoJSON
                            data={typeof mapData.geojson_data === 'string' ? JSON.parse(mapData.geojson_data) : mapData.geojson_data}
                            style={{ color: '#3B82F6', weight: 2, opacity: 0.8, fillOpacity: 0.15 }}
                          />
                        )}
                        <Marker
                          position={[parseFloat(project.latitude), parseFloat(project.longitude)]}
                          icon={makeTypeIcon(project.project_type, 32)}
                        >
                          <Popup>
                            <div style={{ padding: '8px 10px', minWidth: '140px' }}>
                              <p style={{ fontWeight: 800, fontSize: '13px', margin: '0 0 2px 0' }}>{project.name}</p>
                              {project.location_name && <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>{project.location_name}</p>}
                            </div>
                          </Popup>
                        </Marker>
                      </MapContainer>

                      {/* Project type badge */}
                      <div className="absolute bottom-3 left-3 z-[400] bg-surface/95 backdrop-blur-sm rounded-xl px-3 py-2 border border-slate-200 shadow-sm flex items-center gap-2.5">
                        <span style={{ fontSize: '22px', lineHeight: 1 }}>{typeMeta.emoji}</span>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Project Type</p>
                          <p className="text-xs font-bold" style={{ color: typeMeta.color }}>{typeMeta.label}</p>
                        </div>
                      </div>

                      {/* Location label */}
                      {(project.location_name || project.district || project.state) && (
                        <div className="absolute top-3 left-3 z-[400] bg-surface/95 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-slate-200 shadow-sm flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm" style={{ color: typeMeta.color }}>location_on</span>
                          <p className="text-xs font-bold text-slate-700">{project.location_name || [project.district, project.state].filter(Boolean).join(', ')}</p>
                        </div>
                      )}

                      {/* "View full map" hint */}
                      <button
                        onClick={() => setActiveTab('map')}
                        className="absolute bottom-3 right-3 z-[400] bg-surface/95 backdrop-blur-sm rounded-xl px-3 py-1.5 border border-slate-200 shadow-sm flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-primary hover:border-primary/30 transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">open_in_full</span>
                        Full Map
                      </button>
                    </div>
                  );
                })()}

                {/* ── Project details ── */}
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {[
                      ['Project Name', project.name],
                      ['Client',       project.client_name],
                      ['Type',         (() => { const m = TYPE_META[project.project_type]; return m ? `${m.emoji} ${m.label}` : project.project_type; })()],
                      ['Project Value', project.project_value != null && project.project_value !== '' ? fmtMoney(project.project_value) : null],
                      ['State',        project.state],
                      ['District',     project.district],
                      ['Location / Site', project.location_name],
                      ['Coordinates',  (project.latitude != null && project.longitude != null) ? `${project.latitude}, ${project.longitude}` : null],
                      ['Start Date',   formatDate(project.start_date)],
                      ['End Date',     formatDate(project.end_date)],
                      ['PO Number',    project.po_number],
                      ['Work Order',   project.work_order_number],
                      ['Contact',      project.contact_person],
                      ['Contact No.',  project.contact_number],
                      ['Email',        project.contact_email],
                      ['Drone Flying Zone', project.drone_flying_zone],
                    ].map(([l, v]) => v ? (
                      <div key={l} className="space-y-0.5">
                        <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black">{l}</p>
                        <p className="text-sm text-slate-900 font-semibold">{v}</p>
                      </div>
                    ) : null)}
                  </div>

                  {/* Description — full-width, preserves line breaks */}
                  {project.description && project.description !== 'na' && (
                    <div className="mt-5 pt-4 border-t border-slate-100">
                      <p className="text-[9px] uppercase tracking-widest text-slate-400 font-black mb-1.5">Description</p>
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{project.description}</p>
                    </div>
                  )}

                  {/* Invoice on file (complete projects) */}
                  {project.status === 'complete' && project.invoice_url && (
                    <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-emerald-500">receipt_long</span>
                        <div>
                          <p className="text-sm font-bold text-slate-900">Invoice on file</p>
                          <p className="text-xs text-slate-500">Uploaded {formatDate(project.invoice_uploaded_at)}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="secondary" icon="download" onClick={async () => {
                        try {
                          const res = await axiosInstance.get(ENDPOINTS.PROJECTS.INVOICE_DOWNLOAD(id));
                          if (res.data?.data?.url) window.open(res.data.data.url, '_blank');
                        } catch { showToast('Failed to get invoice link', 'error'); }
                      }}>Download Invoice</Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'scope' && (
          <div className="space-y-6">
          <Card className="p-6">
            {scope === null ? (
              <SectionSkeleton />
            ) : !scope ? (
              <div className="text-center py-12 text-slate-500">
                <p>No scope defined yet.</p>
                {canEdit && <Button className="mt-4" onClick={() => setScopeModal(true)}>Add Scope</Button>}
              </div>
            ) : (
              <div className="space-y-6">
                {canEdit && (
                  <div className="flex justify-end">
                    <Button icon="edit" variant="secondary" onClick={() => {
                      setScopeForm({
                        scope_type:           scope.scope_type           || '',
                        area_hectares:        scope.area_hectares        || '',
                        length_km:            scope.length_km            || '',
                        asset_count:          scope.asset_count          || '',
                        special_instructions: scope.special_instructions || '',
                      });
                      setScopeModal(true);
                    }}>Edit Scope</Button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  {/* Short fields stay in the paired 2-column grid */}
                  {[
                    ['Scope Type', scope.scope_type ? (projectTypes.find(t => t.value === scope.scope_type)?.label || scope.scope_type) : null],
                    ['Area (ha)', scope.area_hectares],
                    ['Length (km)', scope.length_km],
                    ['Asset Count', scope.asset_count],
                  ].map(([l, v]) => v != null && v !== '' && (
                    <div key={l} className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{l}</p>
                      <p className="text-sm text-slate-900">{v}</p>
                    </div>
                  ))}

                  {/* Special instructions can be long — give it the full width as a paragraph */}
                  {scope.special_instructions != null && scope.special_instructions !== '' && (
                    <div className="md:col-span-2 space-y-1">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Special Instructions</p>
                      <p className="text-sm text-slate-900 whitespace-pre-line leading-relaxed break-words">{scope.special_instructions}</p>
                    </div>
                  )}

                  {scope.deliverables_expected && Object.keys(scope.deliverables_expected).length > 0 && (
                    <div className="md:col-span-2 space-y-1">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Scope Parameters</p>
                      <div className="bg-surface rounded p-3 space-y-2">
                        {Object.entries(scope.deliverables_expected).map(([k, v]) => v != null && v !== '' && (
                          <div key={k} className="text-xs">
                            <span className="text-slate-500 capitalize block mb-0.5">{k.replace(/_/g, ' ')}</span>
                            <span className="text-slate-900 whitespace-pre-line leading-relaxed break-words">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* ── Quick-Add Deliverables ── */}
          {canEdit && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Quick-Add Deliverables</p>
                  <p className="text-xs text-slate-500 mt-0.5">List expected deliverables for this project — they'll be created instantly and pilots can upload files against them.</p>
                </div>
              </div>

              {/* Input rows */}
              <div className="space-y-2 mb-4">
                <div className="grid grid-cols-12 gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400 px-1">
                  <div className="col-span-7">Deliverable Name</div>
                  <div className="col-span-4">Format / Type</div>
                  <div className="col-span-1" />
                </div>
                {quickRows.map((row, i) => (
                  <div key={row._id} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={row.name}
                      onChange={e => setQuickRows(prev => prev.map((r, idx) => idx === i ? { ...r, name: e.target.value } : r))}
                      placeholder={`e.g. ${['Orthophoto Map', '3D Point Cloud', 'Survey Report', 'KML Boundaries'][i] || 'Deliverable name'}`}
                      className="col-span-7 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                    <select
                      value={row.format}
                      onChange={e => setQuickRows(prev => prev.map((r, idx) => idx === i ? { ...r, format: e.target.value } : r))}
                      className="col-span-4 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    >
                      <option value="orthophoto">Orthophoto</option>
                      <option value="3d_model">3D Model</option>
                      <option value="point_cloud">Point Cloud</option>
                      <option value="report">Survey Report</option>
                      <option value="kml">KML / KMZ</option>
                      <option value="dwg">DWG / CAD</option>
                      <option value="raw_data">Raw Data</option>
                      <option value="video">Video</option>
                      <option value="other">Other</option>
                    </select>
                    <button
                      onClick={() => setQuickRows(prev => prev.filter((_, idx) => idx !== i))}
                      className="col-span-1 p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center"
                      title="Remove row"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Add row + submit */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuickRows(prev => [...prev, EMPTY_ROW()])}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors"
                >
                  <span className="material-symbols-outlined text-base">add_circle</span>
                  Add Row
                </button>
                <div className="flex-1" />
                <Button icon="playlist_add" onClick={handleQuickAddDeliverables} disabled={quickLoading || !quickRows.some(r => r.name.trim())}>
                  {quickLoading ? 'Creating…' : `Create ${quickRows.filter(r => r.name.trim()).length || ''} Deliverable${quickRows.filter(r => r.name.trim()).length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </Card>
          )}

          </div>
        )}

        {activeTab === 'resources' && (
          <div className="space-y-6">
            <div className="flex justify-end">{canEdit && <Button icon="add" onClick={() => setAllocModal(true)}>Allocate Resources</Button>}</div>
            {allocations === null ? (
              <SectionSkeleton />
            ) : allocations.length === 0 ? (
              <Card className="py-16 text-center">
                <span className="material-symbols-outlined text-4xl text-slate-300 block mb-3">flight_takeoff</span>
                <p className="text-slate-700 font-bold text-sm mb-1">No resources allocated yet</p>
                <p className="text-slate-400 text-xs mb-5 max-w-xs mx-auto">Assign a pilot and drone to this project so the team knows who is flying and when.</p>
                {canEdit && <Button icon="add" onClick={() => setAllocModal(true)}>Allocate Pilot / Drone</Button>}
              </Card>
            ) : (
              <div className="space-y-6">
                {/* ── Formal allocations ── */}
                {allocations.filter(a => !a.is_member_only).length > 0 && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Formal Allocations</p>
                    <div className="grid grid-cols-1 gap-4">
                      {allocations.filter(a => !a.is_member_only).map(alloc => (
                        <Card key={alloc.id} className="p-4 relative">
                          {canEdit && (
                            <div className="absolute top-3 right-3 flex items-center gap-1">
                              <button onClick={() => {
                                setEditAllocId(alloc.id);
                                setEditAllocForm({
                                  pilot_id: alloc.pilot_id || '',
                                  copilot_id: alloc.copilot_id || '',
                                  drone_id: alloc.drone_id || '',
                                  start_date: alloc.start_date ? String(alloc.start_date).substring(0, 10) : '',
                                  end_date: alloc.end_date ? String(alloc.end_date).substring(0, 10) : '',
                                  is_primary: alloc.is_primary !== false,
                                });
                                setEditAllocModal(true);
                              }} className="text-slate-400 hover:text-blue-500 transition-colors" title="Edit allocation">
                                <span className="material-symbols-outlined text-sm">edit</span>
                              </button>
                              <button onClick={async () => {
                                if (!(await confirmDialog({ message: 'Remove this allocation? The assigned resources will be freed for this period.', danger: true }))) return;
                                try {
                                  await axiosInstance.delete(ENDPOINTS.PROJECTS.RESOURCE(id, alloc.id));
                                  setAllocations(as => (as || []).filter(a => a.id !== alloc.id));
                                  showToast('Allocation removed');
                                } catch (err) {
                                  showToast(err.userMessage, 'error');
                                }
                              }} className="text-slate-400 hover:text-red-500 transition-colors" title="Remove allocation">
                                <span className="material-symbols-outlined text-sm">delete</span>
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-3">
                            <p className="text-[9px] uppercase tracking-widest text-slate-500 font-black">
                              {alloc.start_date ? `${formatDate(alloc.start_date)} → ${formatDate(alloc.end_date)}` : 'No date set'}
                            </p>
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${alloc.is_primary !== false ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-surface text-slate-400 border border-slate-200'}`}>
                              {alloc.is_primary !== false ? 'Primary' : 'Secondary'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {/* 1. Pilot Tile */}
                            {alloc.pilot_id ? (
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="material-symbols-outlined text-blue-500 text-base">person</span>
                                  <div>
                                    <p className="text-sm text-slate-900 font-bold leading-none">{alloc.pilot_name}</p>
                                    <p className="text-[9px] text-blue-500 font-black uppercase tracking-widest mt-0.5">Pilot</p>
                                  </div>
                                </div>
                                <div className="space-y-0.5 text-[10px] text-slate-500">
                                  <p className="flex justify-between"><span>License</span><span className="font-mono text-slate-700">{alloc.pilot_license_number || '—'}</span></p>
                                  <p className="flex justify-between"><span>Status</span><span className={alloc.pilot_status === 'active' ? 'text-green-500 font-bold' : 'text-amber-500 font-bold'}>{alloc.pilot_status || '—'}</span></p>
                                  {alloc.pilot_license_expiry && <p className="flex justify-between"><span>Expiry</span><span className="font-mono text-slate-700">{formatDate(alloc.pilot_license_expiry)}</span></p>}
                                </div>
                              </div>
                            ) : <div className="bg-slate-50 border border-dashed border-slate-200 p-3 rounded-lg flex items-center justify-center text-xs text-slate-400">No Pilot</div>}

                            {/* 2. Co-Pilot Tile */}
                            {alloc.copilot_id ? (
                              <div className="bg-violet-50/50 p-3 rounded-lg border border-violet-200">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="material-symbols-outlined text-violet-600 text-base">group</span>
                                  <div>
                                    <p className="text-sm text-slate-900 font-bold leading-none">{alloc.copilot_name}</p>
                                    <p className="text-[9px] text-violet-600 font-black uppercase tracking-widest mt-0.5">Co-Pilot</p>
                                  </div>
                                </div>
                                <div className="space-y-0.5 text-[10px] text-slate-500">
                                  <p className="flex justify-between"><span>License</span><span className="font-mono text-slate-700">{alloc.copilot_license_number || '—'}</span></p>
                                  <p className="flex justify-between"><span>Status</span><span className={alloc.copilot_status === 'active' ? 'text-green-500 font-bold' : 'text-amber-500 font-bold'}>{alloc.copilot_status || '—'}</span></p>
                                  {alloc.copilot_license_expiry && <p className="flex justify-between"><span>Expiry</span><span className="font-mono text-slate-700">{formatDate(alloc.copilot_license_expiry)}</span></p>}
                                </div>
                              </div>
                            ) : <div className="bg-slate-50 border border-dashed border-slate-200 p-3 rounded-lg flex items-center justify-center text-xs text-slate-400">No Co-Pilot</div>}

                            {/* 3. Drone Tile */}
                            {alloc.drone_id ? (
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="material-symbols-outlined text-amber-500 text-base">flight</span>
                                  <div>
                                    <p className="text-sm text-slate-900 font-bold leading-none">{alloc.drone_name}</p>
                                    <p className="text-[9px] text-amber-500 font-black uppercase tracking-widest mt-0.5">Drone</p>
                                  </div>
                                </div>
                                <div className="space-y-0.5 text-[10px] text-slate-500">
                                  <p className="flex justify-between"><span>Model</span><span className="text-slate-700">{alloc.drone_model || '—'}</span></p>
                                  <p className="flex justify-between"><span>Status</span><span className={alloc.drone_status === 'active' ? 'text-green-500 font-bold' : 'text-amber-500 font-bold'}>{alloc.drone_status || '—'}</span></p>
                                  {alloc.drone_next_maintenance && <p className="flex justify-between"><span>Maint.</span><span className="font-mono text-slate-700">{formatDate(alloc.drone_next_maintenance)}</span></p>}
                                </div>
                              </div>
                            ) : <div className="bg-slate-50 border border-dashed border-slate-200 p-3 rounded-lg flex items-center justify-center text-xs text-slate-400">No Drone</div>}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Team Pilots (project members who are pilots) ── */}
                {(() => {
                  const teamPilots = allocations.filter(a => a.is_member_only && a.pilot_id && (!a.copilot_id || a.row_kind === 'team_pilot'));
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Team Pilots <span className="font-normal normal-case text-slate-300">— project members, no date window</span>
                        </p>
                        {canEdit && (
                          <Button size="sm" variant="secondary" icon="person_add" onClick={() => { setTeamPilotUserId(''); setTeamPilotModal(true); }}>
                            Add Pilot
                          </Button>
                        )}
                      </div>
                      {teamPilots.length === 0 ? (
                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-5 text-center text-xs text-slate-400">
                          No team pilots yet.{canEdit && ' Use "Add Pilot" to assign one.'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {teamPilots.map(alloc => (
                            <div key={`member-pilot-${alloc.pilot_id}`} className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3 flex items-center gap-3 relative group">
                              <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-indigo-500 text-base">person</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-slate-900 truncate">{alloc.pilot_name}</p>
                                <p className="text-[10px] text-slate-500 truncate">{alloc.pilot_license_number || 'No license #'}</p>
                                <span className={`inline-block mt-0.5 px-1.5 py-px rounded text-[8px] font-black uppercase tracking-widest ${alloc.pilot_status === 'active' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                                  {alloc.pilot_status || 'unknown'}
                                </span>
                              </div>
                              {canEdit && alloc.pilot_member_user_id && (
                                <button
                                  onClick={() => handleRemoveTeamPilot(alloc.pilot_member_user_id, alloc.pilot_name)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500 shrink-0"
                                  title="Remove from project team"
                                >
                                  <span className="material-symbols-outlined text-sm">person_remove</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Team Co-Pilots (project members who are co-pilots) ── */}
                {(() => {
                  const teamCopilots = allocations.filter(a => a.is_member_only && (a.copilot_id || a.row_kind === 'team_copilot'));
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-violet-500 font-bold">
                          Team Co-Pilots <span className="font-normal normal-case text-slate-400">— project crew, no date window</span>
                        </p>
                        {canEdit && (
                          <Button size="sm" variant="secondary" icon="group_add" onClick={() => { setTeamCopilotUserId(''); setTeamCopilotModal(true); }}>
                            Add Co-Pilot
                          </Button>
                        )}
                      </div>
                      {teamCopilots.length === 0 ? (
                        <div className="bg-violet-50/40 border border-dashed border-violet-200 rounded-xl p-5 text-center text-xs text-slate-400">
                          No team co-pilots yet.{canEdit && ' Use "Add Co-Pilot" to assign one.'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {teamCopilots.map(alloc => (
                            <div key={`member-copilot-${alloc.copilot_id || alloc.id}`} className="bg-violet-50/50 border border-dashed border-violet-200 rounded-xl p-3 flex items-center gap-3 relative group">
                              <div className="w-9 h-9 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-violet-600 text-base">group</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-slate-900 truncate">{alloc.copilot_name}</p>
                                <p className="text-[10px] text-slate-500 truncate">{alloc.copilot_license_number || 'No license #'}</p>
                                <span className={`inline-block mt-0.5 px-1.5 py-px rounded text-[8px] font-black uppercase tracking-widest ${alloc.copilot_status === 'active' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                                  {alloc.copilot_status || 'unknown'}
                                </span>
                              </div>
                              {canEdit && alloc.pilot_member_user_id && (
                                <button
                                  onClick={() => handleRemoveTeamCopilot(alloc.pilot_member_user_id, alloc.copilot_name)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500 shrink-0"
                                  title="Remove from project team"
                                >
                                  <span className="material-symbols-outlined text-sm">person_remove</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Team Drones (project_drones — no date window) ── */}
                {(() => {
                  const teamDrones = allocations.filter(a => a.is_member_only && a.drone_id && !a.pilot_id && !a.copilot_id);
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          Team Drones <span className="font-normal normal-case text-slate-300">— project equipment, no date window</span>
                        </p>
                        {canEdit && (
                          <Button size="sm" variant="secondary" icon="flight_takeoff" onClick={() => { setTeamDroneId(''); setTeamDroneModal(true); }}>
                            Add Drone
                          </Button>
                        )}
                      </div>
                      {teamDrones.length === 0 ? (
                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-5 text-center text-xs text-slate-400">
                          No team drones yet.{canEdit && ' Use "Add Drone" to assign one.'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {teamDrones.map(alloc => (
                            <div key={`team-drone-${alloc.drone_id}`} className="bg-slate-50 border border-dashed border-amber-200 rounded-xl p-3 flex items-center gap-3 relative group">
                              <div className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-amber-500 text-base">flight</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-slate-900 truncate">{alloc.drone_name}</p>
                                <p className="text-[10px] text-slate-500 truncate">{alloc.drone_model || 'No model'}</p>
                                <span className={`inline-block mt-0.5 px-1.5 py-px rounded text-[8px] font-black uppercase tracking-widest ${alloc.drone_status === 'active' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                                  {alloc.drone_status || 'unknown'}
                                </span>
                              </div>
                              {canEdit && (
                                <button
                                  onClick={() => handleRemoveTeamDrone(alloc.drone_id, alloc.drone_name)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-red-500 shrink-0"
                                  title="Remove drone from project team"
                                >
                                  <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* CTA when no formal allocations exist */}
                {allocations.filter(a => !a.is_member_only).length === 0 && canEdit && (
                  <div className="flex justify-center pt-2">
                    <Button icon="add" variant="secondary" onClick={() => setAllocModal(true)}>Add Formal Allocation with Dates</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-6">
            <Card className="p-0 overflow-hidden">
              <div className="bg-surface px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-sm text-slate-900">Project Documents</h3>
              </div>
              {documents === null ? (
                <SectionSkeleton />
              ) : documents.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">No documents found.</div>
              ) : (
                <Table data={documents} columns={[
                  { header: 'File Name', cell: r => {
                    const ext = (r.file_name || '').split('.').pop().toLowerCase();
                    const iconMap = {
                      pdf: ['picture_as_pdf','text-red-400'], kml: ['map','text-green-500'], kmz: ['map','text-green-500'],
                      xlsx: ['table_chart','text-emerald-500'], xls: ['table_chart','text-emerald-500'], csv: ['table_chart','text-emerald-500'],
                      docx: ['description','text-blue-400'], doc: ['description','text-blue-400'],
                      zip: ['folder_zip','text-amber-400'], jpg: ['image','text-sky-400'], jpeg: ['image','text-sky-400'],
                      png: ['image','text-sky-400'], tif: ['image','text-sky-400'], tiff: ['image','text-sky-400'],
                      mp4: ['movie','text-violet-400'], mov: ['movie','text-violet-400'],
                      las: ['scatter_plot','text-orange-400'], laz: ['scatter_plot','text-orange-400'],
                    };
                    const [icon, cls] = iconMap[ext] || ['draft','text-slate-400'];
                    return (
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={`material-symbols-outlined text-base flex-shrink-0 ${cls}`}>{icon}</span>
                        <span className="truncate">{r.file_name}</span>
                      </span>
                    );
                  }},
                  { header: 'Category', cell: r => (
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] uppercase font-bold tracking-wider">{r.category || '—'}</span>
                      {/* Only admins / project PMs ever receive these rows — the badge
                          tells them the document is invisible to pilots. */}
                      {isRestrictedDocCategory(r.category) && (
                        <span
                          title="Restricted — visible only to admins and project managers. Pilots cannot see or download this document."
                          className="inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5"
                        >
                          <span className="material-symbols-outlined text-[11px] leading-none">lock</span>
                          Hidden from pilots
                        </span>
                      )}
                    </span>
                  ) },
                  { header: 'Version', cell: r => r.version },
                  { header: 'Date', cell: r => formatDate(r.created_at) },
                  { header: '', cell: r => (
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="secondary" icon="download"
                        onClick={() => downloadFile(ENDPOINTS.PROJECTS.DOC_DOWNLOAD(id, r.id), r.file_name)} />
                      {canEdit && (
                        <Button size="sm" variant="secondary" icon="edit"
                          onClick={() => handleEditDocOpen(r)} />
                      )}
                      {canEdit && (
                        <Button size="sm" variant="danger" icon="delete"
                          onClick={() => handleDeleteDocument(r.id, r.file_name)} />
                      )}
                    </div>
                  )}
                ]} />
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Category:</p>
                <select className="bg-surface text-slate-900 text-xs border border-slate-200 rounded px-3 py-2"
                  value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}>
                  {/* Restricted categories are only offered to those who may manage
                      documents — the backend rejects document uploads from anyone else. */}
                  {DOCUMENT_CATEGORIES
                    .filter(c => canEdit || !isRestrictedDocCategory(c))
                    .map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                </select>
                {isRestrictedDocCategory(uploadCategory) && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                    <span className="material-symbols-outlined text-sm">lock</span>
                    Uploads in this category stay hidden from pilots
                  </span>
                )}
              </div>
              <ChunkedUploader
                entityType="document"
                projectId={id}
                multiple={true}
                label="Upload project document — PDF, Word, Excel, KML and more"
                extraMeta={{ category: uploadCategory }}
                onComplete={() => { setDocuments(null); showToast('Document uploaded'); }}
                onError={(err) => showToast(err.message || 'Upload error', 'error')}
              />
            </Card>
          </div>
        )}

        {activeTab === 'deliverables' && (
          <div className="space-y-4">
            {/* Bundle / Download all — PM/admin only (backend requires project_manager) */}
            {canEdit && (
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div className="flex gap-2 items-center flex-wrap">
                  <Button
                    variant="secondary" icon={bundleState === 'queued' ? 'hourglass_empty' : 'folder_zip'}
                    onClick={handleBundleDeliverables}
                    disabled={!deliverables?.length || bundleState === 'queued'}
                  >
                    {bundleState === 'queued' ? 'Downloading…' : 'Download All (ZIP)'}
                  </Button>
                </div>
              </div>
            )}

            {/* Deliverable list */}
            <Card>
              {deliverables === null ? (
                <SectionSkeleton />
              ) : (() => {
                // Group: folders (is_folder) with their children (parent_id), plus loose files.
                const folders   = deliverables.filter(d => d.is_folder);
                const childrenOf = {};
                deliverables.forEach(d => { if (d.parent_id) (childrenOf[d.parent_id] = childrenOf[d.parent_id] || []).push(d); });
                const loose     = deliverables.filter(d => !d.is_folder && !d.parent_id);

                const fileIcon = (filename) => {
                  const ext = (filename || '').split('.').pop().toLowerCase();
                  const map = {
                    pdf:  ['picture_as_pdf', 'text-red-400'],
                    jpg:  ['image',          'text-sky-400'],
                    jpeg: ['image',          'text-sky-400'],
                    png:  ['image',          'text-sky-400'],
                    tif:  ['image',          'text-sky-400'],
                    tiff: ['image',          'text-sky-400'],
                    mp4:  ['movie',          'text-violet-400'],
                    mov:  ['movie',          'text-violet-400'],
                    avi:  ['movie',          'text-violet-400'],
                    las:  ['scatter_plot',   'text-orange-400'],
                    laz:  ['scatter_plot',   'text-orange-400'],
                    kml:  ['map',            'text-green-500'],
                    kmz:  ['map',            'text-green-500'],
                    zip:  ['folder_zip',     'text-amber-400'],
                    xlsx: ['table_chart',    'text-emerald-500'],
                    xls:  ['table_chart',    'text-emerald-500'],
                    csv:  ['table_chart',    'text-emerald-500'],
                    docx: ['description',   'text-blue-400'],
                    doc:  ['description',   'text-blue-400'],
                  };
                  const [icon, cls] = map[ext] || ['draft', 'text-slate-400'];
                  return <span className={`material-symbols-outlined text-base flex-shrink-0 ${cls}`}>{icon}</span>;
                };

                const statusBadge = (s) => {
                  const cfg = {
                    approved: 'bg-green-500/20 text-green-600', uploaded: 'bg-blue-500/20 text-blue-600',
                    processing: 'bg-purple-500/20 text-purple-600', uploading: 'bg-amber-500/20 text-amber-600',
                    rejected: 'bg-red-500/20 text-red-600', pending: 'bg-slate-100 text-slate-500',
                  };
                  return <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest ${cfg[s] || cfg.pending}`}>{s}</span>;
                };

                const actions = (r) => (
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {r.file_key && (
                      <Button size="sm" variant="secondary" icon="download"
                        onClick={() => downloadFile(ENDPOINTS.PROJECTS.DEL_DOWNLOAD(id, r.id), r.name)} />
                    )}
                    {/* Pending → attach file for the first time */}
                    {canContribute && r.status === 'pending' && (
                      <label className={`cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                        resubmitting === r.id
                          ? 'opacity-50 cursor-wait bg-slate-50 border-slate-200 text-slate-400'
                          : 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/20'}`}>
                        <span className="material-symbols-outlined text-sm">upload_file</span>
                        {resubmitting === r.id ? 'Uploading…' : 'Attach File'}
                        <input type="file" className="hidden" disabled={!!resubmitting}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResubmit(r.id, f, true); e.target.value = ''; }} />
                      </label>
                    )}
                    {canEdit && r.status === 'uploaded' && (
                      <Button size="sm" icon="check" onClick={() => handleApprove(r.id)}>Approve</Button>
                    )}
                    {canEdit && r.status === 'uploaded' && (
                      <Button size="sm" variant="danger" icon="close"
                        onClick={() => { setRejectTarget(r.id); setRejectModal(true); }}>Reject</Button>
                    )}
                    {r.status === 'rejected' && (
                      <div className="flex flex-col gap-1">
                        {r.rejected_reason && (
                          <p className="text-[10px] text-red-500 italic max-w-[180px] truncate" title={r.rejected_reason}>
                            Rejected: {r.rejected_reason}
                          </p>
                        )}
                        <label className={`cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                          resubmitting === r.id ? 'opacity-50 cursor-wait bg-slate-50 border-slate-200 text-slate-400'
                            : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'}`}>
                          <span className="material-symbols-outlined text-sm">upload_file</span>
                          {resubmitting === r.id ? 'Uploading...' : 'Resubmit'}
                          <input type="file" className="hidden" disabled={!!resubmitting}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleResubmit(r.id, f); e.target.value = ''; }} />
                        </label>
                      </div>
                    )}
                    {/* Rename + Delete (admin/PM only, not on folders) */}
                    {canEdit && !r.is_folder && (
                      <Button size="sm" variant="secondary" icon="edit"
                        onClick={() => handleRenameDelOpen(r)} />
                    )}
                    {canEdit && (
                      <Button size="sm" variant="danger" icon="delete"
                        onClick={() => handleDeleteDeliverable(r.id, r.name || r.file_name || 'this file')} />
                    )}
                  </div>
                );

                const fileRow = (r, indent = false) => (
                  <div key={r.id} className={`grid grid-cols-[1fr_100px_90px_80px_130px_auto] items-center gap-2 px-4 py-2.5 border-t border-slate-50 hover:bg-slate-50/60 ${indent ? 'pl-10 bg-slate-50/30' : ''}`}>
                    <span className="text-sm text-slate-800 truncate flex items-center gap-2 min-w-0">
                      {indent && <span className="material-symbols-outlined text-sm text-slate-300 flex-shrink-0">subdirectory_arrow_right</span>}
                      {fileIcon(r.name || r.file_name)}
                      <span className="truncate" title={r.name || r.file_name}>{r.name || r.file_name || '—'}</span>
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 truncate">{r.format ? r.format.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—'}</span>
                    <span>{statusBadge(r.status)}</span>
                    <span className="text-xs text-slate-500">{r.file_size ? `${(r.file_size / 1e6).toFixed(1)} MB` : '—'}</span>
                    <span className="text-xs text-slate-500">{formatDate(r.uploaded_at)}</span>
                    {actions(r)}
                  </div>
                );

                if (!deliverables.length) {
                  return <div className="py-16 text-center text-sm text-slate-400">No deliverables yet</div>;
                }

                return (
                  <div className="overflow-x-auto">
                    {/* header */}
                    <div className="hidden md:grid grid-cols-[1fr_100px_90px_80px_130px_auto] gap-2 px-4 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <span>Name</span><span>Format / Type</span><span>Status</span><span>Size</span><span>Date</span><span className="text-right">Actions</span>
                    </div>

                    {/* Folders (expandable) */}
                    {folders.map(f => {
                      const kids  = childrenOf[f.id] || [];
                      const total = kids.reduce((s, k) => s + (k.file_size || 0), 0);
                      const open  = expandedFolders.includes(f.id);
                      return (
                        <div key={f.id}>
                          <div
                            onClick={() => setExpandedFolders(prev => open ? prev.filter(x => x !== f.id) : [...prev, f.id])}
                            className="grid grid-cols-[1fr_100px_90px_80px_130px_auto] items-center gap-2 px-4 py-3 border-t border-slate-100 cursor-pointer hover:bg-slate-50 select-none">
                            <span className="text-sm font-semibold text-slate-900 flex items-center gap-2 truncate">
                              <span className={`material-symbols-outlined text-base text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>chevron_right</span>
                              <span className="material-symbols-outlined text-base text-amber-500">{open ? 'folder_open' : 'folder'}</span>
                              <span className="truncate" title={f.name}>{f.name}</span>
                            </span>
                            <span className="text-[10px] text-slate-400">—</span>
                            <span><span className="px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-widest bg-slate-100 text-slate-500">{kids.length} files</span></span>
                            <span className="text-xs text-slate-500">{total ? `${(total / 1e6).toFixed(1)} MB` : '—'}</span>
                            <span className="text-xs text-slate-500">{formatDate(f.uploaded_at)}</span>
                            <span className="text-right text-[10px] text-slate-400">{open ? 'Hide' : 'Open'}</span>
                          </div>
                          {open && (kids.length
                            ? kids.map(k => fileRow(k, true))
                            : <div className="pl-10 px-4 py-3 text-xs text-slate-400 border-t border-slate-50">Empty folder</div>)}
                        </div>
                      );
                    })}

                    {/* Loose files */}
                    {loose.map(r => fileRow(r))}
                  </div>
                );
              })()}
            </Card>

            {/* Chunked upload zone — visible to any project member (incl. pilots), hidden for non-member read-only viewers */}
            {canContribute && (
              <Card className="p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
                  Upload Deliverable — supports GeoTIFF, LAS/LAZ, video, ZIP, PDF and all drone formats
                </p>
                <ChunkedUploader
                  entityType="deliverable"
                  projectId={id}
                  multiple={true}
                  label="Drop deliverable files here — any size supported"
                  onComplete={() => { setDeliverables(null); showToast('Deliverable upload queued for processing'); }}
                  onError={(err) => showToast(err.message || 'Upload error', 'error')}
                />
              </Card>
            )}
          </div>
        )}

        {activeTab === 'estimations' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button icon="add" onClick={() => navigate(
                `/estimations/new?project_id=${id}` +
                `&client_name=${encodeURIComponent(project?.client_name || '')}` +
                `&project_type=${encodeURIComponent(project?.project_type || '')}` +
                `&label=${encodeURIComponent(project?.name || '')}`
              )}>New Estimation</Button>
            </div>
            <Card>
              {estimations === null ? (
                <SectionSkeleton />
              ) : estimations.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">No estimations linked to this project.</div>
              ) : (
                <Table data={estimations} columns={[
                  { header: 'Client', cell: r => r.client_name || '—' },
                  { header: 'Type', cell: r => <span className="text-[10px] uppercase font-bold">{r.project_type}</span> },
                  { header: 'Excl. GST', cell: r => {
                    const exGst = Number(r.total_cost || 0) - Number(r.tax || 0);
                    return <span className="font-semibold">₹ {exGst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>;
                  }},
                  { header: 'Incl. GST', cell: r => <span className="text-slate-500 text-xs">₹ {Number(r.total_cost || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> },
                  { header: 'Date', cell: r => formatDate(r.created_at) },
                  { header: '', cell: r => (
                    <Button size="sm" variant="secondary" icon="open_in_new" onClick={() => navigate(`/estimations/${r.id}`)} />
                  )},
                ]} />
              )}
            </Card>
          </div>
        )}

        {/* Re-center map when KML is uploaded and new center is available */}
        {activeTab === 'map' && (
          <div className="space-y-4">
            <Card className="p-0 overflow-hidden relative">
              {/* Top-right: download GeoJSON */}
              <div className="absolute top-4 right-4 z-[400] flex gap-2">
                {mapData?.geojson_data && (
                  <Button size="sm" variant="secondary" icon="download" onClick={() => {
                    const blob = new Blob([typeof mapData.geojson_data === 'string' ? mapData.geojson_data : JSON.stringify(mapData.geojson_data)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url; link.download = `${project.name}_boundary.geojson`;
                    document.body.appendChild(link); link.click(); document.body.removeChild(link);
                  }}>Download GeoJSON</Button>
                )}
              </div>

              <div className="h-[400px] sm:h-[520px] md:h-[620px] w-full relative">
                {/* Bottom-left: project identity card — inside map div so overflow-hidden on Card doesn't clip it */}
                {(() => {
                  const typeMeta = TYPE_META[project.project_type] || TYPE_META.other;
                  return (
                    <div className="absolute bottom-5 left-4 z-[400] bg-surface/95 backdrop-blur-md rounded-2xl px-4 py-3 border border-slate-200 shadow-lg flex items-center gap-3 pointer-events-none max-w-[260px]">
                      <span style={{ fontSize: '32px', lineHeight: 1, flexShrink: 0 }}>{typeMeta.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate leading-tight">{project.name}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: typeMeta.color }}>{typeMeta.label}</p>
                        {(project.location_name || project.state) && (
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                            📌 {project.location_name || [project.district, project.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                        {(() => {
                          const totalArea = kmlHistory
                            .filter(k => visibleKmlIds.has(k.id) && k.area_sqm)
                            .reduce((s, k) => s + Number(k.area_sqm), 0);
                          return totalArea > 0 ? (
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {totalArea >= 1_000_000
                                ? `${(totalArea / 1_000_000).toFixed(2)} km²`
                                : `${(totalArea / 10_000).toFixed(2)} ha`} total coverage
                            </p>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  );
                })()}
                {(mapData || (project.latitude && project.longitude)) ? (
                  <MapContainer
                    center={[
                      mapData?.center_lat || parseFloat(project.latitude) || 20,
                      mapData?.center_lng || parseFloat(project.longitude) || 78
                    ]}
                    zoom={mapData?.zoom_level || 13}
                    style={{ height: '100%', width: '100%', background: '#F8FAFC' }}
                  >
                    <LayersControl position="topright">
                      <LayersControl.BaseLayer name="Dark Satellite">
                          <TileLayer
                              attribution='&copy; CARTO'
                              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                          />
                      </LayersControl.BaseLayer>
                      <LayersControl.BaseLayer checked name="Street Map">
                          <TileLayer
                              attribution='&copy; OpenStreetMap'
                              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          />
                      </LayersControl.BaseLayer>
                      <LayersControl.BaseLayer name="Esri Satellite">
                          <TileLayer
                              attribution='&copy; Esri'
                              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                          />
                      </LayersControl.BaseLayer>
                    </LayersControl>

                    {/* Render ALL visible KML layers simultaneously */}
                    {kmlHistory.filter(k => visibleKmlIds.has(k.id) && k.geojson_data).map((k, idx) => {
                      const layerColor = KML_LAYER_COLORS[idx % KML_LAYER_COLORS.length];
                      const geojsonObj = typeof k.geojson_data === 'string'
                        ? JSON.parse(k.geojson_data)
                        : k.geojson_data;
                      const layerStyle = (feature) => {
                        const p = feature?.properties || {};
                        const kmlStroke = p['stroke'] || p['stroke-color'];
                        const lineColor   = kmlStroke || layerColor;
                        const lineWidth   = parseFloat(p['stroke-width'] || 0) || 0;
                        const lineOpacity = parseFloat(p['stroke-opacity'] != null ? p['stroke-opacity'] : 1);
                        const fillColor   = p['fill'] || lineColor;
                        const fillOpacity = parseFloat(p['fill-opacity']   != null ? p['fill-opacity']   : 0.18);
                        const geomType = feature?.geometry?.type || '';
                        const isLine = geomType === 'LineString' || geomType === 'MultiLineString';
                        return {
                          color:       lineColor,
                          weight:      Math.max(lineWidth || (isLine ? 4 : 3), 3),
                          opacity:     Math.min(Math.max(lineOpacity, 0.7), 1),
                          fillColor:   fillColor,
                          fillOpacity: Math.min(Math.max(fillOpacity, 0), 0.35),
                          dashArray:   isLine ? '8 4' : undefined,
                        };
                      };
                      return (
                        <GeoJSON
                          key={`kml-${k.id}-${kmlVersion}`}
                          data={geojsonObj}
                          style={layerStyle}
                        />
                      );
                    })}

                    {/* Re-center to the most recently added visible KML */}
                    {(() => {
                      const visible = kmlHistory.filter(k => visibleKmlIds.has(k.id) && k.center_lat && k.center_lng);
                      const latest  = visible[0]; // history is ordered newest-first
                      return latest ? (
                        <MapRecenter lat={latest.center_lat} lng={latest.center_lng} zoom={mapData?.zoom_level || 13} />
                      ) : mapData?.center_lat ? (
                        <MapRecenter lat={mapData.center_lat} lng={mapData.center_lng} zoom={mapData.zoom_level || 13} />
                      ) : null;
                    })()}

                    {/* Emoji pin marker at project coordinates */}
                    {(project.latitude && project.longitude) && (() => {
                      const typeMeta = TYPE_META[project.project_type] || TYPE_META.other;
                      return (
                        <Marker
                          position={[parseFloat(project.latitude), parseFloat(project.longitude)]}
                          icon={makeTypeIcon(project.project_type, 40)}
                        >
                          <Popup>
                            <div style={{ padding: '10px 14px', minWidth: '170px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                <span style={{ fontSize: '28px', lineHeight: 1 }}>{typeMeta.emoji}</span>
                                <div>
                                  <p style={{ fontWeight: 800, fontSize: '13px', margin: '0 0 2px 0', color: '#0F172A' }}>{project.name}</p>
                                  <p style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: typeMeta.color, margin: 0 }}>{typeMeta.label}</p>
                                </div>
                              </div>
                              {(project.location_name || project.district) && (
                                <p style={{ fontSize: '11px', color: '#64748B', margin: '0 0 6px 0' }}>
                                  📌 {project.location_name || [project.district, project.state].filter(Boolean).join(', ')}
                                </p>
                              )}
                              <p style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94A3B8', margin: 0 }}>
                                {parseFloat(project.latitude).toFixed(5)}, {parseFloat(project.longitude).toFixed(5)}
                              </p>
                            </div>
                          </Popup>
                        </Marker>
                      );
                    })()}
                  </MapContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2">
                    <span className="material-symbols-outlined text-4xl">location_off</span>
                    <p>No coordinates or map data provided for this project.</p>
                  </div>
                )}
              </div>
            </Card>

            {/* KML/KMZ upload — PM and Admin only */}
            {canEdit && (
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Upload KML / KMZ Boundary</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Overlay a flight boundary or survey area on the map above. Processed server-side — map updates live.</p>
                  </div>
                  <label className={`relative cursor-pointer ${kmlUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <input
                      type="file"
                      accept=".kml,.kmz"
                      className="sr-only"
                      onChange={handleKmlUpload}
                      disabled={kmlUploading}
                    />
                    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      kmlUploading
                        ? 'bg-surface text-slate-500'
                        : 'bg-blue-600 hover:bg-blue-500 text-slate-900'
                    }`}>
                      {kmlUploading ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Processing…
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-base">upload_file</span>
                          Upload KML / KMZ
                        </>
                      )}
                    </span>
                  </label>
                </div>

                {mapData && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-200">
                    {mapData.area_sqm != null && (
                      <div className="bg-slate-100 rounded-lg p-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Area</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {mapData.area_sqm >= 1_000_000
                            ? `${(mapData.area_sqm / 1_000_000).toFixed(2)} km²`
                            : `${(mapData.area_sqm / 10_000).toFixed(2)} ha`}
                        </p>
                      </div>
                    )}
                    {mapData.center_lat != null && (
                      <div className="bg-slate-100 rounded-lg p-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Center</p>
                        <p className="text-sm font-semibold text-slate-900 font-mono">
                          {parseFloat(mapData.center_lat).toFixed(5)}, {parseFloat(mapData.center_lng).toFixed(5)}
                        </p>
                      </div>
                    )}
                    {mapData.kml_key && (
                      <div className="bg-slate-100 rounded-lg p-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Source</p>
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {mapData.kml_key.split('/').pop()}
                        </p>
                      </div>
                    )}
                    {mapData.updated_at && (
                      <div className="bg-slate-100 rounded-lg p-3">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Last Updated</p>
                        <p className="text-sm font-semibold text-slate-900">{formatDate(mapData.updated_at)}</p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            {/* KML files from Documents library */}
            {kmlDocuments.length > 0 && (
              <Card>
                <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-emerald-500">folder_open</span>
                  KML / KMZ from Documents ({kmlDocuments.length})
                </h3>
                <p className="text-xs text-slate-500 mb-3">These KML files are stored in your Documents tab. Click "Load on Map" to display them.</p>
                <div className="space-y-2">
                  {kmlDocuments.map(doc => {
                    const isImporting  = importingDocId === doc.id;
                    // A doc is already on the map if its file_key matches any existing kml layer's kml_key
                    const isAlreadyLoaded = kmlHistory.some(k => k.kml_key === doc.file_key);
                    return (
                      <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
                        <span className="material-symbols-outlined text-lg text-emerald-500 shrink-0">description</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{doc.file_name}</p>
                          <p className="text-[10px] text-slate-500">{formatDate(doc.created_at)}</p>
                        </div>
                        <button
                          onClick={() => !isAlreadyLoaded && !isImporting && handleImportDoc(doc)}
                          disabled={isImporting || isAlreadyLoaded}
                          title={isAlreadyLoaded ? 'Already loaded on map' : 'Load this KML onto the map'}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                            isImporting
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                              : isAlreadyLoaded
                              ? 'bg-emerald-100 text-emerald-600 cursor-default border border-emerald-200'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          }`}
                        >
                          {isImporting ? (
                            <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Processing…</>
                          ) : isAlreadyLoaded ? (
                            <><span className="material-symbols-outlined text-sm">check_circle</span>Loaded</>
                          ) : (
                            <><span className="material-symbols-outlined text-sm">map</span>Load on Map</>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* KML Layers — all shown simultaneously with toggle checkboxes */}
            {kmlHistory.length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-primary">layers</span>
                    KML Layers ({kmlHistory.length})
                    <span className="text-[10px] font-medium text-slate-400 ml-1">
                      {visibleKmlIds.size} of {kmlHistory.length} visible
                    </span>
                  </h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setVisibleKmlIds(new Set(kmlHistory.map(k => k.id)))}
                      className="text-[10px] font-bold text-primary hover:underline"
                    >Show All</button>
                    <span className="text-slate-300">·</span>
                    <button
                      onClick={() => setVisibleKmlIds(new Set())}
                      className="text-[10px] font-bold text-slate-400 hover:underline"
                    >Hide All</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {kmlHistory.map((k, idx) => {
                    const layerColor = KML_LAYER_COLORS[idx % KML_LAYER_COLORS.length];
                    const isVisible  = visibleKmlIds.has(k.id);
                    return (
                      <div
                        key={k.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          isVisible
                            ? 'bg-slate-50 border-slate-200'
                            : 'bg-slate-50/40 border-slate-100 opacity-50'
                        }`}
                      >
                        {/* Color swatch + toggle */}
                        <button
                          onClick={() => {
                            setVisibleKmlIds(prev => {
                              const next = new Set(prev);
                              if (next.has(k.id)) next.delete(k.id);
                              else next.add(k.id);
                              return next;
                            });
                            setKmlVersion(v => v + 1);
                          }}
                          className="shrink-0 flex items-center gap-1.5 group"
                          title={isVisible ? 'Hide layer' : 'Show layer'}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-sm shrink-0 transition-opacity"
                            style={{ background: layerColor, opacity: isVisible ? 1 : 0.3 }}
                          />
                          <span className={`material-symbols-outlined text-base transition-colors ${isVisible ? 'text-slate-600' : 'text-slate-300'}`}>
                            {isVisible ? 'visibility' : 'visibility_off'}
                          </span>
                        </button>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{k.name}</p>
                          <p className="text-[10px] text-slate-500">
                            {formatDate(k.created_at)}
                            {k.feature_count != null && ` · ${k.feature_count} feature(s)`}
                            {k.area_sqm != null && ` · ${k.area_sqm >= 1_000_000 ? (k.area_sqm/1_000_000).toFixed(2)+' km²' : (k.area_sqm/10_000).toFixed(2)+' ha'}`}
                            {k.uploaded_by_name && ` · by ${k.uploaded_by_name}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-4">
            <div className="flex justify-end"><Button icon="person_add" onClick={() => setMemberModal(true)}>Add member</Button></div>
            <Card>
              {members === null ? (
                <SectionSkeleton />
              ) : (
                <Table data={members} columns={[
                  { header: 'Name', cell: r => r.name },
                  { header: 'Role', cell: r => (
                    <span className="text-[10px] font-bold uppercase">{r.role?.replace(/_/g, ' ')}</span>
                  )},
                  { header: '', cell: r => isAdmin && (
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="secondary" icon="edit" onClick={() => {
                        setEditRoleTarget(r);
                        setEditRoleValue(r.role || 'project_manager');
                      }} />
                      <Button size="sm" variant="danger" icon="person_remove" onClick={async () => {
                        if (!(await confirmDialog({ message: `Remove ${r.name} from the project? They will lose access.`, danger: true }))) return;
                        try {
                          await axiosInstance.delete(ENDPOINTS.PROJECTS.MEMBER(id, r.user_id));
                          setMembers(ms => (ms || []).filter(m => m.user_id !== r.user_id));
                          showToast('Member removed');
                        } catch (err) {
                          showToast(err.userMessage, 'error');
                        }
                      }} />
                    </div>
                  )}
                ]} />
              )}
            </Card>
          </div>
        )}

        {activeTab === 'invoices' && (
          <InvoicesTab projectId={id} canEdit={canEdit} />
        )}

        {activeTab === 'expenses' && (
          <ExpensesTab
            projectId={id}
            members={members || []}
            canEdit={canEdit}
            showToast={showToast}
          />
        )}

      </div>

      {/* Modals - Allocate Resources */}
      <Modal isOpen={allocModal} onClose={() => setAllocModal(false)} title="Allocate Resources">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Select a pilot, co-pilot, or drone and set the project date window.</p>

          {/* Pilot selector */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Pilot <span className="font-normal normal-case">(optional)</span></label>
            <select className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              value={allocForm.pilot_id} onChange={e => setAllocForm({ ...allocForm, pilot_id: e.target.value })}>
              <option value="">— No pilot —</option>
              {pilots.map(p => (
                <option key={p.id} value={p.id} disabled={p.status !== 'active'}>
                  {p.name}{p.status !== 'active' ? ` (${p.status})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Pilot availability banner */}
          {pilotAvailability.status && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold border ${
              pilotAvailability.status === 'available'
                ? 'bg-green-50 border-green-200 text-green-700'
                : pilotAvailability.status === 'expiring'
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              <span className="material-symbols-outlined text-base">
                {pilotAvailability.status === 'available' ? 'check_circle' : pilotAvailability.status === 'expiring' ? 'warning' : 'cancel'}
              </span>
              {pilotAvailability.status === 'available' ? 'Pilot is available for this window' : pilotAvailability.reason}
            </div>
          )}

          {/* Co-Pilot selector */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-violet-600 mb-1.5 block">Co-Pilot <span className="font-normal normal-case text-slate-500">(optional)</span></label>
            <select className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
              value={allocForm.copilot_id} onChange={e => setAllocForm({ ...allocForm, copilot_id: e.target.value })}>
              <option value="">— No co-pilot —</option>
              {copilots.map(p => (
                <option key={p.id} value={p.id} disabled={p.status !== 'active'}>
                  {p.name}{p.status !== 'active' ? ` (${p.status})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Co-Pilot availability banner */}
          {copilotAvailability.status && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold border ${
              copilotAvailability.status === 'available'
                ? 'bg-green-50 border-green-200 text-green-700'
                : copilotAvailability.status === 'expiring'
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              <span className="material-symbols-outlined text-base">
                {copilotAvailability.status === 'available' ? 'check_circle' : copilotAvailability.status === 'expiring' ? 'warning' : 'cancel'}
              </span>
              {copilotAvailability.status === 'available' ? 'Co-Pilot is available for this window' : copilotAvailability.reason}
            </div>
          )}

          {/* Drone selector */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Drone / Equipment <span className="font-normal normal-case">(optional)</span></label>
            <select className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              value={allocForm.drone_id} onChange={e => setAllocForm({ ...allocForm, drone_id: e.target.value })}>
              <option value="">— No drone —</option>
              {drones.map(d => (
                <option key={d.id} value={d.id} disabled={d.status !== 'active'}>
                  {d.name || d.serial_number}{d.status !== 'active' ? ` (${d.status})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" label="Start Date" value={allocForm.start_date} onChange={e => setAllocForm({ ...allocForm, start_date: e.target.value })} />
            <Input type="date" label="End Date" value={allocForm.end_date} onChange={e => setAllocForm({ ...allocForm, end_date: e.target.value })} />
          </div>

          {/* Primary / Secondary */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Allocation Type</label>
            <div className="flex gap-2">
              {[true, false].map(val => (
                <button key={String(val)} type="button"
                  onClick={() => setAllocForm({ ...allocForm, is_primary: val })}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${allocForm.is_primary === val ? 'bg-primary text-on-primary border-primary' : 'bg-transparent text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                  {val ? 'Primary' : 'Secondary'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setAllocModal(false)}>Cancel</Button>
            <Button icon="check" onClick={handleAddAllocation}>Confirm Allocation</Button>
          </div>
        </div>
      </Modal>

      {/* Conflict-override modal (PRD §6.7) */}
      <Modal isOpen={!!conflictModal} onClose={() => setConflictModal(null)} title="Resource Conflict Detected">
        {conflictModal && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <span className="material-symbols-outlined text-amber-600">warning</span>
              <p className="text-sm text-amber-800">{conflictModal.message}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Conflicts ({conflictModal.conflicts.length})</p>
              <ul className="space-y-1.5 text-sm">
                {conflictModal.conflicts.map((c, i) => {
                  const label = {
                    pilot: 'Pilot is already booked on another project in this window',
                    copilot: 'Co-Pilot is already booked on another project in this window',
                    drone: 'Drone is already booked on another project in this window',
                    pilot_leave: 'Pilot is on approved leave during these dates',
                    pilot_training: 'Pilot is in training during these dates',
                    copilot_leave: 'Co-Pilot is on approved leave during these dates',
                    copilot_training: 'Co-Pilot is in training during these dates',
                    pilot_license_expiring_during_allocation: 'Pilot license expires during the allocation window — flight legality risk',
                    copilot_license_expiring_during_allocation: 'Co-Pilot license expires during the allocation window — flight legality risk',
                    drone_maintenance: 'Drone scheduled maintenance falls in this window',
                    drone_insurance_expired: 'Drone insurance has expired',
                  }[c.type] || c.type;
                  return (
                    <li key={i} className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <span className="material-symbols-outlined text-red-500 text-base mt-0.5">error</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-900">{label}</p>
                        {c.expiry_date && <p className="text-[11px] text-slate-500 mt-0.5">Expired: {String(c.expiry_date).slice(0, 10)}</p>}
                        {c.maintenance_date && <p className="text-[11px] text-slate-500 mt-0.5">Scheduled: {String(c.maintenance_date).slice(0, 10)}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
                Override Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                placeholder="Explain why this conflict is acceptable (logged for audit) — min 5 characters"
                className="w-full bg-surface border border-slate-200 rounded-lg p-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">This reason is permanently recorded against the allocation in the audit log.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setConflictModal(null)} disabled={overrideSubmitting}>Cancel</Button>
              <Button
                variant="danger"
                onClick={handleOverrideAllocation}
                disabled={overrideSubmitting || overrideReason.trim().length < 5}
                icon="warning"
              >
                {overrideSubmitting ? 'Submitting…' : 'Override & Allocate'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Allocation Modal */}
      <Modal isOpen={editAllocModal} onClose={() => setEditAllocModal(false)} title="Edit Allocation">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Update the pilot, co-pilot, drone, or date window for this allocation.</p>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Pilot <span className="font-normal normal-case">(optional)</span></label>
            <select className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              value={editAllocForm.pilot_id} onChange={e => setEditAllocForm({ ...editAllocForm, pilot_id: e.target.value })}>
              <option value="">— No pilot —</option>
              {pilots.map(p => (
                <option key={p.id} value={p.id} disabled={p.status !== 'active'}>
                  {p.name}{p.status !== 'active' ? ` (${p.status})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-violet-600 mb-1.5 block">Co-Pilot <span className="font-normal normal-case text-slate-500">(optional)</span></label>
            <select className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
              value={editAllocForm.copilot_id} onChange={e => setEditAllocForm({ ...editAllocForm, copilot_id: e.target.value })}>
              <option value="">— No co-pilot —</option>
              {copilots.map(p => (
                <option key={p.id} value={p.id} disabled={p.status !== 'active'}>
                  {p.name}{p.status !== 'active' ? ` (${p.status})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Drone / Equipment <span className="font-normal normal-case">(optional)</span></label>
            <select className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              value={editAllocForm.drone_id} onChange={e => setEditAllocForm({ ...editAllocForm, drone_id: e.target.value })}>
              <option value="">— No drone —</option>
              {drones.map(d => (
                <option key={d.id} value={d.id} disabled={d.status !== 'active'}>
                  {d.name || d.serial_number}{d.status !== 'active' ? ` (${d.status})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" label="Start Date" value={editAllocForm.start_date} onChange={e => setEditAllocForm({ ...editAllocForm, start_date: e.target.value })} />
            <Input type="date" label="End Date" value={editAllocForm.end_date} onChange={e => setEditAllocForm({ ...editAllocForm, end_date: e.target.value })} />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Allocation Type</label>
            <div className="flex gap-2">
              {[true, false].map(val => (
                <button key={String(val)} type="button"
                  onClick={() => setEditAllocForm({ ...editAllocForm, is_primary: val })}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${editAllocForm.is_primary === val ? 'bg-primary text-on-primary border-primary' : 'bg-transparent text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                  {val ? 'Primary' : 'Secondary'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditAllocModal(false)} disabled={editAllocSaving}>Cancel</Button>
            <Button icon="save" onClick={handleEditAllocation} disabled={editAllocSaving} isLoading={editAllocSaving}>
              {editAllocSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Team Pilot Modal */}
      <Modal isOpen={teamPilotModal} onClose={() => setTeamPilotModal(false)} title="Add Pilot to Project Team">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Add a pilot as a project team member. They'll get access to this project and appear as a team pilot without a date-range allocation.</p>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Select Pilot</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              value={teamPilotUserId}
              onChange={e => setTeamPilotUserId(e.target.value)}
            >
              <option value="">— Choose a pilot —</option>
              {allPilotUsers
                .filter(p => !allocations?.some(a => a.pilot_member_user_id === p.user_id || a.pilot_id === p.id))
                .map(p => (
                  <option key={p.id} value={p.user_id} disabled={p.status !== 'active'}>
                    {p.name}{p.status !== 'active' ? ` (${p.status})` : ''} — {p.license_number || 'No license'}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setTeamPilotModal(false)} disabled={teamPilotSaving}>Cancel</Button>
            <Button icon="person_add" onClick={handleAddTeamPilot} disabled={teamPilotSaving || !teamPilotUserId} isLoading={teamPilotSaving}>
              {teamPilotSaving ? 'Adding…' : 'Add to Team'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Team Co-Pilot Modal */}
      <Modal isOpen={teamCopilotModal} onClose={() => setTeamCopilotModal(false)} title="Add Co-Pilot to Project Team">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Add a co-pilot as a project crew member. They will appear as a team co-pilot without a date-range allocation.</p>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-violet-600 mb-1.5 block">Select Co-Pilot</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
              value={teamCopilotUserId}
              onChange={e => setTeamCopilotUserId(e.target.value)}
            >
              <option value="">— Choose a co-pilot —</option>
              {allCopilotUsers
                .filter(p => !allocations?.some(a => a.pilot_member_user_id === p.user_id || a.copilot_id === p.id))
                .map(p => (
                  <option key={p.id} value={p.user_id} disabled={p.status !== 'active'}>
                    {p.name}{p.status !== 'active' ? ` (${p.status})` : ''} — {p.license_number || 'No license'}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setTeamCopilotModal(false)} disabled={teamCopilotSaving}>Cancel</Button>
            <Button icon="group_add" onClick={handleAddTeamCopilot} disabled={teamCopilotSaving || !teamCopilotUserId} isLoading={teamCopilotSaving}>
              {teamCopilotSaving ? 'Adding…' : 'Add to Team'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Team Drone Modal */}
      <Modal isOpen={teamDroneModal} onClose={() => setTeamDroneModal(false)} title="Add Drone to Project Team">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">Assign a drone to this project as team equipment. This does not set a date range — use "Allocate Resources" for date-bounded assignments.</p>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Select Drone</label>
            <select
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              value={teamDroneId}
              onChange={e => setTeamDroneId(e.target.value)}
            >
              <option value="">— Choose a drone —</option>
              {drones
                .filter(d => !allocations?.some(a => a.drone_id === d.id))
                .map(d => (
                  <option key={d.id} value={d.id} disabled={d.status !== 'active'}>
                    {d.name || d.serial_number}{d.status !== 'active' ? ` (${d.status})` : ''}{d.model ? ` — ${d.model}` : ''}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setTeamDroneModal(false)} disabled={teamDroneSaving}>Cancel</Button>
            <Button icon="flight_takeoff" onClick={handleAddTeamDrone} disabled={teamDroneSaving || !teamDroneId} isLoading={teamDroneSaving}>
              {teamDroneSaving ? 'Adding…' : 'Add to Team'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={memberModal} onClose={() => setMemberModal(false)} title="Add Member">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">User</label>
            <select className="w-full bg-surface border border-slate-200 text-slate-900 rounded p-2 text-sm"
              value={memberForm.user_id} onChange={e => setMemberForm({ ...memberForm, user_id: e.target.value })}>
              <option value="">Select User</option>
              {users.filter(u => !(members||[]).some(m => m.user_id === u.id)).map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Project Role</label>
            <select className="w-full bg-surface border border-slate-200 text-slate-900 rounded p-2 text-sm"
              value={memberForm.role} onChange={e => setMemberForm({ ...memberForm, role: e.target.value })}>
              <option value="project_manager">Project Manager</option>
              <option value="admin">Admin</option>
              <option value="pilot">Pilot</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <Button className="w-full" onClick={handleAddMember} disabled={addingMember}>
            {addingMember ? 'Adding…' : 'Add to Team'}
          </Button>
        </div>
      </Modal>

      {/* ── Edit Member Role Modal ──────────────────────────── */}
      <Modal isOpen={!!editRoleTarget} onClose={() => setEditRoleTarget(null)} title="Change Member Role">
        {editRoleTarget && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Changing role for <strong>{editRoleTarget.name}</strong></p>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Project Role</label>
              <select
                className="w-full bg-surface border border-slate-200 text-slate-900 rounded-lg p-2 text-sm"
                value={editRoleValue}
                onChange={e => setEditRoleValue(e.target.value)}
              >
                <option value="project_manager">Project Manager</option>
                <option value="admin">Admin</option>
                <option value="pilot">Pilot</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleEditRoleSave} disabled={editRoleSaving}>
                {editRoleSaving ? 'Saving…' : 'Update Role'}
              </Button>
              <Button className="flex-1" variant="secondary" onClick={() => setEditRoleTarget(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reject deliverable modal */}
      <Modal isOpen={rejectModal} onClose={() => { setRejectModal(false); setRejectReason(''); setRejectTarget(null); setRejectError(''); }} title="Reject Deliverable">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Provide a reason so the pilot knows what needs to be corrected.</p>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              className={`w-full bg-surface border rounded p-2 min-h-[80px] resize-y focus:outline-none text-sm text-slate-900 ${rejectError ? 'border-red-400 focus:border-red-500' : 'border-slate-200 focus:border-slate-400'}`}
              placeholder="e.g. File is corrupted, wrong area covered, resolution too low..."
              value={rejectReason}
              onChange={e => { setRejectReason(e.target.value); if (e.target.value.trim()) setRejectError(''); }}
            />
            {rejectError && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">error</span>
                {rejectError}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" variant="danger" icon="close" onClick={handleReject} disabled={!rejectReason.trim()}>Confirm Reject</Button>
            <Button className="flex-1" variant="secondary" onClick={() => { setRejectModal(false); setRejectReason(''); setRejectTarget(null); }}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Edit Document Modal ─────────────────────────────── */}
      <Modal isOpen={editDocModal} onClose={() => setEditDocModal(false)} title="Edit Document">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">File Name</label>
            <input
              type="text"
              className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-primary/60"
              value={editDocForm.file_name}
              onChange={e => setEditDocForm(f => ({ ...f, file_name: e.target.value }))}
              placeholder="e.g. Survey_Report_v2.pdf"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Category</label>
            <select
              className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-primary/60"
              value={editDocForm.category}
              onChange={e => setEditDocForm(f => ({ ...f, category: e.target.value }))}
            >
              {/* Keep whatever the document already has (e.g. a legacy category)
                  selectable so saving the file name can't silently re-file it. */}
              {[...new Set([
                ...DOCUMENT_CATEGORIES,
                ...(editDocForm.category ? [editDocForm.category] : []),
              ])].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {isRestrictedDocCategory(editDocForm.category) && (
              <p className="flex items-start gap-1.5 mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                <span className="material-symbols-outlined text-sm leading-none mt-px">lock</span>
                Restricted: once saved, only admins and this project's managers can
                see or download this document. Pilots will no longer see it listed.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleEditDocSave} disabled={editDocSaving || !editDocForm.file_name.trim()}>
              {editDocSaving ? 'Saving…' : 'Save Changes'}
            </Button>
            <Button className="flex-1" variant="secondary" onClick={() => setEditDocModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Rename Deliverable Modal ─────────────────────────── */}
      <Modal isOpen={renameDelModal} onClose={() => setRenameDelModal(false)} title="Rename Deliverable">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Deliverable Name</label>
            <input
              type="text"
              className="w-full bg-surface border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-primary/60"
              value={renameDelName}
              onChange={e => setRenameDelName(e.target.value)}
              placeholder="e.g. Final_Survey_Ortho"
              onKeyDown={e => e.key === 'Enter' && handleRenameDelSave()}
            />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleRenameDelSave} disabled={renameDelSaving || !renameDelName.trim()}>
              {renameDelSaving ? 'Saving…' : 'Rename'}
            </Button>
            <Button className="flex-1" variant="secondary" onClick={() => setRenameDelModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={scopeModal} onClose={() => setScopeModal(false)} title="Project Scope">
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-xs font-semibold tracking-wide text-slate-600">Scope Type</label>
            <select
              value={scopeForm.scope_type}
              onChange={e => setScopeForm({ ...scopeForm, scope_type: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 hover:bg-surface focus:bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none rounded-xl py-2.5 px-4 text-sm text-slate-900 transition-all"
            >
              <option value="">Select scope type…</option>
              {projectTypes.map(t => <option key={t.value} value={t.label}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Area (ha)" type="number" step="0.01" value={scopeForm.area_hectares} onChange={e => setScopeForm({ ...scopeForm, area_hectares: e.target.value })} />
            <Input label="Length (km)" type="number" step="0.01" value={scopeForm.length_km} onChange={e => setScopeForm({ ...scopeForm, length_km: e.target.value })} />
          </div>
          <Input label="Asset Count" type="number" value={scopeForm.asset_count} onChange={e => setScopeForm({ ...scopeForm, asset_count: e.target.value })} />
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Special Instructions</label>
            <textarea className="w-full bg-surface border border-slate-200 text-slate-900 rounded p-2 min-h-[80px] resize-y focus:outline-none focus:border-white/30" placeholder="Site access notes, safety requirements..."
              value={scopeForm.special_instructions} onChange={e => setScopeForm({ ...scopeForm, special_instructions: e.target.value })} />
          </div>
          <Button className="w-full" onClick={handleScopeSubmit}>Save Scope</Button>
        </div>
      </Modal>

      {/* Complete project — invoice required */}
      <Modal isOpen={completeModal} onClose={() => { if (!completing) { setCompleteModal(false); setInvoiceFile(null); } }} title="Complete Project">
        <div className="space-y-5">
          <div className="flex gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
            <span className="material-symbols-outlined text-emerald-500 text-xl shrink-0 mt-0.5">task_alt</span>
            <div>
              <p className="text-sm font-bold text-emerald-700 mb-1">Mark this project as Complete</p>
              <p className="text-xs text-emerald-700/80 leading-relaxed">
                Completion is final and cannot be reversed. An invoice document must be on record for this project.
              </p>
            </div>
          </div>

          {existingInvoiceCount > 0 && (
            <div className="flex gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <span className="material-symbols-outlined text-blue-500 text-lg shrink-0">receipt_long</span>
              <p className="text-xs text-blue-700 leading-relaxed">
                <strong>{existingInvoiceCount} invoice{existingInvoiceCount > 1 ? 's' : ''} already on file</strong> for this project — you can complete it right away. Attach a file below only if you want to add another.
              </p>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">
              Invoice File {existingInvoiceCount > 0
                ? <span className="text-slate-400 normal-case tracking-normal font-normal">(optional — one is already on file)</span>
                : <span className="text-red-500">*</span>}
            </label>
            <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${invoiceFile ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 hover:border-primary/40 bg-slate-50'}`}>
              <span className="material-symbols-outlined text-3xl text-slate-400">{invoiceFile ? 'description' : 'upload_file'}</span>
              <p className="text-sm font-semibold text-slate-700">{invoiceFile ? invoiceFile.name : 'Click to attach invoice'}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">PDF, JPG or PNG</p>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" icon="task_alt"
              onClick={handleComplete}
              disabled={completing || existingInvoiceCount === null || (!invoiceFile && !existingInvoiceCount)}>
              {completing ? 'Completing…' : 'Confirm Complete'}
            </Button>
            <Button className="flex-1" variant="secondary" onClick={() => { setCompleteModal(false); setInvoiceFile(null); }} disabled={completing}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel project — reason required → archives */}
      <Modal isOpen={cancelModal} onClose={() => { if (!cancelling) { setCancelModal(false); setCancelReason(''); } }} title="Cancel Project">
        <div className="space-y-5">
          <div className="flex gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
            <span className="material-symbols-outlined text-red-400 text-xl shrink-0 mt-0.5">warning</span>
            <div>
              <p className="text-sm font-bold text-red-700 mb-1">This will cancel and archive the project</p>
              <p className="text-xs text-red-600 leading-relaxed">
                The project moves to <span className="font-bold">Cancelled</span> and is archived. All data is preserved. This cannot be undone.
              </p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 block">Cancellation Reason <span className="text-red-500">*</span></label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Why is this project being cancelled? (recorded in the audit log)"
              className="w-full bg-surface border border-slate-200 rounded-lg p-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button className="flex-1" variant="danger" icon="cancel"
              onClick={handleCancel} disabled={cancelling || !cancelReason.trim()}>
              {cancelling ? 'Cancelling…' : 'Confirm Cancellation'}
            </Button>
            <Button className="flex-1" variant="secondary" onClick={() => { setCancelModal(false); setCancelReason(''); }} disabled={cancelling}>
              Keep Project
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProjectDetail;
