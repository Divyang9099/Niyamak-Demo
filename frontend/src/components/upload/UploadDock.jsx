import { useState, useEffect, useMemo } from 'react';
import { useUploadStore, STATUS } from '../../store/upload.store';

// ── formatters ────────────────────────────────────────────────────────────────
const fmtBytes = (b) => {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / 1024 ** i).toFixed(1)} ${u[i]}`;
};
const fmtEta = (s) => {
  if (!s || !isFinite(s)) return '';
  if (s < 60) return `${Math.ceil(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};
const fmtDur = (ms) => {
  if (!ms || ms < 0) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

const STAGE_FLOW = ['Upload', 'Finalize', 'Process', 'Ready'];
const stageIndex = (status, processingStage) => {
  switch (status) {
    case STATUS.QUEUED: return -1;
    case STATUS.UPLOADING: case STATUS.PAUSED: return 0;
    case STATUS.PROCESSING: return processingStage === 'Finalizing…' ? 1 : 2;
    case STATUS.DONE: return 99;
    default: return -1;
  }
};

const Stepper = ({ status, processingStage }) => {
  const stage = stageIndex(status, processingStage);
  return (
    <div className="flex items-center gap-1 mt-1">
      {STAGE_FLOW.map((label, i) => {
        const isDone = stage === 99 || (stage >= 0 && i < stage);
        const isErr = status === STATUS.ERROR && i === 0;
        const isActive = stage !== 99 && i === stage && status !== STATUS.ERROR;
        return (
          <div key={label} className="flex items-center gap-1 flex-1 last:flex-none">
            <span className={`w-3.5 h-3.5 rounded-full grid place-items-center text-[7px] font-bold shrink-0 ${isDone ? 'bg-green-500 text-white' : isErr ? 'bg-red-500 text-white' : isActive ? 'bg-blue-500 text-white animate-pulse' : 'bg-slate-200 text-slate-400'}`}>{isDone ? '✓' : isErr ? '!' : i + 1}</span>
            <span className={`text-[8px] font-semibold uppercase tracking-wide ${isDone ? 'text-green-600' : isActive ? 'text-blue-600' : isErr ? 'text-red-500' : 'text-slate-400'}`}>{label}</span>
            {i < STAGE_FLOW.length - 1 && <span className={`flex-1 h-px min-w-[6px] ${isDone ? 'bg-green-300' : 'bg-slate-200'}`} />}
          </div>
        );
      })}
    </div>
  );
};

export default function UploadDock() {
  const itemsMap = useUploadStore((s) => s.items);
  const order    = useUploadStore((s) => s.order);
  const items    = useMemo(() => order.map((id) => itemsMap[id]).filter(Boolean), [order, itemsMap]);
  const clearFinished = useUploadStore((s) => s.clearFinished);
  const cancel = useUploadStore((s) => s.cancel);
  const retry  = useUploadStore((s) => s.retry);
  const remove = useUploadStore((s) => s.remove);
  const [collapsed, setCollapsed] = useState(false);
  const [, force] = useState(0);

  // Ensure the engine's global socket listener is attached (in case the dock
  // mounts before any uploader registers a scope).
  useEffect(() => { useUploadStore.getState()._initSocket(); }, []);

  // tick while active for live elapsed/eta
  useEffect(() => {
    const active = items.some((f) => f.status === STATUS.UPLOADING || f.status === STATUS.PROCESSING);
    if (!active) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [items]);

  if (!items.length) return null;

  const total = items.length;
  const done = items.filter((f) => f.status === STATUS.DONE).length;
  const failed = items.filter((f) => f.status === STATUS.ERROR).length;
  const active = items.filter((f) => f.status === STATUS.UPLOADING || f.status === STATUS.PROCESSING).length;
  const totalBytes = items.reduce((s, f) => s + (f.size || 0), 0);
  const uploadedB = items.reduce((s, f) => s + (f.size || 0) * Math.min(100, f.percent || 0) / 100, 0);
  const overallPct = totalBytes ? Math.round(uploadedB / totalBytes * 100) : 0;
  const totalSpeed = items.filter((f) => f.status === STATUS.UPLOADING).reduce((s, f) => s + (f.speed || 0), 0);
  const overallEta = totalSpeed > 0 ? (totalBytes - uploadedB) / totalSpeed : null;
  const allDone = total > 0 && active === 0;

  return (
    <div className="fixed bottom-4 right-4 z-[1400] w-[340px] max-w-[calc(100vw-2rem)] bg-surface border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900 text-white cursor-pointer" onClick={() => setCollapsed((c) => !c)}>
        <span className="material-symbols-outlined text-base">{allDone ? 'cloud_done' : 'cloud_upload'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold">{allDone ? `${done} uploaded${failed ? ` · ${failed} failed` : ''}` : `Uploading ${active} file${active !== 1 ? 's' : ''}…`}</p>
          <p className="text-[10px] text-slate-300 font-mono">{done}/{total} · {overallPct}%{totalSpeed > 0 && ` · ↑ ${fmtBytes(totalSpeed)}/s`}{overallEta != null && !allDone && ` · ~${fmtEta(overallEta)} left`}</p>
        </div>
        {allDone && <button onClick={(e) => { e.stopPropagation(); clearFinished(); }} title="Clear" className="p-1 rounded hover:bg-surface/10"><span className="material-symbols-outlined text-base">close</span></button>}
        <span className="material-symbols-outlined text-base">{collapsed ? 'expand_less' : 'expand_more'}</span>
      </div>

      <div className="h-1 bg-slate-100"><div className={`h-full transition-all duration-500 ${allDone ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${overallPct}%` }} /></div>

      {!collapsed && (
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
          {items.map((f) => {
            const elapsed = f.startedAt ? (f.completedAt || Date.now()) - f.startedAt : 0;
            return (
              <div key={f.id} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-800 truncate flex-1" title={f.relativePath || f.name}>{f.relativePath && f.relativePath !== f.name ? f.relativePath : f.name}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{fmtBytes(f.size)}</span>
                  {(f.status === STATUS.UPLOADING || f.status === STATUS.PAUSED) && <button onClick={() => cancel(f.id)} title="Cancel" className="p-0.5 rounded text-red-400 hover:bg-red-50"><span className="material-symbols-outlined text-sm">close</span></button>}
                  {f.status === STATUS.ERROR && <button onClick={() => retry(f.id)} title="Retry" className="p-0.5 rounded text-blue-400 hover:bg-blue-50"><span className="material-symbols-outlined text-sm">refresh</span></button>}
                  {(f.status === STATUS.DONE || f.status === STATUS.ERROR || f.status === STATUS.CANCELLED) && <button onClick={() => remove(f.id)} title="Remove" className="p-0.5 rounded text-slate-300 hover:text-slate-500"><span className="material-symbols-outlined text-sm">delete</span></button>}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                  {f.scopeLabel && <span className="text-slate-400">{f.scopeLabel}</span>}
                  {f.status === STATUS.UPLOADING && f.speed > 0 && <span className="text-blue-500 font-mono">{fmtBytes(f.speed)}/s</span>}
                  {(f.status === STATUS.UPLOADING || f.status === STATUS.PROCESSING) && elapsed > 0 && <span>{fmtDur(elapsed)}</span>}
                  {f.status === STATUS.DONE && <span className="text-green-600 font-bold">✓ Complete{elapsed > 0 ? ` · ${fmtDur(elapsed)}` : ''}</span>}
                  {f.status === STATUS.ERROR && <span className="text-red-500 truncate">{f.error || 'Failed'}</span>}
                  {f.status === STATUS.PAUSED && <span className="text-amber-500 font-bold">Paused</span>}
                  {f.status === STATUS.QUEUED && <span className="text-slate-400">Queued</span>}
                </div>
                <Stepper status={f.status} processingStage={f.processingStage} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
