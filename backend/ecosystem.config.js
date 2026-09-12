/**
 * PM2 process topology for Varuna Ops.
 *
 *   pm2 start ecosystem.config.js
 *
 * Two processes with a clean separation of duties:
 *   • varuna-api    — the HTTP API. Scheduler DISABLED here (the worker owns it).
 *   • varuna-worker — BullMQ queue workers + the cron scheduler.
 *
 * The scheduler also self-guards via a DB lease, so even if both processes ran
 * it, the daily sweep cannot double-fire — this split just keeps duties clean.
 */
module.exports = {
  apps: [
    {
      name:   'varuna-api',
      script: 'src/server.js',
      // Kept at 1 deliberately. Do NOT set instances:'max'/cluster until Socket.IO
      // has a shared adapter (@socket.io/redis-adapter) — otherwise rooms are
      // per-process and real-time emits from one worker won't reach clients on
      // another (broken notifications/progress). Horizontal-scale checklist:
      //   1) add @socket.io/redis-adapter wired to REDIS_URL
      //   2) enable presigned direct-to-R2 uploads (VITE_DIRECT_R2_UPLOAD=true)
      //   3) then bump instances and put nodes behind a load balancer
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        DISABLE_SCHEDULER: 'true',
        FRONTEND_URL: 'https://app.varunaat.in',
        // Base URL for links inside outbound email. Set on BOTH processes —
        // without it emails fall back to the localhost dev URL.
        APP_URL: 'https://app.varunaat.in',
      },
    },
    {
      name:   'varuna-worker',
      script: 'src/worker.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '700M', // ZIP/export jobs are heavier
      env: {
        NODE_ENV: 'production',
        // Scheduler enabled here (DISABLE_SCHEDULER unset).
        // The worker owns the cron sweeps, so it sends the attendance reminder,
        // BD digests and the weekly report — it needs the public URL too.
        FRONTEND_URL: 'https://app.varunaat.in',
        APP_URL: 'https://app.varunaat.in',
      },
    },
  ],
};
