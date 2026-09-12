const { Worker } = require('bullmq');
const { REDIS_ENABLED, getSharedConnection } = require('../queues/redis');
const db = require('../config/db');

if (!REDIS_ENABLED) {
  console.warn('[Worker:Notification] Redis not configured — worker not started.');
  module.exports = null;
  return;
}

/**
 * Bulk notification processor.
 * Job data: { notifications: [{ user_id, title, message }] }
 *
 * Used by the scheduler and bulk-broadcast flows to avoid blocking the API
 * thread when creating tens or hundreds of notifications at once.
 */
const worker = new Worker(
  'notification',
  async (job) => {
    const { notifications } = job.data;
    if (!Array.isArray(notifications) || notifications.length === 0) return { inserted: 0 };

    console.log(`[Worker:Notification] Processing job ${job.id} — ${notifications.length} notifications`);

    // Batch insert using unnest for efficiency
    const userIds = notifications.map(n => n.user_id);
    const titles  = notifications.map(n => n.title);
    const messages = notifications.map(n => n.message);

    const result = await db.query(
      `INSERT INTO notifications (user_id, title, message)
       SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[])
       ON CONFLICT DO NOTHING
       RETURNING id, user_id`,
      [userIds, titles, messages]
    );

    return { inserted: result.rowCount };
  },
  {
    connection: getSharedConnection(),
    concurrency: 3,
  }
);

worker.on('completed', (job, result) => {
  console.log(`[Worker:Notification] Job ${job.id} done — inserted ${result?.inserted ?? 0}`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker:Notification] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[Worker:Notification] Worker error:', err.message);
});

module.exports = worker;
