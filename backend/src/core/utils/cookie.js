/**
 * Auth-cookie options — single source of truth.
 *
 * The token cookie is set in three places (login, logout-clear, sliding-session
 * refresh). They MUST share identical attributes — especially `domain` — because
 * a browser only clears a cookie when the clear call matches the domain/path the
 * cookie was set with. Centralising avoids drift.
 *
 * Production (COOKIE_DOMAIN=.varunaat.in):
 *   - domain attached → the cookie is valid on BOTH app.varunaat.in and
 *     api.varunaat.in, so login on the app reaches the API.
 *   - secure=true     → only sent over HTTPS (Render provides it).
 * Development (COOKIE_DOMAIN unset):
 *   - host-only cookie, secure=false → works on http://localhost.
 * Split-domain demo (COOKIE_SAMESITE=none):
 *   - app (Vercel) and API (AWS) are unrelated domains → the cookie must be
 *     SameSite=None, which browsers only honour when secure=true, so it is
 *     forced on regardless of NODE_ENV.
 */
const env = require('../config/env');

const isProd = () => env.nodeEnv === 'production';
const isCrossSite = () => env.cookieSameSite === 'none';

// Attributes common to every auth cookie (set AND clear).
const baseCookieOptions = () => ({
  httpOnly: true,
  secure:   isProd() || isCrossSite(),
  sameSite: env.cookieSameSite, // 'lax' (default) or 'none' for split-domain deployments
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
});

/** Options for SETTING the token cookie. Pass { maxAge } for a persistent cookie. */
const authCookieOptions = (extra = {}) => ({ ...baseCookieOptions(), ...extra });

/** Options for CLEARING the token cookie — must match the set attributes. */
const clearCookieOptions = () => baseCookieOptions();

module.exports = { authCookieOptions, clearCookieOptions };
