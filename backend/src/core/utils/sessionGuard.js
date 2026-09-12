/**
 * Session guard (H-4) — revalidates a decoded JWT against live user state so that
 * deactivation, role changes and password resets take effect quickly instead of
 * living the full JWT lifetime (previously up to 8h).
 *
 * A short in-memory cache (per process) keeps this from becoming a DB hit on every
 * request: at most one lookup per user per CACHE_TTL_MS. Forced changes call
 * invalidate(userId) so they apply immediately.
 *
 * Checks:
 *   • user still exists and is not soft-deleted        → else 'account_disabled'
 *   • token was issued AFTER users.tokens_valid_after   → else 'session_expired'
 * Returns the FRESH role from the DB so role changes apply without re-login.
 */
const db = require('../config/db');

const CACHE_TTL_MS = 30_000;
const cache = new Map(); // userId -> { at: epochMs, row: {...}|null }

const _load = async (userId) => {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.row;
  const r = await db.query(
    'SELECT id, email, role, deleted_at, tokens_valid_after FROM users WHERE id = $1',
    [userId]
  );
  const row = r.rows[0] || null;
  cache.set(userId, { at: now, row });
  return row;
};

/**
 * @param {object} decoded - verified JWT payload ({ id, email, role, iat, exp })
 * @returns {Promise<{ok:boolean, reason?:string, user?:{id,email,role}}>}
 */
exports.validateSession = async (decoded) => {
  if (!decoded || !decoded.id) return { ok: false, reason: 'invalid' };

  const row = await _load(decoded.id);
  if (!row || row.deleted_at) return { ok: false, reason: 'account_disabled' };
  if (row.role === 'co_pilot') return { ok: false, reason: 'no_access' };

  if (row.tokens_valid_after && decoded.iat) {
    const cutoffSec = Math.floor(new Date(row.tokens_valid_after).getTime() / 1000);
    if (decoded.iat < cutoffSec) return { ok: false, reason: 'session_expired' };
  }

  return { ok: true, user: { id: row.id, email: row.email, role: row.role } };
};

/** Drop the cached entry so the next request re-reads live state immediately. */
exports.invalidate = (userId) => { if (userId) cache.delete(userId); };
