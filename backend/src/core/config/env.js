const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const requiredVars = [
  'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
  'JWT_SECRET',
  'CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY', 'R2_SECRET_KEY', 'R2_BUCKET'
];

const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
  console.error(`❌ CRITICAL: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// FRONTEND_URL doubles as the CORS allow-list, so it may be a comma-separated
// list or even '*' — neither is linkable. Pick the first concrete origin.
const firstOrigin = (list) =>
  String(list || '')
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .find(s => s && s !== '*') || '';

// Public base URL of the frontend, used to build links inside outbound email.
// APP_URL wins when set; otherwise fall back to FRONTEND_URL. Without this the
// links in every email pointed at the localhost dev fallback.
const appUrl = process.env.APP_URL
  ? process.env.APP_URL.trim().replace(/\/+$/, '')
  : (firstOrigin(process.env.FRONTEND_URL) || 'http://localhost:5173');

if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/i.test(appUrl)) {
  console.warn(`⚠️  APP_URL/FRONTEND_URL resolves to "${appUrl}" in production — email links will point at localhost.`);
}

module.exports = {
  port:    process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  // Single source of truth for links in email/notifications. Always a bare
  // origin with no trailing slash, so `${env.appUrl}/login` is safe.
  appUrl,
  // Parent domain for the auth cookie so it is valid across the app + API
  // subdomains in production, e.g. COOKIE_DOMAIN=.varunaat.in. Empty in dev
  // (localhost) so the cookie is host-only and works on http://localhost.
  cookieDomain: process.env.COOKIE_DOMAIN || '',
  // 'lax' when app+API share a registrable domain (production default).
  // Set to 'none' for split-domain deployments (e.g. Vercel frontend +
  // AWS backend on unrelated domains) — the cookie.js helper forces
  // `secure: true` whenever this is 'none', since browsers reject
  // SameSite=None cookies without Secure.
  cookieSameSite: process.env.COOKIE_SAMESITE || 'lax',

  db: {
    host:     process.env.DB_HOST,
    port:     Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    // Fallback session window only. The live value is
    // company_config.session_timeout_hours (admin-tunable, default 360h = 15
    // days); this is used when that column/row isn't readable.
    expiresIn: process.env.JWT_EXPIRES_IN || '15d',
  },

  r2: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    accessKey: process.env.R2_ACCESS_KEY,
    secretKey: process.env.R2_SECRET_KEY,
    bucket:    process.env.R2_BUCKET,
  },
  
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    fromName:  process.env.SMTP_FROM_NAME  || 'Niyamak',
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER,
  },

  whatsapp: {
    phoneId:     process.env.WHATSAPP_PHONE_ID     || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  },
};
