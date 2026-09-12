/**
 * ChunkedUploader — drop-zone + in-page list for the GLOBAL upload manager.
 *
 * The upload engine and the File objects now live in upload.store.js (module
 * scope), so uploads keep running and the queue keeps draining even if this
 * component unmounts (navigation). This component just: (1) registers its target
 * scope + callbacks, (2) enqueues dropped files, (3) renders this scope's items.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useUploadStore, STATUS } from '../../store/upload.store';

// ── formatters ────────────────────────────────────────────────────────────────
const fmtBytes = (b) => {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / 1024 ** i).toFixed(1)} ${u[i]}`;
};
const fmtSpeed = (bps) => bps ? `${fmtBytes(bps)}/s` : '';
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
const activeStageIndex = (entry) => {
  switch (entry.status) {
    case STATUS.QUEUED:     return -1;
    case STATUS.UPLOADING:  return 0;
    case STATUS.PAUSED:     return 0;
    case STATUS.PROCESSING: return entry.processingStage === 'Finalizing…' ? 1 : 2;
    case STATUS.DONE:       return 99;
    default:                return -1;
  }
};

// virtual scroll
const VIRTUAL_THRESHOLD = 80, ITEM_HEIGHT = 96, LIST_HEIGHT = 384, OVERSCAN = 4;

// ── folder traversal (DataTransfer API) ──────────────────────────────────────
const readEntriesAll = (reader) => new Promise((resolve, reject) => {
  const all = [];
  const next = () => reader.readEntries((batch) => { if (!batch.length) resolve(all); else { all.push(...batch); next(); } }, reject);
  next();
});
const traverseEntry = async (fsEntry, pathPrefix = '') => {
  if (fsEntry.isFile) return new Promise((resolve, reject) => fsEntry.file((f) => { f._relativePath = pathPrefix + f.name; resolve([f]); }, reject));
  if (fsEntry.isDirectory) {
    const children = await readEntriesAll(fsEntry.createReader());
    const nested = await Promise.all(children.map((c) => traverseEntry(c, pathPrefix + fsEntry.name + '/')));
    return nested.flat();
  }
  return [];
};

export function ChunkedUploader({
  entityType = 'deliverable', projectId = null, entityId = null,
  accept = '*', multiple = true, onComplete = null, onError = null,
  disabled = false, label = 'Drag & drop files or folders here, or click to browse',
  extraMeta = {},
}) {
  const scopeKey = `${entityType}:${projectId || ''}:${entityId || ''}`;
  const [dragging, setDragging] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [now, setNow] = useState(Date.now());
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const listRef = useRef(null);
  const scrollRaf = useRef(null);

  // keep latest extraMeta/callbacks for the engine
  const extraMetaRef = useRef(extraMeta);  useEffect(() => { extraMetaRef.current = extraMeta; }, [extraMeta]);
  const onCompleteRef = useRef(onComplete); useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  const onErrorRef = useRef(onError);       useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const registerScope = useUploadStore((s) => s.registerScope);
  const enqueueStore  = useUploadStore((s) => s.enqueue);
  const pause   = useUploadStore((s) => s.pause);
  const resume  = useUploadStore((s) => s.resume);
  const cancel  = useUploadStore((s) => s.cancel);
  const retry   = useUploadStore((s) => s.retry);
  const remove  = useUploadStore((s) => s.remove);

  // register this drop-zone's target + callbacks with the global engine
  useEffect(() => {
    registerScope(scopeKey, {
      entityType, projectId, entityId,
      getExtraMeta: () => extraMetaRef.current,
      onComplete: (info) => onCompleteRef.current?.(info),
      onError: (err, file) => onErrorRef.current?.(err, file),
    });
  }, [scopeKey, entityType, projectId, entityId, registerScope]);

  // this scope's items
  const itemsMap = useUploadStore((s) => s.items);
  const order    = useUploadStore((s) => s.order);
  const files    = useMemo(() => order.map((id) => itemsMap[id]).filter((f) => f && f.scopeKey === scopeKey), [order, itemsMap, scopeKey]);

  // live clock for elapsed/eta
  useEffect(() => {
    const active = files.some((f) => f.status === STATUS.UPLOADING || f.status === STATUS.PROCESSING);
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [files]);

  const enqueue = useCallback((rawFiles) => {
    const arr = Array.from(rawFiles || []);
    if (arr.length) enqueueStore(arr, scopeKey);
  }, [enqueueStore, scopeKey]);

  const onDrop = useCallback(async (e) => {
    e.preventDefault(); setDragging(false);
    if (disabled) return;
    const dtItems = Array.from(e.dataTransfer.items || []);
    if (dtItems.length && typeof dtItems[0].webkitGetAsEntry === 'function') {
      const fsEntries = dtItems.map((i) => i.webkitGetAsEntry()).filter(Boolean);
      try {
        const allFiles = (await Promise.all(fsEntries.map((entry) => traverseEntry(entry)))).flat();
        if (allFiles.length) enqueue(allFiles);
      } catch { enqueue(e.dataTransfer.files); }
    } else enqueue(e.dataTransfer.files);
  }, [disabled, enqueue]);

  // ── summary ─────────────────────────────────────────────────────────────────
  const totalFiles = files.length;
  const doneFiles  = files.filter((f) => f.status === STATUS.DONE).length;
  const errorFiles = files.filter((f) => f.status === STATUS.ERROR).length;
  const activeFiles = files.filter((f) => f.status === STATUS.UPLOADING || f.status === STATUS.PROCESSING).length;
  const totalBytes = files.reduce((s, f) => s + (f.size || 0), 0);
  const totalSpeed = files.filter((f) => f.status === STATUS.UPLOADING).reduce((s, f) => s + (f.speed || 0), 0);

  const statusIcon = {
    [STATUS.QUEUED]: { icon: 'schedule', color: 'text-slate-500' },
    [STATUS.UPLOADING]: { icon: 'upload', color: 'text-blue-500' },
    [STATUS.PAUSED]: { icon: 'pause_circle', color: 'text-amber-500' },
    [STATUS.PROCESSING]: { icon: 'autorenew', color: 'text-purple-500' },
    [STATUS.DONE]: { icon: 'check_circle', color: 'text-green-500' },
    [STATUS.ERROR]: { icon: 'error', color: 'text-red-500' },
    [STATUS.CANCELLED]: { icon: 'cancel', color: 'text-slate-400' },
  };

  const renderItem = (entry) => {
    const si = statusIcon[entry.status] || statusIcon[STATUS.QUEUED];
    const isActive = entry.status === STATUS.UPLOADING || entry.status === STATUS.PROCESSING;
    const showPath = entry.relativePath !== entry.name;
    const stage = activeStageIndex(entry);
    const elapsed = entry.startedAt ? (entry.completedAt || now) - entry.startedAt : 0;
    const showStepper = entry.status !== STATUS.QUEUED && entry.status !== STATUS.CANCELLED;
    return (
      <div className="bg-surface border border-slate-200 rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-3">
          <span className={`material-symbols-outlined text-lg shrink-0 ${si.color} ${entry.status === STATUS.PROCESSING ? 'animate-spin' : ''}`}>{si.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate" title={entry.relativePath}>{showPath ? entry.relativePath : entry.name}</p>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 flex-wrap">
              <span>{fmtBytes(entry.size)}</span>
              {entry.status === STATUS.UPLOADING && entry.speed > 0 && (<><span>·</span><span className="text-blue-500 font-mono">{fmtSpeed(entry.speed)}</span>{entry.eta && <><span>·</span><span>~{fmtEta(entry.eta)} left</span></>}</>)}
              {(entry.status === STATUS.UPLOADING || entry.status === STATUS.PROCESSING) && elapsed > 0 && (<><span>·</span><span>{fmtDur(elapsed)} elapsed</span></>)}
              {entry.status === STATUS.DONE && <span className="text-green-600 font-bold">✓ Complete{elapsed > 0 ? ` · in ${fmtDur(elapsed)}` : ''}</span>}
              {entry.status === STATUS.PROCESSING && <span className="text-purple-500 font-bold">{entry.processingStage || 'Processing on server…'}</span>}
              {entry.status === STATUS.PAUSED && <span className="text-amber-500 font-bold">Paused</span>}
              {entry.status === STATUS.QUEUED && <span className="text-slate-400">Queued · waiting for a slot</span>}
              {entry.status === STATUS.ERROR && <span className="text-red-500 truncate max-w-[180px]">{entry.error}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {entry.status === STATUS.UPLOADING && <button onClick={() => pause(entry.id)} title="Pause" className="p-1.5 rounded text-amber-500 hover:bg-amber-50"><span className="material-symbols-outlined text-sm">pause</span></button>}
            {entry.status === STATUS.PAUSED && <button onClick={() => resume(entry.id)} title="Resume" className="p-1.5 rounded text-blue-500 hover:bg-blue-50"><span className="material-symbols-outlined text-sm">play_arrow</span></button>}
            {entry.status === STATUS.ERROR && <button onClick={() => retry(entry.id)} title="Retry" className="p-1.5 rounded text-blue-500 hover:bg-blue-50"><span className="material-symbols-outlined text-sm">refresh</span></button>}
            {(entry.status === STATUS.UPLOADING || entry.status === STATUS.PAUSED) && <button onClick={() => cancel(entry.id)} title="Cancel" className="p-1.5 rounded text-red-500 hover:bg-red-50"><span className="material-symbols-outlined text-sm">close</span></button>}
            {(entry.status === STATUS.DONE || entry.status === STATUS.ERROR || entry.status === STATUS.CANCELLED) && <button onClick={() => remove(entry.id)} title="Remove" className="p-1.5 rounded text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined text-sm">delete</span></button>}
          </div>
        </div>

        {showStepper && (
          <div className="flex items-center gap-1 pt-0.5">
            {STAGE_FLOW.map((lbl, i) => {
              const isDone = stage === 99 || (stage >= 0 && i < stage);
              const isErr = entry.status === STATUS.ERROR && i === 0;
              const isAct = stage !== 99 && i === stage && entry.status !== STATUS.ERROR;
              return (
                <div key={lbl} className="flex items-center gap-1 flex-1 last:flex-none">
                  <span className={`w-4 h-4 rounded-full grid place-items-center text-[8px] font-bold shrink-0 ${isDone ? 'bg-green-500 text-white' : isErr ? 'bg-red-500 text-white' : isAct ? 'bg-blue-500 text-white animate-pulse' : 'bg-slate-200 text-slate-400'}`}>{isDone ? '✓' : isErr ? '!' : i + 1}</span>
                  <span className={`text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap ${isDone ? 'text-green-600' : isAct ? 'text-blue-600' : isErr ? 'text-red-500' : 'text-slate-400'}`}>{lbl}</span>
                  {i < STAGE_FLOW.length - 1 && <span className={`flex-1 h-px min-w-[8px] ${isDone ? 'bg-green-300' : 'bg-slate-200'}`} />}
                </div>
              );
            })}
          </div>
        )}

        {(isActive || entry.status === STATUS.PAUSED) && (
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-300 ${entry.status === STATUS.PAUSED ? 'bg-amber-400' : entry.status === STATUS.PROCESSING ? 'bg-purple-400 animate-pulse' : 'bg-blue-500'}`} style={{ width: `${entry.percent}%` }} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center select-none transition-all ${dragging ? 'border-blue-400 bg-blue-500/10' : disabled ? 'border-slate-200 bg-slate-50 opacity-50' : 'border-slate-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-500/5'}`}>
        <span className={`material-symbols-outlined text-4xl mb-2 ${dragging ? 'text-blue-400' : 'text-slate-400'}`}>cloud_upload</span>
        <p className="text-slate-900 font-semibold text-sm mb-1">{label}</p>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">Files &amp; folders · All drone data formats</p>
        <div className="flex gap-2">
          <button type="button" disabled={disabled} onClick={() => !disabled && fileInputRef.current?.click()} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors">Browse Files</button>
          <button type="button" disabled={disabled} onClick={() => !disabled && folderInputRef.current?.click()} className="px-3 py-1.5 text-xs font-semibold bg-surface hover:bg-slate-50 disabled:opacity-50 text-slate-700 border border-slate-300 rounded-lg transition-colors">Browse Folder</button>
        </div>
        <input ref={fileInputRef} type="file" className="sr-only" multiple={multiple} accept={accept} disabled={disabled} onChange={(e) => { enqueue(e.target.files); e.target.value = ''; }} />
        <input ref={folderInputRef} type="file" className="sr-only" webkitdirectory="" multiple disabled={disabled} onChange={(e) => { enqueue(e.target.files); e.target.value = ''; }} />
      </div>

      {totalFiles > 1 && (
        <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-surface border border-slate-200 rounded-lg text-[10px] text-slate-500">
          <span className="text-slate-900 font-semibold">{totalFiles} files</span><span>·</span><span>{fmtBytes(totalBytes)}</span>
          {doneFiles > 0 && (<><span>·</span><span className="text-green-500">{doneFiles} done</span></>)}
          {errorFiles > 0 && (<><span>·</span><span className="text-red-500">{errorFiles} failed</span></>)}
          {activeFiles > 0 && (<><span>·</span><span className="text-blue-500">{activeFiles} active</span></>)}
          {totalSpeed > 0 && (<><span>·</span><span className="text-blue-500 font-mono">{fmtSpeed(totalSpeed)}</span></>)}
        </div>
      )}

      {files.length > 0 && (files.length <= VIRTUAL_THRESHOLD ? (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {files.map((entry) => <div key={entry.id}>{renderItem(entry)}</div>)}
        </div>
      ) : (() => {
        const totalHeight = files.length * ITEM_HEIGHT;
        const visibleStart = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
        const visibleEnd = Math.min(files.length - 1, Math.ceil((scrollTop + LIST_HEIGHT) / ITEM_HEIGHT) + OVERSCAN);
        const slice = files.slice(visibleStart, visibleEnd + 1);
        return (
          <div ref={listRef} className="overflow-y-auto rounded-lg" style={{ height: LIST_HEIGHT }}
            onScroll={(e) => { const top = e.currentTarget.scrollTop; if (scrollRaf.current) return; scrollRaf.current = requestAnimationFrame(() => { setScrollTop(top); scrollRaf.current = null; }); }}>
            <div style={{ height: totalHeight, position: 'relative' }}>
              {slice.map((entry, i) => (
                <div key={entry.id} style={{ position: 'absolute', top: (visibleStart + i) * ITEM_HEIGHT, left: 0, right: 0, height: ITEM_HEIGHT, padding: '2px 0', overflow: 'hidden' }}>
                  {renderItem(entry)}
                </div>
              ))}
            </div>
          </div>
        );
      })())}
    </div>
  );
}

export default ChunkedUploader;
