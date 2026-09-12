const jwt = require('jsonwebtoken');
const env  = require('../config/env');
const { validateSession } = require('../utils/sessionGuard');

/**
 * Socket.IO authentication middleware.
 * Reads JWT from HttpOnly cookie (preferred) or Authorization header fallback.
 * Attaches socket.user = { id, email, role } on success.
 */
const socketAuth = async (socket, next) => {
  try {
    let token = null;

    // 1. Cookie (primary path — sent automatically by browser)
    const cookieHeader = socket.handshake.headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }

    // 2. Authorization header fallback (for non-browser clients / tests)
    if (!token) {
      const auth = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
      if (auth) token = auth.replace(/^Bearer\s+/i, '');
    }

    if (!token) {
      return next(new Error('Authentication required'));
    }

    if (!env.jwt.secret) {
      return next(new Error('Server authentication configuration error'));
    }

    const decoded = jwt.verify(token, env.jwt.secret);

    // H-4: reject sockets for deactivated/invalidated accounts; use live role.
    const check = await validateSession(decoded);
    if (!check.ok) {
      return next(new Error('Session is no longer valid'));
    }
    socket.user = check.user;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
};

module.exports = socketAuth;
