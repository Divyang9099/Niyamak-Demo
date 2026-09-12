const { GetObjectCommand } = require('@aws-sdk/client-s3');
const db        = require('../../core/config/db');
const r2Client  = require('../../core/config/r2');
const env       = require('../../core/config/env');
const { uploadToR2 } = require('../../core/utils/r2Upload');

const ensureRow = async () => {
  const check = await db.query('SELECT id FROM company_config LIMIT 1');
  if (!check.rows.length) {
    const ins = await db.query(
      `INSERT INTO company_config (company_name) VALUES ('Niyamak') RETURNING id`
    );
    return ins.rows[0].id;
  }
  return check.rows[0].id;
};

exports.getConfig = async () => {
  await ensureRow();
  const result = await db.query('SELECT * FROM company_config LIMIT 1');
  return result.rows[0];
};

exports.updateConfig = async (data) => {
  const id = await ensureRow();
  const result = await db.query(
    `UPDATE company_config SET
       company_name                 = COALESCE($1,  company_name),
       address                      = COALESCE($2,  address),
       gstin                        = COALESCE($3,  gstin),
       cin                          = COALESCE($4,  cin),
       financial_year_start         = COALESCE($5,  financial_year_start),
       primary_contact_email        = COALESCE($6,  primary_contact_email),
       primary_contact_phone        = COALESCE($7,  primary_contact_phone),
       default_overhead_percent     = COALESCE($8,  default_overhead_percent),
       default_margin_percent       = COALESCE($9,  default_margin_percent),
       default_contingency_percent  = COALESCE($10, default_contingency_percent),
       session_timeout_hours        = COALESCE($11, session_timeout_hours)
     WHERE id = $12 RETURNING *`,
    [
      data.company_name                !== undefined ? data.company_name                : null,
      data.address                     !== undefined ? data.address                     : null,
      data.gstin                       !== undefined ? data.gstin                       : null,
      data.cin                         !== undefined ? data.cin                         : null,
      data.financial_year_start        !== undefined ? data.financial_year_start        : null,
      data.primary_contact_email       !== undefined ? data.primary_contact_email       : null,
      data.primary_contact_phone       !== undefined ? data.primary_contact_phone       : null,
      data.default_overhead_percent    !== undefined ? data.default_overhead_percent    : null,
      data.default_margin_percent      !== undefined ? data.default_margin_percent      : null,
      data.default_contingency_percent !== undefined ? data.default_contingency_percent : null,
      data.session_timeout_hours       !== undefined ? data.session_timeout_hours       : null,
      id,
    ]
  );
  // bust the cache so the new value takes effect immediately
  _cachedTimeoutHours = null;
  _cachedAt = 0;
  return result.rows[0];
};

// ── Session window (60-second cache to avoid per-login DB hit) ──────────
// This single value drives BOTH the JWT's expiry and the auth cookie's maxAge,
// so a sign-in dies at the same instant on the server and in the browser.
let _cachedTimeoutHours = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 60_000;

const DEFAULT_SESSION_HOURS = 360;  // 15 days — "stay signed in on this device"
const MAX_SESSION_HOURS     = 8760; // 1 year — ceiling enforced by migration 059

// JWT_EXPIRES_IN ("15d" / "8h" / "90m") is the fallback used only when
// company_config has no usable value (e.g. migration 059 not applied yet).
const envFallbackHours = () => {
  const raw = String(env.jwt.expiresIn || '').trim();
  const n   = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SESSION_HOURS;
  if (raw.endsWith('d')) return n * 24;
  if (raw.endsWith('h')) return n;
  if (raw.endsWith('m')) return Math.max(1, Math.round(n / 60));
  return DEFAULT_SESSION_HOURS;
};

exports.getSessionTimeoutHours = async () => {
  const now = Date.now();
  if (_cachedTimeoutHours !== null && (now - _cachedAt) < CACHE_TTL_MS) {
    return _cachedTimeoutHours;
  }
  try {
    const r = await db.query('SELECT session_timeout_hours FROM company_config LIMIT 1');
    const hrs = r.rows[0]?.session_timeout_hours;
    _cachedTimeoutHours = (Number.isInteger(hrs) && hrs >= 1 && hrs <= MAX_SESSION_HOURS)
      ? hrs
      : envFallbackHours();
  } catch {
    _cachedTimeoutHours = envFallbackHours(); // column not yet migrated
  }
  _cachedAt = now;
  return _cachedTimeoutHours;
};

exports.uploadLogo = async (file) => {
  const key = await uploadToR2(file, 'logos');
  const id = await ensureRow();
  await db.query('UPDATE company_config SET logo_url = $1 WHERE id = $2', [key, id]);
  return key;
};

exports.getLogoStream = async () => {
  const result = await db.query('SELECT logo_url FROM company_config LIMIT 1');
  const key = result.rows[0]?.logo_url;
  if (!key) throw Object.assign(new Error('No logo configured'), { statusCode: 404 });

  const response = await r2Client.send(
    new GetObjectCommand({ Bucket: env.r2.bucket, Key: key })
  );
  return { stream: response.Body, contentType: response.ContentType || 'image/png' };
};
