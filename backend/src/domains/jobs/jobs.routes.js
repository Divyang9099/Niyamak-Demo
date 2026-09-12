const router     = require('express').Router();
const { Queue }  = require('bullmq');
const { REDIS_ENABLED, getSharedConnection } = require('../../core/queues/redis');
const authenticate = require('../../core/middleware/auth.middleware');
const { success, error } = require('../../core/utils/response');

const QUEUE_MAP = {
  'pdf-export':   'pdf-export',
  'excel-export': 'excel-export',
  'email':        'email',
  'notification': 'notification',
  'zip':          'zip',
  'file-upload':  'file-upload',
  'reminder':     'reminder',
  'cleanup':      'cleanup',
};

// Lazy queue instances for status checking (read-only — no workers here).
// All share the singleton Redis connection — no extra clients.
const queueCache = {};
const getQueue = (name) => {
  if (!queueCache[name]) {
    queueCache[name] = new Queue(name, { connection: getSharedConnection() });
  }
  return queueCache[name];
};

/**
 * GET /api/v1/jobs/:jobId?queue=pdf-export
 *
 * Returns the current state and return value of a background job.
 * Used by the frontend to poll export status after a 202 response.
 *
 * States: waiting | active | completed | failed | delayed | unknown
 */
router.get('/:jobId', authenticate, async (req, res, next) => {
  try {
    if (!REDIS_ENABLED) {
      return res.json(success({ status: 'unavailable', message: 'Queue system not configured' }));
    }

    const { jobId } = req.params;
    const queueName = req.query.queue;

    if (!queueName || !QUEUE_MAP[queueName]) {
      return res.status(400).json(error('Missing or invalid ?queue= parameter', 400));
    }

    const queue = getQueue(queueName);
    const job   = await queue.getJob(jobId);

    if (!job) {
      return res.status(404).json(error('Job not found', 404));
    }

    // Ownership check: job ids are sequential integers, trivially enumerable, and
    // returnvalue/failedReason can carry another user's R2 keys, upload metadata,
    // or error strings. Only the enqueuing user (or an admin) may read a job.
    const isAdmin = ['admin', 'super_admin'].includes(req.user?.role);
    if (!isAdmin && job.data && job.data.userId != null &&
        String(job.data.userId) !== String(req.user.id)) {
      return res.status(404).json(error('Job not found', 404));
    }

    const state = await job.getState();

    const payload = {
      jobId:       job.id,
      queue:       queueName,
      status:      state,
      progress:    job.progress,
      attemptsMade: job.attemptsMade,
      createdAt:   job.timestamp,
      processedAt: job.processedOn,
      finishedAt:  job.finishedOn,
    };

    if (state === 'completed') {
      payload.result = job.returnvalue;
    }

    if (state === 'failed') {
      payload.reason = job.failedReason;
    }

    res.json(success(payload));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
