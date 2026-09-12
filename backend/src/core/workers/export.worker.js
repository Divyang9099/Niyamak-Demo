const { Worker } = require('bullmq');
const { REDIS_ENABLED, getSharedConnection } = require('../queues/redis');
const exportService = require('../../domains/estimation/export.service');
const socket = require('../socket/socket.gateway');
const EVENTS = require('../socket/socket.events');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const r2 = require('../config/r2');
const env = require('../config/env');
const { randomUUID } = require('crypto');

if (!REDIS_ENABLED) {
  console.warn('[Worker:Export] Redis not configured — worker not started.');
  module.exports = null;
  return;
}

const PRESIGNED_EXPIRY_SECONDS = 60 * 60; // 1 hour

const uploadExportToR2 = async (buffer, estimationId, type) => {
  const ext = type === 'pdf' ? 'pdf' : 'xlsx';
  const mime = type === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const key = `exports/${estimationId}/${Date.now()}-${randomUUID()}.${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: env.r2.bucket,
      Key: key,
      Body: buffer,
      ContentType: mime,
      ContentDisposition: `attachment; filename="estimation-${estimationId.slice(0, 8)}.${ext}"`,
    })
  );

  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: env.r2.bucket, Key: key }),
    { expiresIn: PRESIGNED_EXPIRY_SECONDS }
  );

  return { key, url };
};

const worker = new Worker(
  'pdf-export',
  async (job) => {
    const { estimationId, userId, type = 'pdf' } = job.data;
    if (!estimationId) throw new Error('Export job missing estimationId');

    console.log(`[Worker:Export] Job ${job.id} — ${type.toUpperCase()} for estimation ${estimationId}`);

    const buffer = type === 'excel'
      ? await exportService.generateExcel(estimationId)
      : await exportService.generatePDF(estimationId);

    const { key, url } = await uploadExportToR2(buffer, estimationId, type);

    console.log(`[Worker:Export] Job ${job.id} done — stored at ${key}`);
    return { key, url, type, estimationId, userId };
  },
  {
    connection: getSharedConnection(),
    concurrency: 2, // PDF generation is CPU-heavy
  }
);

// Excel exports share the same queue name for simplicity — queue is 'pdf-export'
// The `type` field in job data controls which generator runs.

worker.on('completed', (job, result) => {
  console.log(`[Worker:Export] Job ${job.id} completed — ${result?.type} ready at ${result?.key}`);
  if (result?.userId && result?.url) {
    try {
      socket.emitToUser(result.userId, EVENTS.EXPORT_READY, {
        url:          result.url,
        type:         result.type,
        estimationId: result.estimationId,
        expiresAt:    Date.now() + PRESIGNED_EXPIRY_SECONDS * 1000,
      });
    } catch (_) {}
  }
});

worker.on('failed', (job, err) => {
  console.error(`[Worker:Export] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
});

worker.on('error', (err) => {
  console.error('[Worker:Export] Worker error:', err.message);
});

module.exports = worker;
