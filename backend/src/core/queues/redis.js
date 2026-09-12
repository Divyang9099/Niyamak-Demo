/**
 * Redis connection for BullMQ.
 *
 * BullMQ requires ioredis. We create a shared connection factory so every
 * queue/worker uses the same Redis config without duplicating env reads.
 *
 * Graceful degradation: if REDIS_URL is missing the module still exports
 * connection factories that return null — callers must handle null and fall
 * back to direct (synchronous) execution.
 */

const IORedis  = require('ioredis');
const env      = require('../config/env');

const REDIS_URL = process.env.REDIS_URL || null;

// Whether Redis is configured at all
const REDIS_ENABLED = !!REDIS_URL;

if (!REDIS_ENABLED) {
  console.warn('[Queue] REDIS_URL not set — queue system disabled. Jobs will run synchronously (degraded mode).');
}

/**
 * Create a new ioredis connection.
 *
 * NOTE on connection budget: Redis Cloud free tier caps at 30 clients.
 * Every Queue/Worker that receives a *config object* makes BullMQ open its
 * own connection (workers open TWO — regular + blocking). 9 queues +
 * 6 workers used to consume 21+, and nodemon restarts leaked the old ones
 * until TCP timeout → "ERR max number of clients reached".
 *
 * Fix: share ONE ioredis instance everywhere via getSharedConnection().
 * BullMQ accepts an instance and only duplicates it where a blocking
 * connection is truly required (one dupe per Worker) → ~7 connections total.
 */
// Module-level throttle so a storm of reconnects (many connections dropping at
// once) logs ONE summary line every 15s instead of dozens of duplicates.
let _lastReconnectLogAt = 0;
const logReconnectThrottled = (delay) => {
  const now = Date.now();
  if (now - _lastReconnectLogAt > 15000) {
    _lastReconnectLogAt = now;
    console.warn(`[Redis] Reconnecting to Redis (retry in ${delay}ms)…`);
  }
};

const createConnection = () => {
  if (!REDIS_ENABLED) return null;

  const conn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,    // Required by BullMQ
    enableReadyCheck:      false,  // Required by BullMQ
    lazyConnect:           false,
    connectTimeout:        10000,
    keepAlive:             15000,  // TCP keepalive — prevents ECONNRESET on idle free-tier connections
    retryStrategy: (times) => {
      const delay = Math.min(2000 * 2 ** Math.min(times, 5), 60000); // 2s → 64s cap
      logReconnectThrottled(delay);
      return delay;
    },
    reconnectOnError: (err) => {
      const reconnectErrors = ['READONLY', 'ETIMEDOUT', 'ECONNREFUSED'];
      return reconnectErrors.some(e => err.message.includes(e));
    },
  });

  // Throttle error spam — identical messages logged at most once per 30s
  let lastErrMsg = '', lastErrAt = 0;
  conn.on('error', (err) => {
    const now = Date.now();
    if (err.message !== lastErrMsg || now - lastErrAt > 30000) {
      console.error('[Redis] Connection error:', err.message);
      lastErrMsg = err.message; lastErrAt = now;
    }
  });
  conn.on('connect', () => console.log('[Redis] Connected'));

  return conn;
};

// Singleton — ALL queues and workers must use this one instance.
let sharedConnection = null;
const getSharedConnection = () => {
  if (!REDIS_ENABLED) return null;
  if (!sharedConnection) sharedConnection = createConnection();
  return sharedConnection;
};

// Close the shared connection on shutdown so nodemon restarts don't leak
// connections on the server side (Redis Cloud free tier: 30-client cap).
const closeSharedConnection = async () => {
  if (!sharedConnection) return;
  try { await sharedConnection.quit(); } catch { /* already closing */ }
  sharedConnection = null;
};

/**
 * Shared default BullMQ connection options (do NOT pass a pre-created connection
 * here; pass these options so BullMQ creates its own connection per instance).
 */
const defaultJobOptions = {
  attempts:      3,
  backoff: {
    type:  'exponential',
    delay: 2000,           // 2s → 4s → 8s
  },
  removeOnComplete: { count: 500 },  // Keep last 500 completed jobs
  removeOnFail:     { count: 1000 }, // Keep last 1000 failed jobs
};

module.exports = {
  REDIS_ENABLED,
  REDIS_URL,
  createConnection,
  getSharedConnection,
  closeSharedConnection,
  defaultJobOptions,
};
