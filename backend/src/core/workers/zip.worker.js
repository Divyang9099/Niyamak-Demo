/**
 * ZIP Bundle Worker
 *
 * Runs when a PM clicks "Download All Deliverables".
 * Instead of blocking the HTTP thread (which caused guaranteed timeouts),
 * this worker:
 *   1. Fetches all deliverable R2 keys for the project
 *   2. Streams each file from R2 in parallel (concurrency: 5)
 *   3. Pipes them into an archiver ZIP stream
 *   4. Uploads the resulting ZIP to R2
 *   5. Generates a presigned 24h download URL
 *   6. Emits 'bundle:ready' to the requesting user via socket
 *   7. Saves the bundle record to deliverable_bundles table
 */

const { Worker, Queue } = require('bullmq');
const { REDIS_ENABLED, getSharedConnection } = require('../queues/redis');
const archiver = require('archiver');
const { PassThrough } = require('stream');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl }     = require('@aws-sdk/s3-request-presigner');
const { Upload }           = require('@aws-sdk/lib-storage');
const r2   = require('../config/r2');
const env  = require('../config/env');
const db   = require('../config/db');
const socket = require('../socket/socket.gateway');
const EVENTS = require('../socket/socket.events');
const { randomUUID } = require('crypto');

if (!REDIS_ENABLED) {
  console.warn('[Worker:ZIP] Redis not configured — worker not started.');
  module.exports = null;
  return;
}

const BUNDLE_URL_EXPIRY = 24 * 60 * 60; // 24 hours

// Fetch a single R2 object stream (with retry)
async function fetchR2Stream(key, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const cmd = new GetObjectCommand({ Bucket: env.r2.bucket, Key: key });
      const res = await r2.send(cmd);
      return res.Body; // ReadableStream
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

// Stream a ZIP of all deliverables directly to R2 via multipart upload.
// The archive is NEVER fully held in memory — archiver pipes into a PassThrough,
// and @aws-sdk/lib-storage uploads parts as they arrive (with backpressure, so
// the source R2 read streams are throttled to match upload speed). Files are
// fetched and appended one at a time to bound the open-connection / buffer count.
async function streamZipToR2(deliverables, projectId, bundleId) {
  const key = `zips/${projectId}/${Date.now()}-${bundleId}.zip`;

  const archive = archiver('zip', { zlib: { level: 6 } });
  const passthrough = new PassThrough();

  archive.on('warning', (warn) => {
    if (warn.code !== 'ENOENT') console.warn('[Worker:ZIP] Archiver warning:', warn.message);
  });

  // Pipe archive output into the upload stream
  archive.pipe(passthrough);

  // Start the multipart upload (consumes passthrough as data flows)
  const uploader = new Upload({
    client: r2,
    params: {
      Bucket:      env.r2.bucket,
      Key:         key,
      Body:        passthrough,
      ContentType: 'application/zip',
      ContentDisposition: `attachment; filename="deliverables-${projectId.slice(0, 8)}.zip"`,
    },
    queueSize:         4,
    partSize:          10 * 1024 * 1024, // 10 MB parts
    leavePartsOnError: false,
  });

  // Surface archive errors onto the upload stream so uploader.done() rejects
  archive.on('error', (err) => passthrough.destroy(err));

  // Append each file sequentially — one open R2 read stream at a time.
  const appendAll = (async () => {
    for (let i = 0; i < deliverables.length; i++) {
      const item = deliverables[i];
      try {
        const stream = await fetchR2Stream(item.file_key);
        const ext = item.format
          ? item.format.replace(/^\./, '')
          : (item.file_key.split('.').pop() || '');
        const baseName = item.name || item.file_key.split('/').pop().replace(/\.[^/.]+$/, '') || `file-${i + 1}`;
        const safeName = ext ? `${baseName}.${ext}` : baseName;

        // archiver consumes the entry with backpressure; await its completion
        // before moving to the next file to keep memory bounded.
        await new Promise((resolve, reject) => {
          stream.on('error', reject);
          archive.on('entry', function onEntry() {
            archive.removeListener('entry', onEntry);
            resolve();
          });
          archive.append(stream, { name: safeName });
        });
      } catch (err) {
        console.error(`[Worker:ZIP] Skipping ${item.file_key}:`, err.message);
      }
    }
    await archive.finalize();
  })();

  // Wait for both the appends/finalize and the upload to complete
  await Promise.all([appendAll, uploader.done()]);

  const bytes = archive.pointer(); // total compressed bytes written

  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
    { expiresIn: BUNDLE_URL_EXPIRY }
  );

  return { key, url, bytes };
}

const worker = new Worker(
  'zip',
  async (job) => {
    const { projectId, userId, bundleId, projectName } = job.data;

    console.log(`[Worker:ZIP] Job ${job.id} — bundling deliverables for project ${projectId}`);

    // Mark bundle as processing
    await db.query(
      `UPDATE deliverable_bundles SET status='processing' WHERE id=$1`, [bundleId]
    );

    // Fetch all deliverables with files — include format so we can restore the extension
    const result = await db.query(
      `SELECT name, format, file_key FROM deliverables
       WHERE project_id=$1 AND file_key IS NOT NULL AND status IN ('uploaded','approved')
       ORDER BY name`,
      [projectId]
    );

    if (!result.rows.length) {
      await db.query(
        `UPDATE deliverable_bundles SET status='failed', error_msg='No uploaded deliverables found' WHERE id=$1`,
        [bundleId]
      );
      socket.emitToUser(userId, EVENTS.BUNDLE_FAILED, { bundleId, projectId, reason: 'No files to bundle' });
      return;
    }

    const deliverables = result.rows;

    // Stream ZIP straight to R2 (never buffers the whole archive in memory)
    const { key: r2Key, url, bytes } = await streamZipToR2(deliverables, projectId, bundleId);
    const expiresAt = new Date(Date.now() + BUNDLE_URL_EXPIRY * 1000);
    const zipName   = `${(projectName || 'project').replace(/\s+/g, '_')}_deliverables.zip`;

    // Update bundle record
    await db.query(
      `UPDATE deliverable_bundles
       SET status='ready', r2_key=$1, presigned_url=$2, url_expires_at=$3,
           file_count=$4, total_size=$5, completed_at=NOW()
       WHERE id=$6`,
      [r2Key, url, expiresAt, deliverables.length, bytes, bundleId]
    );

    // Notify the requesting user
    try {
      socket.emitToUser(userId, EVENTS.BUNDLE_READY, {
        bundleId,
        projectId,
        url,
        fileName: zipName,
        fileCount: deliverables.length,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (_) {}

    console.log(
      `[Worker:ZIP] Job ${job.id} done — ${deliverables.length} files, ` +
      `${(bytes / 1e6).toFixed(1)} MB`
    );

    return { bundleId, r2Key, fileCount: deliverables.length };
  },
  {
    connection:  getSharedConnection(),
    concurrency: 2, // ZIP building is memory-intensive
  }
);

worker.on('failed', async (job, err) => {
  console.error(`[Worker:ZIP] Job ${job?.id} failed:`, err.message);
  const { bundleId, userId } = job?.data || {};
  if (bundleId) {
    await db.query(
      `UPDATE deliverable_bundles SET status='failed', error_msg=$1 WHERE id=$2`,
      [err.message, bundleId]
    ).catch(() => {});
  }
  if (userId) {
    try { socket.emitToUser(userId, EVENTS.BUNDLE_FAILED, { bundleId, reason: err.message }); } catch (_) {}
  }
});

worker.on('error', (err) => console.error('[Worker:ZIP] Worker error:', err.message));

module.exports = worker;
