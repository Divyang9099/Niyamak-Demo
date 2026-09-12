const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const env = require('../config/env');

// Per-IP counters for the auth endpoints. Kept in this module (rather than
// inline in app.js) so the login controller can clear a caller's counter once
// they prove they are legitimate.

// Explicit key generator so clearAuthLimit() can reproduce the exact same key
// the limiter stored under. ipKeyGenerator() is the library's own helper — it
// masks IPv6 addresses to their /56 subnet so a client can't rotate through
// its allocation to dodge the limit.
const keyGenerator = (req) => ipKeyGenerator(req.ip);

const LIMITER_DEFAULTS = {
  windowMs: 15 * 60 * 1000,  // 15 minutes
  keyGenerator,
  skip: () => env.nodeEnv === 'development',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    statusCode: 429,
    message: 'Too many attempts. Please try again after 15 minutes.'
  }
};

// ── Auth rate limiter — disabled in development ──────────────
const authLimiter = rateLimit({
  ...LIMITER_DEFAULTS,
  max: 5,                     // 5 wrong attempts per IP then block
});

// H-1: dedicated limiter for OTP verification so a stolen email can't be used to
// brute-force the 6-digit reset code. Separate counter from login so the two
// don't share/exhaust each other's budget. Pairs with the per-OTP attempt cap.
const resetLimiter = rateLimit({
  ...LIMITER_DEFAULTS,
  max: 10,
});

/**
 * Wipe the caller's authLimiter counter back to zero.
 *
 * Called after a successful login: the failed attempts that preceded it were a
 * legitimate user mistyping their password, not an attack, so they shouldn't
 * leave the IP one typo away from a 15-minute block. An attacker gains nothing
 * here — clearing the counter requires valid credentials (and a valid TOTP code
 * when 2FA is on), which is exactly what the limiter exists to protect.
 *
 * Mirrors the account-level reset in auth.service.js, which clears
 * failed_login_attempts / locked_until on the same event.
 */
const clearAuthLimit = (req) => authLimiter.resetKey(keyGenerator(req));

module.exports = { authLimiter, resetLimiter, clearAuthLimit };
