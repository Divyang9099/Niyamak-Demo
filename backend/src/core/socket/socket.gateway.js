const { Server } = require('socket.io');
const env        = require('../config/env');
const socketAuth = require('./socket.auth');
const db         = require('../config/db');

let io = null;

/**
 * Attach Socket.IO to an existing HTTP server.
 * Call once from server.js after creating httpServer.
 */
const init = (httpServer) => {
  // Same allow-list as the HTTP CORS — FRONTEND_URL may be a single URL or a
  // comma-separated list. Socket.IO accepts an array of allowed origins.
  const allowedOrigins = (env.frontendUrl === '*' ? '' : (env.frontendUrl || 'http://localhost:5173'))
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  io = new Server(httpServer, {
    cors: {
      origin:      allowedOrigins,
      credentials: true,
    },
    // Use both websocket and polling so proxied environments still work
    transports:       ['websocket', 'polling'],
    pingTimeout:      60000,
    pingInterval:     25000,
    connectTimeout:   10000,
  });

  // ── Auth middleware ──────────────────────────────────────────
  io.use(socketAuth);

  // ── Connection handler ───────────────────────────────────────
  io.on('connection', async (socket) => {
    const { id: userId, role } = socket.user;

    // Every user gets their own private room + a role-based room
    socket.join(`user:${userId}`);
    socket.join(`role:${role}`);

    // Join all project rooms the user has access to
    try {
      if (role === 'admin') {
        const res = await db.query('SELECT id FROM projects WHERE deleted_at IS NULL');
        res.rows.forEach(r => socket.join(`project:${r.id}`));
      } else {
        // project_members access
        const memberRes = await db.query(
          'SELECT DISTINCT project_id FROM project_members WHERE user_id = $1',
          [userId]
        );
        memberRes.rows.forEach(r => socket.join(`project:${r.project_id}`));

        // Pilot allocation access
        const allocRes = await db.query(
          `SELECT DISTINCT a.project_id
           FROM allocations a
           JOIN pilots p ON a.pilot_id = p.id
           WHERE p.user_id = $1`,
          [userId]
        );
        allocRes.rows.forEach(r => socket.join(`project:${r.project_id}`));
      }
    } catch (err) {
      console.error(`[Socket] Room join failed for user ${userId}:`, err.message);
    }

    // ── Client-initiated room events ─────────────────────────────
    // Allow client to join a specific project room on-demand (e.g., when opening project detail)
    socket.on('join:project', async (projectId) => {
      try {
        if (role === 'admin') {
          socket.join(`project:${projectId}`);
          return;
        }
        // Verify access before joining
        const access = await db.query(
          `SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2
           UNION
           SELECT 1 FROM allocations a JOIN pilots p ON a.pilot_id=p.id
             WHERE a.project_id=$1 AND p.user_id=$2`,
          [projectId, userId]
        );
        if (access.rows.length > 0) socket.join(`project:${projectId}`);
      } catch (err) {
        console.error(`[Socket] join:project failed:`, err.message);
      }
    });

    socket.on('leave:project', (projectId) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: user=${userId} reason=${reason}`);
    });

    console.log(`[Socket] Connected: user=${userId} role=${role} id=${socket.id}`);
  });

  console.log('[Socket] Socket.IO gateway initialized');
  return io;
};

/** Emit to a specific user's private room */
const emitToUser = (userId, event, data) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
};

/** Emit to all sockets in a project room */
const emitToProject = (projectId, event, data) => {
  if (!io) return;
  io.to(`project:${projectId}`).emit(event, data);
};

/** Emit to all sockets with a specific role */
const emitToRole = (role, event, data) => {
  if (!io) return;
  io.to(`role:${role}`).emit(event, data);
};

/** Emit to all authenticated sockets */
const emitToAll = (event, data) => {
  if (!io) return;
  io.emit(event, data);
};

/**
 * Force a user's live sockets out of a project room. Project rooms are joined
 * once at connect time from project_members/allocations and are never re-derived,
 * so a member removed mid-session keeps receiving project broadcasts until they
 * reconnect. Call this when membership/allocation is revoked to cut it off now.
 */
const evictUserFromProject = (userId, projectId) => {
  if (!io) return;
  try { io.in(`user:${userId}`).socketsLeave(`project:${projectId}`); } catch (_) {}
};

const getIO = () => io;

module.exports = { init, getIO, emitToUser, emitToProject, emitToRole, emitToAll, evictUserFromProject };
