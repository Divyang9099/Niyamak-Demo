import { create } from 'zustand';
import axiosInstance from '../api/axios';
import { ENDPOINTS } from '../api/endpoints';
import { getSocket } from '../services/socket';

/**
 * GLOBAL upload manager.
 *
 * The entire upload engine AND the File objects live here (module scope), NOT in
 * a React component — so uploads keep running and the queue keeps draining even
 * when the user navigates away from the page that started them. The floating
 * <UploadDock/> and the in-page <ChunkedUploader/> are both just views/controllers
 * over this store.
 *
 * (Note: a hard browser refresh still loses in-memory File objects — that's a
 * browser limitation no JS can avoid. In-app navigation is fully preserved.)
 */

const FILE_CONCURRENCY  = 5;   // files transferring bytes at once
const CHUNK_CONCURRENCY  = 5;  // parallel chunks per file
const MAX_RETRIES        = 3;
const RETRY_DELAY_MS     = 2000;
// Once the COMPLETE call returns 200 the file is uploaded + finalized in R2 and the
// session is marked complete server-side — the upload itself has succeeded. We then
// give the optional `file:ready` socket event a short grace window to enrich the
// result, but never block the UI on it (the socket can drop/reconnect and lose the
// event). If the socket isn't even connected, resolve almost immediately.
const PROCESSING_GRACE_CONNECTED_MS = 6_000;
const PROCESSING_GRACE_OFFLINE_MS   = 1_200;
const DIRECT_TO_R2 = import.meta.env?.VITE_DIRECT_R2_UPLOAD === 'true';

export const STATUS = {
  QUEUED: 'queued', UPLOADING: 'uploading', PAUSED: 'paused',
  PROCESSING: 'processing', DONE: 'done', ERROR: 'error', CANCELLED: 'cancelled',
};

// ── Module-level control state (survives component unmounts) ──────────────────
const pauseFlags       = {};        // id → true | 'cancel' | false
const activeUploads    = {};        // id → true (prevents double-start)
const processingTimers = {};        // id → timeout handle
const resolvedSessions = new Set(); // sessionIds already finalized
const scopes           = {};        // scopeKey → { entityType, projectId, entityId, getExtraMeta, onComplete, onError }
let socketBound = null;             // the socket INSTANCE we've attached listeners to (rebind on reconnect)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const labelFor = (scopeKey) => {
  const t = (scopeKey || '').split(':')[0];
  return t === 'document' ? 'Document' : t === 'library' ? 'Library' : 'Deliverable';
};

export const useUploadStore = create((set, get) => ({
  items: {},   // id → snapshot (includes the File object in .file)
  order: [],

  // ── internal helpers ───────────────────────────────────────────────────────
  _patch: (id, patch) => set((s) => (s.items[id] ? { items: { ...s.items, [id]: { ...s.items[id], ...patch } } } : {})),

  remove: (id) => {
    pauseFlags[id] = 'cancel';
    clearTimeout(processingTimers[id]); delete processingTimers[id];
    delete activeUploads[id];
    const it = get().items[id];
    if (it?.sessionId) axiosInstance.delete(ENDPOINTS.UPLOADS.ABORT(it.sessionId), { skipLoader: true }).catch(() => {});
    set((s) => { const items = { ...s.items }; delete items[id]; return { items, order: s.order.filter((x) => x !== id) }; });
  },

  clearFinished: () => set((s) => {
    const items = {}, order = [];
    for (const id of s.order) {
      const it = s.items[id];
      if (['queued', 'uploading', 'paused', 'processing'].includes(it.status)) { items[id] = it; order.push(id); }
    }
    return { items, order };
  }),

  // Register a drop-zone's context (target entity + callbacks) so the engine can
  // finalize uploads correctly regardless of which page is mounted.
  registerScope: (key, ctx) => { scopes[key] = ctx; get()._initSocket(); },

  // ── enqueue files for a given scope ─────────────────────────────────────────
  enqueue: (rawFiles, scopeKey) => {
    const created = Array.from(rawFiles).map((file) => ({
      id:            `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      name:          file.name,
      relativePath:  file._relativePath || file.webkitRelativePath || file.name,
      size:          file.size,
      scopeKey,
      scopeLabel:    labelFor(scopeKey),
      status:        STATUS.QUEUED,
      percent: 0, speed: 0, eta: null, startedAt: null, completedAt: null,
      sessionId: null, totalChunks: null, uploadedChunks: 0, processingStage: null, error: null,
    }));
    if (!created.length) return;
    get()._initSocket(); // ensure the file:* listener is attached before uploads finish
    set((s) => ({
      items: { ...s.items, ...Object.fromEntries(created.map((i) => [i.id, i])) },
      order: [...s.order, ...created.map((i) => i.id)],
    }));
    get()._maybeStart();
  },

  // ── start queued files up to the concurrency limit (PROCESSING doesn't count) ─
  _maybeStart: () => {
    const { items, order } = get();
    let slots = FILE_CONCURRENCY - order.filter((id) => items[id]?.status === STATUS.UPLOADING).length;
    if (slots <= 0) return;
    for (const id of order) {
      if (slots <= 0) break;
      if (items[id]?.status === STATUS.QUEUED && !activeUploads[id]) { get()._run(id); slots--; }
    }
  },

  // ── controls ────────────────────────────────────────────────────────────────
  pause:  (id) => { pauseFlags[id] = true;  get()._patch(id, { status: STATUS.PAUSED }); },
  resume: (id) => { pauseFlags[id] = false; get()._patch(id, { status: STATUS.UPLOADING }); },
  cancel: (id) => { pauseFlags[id] = 'cancel'; },
  retry:  (id) => {
    delete activeUploads[id];
    get()._patch(id, { status: STATUS.QUEUED, percent: 0, error: null, uploadedChunks: 0, processingStage: null });
    get()._maybeStart();
  },

  // ── chunk upload (proxy through API) ─────────────────────────────────────────
  _uploadChunk: async (sessionId, fileName, partNumber, blob, attempt = 1) => {
    const form = new FormData();
    form.append('chunk', blob, fileName);
    try {
      const res = await axiosInstance.put(ENDPOINTS.UPLOADS.CHUNK(sessionId, partNumber), form,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000, skipLoader: true });
      return res.data.data;
    } catch (err) {
      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAY_MS * attempt); return get()._uploadChunk(sessionId, fileName, partNumber, blob, attempt + 1); }
      throw err;
    }
  },

  // ── chunk upload (direct to R2 via presigned URL) ────────────────────────────
  _uploadChunkDirect: async (sessionId, partNumber, blob, attempt = 1) => {
    try {
      const presign = await axiosInstance.post(ENDPOINTS.UPLOADS.PRESIGN(sessionId), { partNumbers: [partNumber] }, { skipLoader: true });
      const url = presign.data?.data?.urls?.[0]?.url;
      if (!url) throw new Error('No presigned URL');
      const r2 = await fetch(url, { method: 'PUT', body: blob });
      if (!r2.ok) throw new Error(`R2 PUT failed (${r2.status})`);
      const etag = r2.headers.get('ETag') || r2.headers.get('etag');
      if (!etag) throw new Error('R2 did not return an ETag (check CORS ExposeHeaders)');
      return { ETag: etag, PartNumber: partNumber };
    } catch (err) {
      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAY_MS * attempt); return get()._uploadChunkDirect(sessionId, partNumber, blob, attempt + 1); }
      throw err;
    }
  },

  // ── core per-file upload loop ────────────────────────────────────────────────
  _run: async (id) => {
    if (activeUploads[id]) return;
    activeUploads[id] = true;
    pauseFlags[id] = false;

    const patch = (p) => get()._patch(id, p);
    const item  = get().items[id];
    if (!item) { delete activeUploads[id]; return; }
    const ctx   = scopes[item.scopeKey] || {};
    const { file, name, size, relativePath } = item;

    let sessionId = null, r2Key = null, chunkSize = null, startChunk = 1;
    patch({ status: STATUS.UPLOADING, startedAt: item.startedAt || Date.now() });

    try {
      // Initiate session
      const initRes = await axiosInstance.post(ENDPOINTS.UPLOADS.INITIATE, {
        entityType: ctx.entityType,
        projectId:  ctx.projectId || null,
        fileName:   name,
        fileSize:   size,
        mimeType:   file.type || 'application/octet-stream',
        metadata: {
          ...(ctx.getExtraMeta ? ctx.getExtraMeta() : {}),
          relative_path: relativePath !== name ? relativePath : undefined,
        },
      }, { skipLoader: true });
      const sess = initRes.data.data;
      sessionId = sess.sessionId; r2Key = sess.r2Key; chunkSize = sess.chunkSize;
      patch({ sessionId });

      const totalChunks = Math.ceil(size / chunkSize);
      let nextPart = startChunk, doneCount = 0, bytesCompleted = 0;
      let speedBytes = 0, speedTime = Date.now(), cancelled = false;
      const collectedParts = [];
      patch({ totalChunks });

      const worker = async () => {
        while (true) {
          if (cancelled || pauseFlags[id] === 'cancel') { cancelled = true; return; }
          while (pauseFlags[id] === true) { await sleep(300); if (pauseFlags[id] === 'cancel') { cancelled = true; return; } }
          const part = nextPart++;
          if (part > totalChunks) break;
          const start = (part - 1) * chunkSize;
          const end   = Math.min(start + chunkSize, size);
          const blob  = file.slice(start, end);

          if (DIRECT_TO_R2) collectedParts.push(await get()._uploadChunkDirect(sessionId, part, blob));
          else              await get()._uploadChunk(sessionId, name, part, blob);

          doneCount++; bytesCompleted += (end - start);
          const now = Date.now(), elapsed = (now - speedTime) / 1000;
          if (elapsed >= 0.5) {
            const speed = (bytesCompleted - speedBytes) / elapsed;
            speedBytes = bytesCompleted; speedTime = now;
            patch({ percent: Math.round(bytesCompleted / size * 100), uploadedChunks: doneCount, speed,
                    eta: speed > 0 ? (size - bytesCompleted) / speed : null, status: STATUS.UPLOADING });
          }
        }
      };

      const workerCount = Math.max(1, Math.min(CHUNK_CONCURRENCY, totalChunks));
      await Promise.all(Array.from({ length: workerCount }, worker));
      if (cancelled) throw new Error('Upload cancelled');

      // Complete — free the upload slot immediately so the next file can start
      patch({ status: STATUS.PROCESSING, percent: 100, speed: 0, eta: null, processingStage: 'Finalizing…' });
      get()._maybeStart();

      await axiosInstance.post(ENDPOINTS.UPLOADS.COMPLETE(sessionId), {
        entityId:  ctx.entityId || null,
        extraMeta: ctx.getExtraMeta ? ctx.getExtraMeta() : {},
        parts: DIRECT_TO_R2 ? collectedParts.slice().sort((a, b) => a.PartNumber - b.PartNumber) : undefined,
      }, { skipLoader: true });

      // The upload has genuinely succeeded at this point. Prefer the `file:ready`
      // socket event (it confirms server-side processing finished), but resolve on a
      // short grace timer regardless so the UI never hangs if the event is missed.
      const sock = getSocket();
      const graceMs = (sock && sock.connected) ? PROCESSING_GRACE_CONNECTED_MS : PROCESSING_GRACE_OFFLINE_MS;
      processingTimers[id] = setTimeout(() => {
        if (resolvedSessions.has(sessionId)) return;
        resolvedSessions.add(sessionId);
        if (get().items[id]?.status === STATUS.PROCESSING) {
          patch({ status: STATUS.DONE, percent: 100, completedAt: Date.now(), processingStage: null });
          try { ctx.onComplete?.({ sessionId, r2Key, fileName: name, fileSize: size }); } catch (_) {}
        }
        delete processingTimers[id];
        get()._maybeStart();
      }, graceMs);

    } catch (err) {
      const wasCancelled = err.message === 'Upload cancelled';
      clearTimeout(processingTimers[id]); delete processingTimers[id];
      if (wasCancelled) {
        if (sessionId) axiosInstance.delete(ENDPOINTS.UPLOADS.ABORT(sessionId), { skipLoader: true }).catch(() => {});
        get().remove(id);
      } else {
        patch({ status: STATUS.ERROR, error: err.message || 'Upload failed' });
        try { ctx.onError?.(err, file); } catch (_) {}
      }
      get()._maybeStart();
    } finally {
      delete pauseFlags[id];
    }
  },

  // ── global socket listener ───────────────────────────────────────────────────
  // Binds to the CURRENT socket instance. socket.js recreates the instance on
  // logout/auth changes, which would orphan listeners attached to the old one —
  // so we rebind whenever the instance changes (idempotent; called on every
  // registerScope + enqueue).
  _initSocket: () => {
    const sock = getSocket();
    if (!sock || sock === socketBound) return;
    socketBound = sock;
    const bySession = (sessionId) => { const { items, order } = get(); return order.find((k) => items[k]?.sessionId === sessionId); };

    sock.on('file:processing', ({ sessionId, stage }) => {
      const id = bySession(sessionId); if (!id) return;
      get()._patch(id, { status: STATUS.PROCESSING, processingStage: { validation: 'Validating…', metadata: 'Reading metadata…', saving: 'Saving…' }[stage] || 'Processing…' });
    });
    sock.on('file:ready', ({ sessionId }) => {
      if (resolvedSessions.has(sessionId)) return;
      resolvedSessions.add(sessionId);
      const id = bySession(sessionId); if (!id) return;
      clearTimeout(processingTimers[id]); delete processingTimers[id];
      const it = get().items[id];
      get()._patch(id, { status: STATUS.DONE, percent: 100, speed: 0, eta: null, processingStage: null, completedAt: Date.now() });
      try { scopes[it?.scopeKey]?.onComplete?.({ sessionId, fileName: it?.name, fileSize: it?.size }); } catch (_) {}
      get()._maybeStart();
    });
    sock.on('file:failed', ({ sessionId, reason }) => {
      const id = bySession(sessionId); if (!id) return;
      clearTimeout(processingTimers[id]); delete processingTimers[id];
      const it = get().items[id];
      get()._patch(id, { status: STATUS.ERROR, error: reason || 'Processing failed', processingStage: null });
      try { scopes[it?.scopeKey]?.onError?.(new Error(reason || 'Processing failed'), it?.file); } catch (_) {}
      get()._maybeStart();
    });
  },
}));
