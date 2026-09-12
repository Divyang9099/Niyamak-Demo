const { Worker } = require('bullmq');
const { REDIS_ENABLED, getSharedConnection } = require('../queues/redis');
const db = require('../config/db');
const mp = require('../utils/r2Multipart');

if (!REDIS_ENABLED) {
  console.warn('[Worker:Cleanup] Redis not configured — worker not started.');
  module.exports = null;
  return;
}

/**
 * Cleanup worker for background housekeeping tasks.
 *
 * Supported job types (job.data.type):
 *   'old_notifications' — removes read notifications older than `days` days
 *   'old_audit_logs'    — removes audit logs older than `days` days
 */
const HANDLERS = {
  async old_notifications({ days = 90 }) {
    const result = await db.query(
      `DELETE FROM notifications
       WHERE is_read = true AND created_at < NOW() - ($1 || ' days')::interval`,
      [days]
    );
    return { deleted: result.rowCount, table: 'notifications' };
  },

  async old_audit_logs({ days = 180 }) {
    const result = await db.query(
      `DELETE FROM activity_logs WHERE created_at < NOW() - ($1 || ' days')::interval`,
      [days]
    );
    return { deleted: result.rowCount, table: 'activity_logs' };
  },

  async expired_upload_sessions() {
    // Abort the underlying R2 multipart upload for each expired session BEFORE
    // marking it — otherwise the already-uploaded parts linger in R2 forever and
    // accrue storage cost (R2 has no automatic incomplete-multipart cleanup).
    const expired = await db.query(
      `SELECT id, r2_key, r2_upload_id FROM upload_sessions
       WHERE status='active' AND expires_at < NOW()
       LIMIT 500`
    );

    let aborted = 0;
    for (const s of expired.rows) {
      if (s.r2_key && s.r2_upload_id) {
        try {
          await mp.abortMultipartUpload({ key: s.r2_key, uploadId: s.r2_upload_id });
          aborted++;
        } catch (err) {
          // Already aborted/completed/gone — safe to ignore, still mark expired below.
          console.warn(`[Worker:Cleanup] abort multipart failed for session ${s.id}: ${err.message}`);
        }
      }
    }

    const result = await db.query(
      `UPDATE upload_sessions SET status='expired', updated_at=NOW()
       WHERE status='active' AND expires_at < NOW()`
    );
    return { updated: result.rowCount, aborted, table: 'upload_sessions' };
  },

  // Watchdog: a ZIP bundle stuck in queued/processing (e.g. the zip worker crashed
  // mid-job) would otherwise hang the UI forever. Fail anything older than `hours`.
  async stuck_bundles({ hours = 1 }) {
    const result = await db.query(
      `UPDATE deliverable_bundles
       SET status='failed', error_msg=COALESCE(error_msg,'Timed out — worker did not finish')
       WHERE status IN ('queued','processing')
         AND created_at < NOW() - ($1 || ' hours')::interval`,
      [String(hours)]
    );
    return { updated: result.rowCount, table: 'deliverable_bundles' };
  },
};

const worker = new Worker(
  'cleanup',
  async (job) => {
    const { type } = job.data;
    const handler = HANDLERS[type];
    if (!handler) throw new Error(`Unknown cleanup type: ${type}`);

    console.log(`[Worker:Cleanup] Job ${job.id} — running '${type}'`);
    return handler(job.data);
  },
  {
    connection: getSharedConnection(),
    concurrency: 1,
  }
);

worker.on('completed', (job, result) => {
  const n = result?.deleted ?? result?.updated ?? 0;
  const extra = result?.aborted != null ? ` (R2 aborts: ${result.aborted})` : '';
  console.log(`[Worker:Cleanup] Job ${job.id} done — ${n} rows on ${result?.table}${extra}`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker:Cleanup] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[Worker:Cleanup] Worker error:', err.message);
});

module.exports = worker;
