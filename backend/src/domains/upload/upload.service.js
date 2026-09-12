/**
 * Chunked Upload Service
 *
 * Manages upload sessions in the DB and orchestrates S3 multipart upload
 * calls through r2Multipart. Handles pause / resume / abort / complete.
 *
 * Entity types supported:
 *   'deliverable' → updates deliverables table
 *   'document'    → updates project_documents table
 *   'library'     → updates library_documents table
 */

const db          = require('../../core/config/db');
const mp          = require('../../core/utils/r2Multipart');
const socket      = require('../../core/socket/socket.gateway');
const EVENTS      = require('../../core/socket/socket.events');
const { addJob, fileUploadQueue } = require('../../core/queues/index');

// How long an upload session stays resumable. Large field datasets (50–100 GB)
// on slow links can take well over a day, so the default is 72h (was 24h).
// Override with UPLOAD_SESSION_HOURS.
const SESSION_HOURS = Math.max(1, Number(process.env.UPLOAD_SESSION_HOURS) || 72);

// ── R2 folder per entity type ────────────────────────────────────────────────
const FOLDER_MAP = {
  deliverable: (projectId) => `projects/${projectId}/deliverables`,
  document:    (projectId) => `projects/${projectId}/documents`,
  library:     ()          => 'library',
  general:     ()          => 'general',
};

const folder = (entityType, projectId) =>
  (FOLDER_MAP[entityType] || FOLDER_MAP.general)(projectId);

/**
 * Authorize a project-scoped upload. The chunked-upload path is a parallel
 * ingestion route that must enforce the SAME access rules as the direct
 * document/deliverable endpoints — otherwise any authenticated user could
 * initiate an upload against a project they have no access to and (via the
 * entityId at /complete) overwrite or plant files there.
 *
 *   • document    → project managers on the project (matches requireProjectRole)
 *   • deliverable → any member of the project        (matches requireProjectAccess)
 *   • admin / super_admin bypass, as everywhere else.
 * 'library' and 'general' are not project-scoped and need no check here.
 */
async function assertProjectUploadAccess({ entityType, projectId, userId, userRole }) {
  if (entityType !== 'document' && entityType !== 'deliverable') return;
  if (userRole === 'admin' || userRole === 'super_admin') return;

  if (!projectId) {
    throw Object.assign(new Error('projectId is required for this upload'), { statusCode: 400 });
  }
  const r = await db.query(
    'SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2',
    [projectId, userId]
  );
  if (!r.rows.length) {
    throw Object.assign(new Error('Access denied. You are not a member of this project.'), { statusCode: 403 });
  }
  if (entityType === 'document' && r.rows[0].role !== 'project_manager') {
    throw Object.assign(new Error('Not a project manager on this project.'), { statusCode: 403 });
  }
}

// ── 1. Initiate a new upload session ─────────────────────────────────────────
exports.initiateUpload = async ({
  entityType,
  projectId,
  fileName,
  fileSize,
  mimeType,
  userId,
  userRole,
  metadata = {},
}) => {
  // Enforce project access BEFORE creating any R2 upload or DB session.
  await assertProjectUploadAccess({ entityType, projectId, userId, userRole });

  const dest   = folder(entityType, projectId);
  const chunkSz = mp.recommendChunkSize(fileSize || 0);
  const total   = fileSize ? Math.ceil(fileSize / chunkSz) : null;

  // Create R2 multipart upload
  const { uploadId: r2UploadId, key: r2Key } = await mp.createMultipartUpload({
    folder:      dest,
    fileName,
    contentType: mimeType || 'application/octet-stream',
  });

  // Persist session
  const result = await db.query(
    `INSERT INTO upload_sessions
     (entity_type, project_id, r2_upload_id, r2_key, file_name, file_size,
      mime_type, chunk_size, total_chunks, created_by, metadata, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW() + ($12 || ' hours')::interval)
     RETURNING *`,
    [
      entityType,
      projectId  || null,
      r2UploadId,
      r2Key,
      fileName,
      fileSize   || null,
      mimeType   || null,
      chunkSz,
      total,
      userId,
      JSON.stringify(metadata),
      String(SESSION_HOURS),
    ]
  );

  const session = result.rows[0];

  // Notify project room that an upload has started.
  // Documents are skipped — this frame carries the file name and the room
  // includes pilots (see the FILE_READY note in _markEntityUploaded's callback).
  if (projectId && entityType !== 'document') {
    try {
      socket.emitToProject(projectId, EVENTS.UPLOAD_STARTED, {
        sessionId:  session.id,
        entityType,
        fileName,
        fileSize,
        uploadedBy: userId,
      });
    } catch (_) {}
  }

  return {
    sessionId:   session.id,
    r2Key,
    chunkSize:   chunkSz,
    totalChunks: total,
  };
};

// ── 2. Upload a single chunk ──────────────────────────────────────────────────
exports.uploadChunk = async ({ sessionId, partNumber, buffer, contentLength, userId }) => {
  // Lightweight fetch — does NOT pull the (growing) uploaded_parts JSONB on the
  // hot path. For a 10,000-part file, selecting the full array on every chunk
  // is O(n²) data transfer; we only need the R2 handle + a few scalars here.
  const sess = await _getSessionForChunk(sessionId, userId);

  const { etag } = await mp.uploadPart({
    key:           sess.r2_key,
    uploadId:      sess.r2_upload_id,
    partNumber,
    body:          buffer,
    contentLength: contentLength != null ? contentLength : buffer.length,
  });

  // Atomically append part — avoids last-writer-wins race when concurrent chunks arrive
  const partJson = JSON.stringify([{ PartNumber: partNumber, ETag: etag }]);
  const updated = await db.query(
    `UPDATE upload_sessions
     SET uploaded_parts = CASE
       WHEN (uploaded_parts @> $1::jsonb) THEN uploaded_parts
       ELSE (uploaded_parts || $1::jsonb)
     END,
     updated_at = NOW()
     WHERE id = $2
     RETURNING uploaded_parts, total_chunks`,
    [partJson, sessionId]
  );
  const parts = Array.isArray(updated.rows[0]?.uploaded_parts) ? updated.rows[0].uploaded_parts : [];
  const done    = parts.length;
  const total   = sess.total_chunks || 1;
  const percent = Math.round((done / total) * 100);

  // Emit progress — throttled. Broadcasting to the project room on EVERY chunk
  // means up to 10,000 emits for one large file; other viewers only need coarse
  // updates, so emit every 5th chunk (and always the final one). The uploader's
  // own UI tracks fine-grained progress client-side regardless.
  if (sess.project_id && (done % 5 === 0 || done >= total)) {
    try {
      socket.emitToProject(sess.project_id, EVENTS.UPLOAD_PROGRESS, {
        sessionId,
        partNumber,
        percent,
        chunksUploaded: done,
        totalChunks:    total,
      });
    } catch (_) {}
  }

  return { partNumber, etag, percent, chunksUploaded: done, totalChunks: total };
};

// ── 2b. Presign part URLs for DIRECT-to-R2 upload (no byte relay through us) ───
// The client requests a batch of presigned PUT URLs, uploads each chunk straight
// to R2, reads the ETag from R2's response, then sends all parts to /complete.
// This removes the server + local-disk + DB-per-chunk bottleneck entirely.
// REQUIRES R2 bucket CORS allowing PUT from the app origin and exposing ETag.
exports.presignParts = async ({ sessionId, userId, partNumbers }) => {
  const sess = await _getSessionForChunk(sessionId, userId);
  if (!Array.isArray(partNumbers) || !partNumbers.length) {
    throw Object.assign(new Error('partNumbers (non-empty array) is required'), { statusCode: 400 });
  }
  // Cap batch size so a malformed request can't presign tens of thousands at once.
  const batch = partNumbers.slice(0, 1000).map(Number).filter(n => n >= 1 && n <= 10000);

  const urls = await Promise.all(batch.map(async (partNumber) => ({
    partNumber,
    url: await mp.presignPartUpload({
      key:        sess.r2_key,
      uploadId:   sess.r2_upload_id,
      partNumber,
      expiresIn:  3600, // 1h — client re-requests if a part is retried later
    }),
  })));

  return { urls };
};

// ── 3. Complete the upload ────────────────────────────────────────────────────
exports.completeUpload = async ({ sessionId, userId, entityId, extraMeta = {}, parts: clientParts }) => {
  const sess = await _getActiveSession(sessionId, userId);

  // Direct-to-R2 mode: the browser PUT each part straight to R2 and collected the
  // ETags itself (no per-chunk server round-trip), so it sends the parts here.
  // Proxy mode: parts were recorded in uploaded_parts as each chunk relayed through us.
  let parts;
  if (Array.isArray(clientParts) && clientParts.length) {
    parts = clientParts
      .map(p => ({ PartNumber: Number(p.PartNumber ?? p.partNumber), ETag: String((p.ETag ?? p.etag) || '') }))
      .filter(p => p.PartNumber >= 1 && p.ETag);
  } else {
    parts = Array.isArray(sess.uploaded_parts) ? sess.uploaded_parts : [];
  }
  if (!parts.length) throw Object.assign(new Error('No parts uploaded yet'), { statusCode: 400 });

  // Finalise R2 multipart
  const { key } = await mp.completeMultipartUpload({
    key:      sess.r2_key,
    uploadId: sess.r2_upload_id,
    parts,
  });

  // Mark session complete
  await db.query(
    `UPDATE upload_sessions SET status='completed', entity_id=$1, updated_at=NOW() WHERE id=$2`,
    [entityId || null, sessionId]
  );

  let sessionMeta = {};
  try {
    sessionMeta = typeof sess.metadata === 'string' ? JSON.parse(sess.metadata) : (sess.metadata || {});
  } catch (_) {}
  const mergedExtraMeta = { ...sessionMeta, ...extraMeta };

  const jobPayload = {
    sessionId,
    r2Key:      key,
    entityType: sess.entity_type,
    entityId,
    projectId:  sess.project_id,
    fileName:   sess.file_name,
    fileSize:   sess.file_size,
    mimeType:   sess.mime_type,
    userId,
    extraMeta:  mergedExtraMeta,
  };

  // Enqueue post-processing job (magic-byte check, metadata extraction, entity update)
  await addJob(
    fileUploadQueue,
    'process-upload',
    jobPayload,
    // Sync fallback when Redis is unavailable — runs inline, then emits socket so
    // the client can transition from PROCESSING → DONE without a BullMQ worker.
    async (data) => {
      // _markEntityUploaded returns the final entityId (may differ from data.entityId
      // for library uploads where a new library_documents row is created inside it)
      const resolvedEntityId = await _markEntityUploaded(data);
      try {
        if (data.userId) {
          socket.emitToUser(data.userId, EVENTS.FILE_READY, {
            sessionId:  data.sessionId,
            entityId:   resolvedEntityId  || null,
            entityType: data.entityType,
            fileName:   data.fileName,
            fileSize:   data.fileSize,
          });
        }
        // Documents are excluded from the project-room frame: it carries the file
        // name and the room includes pilots, who must not see restricted
        // (Commercial) document names. Only the uploader's client consumes this
        // event, and the id-only DOCUMENT_UPLOADED below still refreshes the tab.
        if (data.projectId && data.entityType !== 'document') {
          socket.emitToProject(data.projectId, EVENTS.FILE_READY, {
            sessionId:  data.sessionId,
            entityId:   resolvedEntityId  || null,
            entityType: data.entityType,
            fileName:   data.fileName,
          });
        }
        // Mirror the BullMQ worker's entity-specific cache-invalidation events
        if (data.entityType === 'document' && data.projectId) {
          socket.emitToProject(data.projectId, EVENTS.DOCUMENT_UPLOADED, { id: resolvedEntityId });
        } else if (data.entityType === 'deliverable' && data.projectId) {
          socket.emitToProject(data.projectId, EVENTS.DELIVERABLE_UPDATED, { id: resolvedEntityId, status: 'uploaded' });
        } else if (data.entityType === 'library' && data.userId) {
          socket.emitToUser(data.userId, EVENTS.LIBRARY_DOC_UPLOADED, {
            id:       resolvedEntityId || null,
            fileName: data.fileName,
          });
        }
      } catch (_) {}
    }
  );

  // Emit upload complete to project room (documents excluded — file name + R2 key)
  if (sess.project_id && sess.entity_type !== 'document') {
    try {
      socket.emitToProject(sess.project_id, EVENTS.UPLOAD_COMPLETE, {
        sessionId,
        entityType: sess.entity_type,
        entityId,
        fileName:   sess.file_name,
        r2Key:      key,
      });
    } catch (_) {}
  }

  return { r2Key: key, sessionId };
};

// ── 4. Abort / cancel upload ─────────────────────────────────────────────────
exports.abortUpload = async ({ sessionId, userId }) => {
  const sess = await _getActiveSession(sessionId, userId);

  await mp.abortMultipartUpload({ key: sess.r2_key, uploadId: sess.r2_upload_id });

  await db.query(
    `UPDATE upload_sessions SET status='aborted', updated_at=NOW() WHERE id=$1`,
    [sessionId]
  );

  return { sessionId, aborted: true };
};

// ── 5. Get session state (for resume after disconnect) ────────────────────────
exports.getSession = async ({ sessionId, userId }) => {
  const result = await db.query(
    `SELECT * FROM upload_sessions WHERE id=$1 AND created_by=$2 AND status='active'`,
    [sessionId, userId]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Upload session not found or expired'), { statusCode: 404 });
  }
  const s = result.rows[0];
  return {
    sessionId:      s.id,
    entityType:     s.entity_type,
    projectId:      s.project_id,
    r2Key:          s.r2_key,
    fileName:       s.file_name,
    fileSize:       s.file_size,
    chunkSize:      s.chunk_size,
    totalChunks:    s.total_chunks,
    uploadedParts:  s.uploaded_parts || [],
    chunksUploaded: (s.uploaded_parts || []).length,
    expiresAt:      s.expires_at,
  };
};

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _getActiveSession(sessionId, userId) {
  const result = await db.query(
    `SELECT * FROM upload_sessions
     WHERE id=$1 AND created_by=$2 AND status='active' AND expires_at > NOW()`,
    [sessionId, userId]
  );
  if (!result.rows.length) {
    throw Object.assign(
      new Error('Upload session not found, expired, or you are not the owner'),
      { statusCode: 404 }
    );
  }
  return result.rows[0];
}

// Per-chunk hot-path fetch: same ownership/active/expiry guard as above, but
// returns ONLY the columns the chunk handler needs — never the uploaded_parts
// JSONB (which grows unboundedly and would be re-read on every chunk).
async function _getSessionForChunk(sessionId, userId) {
  const result = await db.query(
    `SELECT id, r2_key, r2_upload_id, project_id, total_chunks
     FROM upload_sessions
     WHERE id=$1 AND created_by=$2 AND status='active' AND expires_at > NOW()`,
    [sessionId, userId]
  );
  if (!result.rows.length) {
    throw Object.assign(
      new Error('Upload session not found, expired, or you are not the owner'),
      { statusCode: 404 }
    );
  }
  return result.rows[0];
}

// Called as fallback when Redis is unavailable — marks entity as 'uploaded' directly
async function _markEntityUploaded(data) {
  const { entityType, r2Key, fileSize, userId, extraMeta = {}, fileName, mimeType } = data;
  let { entityId } = data;

  try {
    if (entityType === 'deliverable') {
      const { projectId } = data;
      if (entityId) {
        // Scope to the session's project so a caller can't point their upload at
        // another project's deliverable by supplying its id at /complete.
        const upd = await db.query(
          `UPDATE deliverables
           SET file_key=$1, file_size=$2, status='uploaded', uploaded_at=NOW(), uploaded_by=$3
           WHERE id=$4 AND project_id=$5`,
          [r2Key, fileSize || null, userId, entityId, projectId]
        );
        if (!upd.rowCount) {
          console.warn(`[Upload] deliverable ${entityId} not in project ${projectId} — file not wired`);
        }
      } else if (projectId) {
        // No pre-existing row — delegate to the deliverable service so socket events,
        // member notifications, PM emails, and audit log all fire correctly.
        const deliverableService = require('../../domains/project/submodules/deliverables/deliverable.service');
        const ext      = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : null;
        const baseName = fileName.replace(/\.[^/.]+$/, '');
        // Folder uploads group under one folder deliverable + single notification.
        const created  = await deliverableService.createDeliverableMaybeFoldered(projectId, {
          name:          baseName,
          format:        ext,
          file_key:      r2Key,
          file_size:     fileSize || null,
          uploaded_by:   userId,
          relative_path: extraMeta.relative_path,
        });
        entityId = created.id;
      }
    } else if (entityType === 'document') {
      const { projectId } = data;
      if (entityId) {
        // Scope to the session's project (see deliverable note above).
        const upd = await db.query(
          `UPDATE project_documents SET file_key=$1, file_size=$2 WHERE id=$3 AND project_id=$4`,
          [r2Key, fileSize || null, entityId, projectId]
        );
        if (!upd.rowCount) {
          console.warn(`[Upload] document ${entityId} not in project ${projectId} — file not wired`);
        }
      } else if (projectId) {
        // No pre-existing row — create one (same logic as projectDocs.service.uploadDocument)
        const existing = await db.query(
          `SELECT version FROM project_documents
           WHERE project_id=$1 AND LOWER(file_name)=LOWER($2)
           ORDER BY (substring(version FROM '[0-9]+'))::INT DESC LIMIT 1`,
          [projectId, fileName]
        );
        const lastVer = existing.rows[0]?.version || '';
        const match   = lastVer.match(/\d+/);
        const version = `v${match ? parseInt(match[0], 10) + 1 : 1}`;
        const ins = await db.query(
          `INSERT INTO project_documents
             (project_id, file_name, file_key, file_size, category, version, uploaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [projectId, fileName, r2Key, fileSize || null,
           extraMeta.category || null, version, userId]
        );
        entityId = ins.rows[0].id;
      }
    } else if (entityType === 'library') {
      if (entityId) {
        await db.query(
          `UPDATE library_documents SET file_key=$1, file_size=$2 WHERE id=$3`,
          [r2Key, fileSize || null, entityId]
        );
      } else {
        // Create new library document from upload metadata
        const { category_id, description, tags } = extraMeta;
        let { folder_id } = extraMeta;

        // Auto-create sub-folder if file came from an uploaded directory
        const relPath = extraMeta.relative_path;
        if (relPath) {
          const parts = relPath.split('/');
          if (parts.length > 1) {
            const subFolderName = parts[0];
            const existing = await db.query(
              'SELECT id FROM library_folders WHERE name=$1 AND parent_id IS NOT DISTINCT FROM $2 LIMIT 1',
              [subFolderName, folder_id || null]
            );
            if (existing.rows.length) {
              folder_id = existing.rows[0].id;
            } else {
              try {
                const created = await db.query(
                  'INSERT INTO library_folders (name, parent_id) VALUES ($1,$2) RETURNING id',
                  [subFolderName, folder_id || null]
                );
                folder_id = created.rows[0].id;
              } catch (_) {
                const retry = await db.query(
                  'SELECT id FROM library_folders WHERE name=$1 AND parent_id IS NOT DISTINCT FROM $2 LIMIT 1',
                  [subFolderName, folder_id || null]
                );
                folder_id = retry.rows[0]?.id || folder_id;
              }
            }
          }
        }

        const nameToUse = fileName || r2Key.split('/').pop();
        const ext      = nameToUse.split('.').pop().toLowerCase();
        const mimeMap  = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
                           tiff: 'image/tiff', tif: 'image/tiff', mp4: 'video/mp4',
                           las: 'application/x-las', laz: 'application/x-laz',
                           zip: 'application/zip', kml: 'application/vnd.google-earth.kml+xml',
                           kmz: 'application/vnd.google-earth.kmz' };
        const fileTypeToUse = mimeType || mimeMap[ext] || 'application/octet-stream';

        const ins = await db.query(
          `INSERT INTO library_documents
             (name, file_name, description, file_key, file_size, file_type, category_id, folder_id, uploaded_by)
           VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id`,
          [
            nameToUse,
            description || null,
            r2Key,
            fileSize    || null,
            fileTypeToUse,
            category_id || null,
            folder_id   || null,
            userId      || null,
          ]
        );
        entityId = ins.rows[0].id;

        // Wire tags
        if (Array.isArray(tags) && tags.length) {
          const tagValues = tags.map((_, i) => `($1, $${i + 2})`).join(', ');
          await db.query(
            `INSERT INTO library_file_tags (document_id, tag_id) VALUES ${tagValues} ON CONFLICT DO NOTHING`,
            [entityId, ...tags]
          );
        }

        // Optionally update the upload session with the new entityId
        if (data.sessionId) {
          await db.query(`UPDATE upload_sessions SET entity_id=$1 WHERE id=$2`, [entityId, data.sessionId]);
        }
      }
    }
  } catch (err) {
    console.error('[Upload] Fallback entity update failed:', err.message);
  }
  return entityId;
}
