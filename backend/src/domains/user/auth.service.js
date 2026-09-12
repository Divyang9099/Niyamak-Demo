const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../../core/config/db');
const env    = require('../../core/config/env');
const twoFactor = require('./twoFactor.service');
const systemService = require('../system/system.service');

/**
 * Register a new user
 * @param {Object} userData
 * @param {string} userData.name - Full name
 * @param {string} userData.email - Email address
 * @param {string} userData.password - Plain text password
 * @param {string} userData.role - User role (admin, project_manager, pilot, client)
const crypto = require('crypto');

/**
 * Register a new user
 * @param {Object} userData
 * @param {string} userData.name - Full name
 * @param {string} userData.email - Email address
 * @param {string} [userData.password] - Plain text password (optional for co_pilot)
 * @param {string} userData.role - User role (admin, project_manager, pilot, co_pilot, client)
 * @param {string} [userData.phone] - Optional phone number
 * @returns {Promise<Object>} The created user object (excluding password)
 */
const register = async ({ name, email, password, role, phone }) => {
  // Co-pilots have no software access; generate an unusable random hash if no password provided
  const rawPassword = (role === 'co_pilot' && !password)
    ? crypto.randomBytes(32).toString('hex')
    : password;
  const password_hash = await bcrypt.hash(rawPassword, 12);

  // Check if a user (active OR soft-deleted) already owns this email
  const existing = await pool.query(
    'SELECT id, deleted_at FROM users WHERE email = $1',
    [email]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (!row.deleted_at) {
      // Active account — genuine conflict
      throw Object.assign(new Error('User with this email already exists'), { statusCode: 409 });
    }
    // Soft-deleted account — reactivate it (reuse the row so the unique email
    // constraint isn't violated). Resets credentials and role to the new values.
    const revived = await pool.query(
      `UPDATE users
         SET name = $1, password_hash = $2, role = $3, phone = $4, deleted_at = NULL
       WHERE id = $5
       RETURNING id, name, email, role, phone, created_at`,
      [name, password_hash, role, phone || null, row.id]
    );
    return revived.rows[0];
  }

  // Fresh account
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, phone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, role, phone, created_at`,
    [name, email, password_hash, role, phone || null]
  );

  return result.rows[0];
};

/**
 * Login — validates credentials and returns JWT
 * @param {Object} credentials
 * @param {string} credentials.email
 * @param {string} credentials.password
 * @returns {Promise<{token: string, user: Object}>} Token and stripped user data
 */
// H-3: account lockout — enforce the failed_login_attempts / locked_until columns
// (migration 007) that previously existed but were never used.
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES       = 15;

const login = async ({ email, password, totp_code, remember_me }) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email]
  );

  if (result.rows.length === 0) {
    // Constant-time response — don't reveal whether email exists
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  const user = result.rows[0];

  // Co-pilots have no software access — reject immediately before password check
  if (user.role === 'co_pilot') {
    throw Object.assign(
      new Error('This is a co-pilot crew record and does not have software access.'),
      { statusCode: 403 }
    );
  }

  // Locked out? Block before doing any password work.
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.max(1, Math.ceil((new Date(user.locked_until) - new Date()) / 60000));
    throw Object.assign(
      new Error(`Account temporarily locked after too many failed attempts. Try again in ${mins} minute(s).`),
      { statusCode: 423 }
    );
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    // Increment the failed-attempt counter; lock the account once the threshold is hit.
    const attempts = (user.failed_login_attempts || 0) + 1;
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      await pool.query(
        `UPDATE users SET failed_login_attempts = 0,
                          locked_until = NOW() + ($1 || ' minutes')::interval
         WHERE id = $2`,
        [String(LOCK_MINUTES), user.id]
      );
    } else {
      await pool.query('UPDATE users SET failed_login_attempts = $1 WHERE id = $2', [attempts, user.id]);
    }
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  // Password correct → clear any prior failed-attempt / lock state.
  if (user.failed_login_attempts > 0 || user.locked_until) {
    await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
  }

  // ── 2FA gate (PRD §9.3) ─────────────────────────────────────────────
  // If the account has 2FA enabled, require a valid TOTP code before issuing the JWT.
  if (user.two_factor_enabled) {
    if (!totp_code) {
      throw Object.assign(
        new Error('Two-factor code required'),
        { statusCode: 401, code: 'TOTP_REQUIRED' }
      );
    }
    const ok = twoFactor.verifyForLogin(user.two_factor_secret, totp_code);
    if (!ok) {
      throw Object.assign(
        new Error('Invalid two-factor code'),
        { statusCode: 401, code: 'TOTP_INVALID' }
      );
    }
  }

  // The token lives exactly as long as the configured session window (default
  // 360h = 15 days) rather than a separate env constant, so it can never expire
  // before the cookie that carries it. `persistent` records whether this was a
  // "keep me signed in" login — auth.middleware needs it to decide if the
  // cookie may be re-issued with a maxAge or must stay a session cookie.
  const sessionHours = await systemService.getSessionTimeoutHours();
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, persistent: !!remember_me },
    env.jwt.secret,
    { expiresIn: `${sessionHours}h` }
  );

  return {
    token,
    user: {
      id:   user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
};

/**
 * Get current user profile from token payload
 * @param {string} userId - UUID of the user
 * @returns {Promise<Object>} User profile data
 */
const getProfile = async (userId) => {
  const result = await pool.query(
    'SELECT id, name, email, role, phone, avatar_url, theme, created_at FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  return result.rows[0];
};

const VALID_THEMES = ['obsidian', 'light', 'midnight', 'forest', 'solar'];

const updateTheme = async (userId, theme) => {
  if (!VALID_THEMES.includes(theme)) {
    throw Object.assign(new Error('Invalid theme'), { statusCode: 400 });
  }
  await pool.query('UPDATE users SET theme = $1 WHERE id = $2', [theme, userId]);
  return { theme };
};

module.exports = { register, login, getProfile, updateTheme };
