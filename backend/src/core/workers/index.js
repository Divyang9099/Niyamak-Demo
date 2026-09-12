/**
 * Worker bootstrapper.
 *
 * Imports all worker modules to start their BullMQ Worker instances.
 * Run this file as a separate process: `node src/core/workers/index.js`
 * (or via the `worker.js` entry point at the src root).
 */

const { REDIS_ENABLED } = require('../queues/redis');

// IMPORTANT: this module is required IN-PROCESS by the API server (server.js)
// as well as by the standalone worker entry point (worker.js). It must NEVER
// call process.exit() — doing so would terminate the API server on boot when
// Redis is absent. In degraded (no-Redis) mode we simply register no workers
// and let jobs fall back to synchronous execution via addJob().
let workers = [];

if (!REDIS_ENABLED) {
  console.warn('[Workers] Redis not configured — no workers started (degraded/synchronous mode).');
} else {
  // Importing a worker module registers its Worker instance immediately.
  const emailWorker        = require('./email.worker');
  const notificationWorker = require('./notification.worker');
  const exportWorker       = require('./export.worker');
  const cleanupWorker      = require('./cleanup.worker');
  const fileUploadWorker   = require('./fileUpload.worker');
  const zipWorker          = require('./zip.worker');

  workers = [
    emailWorker, notificationWorker, exportWorker,
    cleanupWorker, fileUploadWorker, zipWorker,
  ].filter(Boolean);

  console.log(`[Workers] ${workers.length} worker(s) active and listening for jobs.`);

  // Standalone worker process (worker.js) owns its own lifecycle and must exit
  // on signal. When embedded in the API, server.js coordinates shutdown and
  // calls closeWorkers() — so we DON'T register duplicate handlers here that
  // would race and exit the process before Redis/DB close cleanly.
  const isStandalone = require.main === module || /worker\.js$/.test(require.main?.filename || '');
  if (isStandalone) {
    const shutdown = async (signal) => {
      console.log(`[Workers] ${signal} received — closing workers...`);
      await closeWorkers();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  }
}

// Close all worker instances — awaited by the coordinated shutdown in server.js.
const closeWorkers = async () => {
  await Promise.allSettled(workers.map(w => w.close()));
};

module.exports = { workers, closeWorkers };
