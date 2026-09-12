const db            = require('../../../../core/config/db');
const audit         = require('../../../audit/audit.service');
const notifService  = require('../../../notification/notification.service');
const emailTriggers = require('../../../notification/emailTriggers.service');
const socket        = require('../../../../core/socket/socket.gateway');
const EVENTS        = require('../../../../core/socket/socket.events');

// CREATE
// data may include: parent_id (UUID of a folder deliverable), is_folder (bool),
// and silent (bool) — when silent, audit + socket still fire but per-file member
// notifications and PM emails are skipped (used for files inside a folder; the
// folder itself sends a single notification — see createDeliverableMaybeFoldered).
exports.createDeliverable = async (projectId, data) => {
  const { name, format, file_key, uploaded_by, file_name, file_size,
          parent_id = null, is_folder = false, silent = false } = data;

  // 1. Check project exists
  const project = await db.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!project.rows.length) {
    throw Object.assign(new Error('Project not found'), { statusCode: 404 });
  }

  // ✅ Lifecycle: a file makes the deliverable final ('approved') immediately —
  // no separate approval step is required. A folder row carries no file but is a
  // container ('uploaded'). Nothing attached yet → 'pending'.
  const status = file_key ? 'approved' : (is_folder ? 'uploaded' : 'pending');
  const setUploadedAt = !!(file_key || is_folder);
  const setApprovedAt = !!file_key;

  const query = `
    INSERT INTO deliverables
    (project_id, name, format, file_key, file_size, uploaded_by, status, parent_id, is_folder, uploaded_at, approved_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
            ${setUploadedAt ? 'CURRENT_TIMESTAMP' : 'NULL'},
            ${setApprovedAt ? 'CURRENT_TIMESTAMP' : 'NULL'})
    RETURNING *;
  `;

  const values = [projectId, name || file_name || null, format || null, file_key || null,
                  file_size || null, uploaded_by || null, status, parent_id, !!is_folder];

  const result = await db.query(query, values);
  const deliverable = result.rows[0];

  // 📝 LOG AUDIT
  await audit.log({
    user_id: uploaded_by,
    action: 'UPLOAD_DELIVERABLE',
    entity_type: 'deliverable',
    entity_id: deliverable.id,
    new_value: deliverable
  });

  try { socket.emitToProject(projectId, EVENTS.DELIVERABLE_CREATED, deliverable); } catch (_) {}

  // 🔔 NOTIFY project members (skipped for folder children — folder notifies once)
  if (file_key && !silent) {
    try {
      const members = await db.query('SELECT user_id FROM project_members WHERE project_id=$1 AND user_id != $2', [projectId, uploaded_by || -1]);
      await Promise.all(members.rows.map(m =>
        notifService.createNotification({
          user_id:     m.user_id,
          title:       'New Deliverable Uploaded',
          message:     `A new deliverable "${deliverable.name || 'File'}" was uploaded.`,
          entity_type: 'project',
          entity_id:   projectId,
        })
      ));
    } catch (notifErr) {
      console.error('Notification error (non-fatal):', notifErr.message);
    }

    // PRD §11.2 trigger #3 — email PMs when pilot uploads
    try {
      const ctx = await db.query(
        `SELECT p.name AS project_name, u.name AS uploader_name
           FROM projects p
           LEFT JOIN users u ON u.id = $2
          WHERE p.id = $1`,
        [projectId, uploaded_by || null]
      );
      if (ctx.rows[0]) {
        emailTriggers.onDeliverableUploaded({
          projectId,
          projectName:     ctx.rows[0].project_name,
          deliverableName: deliverable.name || file_name || 'File',
          uploaderName:    ctx.rows[0].uploader_name,
        });
      }
    } catch (mailErr) {
      console.error('[Deliverable] Email trigger failed (non-fatal):', mailErr.message);
    }
  }

  return deliverable;
};

// Race-safe find-or-create of a FOLDER deliverable (is_folder=true, no file).
// Returns { id, created }. `created` is true only for the caller that won the
// INSERT — used so exactly ONE notification/email fires per folder.
exports.findOrCreateDeliverableFolder = async (projectId, folderName, userId) => {
  const find = `SELECT id FROM deliverables WHERE project_id=$1 AND is_folder=true AND name=$2 LIMIT 1`;
  const existing = await db.query(find, [projectId, folderName]);
  if (existing.rows.length) return { id: existing.rows[0].id, created: false };

  try {
    const ins = await db.query(
      `INSERT INTO deliverables (project_id, name, is_folder, status, uploaded_by, uploaded_at)
       VALUES ($1,$2,true,'uploaded',$3,CURRENT_TIMESTAMP) RETURNING id`,
      [projectId, folderName, userId || null]
    );
    const folder = { id: ins.rows[0].id, created: true };
    try { socket.emitToProject(projectId, EVENTS.DELIVERABLE_CREATED, { id: folder.id, name: folderName, is_folder: true }); } catch (_) {}
    return folder;
  } catch (_) {
    // Lost the race (uq_deliverable_folder) — fetch the winner's row.
    const retry = await db.query(find, [projectId, folderName]);
    return { id: retry.rows[0]?.id || null, created: false };
  }
};

// Create a deliverable, grouping it under a folder when relative_path contains
// one (e.g. "mission_90deg/DJI_0001.JPG"). Files inside a folder are created
// SILENTLY; a single notification/email is sent once, when the folder is created.
exports.createDeliverableMaybeFoldered = async (projectId, data) => {
  const relPath = data.relative_path || data.relativePath;
  const topFolder = relPath && relPath.includes('/') ? relPath.split('/')[0] : null;

  if (!topFolder) {
    // Loose single file — unchanged behaviour (notifies per file).
    return exports.createDeliverable(projectId, data);
  }

  const { id: folderId, created } = await exports.findOrCreateDeliverableFolder(projectId, topFolder, data.uploaded_by);
  const child = await exports.createDeliverable(projectId, { ...data, parent_id: folderId, silent: true });

  // One notification + one email for the whole folder (fired by the file that
  // first created the folder row).
  if (created) {
    try {
      const members = await db.query(
        'SELECT user_id FROM project_members WHERE project_id=$1 AND user_id != $2',
        [projectId, data.uploaded_by || -1]
      );
      await Promise.all(members.rows.map(m =>
        notifService.createNotification({
          user_id:     m.user_id,
          title:       'New Deliverables Folder Uploaded',
          message:     `A folder "${topFolder}" with new deliverables was uploaded.`,
          entity_type: 'project',
          entity_id:   projectId,
        })
      ));
      const ctx = await db.query(
        `SELECT p.name AS project_name, u.name AS uploader_name
           FROM projects p LEFT JOIN users u ON u.id = $2 WHERE p.id = $1`,
        [projectId, data.uploaded_by || null]
      );
      if (ctx.rows[0]) {
        emailTriggers.onDeliverableUploaded({
          projectId,
          projectName:     ctx.rows[0].project_name,
          deliverableName: `${topFolder} (folder)`,
          uploaderName:    ctx.rows[0].uploader_name,
        });
      }
    } catch (err) {
      console.error('[Deliverable] Folder notify failed (non-fatal):', err.message);
    }
  }

  return child;
};

// GET
exports.getDeliverables = async (projectId) => {
  const result = await db.query(
    `
    SELECT d.*, u.name as uploaded_by_name
    FROM deliverables d
    LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE project_id = $1
    ORDER BY uploaded_at DESC
    `,
    [projectId]
  );

  return result.rows;
};

// UPDATE (Name, Format, URL)
exports.updateDeliverable = async (projectId, id, data) => {
  const { name, format, file_key } = data;
  // ✅ Lifecycle: Move from 'pending' to 'uploaded' when file is attached
  const existing = await db.query('SELECT status, file_key FROM deliverables WHERE id = $1', [id]);
  if (!existing.rows.length) throw Object.assign(new Error('Deliverable not found'), { statusCode: 404 });
  
  let statusUpdate = '';
  if (file_key) {
    // Attaching a file finalizes the deliverable — no approval step required.
    statusUpdate = ", status = 'approved', uploaded_at = CURRENT_TIMESTAMP, approved_at = CURRENT_TIMESTAMP";
  }

  const query = `
    UPDATE deliverables
    SET 
      name = COALESCE($1, name), 
      format = COALESCE($2, format), 
      file_key = COALESCE($3, file_key)
      ${statusUpdate}
    WHERE id = $4 AND project_id = $5
    RETURNING *;
  `;

  const values = [name || null, format || null, file_key || null, id, projectId];
  const result = await db.query(query, values);

  if (!result.rows.length) {
    throw Object.assign(new Error('Deliverable not found'), { statusCode: 404 });
  }

  try { socket.emitToProject(projectId, EVENTS.DELIVERABLE_UPDATED, result.rows[0]); } catch (_) {}

  // PRD §11.2 trigger #3 — email PMs when a deliverable gets its file attached
  if (file_key) {
    try {
      const ctx = await db.query(
        `SELECT p.name AS project_name, u.name AS uploader_name
           FROM projects p
           LEFT JOIN users u ON u.id = $2
          WHERE p.id = $1`,
        [projectId, result.rows[0].uploaded_by || null]
      );
      if (ctx.rows[0]) {
        emailTriggers.onDeliverableUploaded({
          projectId,
          projectName:     ctx.rows[0].project_name,
          deliverableName: result.rows[0].name || 'File',
          uploaderName:    ctx.rows[0].uploader_name,
        });
      }
    } catch (mailErr) {
      console.error('[Deliverable] Email trigger failed (non-fatal):', mailErr.message);
    }
  }

  return result.rows[0];
};

// DELETE
exports.deleteDeliverable = async (projectId, id) => {
  const result = await db.query('DELETE FROM deliverables WHERE id = $1 AND project_id = $2 RETURNING id', [id, projectId]);

  if (!result.rows.length) {
    throw Object.assign(new Error('Deliverable not found'), { statusCode: 404 });
  }
  try { socket.emitToProject(projectId, EVENTS.DELIVERABLE_DELETED, { id }); } catch (_) {}
};

// APPROVE
exports.approveDeliverable = async (projectId, id, userId) => {
  // 1. Check if it exists and is already approved
  const check = await db.query('SELECT status FROM deliverables WHERE id = $1 AND project_id = $2', [id, projectId]);
  if (!check.rows.length) {
    throw Object.assign(new Error('Deliverable not found'), { statusCode: 404 });
  }

  if (check.rows[0].status === 'approved') {
    throw Object.assign(new Error('Deliverable is already approved'), { statusCode: 409 });
  }
  if (['pending', 'uploading'].includes(check.rows[0].status)) {
    throw Object.assign(new Error('Cannot approve a deliverable with no file uploaded'), { statusCode: 409 });
  }

  const query = `
    UPDATE deliverables
    SET status = 'approved', approved_by = $3, approved_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND project_id = $2
    RETURNING *;
  `;

  const result = await db.query(query, [id, projectId, userId]);
  const deliverable = result.rows[0];

  // 📝 LOG AUDIT
  await audit.log({
    user_id: userId,
    action: 'APPROVE_DELIVERABLE',
    entity_type: 'deliverable',
    entity_id: deliverable.id,
    new_value: { status: 'approved' }
  });

  try { socket.emitToProject(projectId, EVENTS.DELIVERABLE_APPROVED, deliverable); } catch (_) {}

  // 🔔 NOTIFY the uploader — in-app + email
  if (deliverable.uploaded_by && deliverable.uploaded_by !== userId) {
    try {
      await notifService.createNotification({
        user_id:     deliverable.uploaded_by,
        category:    'project_status',
        title:       'Deliverable Approved',
        message:     `Your deliverable "${deliverable.name || 'file'}" has been approved.`,
        entity_type: 'project',
        entity_id:   projectId,
      });
      // Email the pilot
      const ctx = await db.query(
        `SELECT p.name AS project_name, u.name AS uploader_name, u.email AS uploader_email
           FROM projects p, users u
          WHERE p.id = $1 AND u.id = $2`,
        [projectId, deliverable.uploaded_by]
      );
      if (ctx.rows[0]) {
        emailTriggers.onDeliverableApproved({
          uploaderUserId: deliverable.uploaded_by,
          uploaderEmail:  ctx.rows[0].uploader_email,
          uploaderName:   ctx.rows[0].uploader_name,
          deliverableName: deliverable.name || 'Deliverable',
          projectName:    ctx.rows[0].project_name,
        });
      }
    } catch (notifErr) {
      console.error('Notification error (non-fatal):', notifErr.message);
    }
  }

  return deliverable;
};

// REJECT
exports.rejectDeliverable = async (projectId, id, userId, reason) => {
  const check = await db.query(
    'SELECT status FROM deliverables WHERE id=$1 AND project_id=$2', [id, projectId]
  );
  if (!check.rows.length) throw Object.assign(new Error('Deliverable not found'), { statusCode: 404 });
  if (check.rows[0].status === 'approved') {
    throw Object.assign(new Error('Cannot reject an already-approved deliverable'), { statusCode: 409 });
  }
  if (!reason || !String(reason).trim()) {
    throw Object.assign(new Error('Rejection reason is required'), { statusCode: 400 });
  }

  const result = await db.query(
    `UPDATE deliverables
     SET status='rejected', rejected_by=$3, rejected_at=CURRENT_TIMESTAMP, rejected_reason=$4
     WHERE id=$1 AND project_id=$2
     RETURNING *`,
    [id, projectId, userId, reason || null]
  );
  const deliverable = result.rows[0];

  await audit.log({
    user_id: userId, action: 'REJECT_DELIVERABLE',
    entity_type: 'deliverable', entity_id: id,
    new_value: { status: 'rejected', reason },
  });

  try { socket.emitToProject(projectId, EVENTS.DELIVERABLE_UPDATED, deliverable); } catch (_) {}

  if (deliverable.uploaded_by && deliverable.uploaded_by !== userId) {
    try {
      await notifService.createNotification({
        user_id:     deliverable.uploaded_by,
        category:    'project_status',
        title:       'Deliverable Rejected',
        message:     `Your deliverable "${deliverable.name || 'file'}" was rejected. Reason: ${reason || 'No reason given'}`,
        entity_type: 'project',
        entity_id:   projectId,
      });
      // Email the pilot
      const ctx = await db.query(
        `SELECT p.name AS project_name, u.name AS uploader_name, u.email AS uploader_email
           FROM projects p, users u
          WHERE p.id = $1 AND u.id = $2`,
        [projectId, deliverable.uploaded_by]
      );
      if (ctx.rows[0]) {
        emailTriggers.onDeliverableRejected({
          uploaderUserId: deliverable.uploaded_by,
          uploaderEmail:  ctx.rows[0].uploader_email,
          uploaderName:   ctx.rows[0].uploader_name,
          deliverableName: deliverable.name || 'Deliverable',
          projectName:    ctx.rows[0].project_name,
          reason,
        });
      }
    } catch (_) {}
  }

  return deliverable;
};

// RESUBMIT (PRD §4.4 — pilot re-uploads after rejection)
// Resets status to 'pending' (or 'uploaded' if a new file_key is provided),
// clears the rejection fields, and notifies PMs.
exports.resubmitDeliverable = async (projectId, id, data, userId) => {
  const check = await db.query(
    'SELECT * FROM deliverables WHERE id=$1 AND project_id=$2',
    [id, projectId]
  );
  if (!check.rows.length) {
    throw Object.assign(new Error('Deliverable not found'), { statusCode: 404 });
  }
  const existing = check.rows[0];

  const { file_key, name, format } = data || {};
  // Attaching a file finalizes the deliverable ('approved') — no approval step
  // needed. Used both for first-time attach on a pending row and re-upload after
  // a rejection. With no file (metadata-only) fall back to 'pending'.
  const newStatus = file_key ? 'approved' : 'pending';

  const result = await db.query(
    `UPDATE deliverables
     SET status          = $1,
         rejected_by     = NULL,
         rejected_at     = NULL,
         rejected_reason = NULL,
         file_key        = COALESCE($2, file_key),
         name            = COALESCE($3, name),
         format          = COALESCE($4, format),
         uploaded_by     = COALESCE($5, uploaded_by),
         uploaded_at     = CASE WHEN $2 IS NOT NULL THEN CURRENT_TIMESTAMP ELSE uploaded_at END,
         approved_at     = CASE WHEN $2 IS NOT NULL THEN CURRENT_TIMESTAMP ELSE approved_at END,
         approved_by     = CASE WHEN $2 IS NOT NULL THEN $5 ELSE approved_by END,
         updated_at      = CURRENT_TIMESTAMP
     WHERE id=$6 AND project_id=$7
     RETURNING *`,
    [newStatus, file_key || null, name || null, format || null, userId || null, id, projectId]
  );
  const deliverable = result.rows[0];

  await audit.log({
    user_id: userId, action: 'RESUBMIT_DELIVERABLE',
    entity_type: 'deliverable', entity_id: id,
    old_value: { status: 'rejected', rejected_reason: existing.rejected_reason },
    new_value: { status: newStatus },
  });

  try { socket.emitToProject(projectId, EVENTS.DELIVERABLE_UPDATED, deliverable); } catch (_) {}

  // Notify PMs that a resubmission is ready for review
  try {
    const members = await db.query(
      `SELECT pm.user_id FROM project_members pm
        WHERE pm.project_id=$1 AND pm.role='project_manager' AND pm.user_id != $2`,
      [projectId, userId || null]
    );
    await Promise.all(members.rows.map(m =>
      notifService.createNotification({
        user_id:     m.user_id,
        title:       'Deliverable Resubmitted',
        message:     `"${deliverable.name || 'Deliverable'}" has been resubmitted for review.`,
        entity_type: 'project',
        entity_id:   projectId,
      })
    ));
  } catch (_) {}

  return deliverable;
};

// GET VERSION HISTORY — scoped to the project so version rows are only returned
// when the deliverable actually belongs to the project the caller has access to.
exports.getDeliverableVersions = async (deliverableId, projectId) => {
  const owns = await db.query(
    'SELECT 1 FROM deliverables WHERE id=$1 AND project_id=$2',
    [deliverableId, projectId]
  );
  if (!owns.rows.length) {
    throw Object.assign(new Error('Deliverable not found'), { statusCode: 404 });
  }

  const result = await db.query(
    `SELECT dv.*, u.name as uploaded_by_name
     FROM deliverable_versions dv
     LEFT JOIN users u ON dv.uploaded_by = u.id
     WHERE dv.deliverable_id=$1
     ORDER BY dv.created_at DESC`,
    [deliverableId]
  );
  return result.rows;
};

/**
 * ZIP BUNDLING — Legacy streaming path kept for small projects.
 * Large projects should use the queued bundle endpoint instead.
 */
const archiver = require('archiver');
const { getFileStream, buildDownloadFilename } = require('../../../../core/utils/r2Download');

exports.streamAllDeliverablesAsZip = async (projectId, outputStream) => {
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (err) => {
    console.error('Archiver error:', err);
    throw err;
  });

  archive.pipe(outputStream);

  const result = await db.query(
    'SELECT name, format, file_key FROM deliverables WHERE project_id = $1 AND file_key IS NOT NULL',
    [projectId]
  );

  if (result.rows.length === 0) {
    await archive.finalize();
    return;
  }

  for (const doc of result.rows) {
    try {
      const stream  = await getFileStream(doc.file_key);
      const fname   = buildDownloadFilename(doc.name, doc.file_key);
      archive.append(stream, { name: fname });
    } catch (err) {
      console.error(`Failed to append file ${doc.file_key} to ZIP:`, err.message);
      // Continue with other files if one fails
    }
  }

  await archive.finalize();
};
