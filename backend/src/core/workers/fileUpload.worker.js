/**
 * File Upload Post-Processing Worker
 *
 * Runs after every successful chunked upload completes.
 * Pipeline per job:
 *   1. Magic-byte file type validation
 *   2. Metadata extraction (type-specific)
 *   3. Update entity record (deliverable / document / library)
 *   4. Emit socket events throughout
 *
 * No external scanning dependency required — uses built-in magic bytes.
 * Add ClamAV or VirusTotal here when available in the infra.
 */

const { Worker }   = require('bullmq');
const { REDIS_ENABLED, getSharedConnection } = require('../queues/redis');
const db           = require('../config/db');
const socket       = require('../socket/socket.gateway');
const EVENTS       = require('../socket/socket.events');
const { getFileStream, getPresignedUrl } = require('../utils/r2Download');

if (!REDIS_ENABLED) {
  console.warn('[Worker:FileUpload] Redis not configured — worker not started.');
  module.exports = null;
  return;
}

// ── Magic byte signatures ─────────────────────────────────────────────────────
const MAGIC = [
  { ext: '.pdf',  mime: 'application/pdf',      bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { ext: '.zip',  mime: 'application/zip',       bytes: [0x50, 0x4B, 0x03, 0x04] }, // PK
  { ext: '.jpg',  mime: 'image/jpeg',            bytes: [0xFF, 0xD8, 0xFF] },
  { ext: '.png',  mime: 'image/png',             bytes: [0x89, 0x50, 0x4E, 0x47] },
  { ext: '.gif',  mime: 'image/gif',             bytes: [0x47, 0x49, 0x46, 0x38] },
  { ext: '.tiff', mime: 'image/tiff',            bytes: [0x49, 0x49, 0x2A, 0x00] }, // little-endian TIFF
  { ext: '.tiff', mime: 'image/tiff',            bytes: [0x4D, 0x4D, 0x00, 0x2A] }, // big-endian TIFF
  { ext: '.mp4',  mime: 'video/mp4',             bytes: null, offset: 4, str: 'ftyp' }, // ftyp box
  { ext: '.las',  mime: 'application/x-las',     bytes: [0x4C, 0x41, 0x53, 0x46] }, // LASF
  { ext: '.laz',  mime: 'application/x-laz',     bytes: [0x4C, 0x41, 0x53, 0x46] }, // LASF (same header)
  { ext: '.gz',   mime: 'application/gzip',      bytes: [0x1F, 0x8B] },
  { ext: '.7z',   mime: 'application/x-7z-compressed', bytes: [0x37, 0x7A, 0xBC, 0xAF] },
];

// Read the first 16 bytes from an R2 stream for magic byte check
async function readMagicBytes(r2Key) {
  try {
    const stream  = await getFileStream(r2Key);
    return new Promise((resolve) => {
      const chunks = [];
      let total    = 0;
      stream.on('data', (chunk) => {
        chunks.push(chunk);
        total += chunk.length;
        if (total >= 16) {
          stream.destroy();
          resolve(Buffer.concat(chunks).slice(0, 16));
        }
      });
      stream.on('end',   () => resolve(Buffer.concat(chunks).slice(0, 16)));
      stream.on('error', () => resolve(null));
    });
  } catch {
    return null;
  }
}

function detectFileType(header, declaredMime) {
  if (!header) return { valid: true, detected: declaredMime }; // can't check — trust

  // Check for ZIP-bomb heuristic: disallow nested ZIPs > certain ratio
  // (full ZIP-bomb check needs extraction — skip for now, flag suspicious later)

  for (const sig of MAGIC) {
    if (sig.bytes) {
      const match = sig.bytes.every((b, i) => header[i] === b);
      if (match) return { valid: true, detected: sig.mime };
    } else if (sig.str && sig.offset !== undefined) {
      const slice = header.slice(sig.offset, sig.offset + sig.str.length).toString('ascii');
      if (slice === sig.str) return { valid: true, detected: sig.mime };
    }
  }

  // No match found — still allow (many binary formats have no standard magic)
  return { valid: true, detected: declaredMime };
}

// ── Metadata extraction per file type ────────────────────────────────────────
async function extractMetadata(mimeType, fileName, fileSize) {
  const meta = { fileSize, detectedAt: new Date().toISOString() };
  const ext  = (fileName || '').split('.').pop().toLowerCase();

  // Video files — report file size class
  if (mimeType && (mimeType.startsWith('video/') || ['mp4','mov','avi','mkv'].includes(ext))) {
    meta.type     = 'video';
    meta.sizeClass = fileSize > 1e9 ? 'large' : fileSize > 100e6 ? 'medium' : 'small';
  }
  // GeoTIFF / Orthomosaic
  else if (['tiff','tif','geotiff'].includes(ext) || (mimeType || '').includes('tiff')) {
    meta.type = 'geotiff';
  }
  // Point cloud
  else if (['las','laz'].includes(ext)) {
    meta.type = 'point_cloud';
  }
  // PDF
  else if (ext === 'pdf' || (mimeType || '').includes('pdf')) {
    meta.type = 'pdf';
  }
  // KML / KMZ
  else if (['kml','kmz'].includes(ext)) {
    meta.type = 'kml';
  }
  // ZIP bundle
  else if (['zip'].includes(ext) || (mimeType || '').includes('zip')) {
    meta.type = 'archive';
  }

  return meta;
}

// Find an existing library folder or create it — handles races from parallel workers
async function findOrCreateFolder(name, parentId) {
  const existing = await db.query(
    'SELECT id FROM library_folders WHERE name = $1 AND parent_id IS NOT DISTINCT FROM $2 LIMIT 1',
    [name, parentId]
  );
  if (existing.rows.length) return existing.rows[0].id;
  try {
    const created = await db.query(
      'INSERT INTO library_folders (name, parent_id) VALUES ($1, $2) RETURNING id',
      [name, parentId]
    );
    return created.rows[0].id;
  } catch (_) {
    // Another parallel worker created it first — fetch it
    const retry = await db.query(
      'SELECT id FROM library_folders WHERE name = $1 AND parent_id IS NOT DISTINCT FROM $2 LIMIT 1',
      [name, parentId]
    );
    return retry.rows[0]?.id || null;
  }
}

// ── Update entity with final file key + status ────────────────────────────────
// Returns the entityId (may be newly created for library docs)
async function updateEntity({ entityType, entityId, r2Key, fileSize, metadata, userId, extraMeta = {}, fileName, projectId }) {
  if (!r2Key) return entityId;

  try {
    if (entityType === 'deliverable') {
      if (entityId) {
        // Scope to the session's project so a supplied entityId can't target a
        // deliverable in another project (chunked-upload access control).
        const upd = await db.query(
          `UPDATE deliverables
           SET file_key=$1, file_size=$2, metadata=$3::jsonb,
               status='uploaded', uploaded_at=NOW(), uploaded_by=COALESCE($4, uploaded_by)
           WHERE id=$5 AND project_id=$6`,
          [r2Key, fileSize || null, JSON.stringify(metadata), userId || null, entityId, projectId]
        );
        if (!upd.rowCount) {
          console.warn(`[Worker:FileUpload] deliverable ${entityId} not in project ${projectId} — file not wired`);
          return entityId;
        }
        // Snapshot version history
        const del = await db.query('SELECT name FROM deliverables WHERE id=$1', [entityId]);
        if (del.rows.length) {
          const verCount = await db.query(
            'SELECT COUNT(*) AS cnt FROM deliverable_versions WHERE deliverable_id=$1', [entityId]
          );
          const ver = `v${Number(verCount.rows[0].cnt) + 1}`;
          await db.query(
            `INSERT INTO deliverable_versions (deliverable_id, file_key, file_name, file_size, version, uploaded_by)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [entityId, r2Key, del.rows[0].name, fileSize || null, ver, userId || null]
          );
        }
      } else if (projectId) {
        // Delegate to deliverable service — fires socket, member notifications, PM email, audit
        const deliverableService = require('../../domains/project/submodules/deliverables/deliverable.service');
        const ext      = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : null;
        const baseName = fileName.replace(/\.[^/.]+$/, '');
        // Folder uploads (relative_path = "folder/file") group under one folder
        // deliverable and notify once; loose files notify per file as before.
        const created  = await deliverableService.createDeliverableMaybeFoldered(projectId, {
          name:          baseName,
          format:        ext,
          file_key:      r2Key,
          file_size:     fileSize || null,
          uploaded_by:   userId || null,
          relative_path: extraMeta.relative_path,
        });
        entityId = created.id;
      }
    }

    else if (entityType === 'document') {
      if (entityId) {
        // Scope to the session's project (see deliverable note above).
        const upd = await db.query(
          `UPDATE project_documents SET file_key=$1, file_size=$2 WHERE id=$3 AND project_id=$4`,
          [r2Key, fileSize || null, entityId, projectId]
        );
        if (!upd.rowCount) {
          console.warn(`[Worker:FileUpload] document ${entityId} not in project ${projectId} — file not wired`);
        }
      } else if (projectId) {
        const pid = projectId;
        const existing = await db.query(
          `SELECT version FROM project_documents
           WHERE project_id=$1 AND LOWER(file_name)=LOWER($2)
           ORDER BY (substring(version FROM '[0-9]+'))::INT DESC LIMIT 1`,
          [pid, fileName]
        );
        const lastVer = existing.rows[0]?.version || '';
        const match   = lastVer.match(/\d+/);
        const version = `v${match ? parseInt(match[0], 10) + 1 : 1}`;
        const ins = await db.query(
          `INSERT INTO project_documents
             (project_id, file_name, file_key, file_size, category, version, uploaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [pid, fileName, r2Key, fileSize || null,
           extraMeta.category || null, version, userId || null]
        );
        entityId = ins.rows[0].id;
      }
    }

    else if (entityType === 'library') {
      if (entityId) {
        // Update existing record
        await db.query(
          `UPDATE library_documents SET file_key=$1, file_size=$2 WHERE id=$3`,
          [r2Key, fileSize || null, entityId]
        );
      } else {
        // Create new library document from upload metadata
        const { category_id, description, tags } = extraMeta;
        let { folder_id } = extraMeta;

        // Auto-create sub-folder if the file came from an uploaded directory.
        // relative_path = "90 degree/DJI_0001.JPG" → create library folder "90 degree"
        // inside folder_id, then assign files there.
        const relPath = extraMeta.relative_path;
        if (relPath) {
          const parts = relPath.split('/');
          if (parts.length > 1) {
            const subFolderName = parts[0];
            folder_id = await findOrCreateFolder(subFolderName, folder_id || null);
          }
        }

        const origFileName = fileName || metadata?.r2Key?.split('/').pop() || r2Key.split('/').pop();
        const ext      = origFileName.split('.').pop().toLowerCase();
        const mimeMap  = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
                           tiff: 'image/tiff', tif: 'image/tiff', mp4: 'video/mp4',
                           las: 'application/x-las', laz: 'application/x-laz',
                           zip: 'application/zip', kml: 'application/vnd.google-earth.kml+xml',
                           kmz: 'application/vnd.google-earth.kmz' };
        const mimeType = mimeMap[ext] || 'application/octet-stream';

        const ins = await db.query(
          `INSERT INTO library_documents
             (name, file_name, description, file_key, file_size, file_type, category_id, folder_id, uploaded_by)
           VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id`,
          [
            origFileName,
            description || null,
            r2Key,
            fileSize    || null,
            mimeType,
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
      }
    }
  } catch (err) {
    console.error('[Worker:FileUpload] Entity update failed:', err.message);
    throw err;
  }

  return entityId;
}

// ── BullMQ Worker ─────────────────────────────────────────────────────────────
const worker = new Worker(
  'file-upload',
  async (job) => {
    const {
      sessionId, r2Key, entityType, projectId,
      fileName, fileSize, mimeType, userId,
      extraMeta = {},
    } = job.data;
    let { entityId } = job.data;

    console.log(`[Worker:FileUpload] Job ${job.id} — ${entityType} ${entityId} (${fileName})`);

    // These progress frames carry the file name, and the project room includes
    // pilots — who must never learn the name of a restricted (Commercial)
    // document. Only the uploader's client can act on them anyway (it matches
    // sessionId against its own upload), so document uploads notify the uploader
    // alone; the project room still gets the id-only DOCUMENT_UPLOADED below.
    const projectBroadcast = projectId && entityType !== 'document';
    const emit = (event, payload) => {
      try {
        if (projectBroadcast) socket.emitToProject(projectId, event, payload);
        if (userId)           socket.emitToUser(userId, event, payload);
      } catch (_) {}
    };

    // Stage 1 — Validation
    emit(EVENTS.FILE_PROCESSING, { sessionId, entityId, stage: 'validation', fileName });

    const header = await readMagicBytes(r2Key);
    const { valid, detected } = detectFileType(header, mimeType);

    if (!valid) {
      emit(EVENTS.FILE_FAILED, { sessionId, entityId, reason: 'File type validation failed' });
      await db.query(
        `UPDATE deliverables SET status='rejected', rejected_reason='File type validation failed'
         WHERE id=$1 AND status='uploading'`,
        [entityId]
      );
      throw new Error('File type validation failed — magic bytes mismatch');
    }

    // Stage 2 — Metadata extraction
    emit(EVENTS.FILE_PROCESSING, { sessionId, entityId, stage: 'metadata', fileName });
    const metadata = await extractMetadata(detected || mimeType, fileName, fileSize);
    metadata.r2Key = r2Key;
    if (detected && detected !== mimeType) metadata.detectedMime = detected;

    // Stage 3 — Persist to entity (may create library_documents row when entityId is null)
    emit(EVENTS.FILE_PROCESSING, { sessionId, entityId, stage: 'saving', fileName });
    entityId = await updateEntity({ entityType, entityId, r2Key, fileSize, metadata, userId, extraMeta, fileName, projectId });

    // Stage 4 — Notify ready
    emit(EVENTS.FILE_READY, {
      sessionId,
      entityId,
      entityType,
      fileName,
      fileSize,
      metadata,
    });

    // Entity-specific events for UI cache invalidation
    if (entityType === 'deliverable' && projectId) {
      try { socket.emitToProject(projectId, EVENTS.DELIVERABLE_UPDATED, { id: entityId, status: 'uploaded' }); } catch (_) {}
    } else if (entityType === 'document' && projectId) {
      try { socket.emitToProject(projectId, EVENTS.DOCUMENT_UPLOADED, { id: entityId }); } catch (_) {}
    } else if (entityType === 'library' && userId) {
      try { socket.emitToUser(userId, EVENTS.LIBRARY_DOC_UPLOADED, { id: entityId, fileName }); } catch (_) {}
    }

    console.log(`[Worker:FileUpload] Job ${job.id} done — ${entityType} ${entityId} ready`);
    return { entityId, entityType, r2Key, metadata };
  },
  {
    connection:  getSharedConnection(),
    concurrency: 20, // 20 parallel post-processing jobs
  }
);

worker.on('failed', (job, err) => {
  console.error(`[Worker:FileUpload] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
  const { entityId, projectId, userId, sessionId } = job?.data || {};
  try {
    if (projectId) socket.emitToProject(projectId, EVENTS.FILE_FAILED, { entityId, sessionId, reason: err.message });
    if (userId)    socket.emitToUser(userId, EVENTS.FILE_FAILED, { entityId, sessionId, reason: err.message });
  } catch (_) {}
});

worker.on('error', (err) => {
  console.error('[Worker:FileUpload] Worker error:', err.message);
});

module.exports = worker;
