const http      = require('http');
const app       = require('./app');
const env       = require('./core/config/env');
const scheduler = require('./core/utils/scheduler');
const socket    = require('./core/socket/socket.gateway');
const pool      = require('./core/config/db');
const { closeAllQueues } = require('./core/queues/index');
const { closeSharedConnection } = require('./core/queues/redis');

// BullMQ prints this via console.warn once per queue connection when Redis eviction
// policy is not 'noeviction' (Redis Cloud free tier is always volatile-lru).
// Show it once, suppress duplicates — it's informational noise in dev.
let evictionWarnShown = false;
const _origWarn = console.warn;
console.warn = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('Eviction policy') || msg.includes('noeviction')) {
    if (!evictionWarnShown) {
      evictionWarnShown = true;
      _origWarn('[Redis] Note: eviction policy is volatile-lru (Redis Cloud free tier). Fine for dev; set noeviction in production.');
    }
    return;
  }
  _origWarn(...args);
};

const PORT = env.port;

// ── Global safety nets ────────────────────────────────────────────────────────
// Without these, a single unhandled promise rejection or thrown error ANYWHERE
// outside the Express request cycle — a Socket.IO handler, a fire-and-forget DB
// query, an R2 stream 'error' event, a BullMQ worker callback — crashes the whole
// Node process and takes the API down ("ERR_CONNECTION_REFUSED" in the browser).
// Express's errorHandler only catches errors inside request handlers. Log these
// and keep serving so one bad async path can't kill the server.
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled promise rejection (server kept alive):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception (server kept alive):', err);
});

const httpServer = http.createServer(app);

// Attach Socket.IO before listening
socket.init(httpServer);

httpServer.listen(PORT, () => {
  console.log(`\n🚀 Niyamak API running on http://localhost:${PORT}`);
  console.log(`📍 Environment: ${env.nodeEnv}`);
  console.log(`💡 Health check: http://localhost:${PORT}/health\n`);

  // Verify SMTP at boot so mail misconfiguration is visible immediately in logs
  require('./core/utils/mailer').verifyConnection().catch(() => {});

  // Start background tasks
  scheduler.init();

  // Start BullMQ workers in-process (so npm run dev handles both API + workers)
  require('./core/workers/index');
});

// ── Coordinated graceful shutdown ─────────────────────────────────────────────
// Closes everything IN ORDER before exiting so nodemon restarts (and real
// deploys) never leak Redis/DB connections:
//   1. stop accepting HTTP   2. close workers   3. close queues
//   4. close shared Redis    5. close DB pool   6. exit
// Without this, an abrupt exit left connections open on Redis Cloud until TCP
// timeout, exhausting the 30-client free-tier cap → reconnect storms.
let shuttingDown = false;
const gracefulShutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[Shutdown] ${signal} received — closing gracefully…`);

  // Hard fallback: if cleanup hangs (e.g. Redis unreachable), force-exit at 8s.
  const force = setTimeout(() => { console.warn('[Shutdown] Timed out — forcing exit.'); process.exit(1); }, 8000);
  force.unref();

  try { httpServer.close(); } catch { /* ignore */ }
  try {
    const { closeWorkers } = require('./core/workers/index');
    if (typeof closeWorkers === 'function') await closeWorkers();
  } catch { /* workers not started */ }
  try { await closeAllQueues(); }        catch { /* ignore */ }
  try { await closeSharedConnection(); } catch { /* ignore */ }
  try { await pool.end(); }              catch { /* ignore */ }

  console.log('[Shutdown] Clean. Bye.');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
