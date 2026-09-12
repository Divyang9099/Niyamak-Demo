const { Worker } = require('bullmq');
const { REDIS_ENABLED, getSharedConnection } = require('../queues/redis');
const emailService = require('../../domains/notification/email.service');

if (!REDIS_ENABLED) {
  console.warn('[Worker:Email] Redis not configured — worker not started.');
  module.exports = null;
  return;
}

const worker = new Worker(
  'email',
  async (job) => {
    const { to, subject, html, text } = job.data;

    if (!to || !subject) throw new Error('Email job missing required fields: to, subject');

    console.log(`[Worker:Email] Processing job ${job.id} → ${to}`);
    const result = await emailService.sendEmail({ to, subject, html, text });
    return result;
  },
  {
    connection: getSharedConnection(),
    concurrency: 5,
    limiter: { max: 10, duration: 1000 }, // max 10 emails/sec
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker:Email] Job ${job.id} completed — sent to ${job.data.to}`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker:Email] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
});

worker.on('error', (err) => {
  console.error('[Worker:Email] Worker error:', err.message);
});

module.exports = worker;
