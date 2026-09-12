/**
 * Central queue registry.
 *
 * Every queue is exported from here so domain services import a single
 * symbol rather than constructing queues inline.
 *
 * If Redis is unavailable all queues are null and the addJob() helper
 * falls back to executing the task directly.
 */

const { Queue }          = require('bullmq');
const { REDIS_ENABLED, getSharedConnection, defaultJobOptions } = require('./redis');

const makeQueue = (name, overrides = {}) => {
  if (!REDIS_ENABLED) return null;
  // Shared connection instance — queues issue plain commands only, so all 9
  // can multiplex over one socket (Redis Cloud free tier: 30-client cap).
  return new Queue(name, {
    connection:         getSharedConnection(),
    defaultJobOptions:  { ...defaultJobOptions, ...overrides },
  });
};

// ── Queue definitions ──────────────────────────────────────────────────────
const emailQueue        = makeQueue('email',        { attempts: 5 });
const whatsappQueue     = makeQueue('whatsapp',     { attempts: 3 });
const notificationQueue = makeQueue('notification', { attempts: 3 });
const pdfQueue          = makeQueue('pdf-export',   { attempts: 2 });
const excelQueue        = makeQueue('excel-export', { attempts: 2 });
const zipQueue          = makeQueue('zip',          { attempts: 2 });
const fileUploadQueue   = makeQueue('file-upload',  { attempts: 3 });
const reminderQueue     = makeQueue('reminder',     { attempts: 3 });
const cleanupQueue      = makeQueue('cleanup',      { attempts: 2 });

// ── addJob helper ──────────────────────────────────────────────────────────
/**
 * Enqueue a job. Falls back to direct execution if Redis is unavailable.
 *
 * @param {Queue|null}  queue       - Queue instance (may be null in degraded mode)
 * @param {string}      jobName     - BullMQ job name
 * @param {object}      data        - Job payload
 * @param {Function}    fallbackFn  - Direct execution fallback (async)
 * @param {object}      [opts]      - BullMQ job options (priority, delay, jobId …)
 * @returns {Promise<*>}            - Job instance or fallback result
 */
// Timeout for queue.add() — if Redis doesn't respond within this window we
// fall back to direct execution rather than hanging the request indefinitely.
// (maxRetriesPerRequest: null means ioredis retries forever — the promise
//  never rejects on its own when Redis is unreachable.)
const QUEUE_TIMEOUT_MS = 5000;

const addJob = async (queue, jobName, data, fallbackFn, opts = {}) => {
  if (!queue || !REDIS_ENABLED) {
    console.warn(`[Queue] Degraded mode — running '${jobName}' synchronously`);
    return fallbackFn ? fallbackFn(data) : null;
  }
  try {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Queue timeout after ${QUEUE_TIMEOUT_MS}ms`)), QUEUE_TIMEOUT_MS)
    );
    return await Promise.race([queue.add(jobName, data, opts), timeout]);
  } catch (err) {
    console.warn(`[Queue] '${jobName}' enqueue failed (${err.message}) — running synchronously`);
    return fallbackFn ? fallbackFn(data) : null;
  }
};

// Close all queues on shutdown so their connections release cleanly (prevents
// leaked connections accumulating across nodemon restarts).
const closeAllQueues = async () => {
  const all = [
    emailQueue, whatsappQueue, notificationQueue, pdfQueue, excelQueue,
    zipQueue, fileUploadQueue, reminderQueue, cleanupQueue,
  ].filter(Boolean);
  await Promise.allSettled(all.map(q => q.close()));
};

module.exports = {
  emailQueue,
  whatsappQueue,
  notificationQueue,
  pdfQueue,
  excelQueue,
  zipQueue,
  fileUploadQueue,
  reminderQueue,
  cleanupQueue,
  addJob,
  closeAllQueues,
  REDIS_ENABLED,
};
