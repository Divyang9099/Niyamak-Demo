const { Pool, types } = require('pg');
const env = require('./env');

// ── Date handling ─────────────────────────────────────────────────────────────
// DATE columns (OID 1082) are timezone-naive calendar days. Return raw
// "YYYY-MM-DD" strings so the frontend never gets a phantom UTC-shifted day.
types.setTypeParser(1082, (val) => val);

// ── Pool sizing ───────────────────────────────────────────────────────────────
// Local dev:        10 is plenty (API + workers share one pool)
// Cloud Postgres:   Supabase free=15, paid=25–60, Neon=100, RDS t3.micro=66
//                   → keep DB_POOL_MAX to ≤ (limit / 2) to leave room for
//                     pgAdmin / migrations / other processes.
// Hard cap at 20 so even an accidental DB_POOL_MAX=1000 can't starve the DB.
const poolMax = Math.min(20, Math.max(2, Number(process.env.DB_POOL_MAX) || 10));

// ── Connection timeouts ───────────────────────────────────────────────────────
// Cloud Postgres providers enforce their own server-side idle timeout, e.g.:
//   Supabase free: 60 s  |  paid: 5 min  |  Neon: immediate on suspend
// Strategy: evict pool-side idle connections at 8 s so the pool clears the
// stale slot BEFORE the server kills it, eliminating the "connection terminated
// due to connection timeout" error that occurs when pg-pool hands a dead socket
// to a new query.
// If the slot is already dead when the query arrives, the one-shot retry below
// picks it up transparently.
const IDLE_TIMEOUT_MS = Number(process.env.DB_IDLE_TIMEOUT_MS) || 8_000;
// Max time to wait for a free slot when the pool is fully busy. Set higher than
// the statement timeout so a slot freed by a killed query can be claimed.
const CONN_TIMEOUT_MS = Number(process.env.DB_CONN_TIMEOUT_MS) || 15_000;
// Kill any single query running > 12 s (runaway / lock-contention guard).
const STMT_TIMEOUT_MS = Number(process.env.DB_STMT_TIMEOUT_MS) || 12_000;

const pool = new Pool({
  host:     env.db.host,
  port:     env.db.port,
  database: env.db.database,
  user:     env.db.user,
  password: env.db.password,

  // SSL: always on in production; in dev only when DB_SSL=true (cloud DBs like Neon require it)
  ssl: (env.nodeEnv === 'production' || process.env.DB_SSL === 'true') ? { rejectUnauthorized: false } : false,

  max:                     poolMax,
  idleTimeoutMillis:       IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: CONN_TIMEOUT_MS,

  // TCP-level keepalives — prevents NAT/firewall/cloud-load-balancer from
  // silently dropping the TCP session while pg-pool thinks it is open.
  // Initial delay of 5 s means the first probe fires 5 s after the socket
  // goes idle; subsequent probes are controlled by the OS (typically 75 s).
  keepAlive:                    true,
  keepAliveInitialDelayMillis:  5_000,

  // Per-query hard kill at the DB server level
  statement_timeout: STMT_TIMEOUT_MS,
  query_timeout:     STMT_TIMEOUT_MS,

  // Label connections in pg_stat_activity for easier cloud monitoring
  application_name: `varuna-ops-${env.nodeEnv}`,
});

// ── Error surface ─────────────────────────────────────────────────────────────
pool.on('error', (err) => {
  // "Connection terminated unexpectedly" / "ECONNRESET" are normal on cloud
  // Postgres — the pool will remove the dead client and create a fresh one.
  // Only log at warn so it doesn't drown the console.
  console.warn('[DB] Idle client error (pool auto-recovers):', err.message);
});

// ── One-shot retry wrapper ────────────────────────────────────────────────────
// When a query lands on a stale connection that the server already closed, pg
// throws one of the errors below. We catch it, let pg-pool discard that slot,
// and immediately reissue the query — the pool will open a fresh connection.
// This covers the race between pool-side eviction (8 s) and server-side kill.
const RETRYABLE_MSGS = [
  'Connection terminated',
  'connection timeout',
  'Client was closed',
  'ECONNRESET',
  'ENOTFOUND',
  'ECONNREFUSED',
  'read ETIMEDOUT',
  'write ETIMEDOUT',
];
const isRetryable = (err) =>
  RETRYABLE_MSGS.some((m) => String(err?.message || '').includes(m));

const _rawQuery = pool.query.bind(pool);
pool.query = (...args) =>
  _rawQuery(...args).catch((err) => {
    if (isRetryable(err)) {
      console.warn('[DB] Retrying query after transient connection error:', err.message);
      return _rawQuery(...args);
    }
    throw err;
  });

// ── Startup probe ─────────────────────────────────────────────────────────────
let _resolveReady;
const whenReady = new Promise((resolve) => { _resolveReady = resolve; });

const _testConnection = (attemptsLeft, delayMs) => {
  pool.connect((err, _client, release) => {
    if (err) {
      if (attemptsLeft > 1) {
        console.warn(`[DB] Connection attempt failed (${err.message}), retrying in ${delayMs / 1000}s…`);
        setTimeout(() => _testConnection(attemptsLeft - 1, Math.min(delayMs * 2, 10_000)), delayMs);
      } else {
        console.error('❌ Database connection failed:', err.message);
      }
    } else {
      console.log(`✅ Connected to PostgreSQL → Niyamak (pool max=${poolMax}, idle evict=${IDLE_TIMEOUT_MS}ms)`);
      release();
      _resolveReady();
    }
  });
};
_testConnection(5, 2_000); // up to 5 attempts: 2s → 4s → 8s → 10s → 10s

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// NOTE: we deliberately do NOT register SIGTERM/SIGINT → process.exit() here.
// Doing so killed the process before BullMQ/Redis connections closed, leaking
// Redis connections on every nodemon restart until the server-side TCP timeout
// (→ "ERR max number of clients reached"). Shutdown is now coordinated in
// server.js, which closes workers → queues → Redis → this pool, then exits.

pool.whenReady = whenReady;
module.exports = pool;
