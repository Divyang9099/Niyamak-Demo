import { useState } from 'react';
import clsx from 'clsx';
import { updateClientStatus } from '../api/bd.api';
import { useToast } from '../../../context/ToastContext';

const PIPELINE_STAGES = [
  {
    key: 'to_be_initiated',
    label: 'To Be Initiated',
    sub: 'Lead Identified',
    icon: 'flag',
    stepNumber: 1,
    activeClass: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 ring-1 ring-white/20',
  },
  {
    key: 'wip',
    label: 'In Discussion (WIP)',
    sub: 'Outreach & Discovery',
    icon: 'trending_up',
    stepNumber: 2,
    activeClass: 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/35 ring-1 ring-white/20',
  },
  {
    key: 'closed_onboard',
    label: 'Onboarded',
    sub: 'Converted Client',
    icon: 'verified',
    stepNumber: 3,
    activeClass: 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/35 ring-1 ring-white/20',
  },
];

const STAGE_INDEX = {
  to_be_initiated: 0,
  wip: 1,
  closed_onboard: 2,
};

export const BDPipelineStepper = ({ client, onClientChanged, className }) => {
  const { showToast } = useToast();
  const [updating, setUpdating] = useState(false);
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const currentStatus = client?.status || 'to_be_initiated';
  const isCancelled = currentStatus === 'closed_cancelled';
  const activeIndex = isCancelled ? -1 : (STAGE_INDEX[currentStatus] ?? 0);

  const handleStageClick = async (targetStage, reason = '') => {
    if (targetStage === currentStatus && !isCancelled) return;
    if (targetStage === 'closed_cancelled' && !reason.trim()) {
      setShowCancelPrompt(true);
      return;
    }

    setUpdating(true);
    try {
      await updateClientStatus(client.id, {
        status: targetStage,
        status_reason: reason.trim() || undefined,
      });

      const updated = {
        ...client,
        status: targetStage,
        status_reason: reason.trim() || null,
      };

      onClientChanged?.(updated);
      showToast(
        targetStage === 'closed_onboard'
          ? '🎉 Client marked as Onboarded!'
          : targetStage === 'closed_cancelled'
            ? 'Client moved to Cancelled.'
            : 'Pipeline stage updated successfully.',
        'success'
      );
      setShowCancelPrompt(false);
      setCancelReason('');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Failed to update stage', 'error');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className={clsx('bg-surface border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-2 shadow-card transition-all', className)}>
      {/* Cancellation Prompt Modal / Inline Dialog */}
      {showCancelPrompt ? (
        <div className="flex items-center gap-3 px-3 py-2 animate-fade-in flex-wrap">
          <span className="text-xs font-extrabold text-red-600 flex items-center gap-1.5 shrink-0">
            <span className="material-symbols-outlined text-base">cancel</span>
            Reason for Cancelling:
          </span>
          <input
            type="text"
            autoFocus
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g. Budget constraints, opted for competitor, project deferred..."
            className="flex-1 min-w-[220px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/10 text-slate-900"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowCancelPrompt(false); setCancelReason(''); }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!cancelReason.trim() || updating}
              onClick={() => handleStageClick('closed_cancelled', cancelReason)}
              className="px-4 py-1.5 rounded-xl text-xs font-black text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all disabled:opacity-40"
            >
              {updating ? 'Saving…' : 'Confirm Cancellation'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Continuous Connected Chevron Pipeline Ribbon */}
          <div className="flex items-center flex-1 min-w-0 bg-slate-100/80 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/50 gap-1 overflow-x-auto">
            {PIPELINE_STAGES.map((stage, idx) => {
              const isCurrent = currentStatus === stage.key;
              const isPast = !isCancelled && activeIndex > idx;
              const isFuture = !isCancelled && activeIndex < idx;

              return (
                <button
                  key={stage.key}
                  type="button"
                  disabled={updating}
                  onClick={() => handleStageClick(stage.key)}
                  title={`Transition to ${stage.label}`}
                  className={clsx(
                    'group relative flex-1 min-w-[135px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-extrabold transition-all duration-300 select-none cursor-pointer',
                    isCurrent && stage.activeClass,
                    isPast && [
                      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20',
                      'hover:bg-emerald-500/20 hover:border-emerald-500/30',
                    ],
                    (isFuture || isCancelled) && [
                      'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200',
                      'hover:bg-white/70 dark:hover:bg-slate-800/70 border border-transparent',
                    ]
                  )}
                >
                  {/* Step Node Icon / Number */}
                  <span
                    className={clsx(
                      'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 transition-transform duration-200',
                      isCurrent && 'bg-white/25 text-white scale-110 shadow-sm',
                      isPast && 'bg-emerald-500 text-white shadow-sm',
                      (isFuture || isCancelled) && 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 group-hover:bg-primary/20 group-hover:text-primary'
                    )}
                  >
                    {isPast ? (
                      <span className="material-symbols-outlined text-[13px]">check</span>
                    ) : isCurrent ? (
                      <span className="material-symbols-outlined text-[13px]">{stage.icon}</span>
                    ) : (
                      stage.stepNumber
                    )}
                  </span>

                  {/* Stage Title */}
                  <span className="truncate tracking-tight">
                    {stage.label}
                  </span>

                  {/* Active Indicator Pulse Dot */}
                  {isCurrent && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping opacity-75 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Action: Cancel or Reopen */}
          <div className="flex items-center gap-2 shrink-0 px-1">
            {isCancelled ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 px-2.5 py-1 rounded-xl flex items-center gap-1.5" title={client?.status_reason}>
                  <span className="material-symbols-outlined text-sm">cancel</span>
                  <span>Cancelled {client?.status_reason ? `(${client.status_reason})` : ''}</span>
                </span>
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleStageClick('wip')}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-white text-xs font-bold shadow-sm hover:shadow-glow transition-all"
                >
                  <span className="material-symbols-outlined text-sm">replay</span>
                  Reopen Deal
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={updating}
                onClick={() => setShowCancelPrompt(true)}
                title="Mark deal as cancelled"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border border-transparent hover:border-red-200 transition-all"
              >
                <span className="material-symbols-outlined text-sm">cancel</span>
                <span className="hidden sm:inline">Cancel Deal</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BDPipelineStepper;
