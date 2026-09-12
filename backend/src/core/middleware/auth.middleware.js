const jwt    = require('jsonwebtoken');
const env    = require('../config/env');
const { error } = require('../utils/response');
const { authCookieOptions } = require('../utils/cookie');
const { validateSession } = require('../utils/sessionGuard');

/**
 * Protect routes — verifies JWT from Authorization header
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json(error('Access denied. No token provided.', 401));
  }

  try {
    if (!env.jwt.secret) {
        console.error('CRITICAL ERROR: JWT_SECRET is not configured in environment.');
        return res.status(500).json(error('Server authentication configuration error.', 500));
    }
    const decoded = jwt.verify(token, env.jwt.secret);

    // H-4: revalidate against live user state (deactivation, role change, password
    // reset) instead of trusting the JWT payload for its full lifetime.
    const check = await validateSession(decoded);
    if (!check.ok) {
      return res.status(401).json(error('Session is no longer valid. Please log in again.', 401));
    }
    req.user = check.user; // { id, email, role } — role is the CURRENT DB value

    // Re-issue the cookie so its lifetime tracks the token's REAL expiry. The
    // old code re-set it to a full window on every request while handing back
    // the same (unrenewed) token, so the browser kept a cookie whose JWT had
    // already died. Two guards:
    //   • decoded.persistent — a "keep me signed in" login. Without it the
    //     cookie must stay a session cookie and vanish when the browser closes.
    //   • maxAge from decoded.exp — expires with the token, not after it, so
    //     the sign-in ends at exactly one moment (default 15 days after login).
    if (req.cookies && req.cookies.token && decoded.persistent && decoded.exp) {
      const maxAge = decoded.exp * 1000 - Date.now();
      if (maxAge > 0) {
        res.cookie('token', token, authCookieOptions({ maxAge }));
      }
    }

    next();
  } catch (err) {
    return res.status(401).json(error('Invalid or expired token.', 401));
  }
};

module.exports = authenticate;
