const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const errorHandler = require('./core/middleware/error.middleware');

require('./core/config/db'); // initialise DB connection on startup

const env = require('./core/config/env');

// ── Bull Board (queue monitoring UI) ─────────────
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter }   = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter }  = require('@bull-board/express');
const {
  emailQueue, notificationQueue, pdfQueue, excelQueue,
  zipQueue, fileUploadQueue, reminderQueue, cleanupQueue,
  REDIS_ENABLED,
} = require('./core/queues/index');

const app = express();

// Trust the first proxy (nginx on EC2) so express-rate-limit reads the real client IP
app.set('trust proxy', 1);

const helmet  = require('helmet');
const cookieParser = require('cookie-parser');
const compression = require('compression');

// ── Global Middleware ────────────────────────
app.use(helmet());
app.use(compression());
app.use(cookieParser());

// Allow one or more frontend origins. FRONTEND_URL may be a single URL or a
// comma-separated list, e.g. "https://app.varunaat.in,https://varunaat.in".
// Credentialed CORS forbids "*", so we echo back the request origin only when
// it is in the allow-list. Requests with no Origin (curl, health checks,
// same-origin) are permitted.
const allowedOrigins = (env.frontendUrl === '*' ? '' : (env.frontendUrl || 'http://localhost:5173'))
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Any localhost / 127.0.0.1 port is always allowed so a locally-run frontend can
// talk to the production API too (the user runs both interchangeably).
const isLocalhost = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || isLocalhost(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  // Let the browser read the server-set download filename on cross-origin fetches
  // (used by the frontend downloader to save files in their original name/format).
  exposedHeaders: ['Content-Disposition'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Verbose coloured logs in dev; Apache-combined (parseable) in production.
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// ── Health Check ─────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Niyamak API', timestamp: new Date() });
});

// ── Bull Board — admin-only queue monitor ─────
if (REDIS_ENABLED) {
  const boardAdapter = new ExpressAdapter();
  boardAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      emailQueue, notificationQueue, pdfQueue, excelQueue,
      zipQueue, fileUploadQueue, reminderQueue, cleanupQueue,
    ].map(q => new BullMQAdapter(q)),
    serverAdapter: boardAdapter,
  });

  const authenticate = require('./core/middleware/auth.middleware');
  const authorize    = require('./core/middleware/role.middleware');
  app.use('/admin/queues', authenticate, authorize('admin'), boardAdapter.getRouter());
  console.log('[BullBoard] Queue monitor mounted at /admin/queues (admin only)');
}

// Auth rate limiters live in their own module so the login controller can reset
// a caller's counter after a successful sign-in.
const { authLimiter, resetLimiter } = require('./core/middleware/rateLimit.middleware');

// Rate limit login + forgot-password + reset-password, not logout/profile/theme
app.use('/api/v1/auth/login',            authLimiter);
app.use('/api/v1/auth/forgot-password',  authLimiter);
app.use('/api/v1/auth/reset-password',   resetLimiter);
app.use('/api/v1/auth',                  require('./domains/user/auth.routes'));
app.use('/api/v1/users',         require('./domains/user/user.routes'));
app.use('/api/v1/projects',      require('./domains/project/project.routes'));
app.use('/api/v1/pipeline',      require('./domains/pipeline/pipeline.routes'));
app.use('/api/v1/resources',     require('./domains/resource/resource.routes'));
app.use('/api/v1/calendar',      require('./domains/scheduling/calendar.routes'));
app.use('/api/v1/estimations',   require('./domains/estimation/estimation.routes'));
app.use('/api/v1/library',       require('./domains/library/library.routes'));
app.use('/api/v1/notifications', require('./domains/notification/notification.routes'));
app.use('/api/v1/dashboard',     require('./domains/dashboard/dashboard.routes'));
app.use('/api/v1/audit',         require('./domains/audit/audit.routes'));
app.use('/api/v1/system',        require('./domains/system/system.routes'));
app.use('/api/v1/jobs',          require('./domains/jobs/jobs.routes'));
app.use('/api/v1/uploads',       require('./domains/upload/upload.routes'));
app.use('/api/v1/archive',       require('./domains/archive/archive.routes'));
app.use('/api/v1/assets',        require('./domains/assets/assets.routes'));
app.use('/api/v1/clients',       require('./domains/client/client.routes'));
app.use('/api/v1/reports',       require('./domains/reports/report.routes'));
app.use('/api/v1/attendance',    require('./domains/attendance/attendance.routes'));
app.use('/api/v1/pilot-tracking', require('./domains/pilot_tracking/pilot_tracking.routes'));
app.use('/api/v1/bd',            require('./domains/bd/bd.routes'));

// ── 404 Handler ───────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Global Error Handler ──────────────────────
app.use(errorHandler);

module.exports = app;
