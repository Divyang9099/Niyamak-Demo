const service = require('./deliverable.service');
const { success, error } = require('../../../../core/utils/response');
const { uploadToR2 } = require('../../../../core/utils/r2Upload');
const { getFileStream, streamDownload, buildDownloadFilename } = require('../../../../core/utils/r2Download');
const db = require('../../../../core/config/db');
const { zipQueue, addJob } = require('../../../../core/queues/index');

exports.createDeliverable = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    let key = null;
    let fileName = null;

    if (req.file) {
      key = await uploadToR2(req.file, "deliverables");
      fileName = req.file.originalname;
    }

    const data = await service.createDeliverable(projectId, {
      ...req.body,
      file_name: fileName || req.body.name,
      file_key: key,
      uploaded_by: req.user.id
    });
    res.status(201).json(success(data, 'Deliverable created', 201));
  } catch (err) { next(err); }
};

exports.getDeliverables = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const data = await service.getDeliverables(projectId);
    res.json(success(data));
  } catch (err) {
    next(err);
  }
};

exports.updateDeliverable = async (req, res, next) => {
  try {
    const { deliverableId, id: projectId } = req.params;
    let updateData = { ...req.body };

    if (req.file) {
      const key = await uploadToR2(req.file, "deliverables");
      updateData.file_key = key;
      if (!updateData.name) updateData.name = req.file.originalname;
    }

    const data = await service.updateDeliverable(projectId, deliverableId, updateData);
    res.json(success(data, 'Deliverable updated'));
  } catch (err) {
    next(err);
  }
};

exports.deleteDeliverable = async (req, res, next) => {
  try {
    const { deliverableId, id: projectId } = req.params;
    await service.deleteDeliverable(projectId, deliverableId);
    res.json(success(null, 'Deliverable deleted'));
  } catch (err) {
    next(err);
  }
};

exports.approveDeliverable = async (req, res, next) => {
  try {
    const { deliverableId, id: projectId } = req.params;
    const data = await service.approveDeliverable(projectId, deliverableId, req.user.id);
    res.json(success(data, 'Deliverable approved'));
  } catch (err) { next(err); }
};

exports.rejectDeliverable = async (req, res, next) => {
  try {
    const { deliverableId, id: projectId } = req.params;
    const data = await service.rejectDeliverable(
      projectId, deliverableId, req.user.id, req.body.reason
    );
    res.json(success(data, 'Deliverable rejected'));
  } catch (err) { next(err); }
};

exports.resubmitDeliverable = async (req, res, next) => {
  try {
    const { deliverableId, id: projectId } = req.params;
    let fileKey = null;

    if (req.file) {
      fileKey = await uploadToR2(req.file, 'deliverables');
    }

    const data = await service.resubmitDeliverable(
      projectId,
      deliverableId,
      { ...req.body, file_key: fileKey || req.body.file_key || null },
      req.user.id
    );
    res.json(success(data, 'Deliverable resubmitted for review'));
  } catch (err) { next(err); }
};

exports.getDeliverableVersions = async (req, res, next) => {
  try {
    // Scope to the project in the URL so version history of another project's
    // deliverable can't be read by guessing the deliverableId.
    const data = await service.getDeliverableVersions(req.params.deliverableId, req.params.id);
    res.json(success(data));
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/projects/:id/deliverables/:id/download
 * Secure stream download for finalized deliverables.
 */
exports.downloadDeliverable = async (req, res, next) => {
  try {
    const { deliverableId, id: projectId } = req.params;
    const requestingUser = req.user;

    // 1. Admin bypass check
    if (requestingUser.role !== 'admin') {
      const membership = await db.query(
        'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
        [projectId, requestingUser.id]
      );
      if (!membership.rows.length) {
        return res.status(403).json(error('Access denied. You are not a member of this project.', 403));
      }
    }

    // 2. Fetch deliverable
    const dResult = await db.query(
      'SELECT * FROM deliverables WHERE id = $1 AND project_id = $2',
      [deliverableId, projectId]
    );
    if (!dResult.rows.length) {
      return res.status(404).json(error('Deliverable not found', 404));
    }
    const doc = dResult.rows[0];

    // 3. Log download
    await db.query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id)
       VALUES ($1, 'DOWNLOAD', 'deliverable', $2)`,
      [requestingUser.id, doc.id]
    );

    // 4. Stream from R2
    const r2Key = doc.file_key;
    if (!r2Key) {
      return res.status(404).json(error('File not found — upload may have failed', 404));
    }

    // Stream in original form — real MIME type + original filename/extension
    // (recovered from the R2 key when the deliverable name carries no extension).
    await streamDownload(res, r2Key, doc.name || 'deliverable', next);
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/projects/:id/deliverables/bundle
 * Queues a background ZIP job. Returns 202 immediately.
 * Client listens for 'bundle:ready' socket event which carries the download URL.
 */
exports.bundleDeliverables = async (req, res, next) => {
  try {
    const projectId      = req.params.id;
    const requestingUser = req.user;

    // Auth check
    if (requestingUser.role !== 'admin') {
      const membership = await db.query(
        'SELECT id FROM project_members WHERE project_id=$1 AND user_id=$2',
        [projectId, requestingUser.id]
      );
      if (!membership.rows.length) {
        return res.status(403).json(error('Access denied. You are not a member of this project.', 403));
      }
    }

    // Check there are files to bundle
    const countRes = await db.query(
      `SELECT COUNT(*) AS cnt FROM deliverables
       WHERE project_id=$1 AND file_key IS NOT NULL AND status IN ('uploaded','approved')`,
      [projectId]
    );
    if (parseInt(countRes.rows[0].cnt, 10) === 0) {
      return res.status(400).json(error('No uploaded deliverables to bundle', 400));
    }

    const projectRes  = await db.query('SELECT name FROM projects WHERE id=$1', [projectId]);
    const projectName = projectRes.rows[0]?.name || 'project';

    // Create bundle record
    const bundleRes = await db.query(
      `INSERT INTO deliverable_bundles (project_id, requested_by, status)
       VALUES ($1,$2,'queued') RETURNING id`,
      [projectId, requestingUser.id]
    );
    const bundleId = bundleRes.rows[0].id;

    const socket = require('../../../../core/socket/socket.gateway');
    const EVENTS = require('../../../../core/socket/socket.events');

    // Enqueue ZIP job
    await addJob(
      zipQueue,
      'bundle-deliverables',
      { projectId, userId: requestingUser.id, bundleId, projectName },
      // Degraded fallback — ZIP worker requires Redis. Immediately notify user
      // so the UI doesn't hang waiting for a bundle:ready that will never arrive.
      async () => {
        console.warn('[Bundle] Redis unavailable — ZIP worker not running. Notifying user to use individual downloads.');
        await db.query(`UPDATE deliverable_bundles SET status='failed' WHERE id=$1`, [bundleId]);
        try {
          socket.emitToUser(requestingUser.id, EVENTS.BUNDLE_FAILED, {
            projectId,
            bundleId,
            reason: 'Queue unavailable — please use individual file downloads.',
          });
        } catch (_) {}
      }
    );

    res.status(202).json(success(
      { bundleId, message: 'ZIP preparation started. You will be notified when ready.' },
      'Bundle queued',
      202
    ));
  } catch (err) { next(err); }
};

/**
 * GET /api/v1/projects/:id/deliverables/download-all
 * Legacy synchronous streaming — kept for small projects / Redis-unavailable fallback.
 * Prefer the /bundle endpoint for production use.
 */
exports.downloadAllDeliverables = async (req, res, next) => {
  try {
    const projectId      = req.params.id;
    const requestingUser = req.user;

    if (requestingUser.role !== 'admin') {
      const membership = await db.query(
        'SELECT id FROM project_members WHERE project_id=$1 AND user_id=$2',
        [projectId, requestingUser.id]
      );
      if (!membership.rows.length) {
        return res.status(403).json(error('Access denied. You are not a member of this project.', 403));
      }
    }

    const projectRes  = await db.query('SELECT name FROM projects WHERE id=$1', [projectId]);
    const projectName = projectRes.rows[0]?.name || 'project';
    const zipName     = `${projectName.replace(/\s+/g, '_')}_deliverables.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    await service.streamAllDeliverablesAsZip(projectId, res);
  } catch (err) {
    if (!res.headersSent) next(err);
    else res.destroy();
  }
};
