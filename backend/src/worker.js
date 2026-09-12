/**
 * Background worker process entry point.
 *
 * Runs independently from the API server. Starts:
 *   1. BullMQ workers (email, notification, export, cleanup)
 *   2. Cron scheduler (expiry checks, reminders)
 *
 * Start with: node src/worker.js
 * PM2 example: pm2 start src/worker.js --name varuna-workers
 */

require('./core/config/env');   // load .env first
require('./core/config/db');    // establish DB pool before any queries

// Start queue workers (no-op if Redis not configured)
require('./core/workers/index');

// Start cron scheduler
const scheduler = require('./core/utils/scheduler');
scheduler.init();

console.log('[Worker Process] Started. Queue workers + scheduler active.');
