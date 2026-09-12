const authService     = require('./auth.service');
const systemService   = require('../system/system.service');
const twoFactorService = require('./twoFactor.service');
const emailTriggers   = require('../notification/emailTriggers.service');
const prefService     = require('../notification/notif_prefs.service');
const db              = require('../../core/config/db');
const env             = require('../../core/config/env');
const { success, error } = require('../../core/utils/response');
const { authCookieOptions, clearCookieOptions } = require('../../core/utils/cookie');
const { clearAuthLimit } = require('../../core/middleware/rateLimit.middleware');

/**
 * POST /api/auth/register
 * Admin creates a new user account.
 *
 * Side-effects (non-blocking, never fail the request):
 *   1. If role === 'pilot'  → auto-create a pilots resource record so the user
 *      appears in the Pilot Roster immediately. Without this the user exists in
 *      the users table but is invisible on /resources/pilots (which JOINs pilots).
 *   2. Send a welcome email to the new user with their login credentials.
 */
const register = async (req, res, next) => {
  try {
    const { password, ...rest } = req.body;
    const user = await authService.register({ ...rest, password });
    res.status(201).json(success(user, 'User registered successfully', 201));

    // 0. Create co-pilot resource record (crew_role='co_pilot', NO prefs, NO welcome email)
    if (user.role === 'co_pilot') {
      const {
        license_number = 'PENDING',
        license_expiry = null,
        employee_id    = null,
        per_day_rate   = null,
        contact_number = null,
        base_location  = null,
      } = req.body;

      db.query(
        `INSERT INTO pilots (user_id, license_number, license_expiry, employee_id, per_day_rate, contact_number, base_location, status, crew_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'co_pilot')
         ON CONFLICT (user_id) DO UPDATE SET
           license_number = EXCLUDED.license_number,
           license_expiry = EXCLUDED.license_expiry,
           employee_id    = EXCLUDED.employee_id,
           per_day_rate   = EXCLUDED.per_day_rate,
           contact_number = EXCLUDED.contact_number,
           base_location  = EXCLUDED.base_location,
           status         = 'active',
           crew_role      = 'co_pilot',
           deleted_at     = NULL`,
        [user.id, license_number, license_expiry, employee_id, per_day_rate, contact_number, base_location]
      ).catch((e) => console.error('[Register] Co-pilot record create failed (non-fatal):', e.message));

      return; // Skip notification prefs AND welcome credentials email
    }

    // 1. Create pilot resource record — use fields submitted with registration so
    //    the pilot appears in the Roster immediately with real data, not placeholders.
    if (user.role === 'pilot') {
      const {
        license_number = 'PENDING',
        license_expiry = null,
        employee_id    = null,
        per_day_rate   = null,
        contact_number = null,
        base_location  = null,
      } = req.body;

      db.query(
        `INSERT INTO pilots (user_id, license_number, license_expiry, employee_id, per_day_rate, contact_number, base_location, status, crew_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 'pilot')
         ON CONFLICT (user_id) DO UPDATE SET
           license_number = EXCLUDED.license_number,
           license_expiry = EXCLUDED.license_expiry,
           employee_id    = EXCLUDED.employee_id,
           per_day_rate   = EXCLUDED.per_day_rate,
           contact_number = EXCLUDED.contact_number,
           base_location  = EXCLUDED.base_location,
           status         = 'active',
           crew_role      = 'pilot',
           deleted_at     = NULL`,
        [user.id, license_number, license_expiry, employee_id, per_day_rate, contact_number, base_location]
      ).catch((e) => console.error('[Register] Pilot record create failed (non-fatal):', e.message));
    }

    // 2. Seed notification prefs so the Preferences panel has rows immediately
    prefService.updatePrefs(user.id, prefService.CATEGORIES.map(cat => ({
      category: cat, email_enabled: true, in_app_enabled: true,
    }))).catch((e) => console.error('[Register] Pref init failed (non-fatal):', e.message));

    // 3. Welcome email with credentials
    emailTriggers.onUserWelcome({
      userName:      user.name,
      userEmail:     user.email,
      userRole:      user.role,
      plainPassword: password,
      appUrl:        env.appUrl,
    }).catch((e) => console.error('[Register] Welcome email failed (non-fatal):', e.message));
  } catch (err) { next(err); }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { remember_me } = req.body;
    const data  = await authService.login(req.body);
    const hours = await systemService.getSessionTimeoutHours();

    // remember_me=true  → persistent cookie: the sign-in survives browser
    //                     restarts for the whole session window (default 15
    //                     days), then expires with the token it carries.
    // remember_me=false → session cookie (deleted when browser closes)
    const cookieOpts = authCookieOptions(
      remember_me ? { maxAge: hours * 60 * 60 * 1000 } : {}
    );

    // Credentials checked out — drop this IP's failed-attempt counter back to 0
    // so earlier typos can't push a legitimate user into the 15-minute block.
    await clearAuthLimit(req);

    res.cookie('token', data.token, cookieOpts);
    const { token, ...userData } = data;
    res.json(success(userData, 'Login successful'));
  } catch (err) {
    // PRD §9.3 — surface TOTP-required signal to the client so it can show the 2FA prompt
    if (err.code === 'TOTP_REQUIRED' || err.code === 'TOTP_INVALID') {
      return res.status(401).json(error(err.message, 401, { totp_required: true, totp_invalid: err.code === 'TOTP_INVALID' }));
    }
    next(err);
  }
};

// ─── 2FA endpoints ─────────────────────────────────────────────────────
const twoFactorSetup = async (req, res, next) => {
  try {
    res.json(success(await twoFactorService.beginSetup(req.user.id), 'Scan the QR with your authenticator and submit a code to confirm'));
  } catch (err) { next(err); }
};

const twoFactorEnable = async (req, res, next) => {
  try {
    if (!req.body.code) return res.status(400).json(error('code is required', 400));
    res.json(success(await twoFactorService.enable(req.user.id, req.body.code), '2FA enabled'));
  } catch (err) { next(err); }
};

const twoFactorDisable = async (req, res, next) => {
  try {
    if (!req.body.code) return res.status(400).json(error('A valid 2FA code is required to disable', 400));
    res.json(success(await twoFactorService.disable(req.user.id, req.body.code), '2FA disabled'));
  } catch (err) { next(err); }
};

const twoFactorStatus = async (req, res, next) => {
  try {
    res.json(success(await twoFactorService.status(req.user.id)));
  } catch (err) { next(err); }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res, next) => {
  try {
    res.clearCookie('token', clearCookieOptions());
    res.json(success(null, 'Logged out successfully'));
  } catch (err) { next(err); }
};

/**
 * GET /api/auth/profile
 */
const getProfile = async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.user.id);
    res.json(success(user));
  } catch (err) { next(err); }
};

/**
 * PATCH /api/auth/theme
 */
const updateTheme = async (req, res, next) => {
  try {
    const result = await authService.updateTheme(req.user.id, req.body.theme);
    res.json(success(result));
  } catch (err) { next(err); }
};

module.exports = {
  register, login, logout, getProfile, updateTheme,
  twoFactorSetup, twoFactorEnable, twoFactorDisable, twoFactorStatus,
};
