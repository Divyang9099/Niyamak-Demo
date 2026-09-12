import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../context/ToastContext';
import { useDialog } from '../../../context/DialogContext';
import { downloadFile } from '../../../utils/download';
import { getDashboard, getClients, getStats, getSectors, deleteClient } from '../api/bd.api';
import { BDSectorSection } from '../components/BDSectorSection';
import { BDClientCard } from '../components/BDClientCard';
import { BDClientTable } from '../components/BDClientTable';
import { BDFilterBar } from '../components/BDFilterBar';
import { BDStatsTiles } from '../components/BDStatsTiles';
import { BDPriorityChart } from '../components/BDPriorityChart';
import { BDSectorChart } from '../components/BDSectorChart';
import { BDHowThisWorks } from '../components/BDHowThisWorks';
import { BDFollowUpsPanel } from '../components/BDFollowUpsPanel';
import { BDSettingsPanel } from '../components/BDSettingsPanel';

const VIEW_STORAGE_KEY = 'bd_view_mode';

export const BDHome = () => {
  const { showToast } = useToast();
  const { confirmDialog } = useDialog();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab = searchParams.get('tab') === 'followups' ? 'followups' : 'clients';
  const setTab = (t) => setSearchParams(prev => {
    const next = new URLSearchParams(prev);
    t === 'clients' ? next.delete('tab') : next.set('tab', t);
    return next;
  }, { replace: true });

  const [view, setView] = useState(() => localStorage.getItem(VIEW_STORAGE_KEY) || 'board');
  useEffect(() => { localStorage.setItem(VIEW_STORAGE_KEY, view); }, [view]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showInsights, setShowInsights] = useState(false);

  const [sectors, setSectors] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState(null);
  const [stageFilter, setStageFilter] = useState(null);

  const [sections, setSections] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadStats = useCallback(() => { getStats().then(r => setStats(r.data.data)).catch(() => {}); }, []);

  useEffect(() => {
    getSectors({ active_only: 'true' }).then(r => setSectors(r.data.data || [])).catch(() => {});
    loadStats();
  }, [loadStats]);

  const effectiveParams = useMemo(
    () => filters ? { ...filters, status: stageFilter || filters.status || undefined } : null,
    [filters, stageFilter]
  );

  const loadBoard = useCallback(async (params) => {
    setLoading(true);
    try {
      const res = await getDashboard(params);
      setSections(res.data.data.sections || []);
      setUnassigned(res.data.data.unassigned || []);
    } catch {
      showToast('Failed to load dashboard', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadTable = useCallback(async (params) => {
    setLoading(true);
    try {
      const res = await getClients({ ...params, limit: 200 });
      setClients(res.data.data || []);
    } catch {
      showToast('Failed to load BD clients', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!effectiveParams || tab !== 'clients') return;
    view === 'board' ? loadBoard(effectiveParams) : loadTable(effectiveParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveParams, view, tab]);

  // Generated server-side (bd.export.service.js) as a styled, nested-by-company
  // .xlsx — independent of view/loaded state so it works the same from Board
  // or Table, and reflects whatever filters are currently active.
  const handleExport = async () => {
    setExporting(true);
    try {
      const qs = new URLSearchParams(
        Object.entries(effectiveParams || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
      ).toString();
      await downloadFile(`/bd/clients/export/excel${qs ? `?${qs}` : ''}`, 'niyamak-bd-clients.xlsx');
    } catch {
      showToast('Failed to export', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleClientChanged = (updated) => {
    setClients(cs => cs.map(c => c.id === updated.id ? { ...c, ...updated } : c));
    loadStats();
  };

  const handleDelete = async (c) => {
    if (!(await confirmDialog({
      title: 'Delete Client',
      message: `Delete "${c.name}"? This removes it from the pipeline — contacts, touchpoints, and follow-ups are kept but no longer reachable from this list.`,
      danger: true,
      confirmLabel: 'Delete',
    }))) return;
    try {
      await deleteClient(c.id);
      showToast('Client deleted');
      setClients(cs => cs.filter(x => x.id !== c.id));
      loadStats();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to delete client', 'error');
    }
  };

  const hasFilters = !!(filters && (filters.search || filters.sector || filters.priority || filters.status || filters.followup || stageFilter));
  const totalBoardClients = sections.reduce((n, s) => n + (s.clients?.length || 0), 0) + unassigned.length;
  const trulyEmpty = tab === 'clients' && view === 'board' && totalBoardClients === 0 && !hasFilters;
  const resultCount = view === 'table' ? clients.length : totalBoardClients;

  return (
    <div className="space-y-6 animate-fade-in pb-24">
      <PageHeader
        eyebrow="Pipeline Management"
        title="Business Development"
        description="Monitor lead generation, track engagement phases, and accelerate prospective deals."
        actions={
          <div className="flex items-center gap-2.5">
            <Button 
              variant="secondary" 
              icon={showInsights ? 'analytics' : 'insert_chart'} 
              onClick={() => setShowInsights(!showInsights)}
            >
              {showInsights ? 'Hide Insights' : 'Show Insights'}
            </Button>
            <Button variant="secondary" icon="settings" aria-label="Settings" onClick={() => setSettingsOpen(true)} />
            <Button icon="add" onClick={() => navigate('/bd/clients/new')}>New Client</Button>
          </div>
        }
      />

      <BDHowThisWorks />

      {/* Main Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {[
          { key: 'clients', label: 'Lead Pipeline', icon: 'grid_view' },
          { key: 'followups', label: 'Follow-ups Schedule', icon: 'calendar_month', badge: stats?.followups_due }
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-4 py-3 text-xs font-bold flex items-center gap-2 border-b-2 transition-all duration-200 -mb-px rounded-t-xl select-none',
              tab === t.key ? 'border-primary text-primary bg-primary-light/30' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            )}
          >
            <span className="material-symbols-outlined text-base">{t.icon}</span>
            <span>{t.label}</span>
            {!!t.badge && (
              <span className="text-[10px] font-black bg-red-100 text-red-600 rounded-full px-2 py-0.5 animate-pulse">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'followups' ? (
        <BDFollowUpsPanel />
      ) : (
        <>
          {/* ── Status Command Bar (KPI Tiles) ── */}
          <div className="space-y-4">
            <BDStatsTiles
              stats={stats}
              activeStatus={stageFilter}
              onSelectStatus={setStageFilter}
              onFollowupsClick={() => setTab('followups')}
            />

            {/* Collapsible Analytics Charts */}
            {showInsights && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-slide-up">
                <BDPriorityChart stats={stats} />
                <BDSectorChart stats={stats} />
              </div>
            )}
          </div>

          {/* ── Unified Filter & Control Bar ── */}
          <div className="p-4 rounded-2xl bg-surface border border-slate-200/80 shadow-soft space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1 min-w-[300px]">
                <BDFilterBar sectors={sectors} onChange={setFilters} />
              </div>

              <div className="flex items-center gap-3 shrink-0 self-start pt-0.5">
                <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setView('board')}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 select-none',
                      view === 'board' 
                        ? 'bg-surface text-slate-900 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    <span className="material-symbols-outlined text-base">grid_view</span>
                    Board
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('table')}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 select-none',
                      view === 'table' 
                        ? 'bg-surface text-slate-900 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    <span className="material-symbols-outlined text-base">table_rows</span>
                    Table
                  </button>
                </div>

                <p className="text-xs text-slate-400 font-bold whitespace-nowrap">
                  {resultCount} client{resultCount === 1 ? '' : 's'}
                </p>

                <Button variant="secondary" size="sm" icon="download" onClick={handleExport} isLoading={exporting}>
                  Export
                </Button>
              </div>
            </div>
          </div>

          {/* ── View Content (Board vs Table) ── */}
          {view === 'table' ? (
            <BDClientTable
              clients={clients}
              loading={loading}
              hasFilters={hasFilters}
              onDelete={handleDelete}
              onClientChanged={handleClientChanged}
            />
          ) : loading && !filters ? (
            <div className="py-24 text-center text-slate-400 text-sm font-semibold">Loading pipeline...</div>
          ) : trulyEmpty ? (
            <EmptyState
              icon="handshake"
              title="No leads yet — start building your pipeline"
              description="Add your first client to see it appear here, grouped by sector and priority."
              action={<Button icon="add" onClick={() => navigate('/bd/clients/new')}>Add your first client</Button>}
            />
          ) : totalBoardClients === 0 ? (
            <EmptyState icon="filter_alt_off" title="No clients match these filters" />
          ) : (
            <div className="space-y-6">
              {/* Unassigned Leads if any */}
              {unassigned.length > 0 && (
                <div className="border border-amber-200/80 rounded-2xl bg-amber-50/20 dark:bg-amber-950/10 p-4.5 shadow-soft">
                  <div className="flex items-center gap-2 mb-3.5 select-none">
                    <span className="material-symbols-outlined text-amber-600 text-lg">warning</span>
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      Unassigned Sector Leads ({unassigned.length})
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {unassigned.map(c => (
                      <BDClientCard key={c.id} client={c} onClientChanged={loadStats} />
                    ))}
                  </div>
                </div>
              )}

              {/* Sector Board — one full-width row per sector, stacked vertically */}
              <div className="space-y-4.5">
                {sections.map(s => (
                  <BDSectorSection key={s.key} section={s} onClientChanged={loadStats} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="Business Development Settings" className="max-w-2xl">
        <BDSettingsPanel />
      </Modal>
    </div>
  );
};

export default BDHome;
