/**
 * PM2 process topology for the DEMO deployment (frontend on Vercel, backend
 * on AWS EC2 behind CloudFront). Kept separate from ecosystem.config.js so
 * production's PM2 setup is never touched by demo changes.
 *
 *   pm2 start ecosystem.demo.config.js
 *
 * Unlike production, FRONTEND_URL / APP_URL / COOKIE_SAMESITE are NOT
 * hardcoded here — they come from this box's backend/.env, since the Vercel
 * URL isn't known until the frontend is deployed. Set in .env:
 *   FRONTEND_URL=https://<your-app>.vercel.app
 *   APP_URL=https://<your-app>.vercel.app
 *   COOKIE_SAMESITE=none   (app and API are on unrelated domains)
 *   COOKIE_DOMAIN=         (leave empty — there is no shared parent domain)
 */
module.exports = {
  apps: [
    {
      name:   'niyamak-demo-api',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        DISABLE_SCHEDULER: 'true',
      },
    },
    {
      name:   'niyamak-demo-worker',
      script: 'src/worker.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
