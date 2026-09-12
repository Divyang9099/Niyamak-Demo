const os     = require('os');
const crypto = require('crypto');
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
const pool   = require('../../core/config/db');
const r2     = require('../../core/config/r2');
const env    = require('../../core/config/env');
const { getSharedConnection, REDIS_ENABLED } = require('../../core/queues/redis');

const R2_FREE_LIMIT_GB  = 10;
// SHA-256 of the super-admin secret. Prefer the env var so the real secret can be
// rotated without a code change; the committed hash is only a fallback so existing
// deploys keep working until SUPER_ADMIN_SECRET_HASH is set. Rotate it by setting
// the env var to a new sha256 and removing this literal.
const SA_SECRET_HASH = (process.env.SUPER_ADMIN_SECRET_HASH || 'e3c2b99eb851cdb69e674e8226e13307b73f42a494203e5d23d2d3b653eb3153').toLowerCase();
const R2_FREE_LIMIT_B   = R2_FREE_LIMIT_GB * 1024 * 1024 * 1024;
const NEON_FREE_LIMIT_B = 512 * 1024 * 1024; // 512 MB Neon free tier

// Constant-time compare of two hex-encoded SHA-256 digests (always equal length).
const hashesEqual = (a, b) => {
  try { return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); }
  catch { return false; }
};

exports.getMetrics = async (req, res, next) => {
  try {
    const incoming = req.body?.secret || '';
    const hash = crypto.createHash('sha256').update(incoming).digest('hex');
    if (!hashesEqual(hash, SA_SECRET_HASH)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const [db, tables, app, r2Stats, redis, server] = await Promise.all([
      getDbStats(),
      getTableStats(),
      getAppStats(),
      getR2Stats(),
      getRedisStats(),
      getServerStats(),
    ]);

    res.json({ success: true, data: { db, tables, app, r2: r2Stats, redis, server } });
  } catch (err) {
    next(err);
  }
};

async function getDbStats() {
  const { rows } = await pool.query(`
    SELECT
      pg_database_size(current_database())                   AS bytes,
      pg_size_pretty(pg_database_size(current_database()))   AS pretty,
      current_database()                                     AS name,
      (SELECT count(*) FROM pg_stat_activity
       WHERE datname = current_database())                   AS connections,
      (SELECT count(*) FROM schema_migrations)               AS migrations
  `);
  const row = rows[0];
  return {
    ...row,
    bytes: Number(row.bytes),
    connections: Number(row.connections),
    migrations: Number(row.migrations),
    free_limit_bytes: NEON_FREE_LIMIT_B,
    percent_used: ((Number(row.bytes) / NEON_FREE_LIMIT_B) * 100).toFixed(1),
  };
}

async function getTableStats() {
  const { rows } = await pool.query(`
    SELECT
      t.tablename,
      pg_size_pretty(pg_total_relation_size(quote_ident(t.tablename))) AS size,
      pg_total_relation_size(quote_ident(t.tablename))                 AS size_bytes,
      COALESCE(s.n_live_tup, 0)                                        AS rows
    FROM pg_tables t
    LEFT JOIN pg_stat_user_tables s ON s.relname = t.tablename
    WHERE t.schemaname = 'public'
    ORDER BY size_bytes DESC
    LIMIT 25
  `);
  return rows.map(r => ({ ...r, size_bytes: Number(r.size_bytes), rows: Number(r.rows) }));
}

async function getAppStats() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users    WHERE deleted_at IS NULL)          AS users,
      (SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL)          AS projects,
      (SELECT COUNT(*) FROM pilots   WHERE deleted_at IS NULL)          AS pilots,
      (SELECT COUNT(*) FROM drones   WHERE deleted_at IS NULL)          AS drones,
      (SELECT COUNT(*) FROM pipeline)                                   AS leads,
      (SELECT COUNT(*) FROM upload_sessions WHERE status = 'completed') AS files,
      (SELECT COALESCE(SUM(file_size),0) FROM upload_sessions
         WHERE status = 'completed')                                    AS total_file_bytes,
      (SELECT COUNT(*) FROM activity_logs)                              AS audit_entries
  `);
  const r = rows[0];
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)]));
}

async function getR2Stats() {
  let totalBytes = 0, totalObjects = 0, token;
  const MAX = 10000;
  let capped = false;

  try {
    do {
      const resp = await r2.send(new ListObjectsV2Command({
        Bucket: env.r2.bucket, MaxKeys: 1000, ContinuationToken: token,
      }));
      for (const obj of resp.Contents || []) {
        totalBytes += obj.Size || 0;
        totalObjects++;
      }
      token = resp.NextContinuationToken;
      if (totalObjects >= MAX && resp.IsTruncated) { capped = true; break; }
    } while (token);
  } catch (err) {
    return { error: err.message, bucket: env.r2.bucket };
  }

  return {
    bucket: env.r2.bucket,
    total_bytes: totalBytes,
    total_objects: totalObjects,
    capped,
    free_limit_bytes: R2_FREE_LIMIT_B,
    free_limit_gb: R2_FREE_LIMIT_GB,
    percent_used: ((totalBytes / R2_FREE_LIMIT_B) * 100).toFixed(2),
  };
}

async function getRedisStats() {
  if (!REDIS_ENABLED) return { enabled: false };
  try {
    const conn = getSharedConnection();
    const raw  = await conn.info('all');
    const get  = (key) => {
      const m = raw.match(new RegExp(`^${key}:(.+)$`, 'm'));
      return m ? m[1].trim() : null;
    };
    const dbLine = get('db0') || '';
    const keysMatch = dbLine.match(/keys=(\d+)/);
    return {
      enabled: true,
      version:           get('redis_version'),
      mode:              get('redis_mode'),
      role:              get('role'),
      uptime_days:       Number(get('uptime_in_days') || 0),
      uptime_seconds:    Number(get('uptime_in_seconds') || 0),
      connected_clients: Number(get('connected_clients') || 0),
      used_memory_human: get('used_memory_human'),
      used_memory_bytes: Number(get('used_memory') || 0),
      peak_memory_human: get('used_memory_peak_human'),
      total_keys:        keysMatch ? Number(keysMatch[1]) : 0,
      total_commands:    Number(get('total_commands_processed') || 0),
      hit_rate:          get('keyspace_hits') && get('keyspace_misses')
        ? ((Number(get('keyspace_hits')) / Math.max(1, Number(get('keyspace_hits')) + Number(get('keyspace_misses')))) * 100).toFixed(1) + '%'
        : 'N/A',
    };
  } catch (err) {
    return { enabled: true, error: err.message };
  }
}

function getServerStats() {
  const mem = process.memoryUsage();
  const upSec = Math.floor(process.uptime());
  return {
    node_version: process.version,
    env:          env.nodeEnv,
    uptime_seconds: upSec,
    uptime_human:   fmtUptime(upSec),
    heap_used:      mem.heapUsed,
    heap_total:     mem.heapTotal,
    rss:            mem.rss,
    os_platform:    os.platform(),
    os_arch:        os.arch(),
    os_total_mem:   os.totalmem(),
    os_free_mem:    os.freemem(),
    os_mem_percent: (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1),
    cpu_count:      os.cpus().length,
    cpu_model:      os.cpus()[0]?.model || 'unknown',
    load_avg:       os.loadavg().map(v => v.toFixed(2)),
    hostname:       os.hostname(),
  };
}

function fmtUptime(s) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
