/**
 * Two-Factor Authentication (TOTP) — PRD §9.3
 *
 * Flow:
 *   1. Setup: generate a per-user secret, return otpauth URL + QR data URL.
 *      Secret is stored against the user but `two_factor_enabled` stays FALSE
 *      until the user proves they can generate valid codes.
 *   2. Enable: user submits a code, we verify against the secret, flip enabled=TRUE.
 *   3. Login: if enabled=TRUE, login.service requires `totp_code` and validates.
 *   4. Disable: requires a valid code (so attackers can't disable casually).
 *
 * Library: `speakeasy` (RFC 6238 compliant, 30s window, ±1 step tolerance).
 */

const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');
const db        = require('../../core/config/db');
const env       = require('../../core/config/env');

const ISSUER = env.smtp?.fromName || 'DroneOps';

exports.beginSetup = async (userId) => {
  const u = await db.query('SELECT email, two_factor_enabled FROM users WHERE id=$1 AND deleted_at IS NULL', [userId]);
  if (!u.rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  if (u.rows[0].two_factor_enabled) {
    throw Object.assign(new Error('2FA is already enabled for this account. Disable it first to re-provision.'), { statusCode: 409 });
  }

  const secret = speakeasy.generateSecret({
    length: 20,
    name: `${ISSUER} (${u.rows[0].email})`,
    issuer: ISSUER,
  });

  // Persist secret (but not yet enabled). Overwrites any prior in-progress secret.
  await db.query('UPDATE users SET two_factor_secret=$1, two_factor_enabled=FALSE WHERE id=$2', [secret.base32, userId]);

  const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
  return {
    secret:    secret.base32,       // user can also key it in manually if QR fails
    otpauth:   secret.otpauth_url,
    qr:        qrDataUrl,           // <img src="..."> ready
  };
};

const _verifyCode = (secret, code) =>
  speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: String(code || '').replace(/\s+/g, ''),
    window: 1, // ±30s tolerance
  });

exports.enable = async (userId, code) => {
  const u = await db.query('SELECT two_factor_secret, two_factor_enabled FROM users WHERE id=$1', [userId]);
  if (!u.rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  const { two_factor_secret, two_factor_enabled } = u.rows[0];

  if (two_factor_enabled) {
    throw Object.assign(new Error('2FA is already enabled'), { statusCode: 409 });
  }
  if (!two_factor_secret) {
    throw Object.assign(new Error('No setup in progress — start setup first'), { statusCode: 400 });
  }
  if (!_verifyCode(two_factor_secret, code)) {
    throw Object.assign(new Error('Invalid code. Check your authenticator app and try again.'), { statusCode: 401 });
  }

  await db.query(
    'UPDATE users SET two_factor_enabled=TRUE, two_factor_enabled_at=NOW() WHERE id=$1',
    [userId]
  );
  return { enabled: true };
};

exports.disable = async (userId, code) => {
  const u = await db.query('SELECT two_factor_secret, two_factor_enabled FROM users WHERE id=$1', [userId]);
  if (!u.rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  const { two_factor_secret, two_factor_enabled } = u.rows[0];

  if (!two_factor_enabled) {
    throw Object.assign(new Error('2FA is not enabled'), { statusCode: 400 });
  }
  if (!_verifyCode(two_factor_secret, code)) {
    throw Object.assign(new Error('Invalid code. A valid 2FA code is required to disable 2FA.'), { statusCode: 401 });
  }

  await db.query(
    'UPDATE users SET two_factor_enabled=FALSE, two_factor_secret=NULL, two_factor_enabled_at=NULL WHERE id=$1',
    [userId]
  );
  return { enabled: false };
};

exports.status = async (userId) => {
  const u = await db.query('SELECT two_factor_enabled, two_factor_enabled_at FROM users WHERE id=$1', [userId]);
  if (!u.rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  return {
    enabled:    !!u.rows[0].two_factor_enabled,
    enabled_at: u.rows[0].two_factor_enabled_at,
  };
};

// Called from auth.service during login
exports.verifyForLogin = (secret, code) => _verifyCode(secret, code);
