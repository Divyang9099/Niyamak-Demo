import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

const STEPS = [
  {
    key: 'not_contacted',
    label: 'Not Contacted',
    badge: 'Step 1/3 • New Lead',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
  },
  {
    key: 'contacted',
    label: 'Contacted',
    badge: 'Step 2/3 • Outreach Active',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    key: 'replied',
    label: 'Replied',
    badge: 'Step 3/3 • Replied',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
];

const stepIndex = ({ touchpoint_count, has_responded }) => {
  if (has_responded) return 2;
  if (Number(touchpoint_count) > 0) return 1;
  return 0;
};

export const BDEngagementStepper = ({ client, className }) => {
  const current = stepIndex(client || {});
  const tpCount = Number(client?.touchpoint_count || 0);
  const hasReply = !!client?.has_responded;

  const [hovered, setHovered] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const tooltipHeight = 220;
      const isNearBottom = rect.bottom + tooltipHeight > window.innerHeight;
      const top = isNearBottom ? Math.max(10, rect.top - tooltipHeight - 8) : rect.bottom + 8;

      setCoords({
        top,
        left: Math.max(10, Math.min(rect.left, window.innerWidth - 300)),
      });
    }
    setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={clsx('inline-flex items-center gap-1.5 cursor-pointer py-1 select-none group', className)}
      >
        {/* Milestone Indicator */}
        <div className="flex items-center gap-1">
          {STEPS.map((step, i) => {
            const isCompleted = i < current;
            const isActive = i === current;

            return (
              <span
                key={step.key}
                className={clsx(
                  'h-1.5 rounded-full transition-all duration-300',
                  isActive && (
                    current === 2
                      ? 'w-4 bg-emerald-500 shadow-glow'
                      : current === 1
                        ? 'w-4 bg-amber-500 shadow-glow'
                        : 'w-4 bg-primary shadow-glow'
                  ),
                  isCompleted && 'w-2 bg-emerald-500',
                  !isActive && !isCompleted && 'w-1.5 bg-slate-200 dark:bg-slate-700'
                )}
                aria-hidden="true"
              />
            );
          })}
        </div>

        <span className={clsx(
          'text-[11px] font-extrabold transition-colors duration-200',
          current === 2
            ? 'text-emerald-600 dark:text-emerald-400'
            : current === 1
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-slate-500 dark:text-slate-400'
        )}>
          {STEPS[current].label}
        </span>
      </div>

      {/* Solid Clean White Popover */}
      {hovered && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            zIndex: 99999,
          }}
          className="w-72 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.16)] border border-slate-200 dark:border-slate-800 animate-scale-in pointer-events-none select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-sm">rocket_launch</span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Outreach Pipeline
              </span>
            </div>
            <span className={clsx('text-[9px] font-black px-2 py-0.5 rounded-full border', STEPS[current].badgeClass)}>
              {STEPS[current].badge}
            </span>
          </div>

          {/* Timeline Steps */}
          <div className="relative pl-7 space-y-3 my-1">
            {/* Vertical Track Line */}
            <div className="absolute left-[11px] top-2.5 bottom-2.5 w-0.5 bg-slate-200 dark:bg-slate-700 rounded-full" />

            {/* Step 1: Lead Identified */}
            <div className="relative flex flex-col">
              <div className="absolute -left-7 top-0 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[11px] font-black shadow-sm ring-2 ring-white dark:ring-slate-900">
                ✓
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900 dark:text-white">1. Lead Identified</p>
                <span className="text-[9px] text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded">Active</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Profile & company contacts created</p>
            </div>

            {/* Step 2: Outreach Logged */}
            <div className="relative flex flex-col">
              <div className={clsx(
                'absolute -left-7 top-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ring-2 ring-white dark:ring-slate-900 transition-all',
                current >= 1
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700'
              )}>
                {current >= 1 ? '✓' : '2'}
              </div>
              <div className="flex items-center justify-between">
                <p className={clsx('text-xs font-bold', current >= 1 ? 'text-slate-900 dark:text-white' : 'text-slate-400')}>
                  2. Outreach Logged
                </p>
                {tpCount > 0 && (
                  <span className="text-[9px] text-amber-700 dark:text-amber-300 font-black bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">
                    {tpCount} Logged
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {tpCount > 0 ? `${tpCount} interaction(s) recorded` : 'No touchpoints recorded yet'}
              </p>
            </div>

            {/* Step 3: Client Replied */}
            <div className="relative flex flex-col">
              <div className={clsx(
                'absolute -left-7 top-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ring-2 ring-white dark:ring-slate-900 transition-all',
                current >= 2
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700'
              )}>
                {current >= 2 ? '✓' : '3'}
              </div>
              <div className="flex items-center justify-between">
                <p className={clsx('text-xs font-bold', current >= 2 ? 'text-slate-900 dark:text-white' : 'text-slate-400')}>
                  3. Client Replied
                </p>
                <span className={clsx(
                  'text-[9px] font-black px-1.5 py-0.5 rounded border',
                  hasReply
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                )}>
                  {hasReply ? 'Received' : 'Pending'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {hasReply ? 'Response confirmed on communication log' : 'Waiting for prospect to answer'}
              </p>
            </div>
          </div>

          {/* Solid Clean Footer Hint */}
          <div className={clsx(
            'mt-3 pt-2 text-[10.5px] rounded-xl px-3 py-2 flex items-center gap-2 font-medium border',
            current === 0 && 'bg-blue-50/70 text-blue-800 border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/40',
            current === 1 && 'bg-amber-50/70 text-amber-800 border-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40',
            current === 2 && 'bg-emerald-50/70 text-emerald-800 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40'
          )}>
            <span className="material-symbols-outlined text-sm shrink-0">
              {current === 2 ? 'verified' : current === 1 ? 'schedule' : 'tips_and_updates'}
            </span>
            <p className="leading-tight text-[10.5px]">
              {current === 0 && 'Send an email or log a call to initiate outreach.'}
              {current === 1 && 'Outreach in progress. Follow up if response is overdue.'}
              {current === 2 && 'Prospect engaged! Proceed with deal qualification.'}
            </p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default BDEngagementStepper;
