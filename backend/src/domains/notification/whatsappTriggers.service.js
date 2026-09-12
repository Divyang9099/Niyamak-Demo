/**
 * WhatsApp Triggers — mirrors emailTriggers.service.js event-for-event.
 *
 * Each function:
 *   - Respects user_notification_prefs (whatsapp_enabled column)
 *   - Uses the whatsapp queue with sync fallback (same pattern as email)
 *   - Never throws — best-effort, errors logged only
 *
 * Template names map to Meta-approved templates defined in whatsapp.service.js.
 */

const db          = require('../../core/config/db');
const { addJob }  = require('../../core/queues');
const wa          = require('./whatsapp.service');

let _waQueue = null;
const getWaQueue = () => {
  if (!_waQueue) {
    try {
      const { whatsappQueue } = require('../../core/queues');
      _waQueue = whatsappQueue;
    } catch { _waQueue = null; }
  }
  return _waQueue;
};

const _prefAllows = async (userId, category) => {
  if (!userId) return true;
  try {
    const r = await db.query(
      'SELECT whatsapp_enabled FROM user_notification_prefs WHERE user_id = $1 AND category = $2',
      [userId, category]
    );
    if (!r.rows.length) return true;
    return r.rows[0].whatsapp_enabled !== false;
  } catch {
    return true;
  }
};

const _enqueue = (templateName, phone, params) => {
  const job = { templateName, phone, params };
  return addJob(
    getWaQueue(),
    'send-whatsapp',
    job,
    (data) => wa.sendTemplate(data.phone, data.templateName, data.params)
  ).catch((e) => console.error('[WATrigger] enqueue failed:', e.message));
};

// ─── 0. Welcome new user ──────────────────────────────────────────────────
exports.onUserWelcome = async ({ userName, userPhone, userRole }) => {
  if (!userPhone) return;
  const roleLabel = { admin: 'Administrator', project_manager: 'Project Manager', pilot: 'Pilot' }[userRole] || userRole;
  await _enqueue('varuna_welcome', userPhone, [userName, roleLabel]).catch(() => {});
};

// ─── 1. Pilot assigned to project ────────────────────────────────────────
exports.onAllocation = async ({ pilotUserId, pilotPhone, pilotName, projectName, startDate, droneName }) => {
  if (!pilotPhone) return;
  if (!(await _prefAllows(pilotUserId, 'allocation'))) return;
  await _enqueue('varuna_pilot_assignment', pilotPhone, [
    pilotName,
    projectName,
    startDate || 'TBD',
    droneName || 'TBD',
  ]);
};

// ─── 2. Project status changed ────────────────────────────────────────────
exports.onProjectStatusChange = async ({ projectId, projectName, statusLabel }) => {
  try {
    const r = await db.query(
      `SELECT DISTINCT u.id AS user_id, u.phone, u.name
         FROM project_members pm
         JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = $1 AND u.phone IS NOT NULL AND u.deleted_at IS NULL`,
      [projectId]
    );
    for (const m of r.rows) {
      if (!(await _prefAllows(m.user_id, 'project_status'))) continue;
      await _enqueue('varuna_project_status', m.phone, [m.name, projectName, statusLabel]);
    }
  } catch (e) {
    console.error('[WATrigger] onProjectStatusChange failed:', e.message);
  }
};

// ─── 2b. Pipeline stage changed → admins + creator ───────────────────────
exports.onPipelineStageChange = async ({ pipelineId, pipelineName, createdBy, stageLabel }) => {
  try {
    const r = await db.query(
      `SELECT DISTINCT u.id AS user_id, u.phone, u.name
         FROM users u
        WHERE u.phone IS NOT NULL AND u.deleted_at IS NULL
          AND (u.role = 'admin' OR u.id = $1)`,
      [createdBy || null]
    );
    for (const m of r.rows) {
      if (!(await _prefAllows(m.user_id, 'project_status'))) continue;
      await _enqueue('varuna_project_status', m.phone, [m.name, pipelineName, stageLabel]);
    }
  } catch (e) {
    console.error('[WATrigger] onPipelineStageChange failed:', e.message);
  }
};

// ─── 3. Deliverable uploaded → PM ────────────────────────────────────────
exports.onDeliverableUploaded = async ({ projectId, projectName, deliverableName }) => {
  try {
    const r = await db.query(
      `SELECT DISTINCT u.id AS user_id, u.phone, u.name
         FROM project_members pm
         JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = $1 AND pm.role = 'project_manager'
          AND u.phone IS NOT NULL`,
      [projectId]
    );
    for (const m of r.rows) {
      if (!(await _prefAllows(m.user_id, 'project_status'))) continue;
      await _enqueue('varuna_deliverable_uploaded', m.phone, [m.name, deliverableName, projectName]);
    }
  } catch (e) {
    console.error('[WATrigger] onDeliverableUploaded failed:', e.message);
  }
};

// ─── 3b. Deliverable approved → pilot ────────────────────────────────────
exports.onDeliverableApproved = async ({ uploaderUserId, uploaderPhone, uploaderName, deliverableName, projectName }) => {
  if (!uploaderPhone) return;
  if (!(await _prefAllows(uploaderUserId, 'project_status'))) return;
  await _enqueue('varuna_deliverable_approved', uploaderPhone, [uploaderName, deliverableName, projectName]);
};

// ─── 3c. Deliverable rejected → pilot ────────────────────────────────────
exports.onDeliverableRejected = async ({ uploaderUserId, uploaderPhone, uploaderName, deliverableName, projectName, reason }) => {
  if (!uploaderPhone) return;
  if (!(await _prefAllows(uploaderUserId, 'project_status'))) return;
  await _enqueue('varuna_deliverable_rejected', uploaderPhone, [
    uploaderName,
    deliverableName,
    projectName,
    reason || 'No reason provided',
  ]);
};

// ─── 3d. Member added to project ─────────────────────────────────────────
exports.onMemberAdded = async ({ userId, userPhone, userName, projectName, role }) => {
  if (!userPhone) return;
  if (!(await _prefAllows(userId, 'project_status'))) return;
  const roleLabel = (role || '').replace('_', ' ');
  await _enqueue('varuna_member_added', userPhone, [userName, projectName, roleLabel]);
};

// ─── 5. Drone maintenance due ─────────────────────────────────────────────
exports.onDroneMaintenanceDue = async ({ droneName, serialNumber, maintenanceDate }) => {
  try {
    const admins = await db.query(
      `SELECT id AS user_id, phone, name FROM users
        WHERE role = 'admin' AND phone IS NOT NULL AND deleted_at IS NULL`
    );
    for (const a of admins.rows) {
      if (!(await _prefAllows(a.user_id, 'expiry'))) continue;
      await _enqueue('varuna_drone_maintenance', a.phone, [
        a.name,
        droneName || serialNumber,
        maintenanceDate,
      ]);
    }
  } catch (e) {
    console.error('[WATrigger] onDroneMaintenanceDue failed:', e.message);
  }
};

// ─── 6. Pilot license expiring ────────────────────────────────────────────
exports.onPilotLicenseExpiring = async ({ pilotUserId, pilotName, pilotPhone, expiryDate }) => {
  try {
    if (pilotPhone && (await _prefAllows(pilotUserId, 'expiry'))) {
      await _enqueue('varuna_license_expiry_pilot', pilotPhone, [pilotName, expiryDate]);
    }
    const admins = await db.query(
      `SELECT id AS user_id, phone, name FROM users
        WHERE role = 'admin' AND phone IS NOT NULL AND deleted_at IS NULL`
    );
    for (const a of admins.rows) {
      if (!(await _prefAllows(a.user_id, 'expiry'))) continue;
      await _enqueue('varuna_license_expiry_admin', a.phone, [a.name, pilotName, expiryDate]);
    }
  } catch (e) {
    console.error('[WATrigger] onPilotLicenseExpiring failed:', e.message);
  }
};
