const db     = require('../../core/config/db');
const socket = require('../../core/socket/socket.gateway');
const EVENTS = require('../../core/socket/socket.events');
const notif         = require('../notification/notification.service');
const emailTriggers = require('../notification/emailTriggers.service');
const { formatDateIST } = require('../../core/utils/dateUtils');

// day_rate is equipment rental cost — legitimate for admin/PM allocation costing,
// not needed by a field pilot browsing the drone registry.
exports.redactDroneForViewer = (row, viewer) => {
  if (!row || !viewer) return row;
  if (viewer.role !== 'admin' && viewer.role !== 'project_manager') delete row.day_rate;
  return row;
};

/**
 * If a drone's maintenance falls within the next 7 days (and it's active), alert
 * all admins immediately — in-app (deduped 24h) + email. Runs on create/update so
 * admins are warned the moment a soon-due drone is added, without waiting for the
 * daily scheduler. Best-effort: never throws.
 */
const _checkMaintenanceDue = async (drone) => {
  try {
    if (!drone?.next_maintenance || drone.status !== 'active') return;
    const due = new Date(drone.next_maintenance);
    const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (due > sevenDays) return; // not due within 7 days

    const admins = await db.query("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL");
    const maintDate = formatDateIST(drone.next_maintenance);
    for (const a of admins.rows) {
      await notif.createNotification({
        user_id:  a.id,
        category: 'expiry',
        title:    'Drone Maintenance Due',
        message:  `Drone ${drone.serial_number} (${drone.name || 'Unit'}) is due for maintenance on ${maintDate}.`,
        dedupeHours: 24,
      });
    }
    emailTriggers.onDroneMaintenanceDue({
      droneId:         drone.id,
      droneName:       drone.name,
      serialNumber:    drone.serial_number,
      maintenanceDate: maintDate,
    });
    try { socket.emitToRole('admin', EVENTS.SCHEDULER_ALERT, { type: 'drone_maintenance', count: 1 }); } catch (_) {}
  } catch (e) {
    console.error('[Drone] Maintenance-due check failed (non-fatal):', e.message);
  }
};

exports.createDrone = async (data) => {
  const result = await db.query(
    `INSERT INTO drones (name, model, make, serial_number, status, sensor_type, sensor_payloads, uin, day_rate, insurance_expiry, next_maintenance)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      data.name,
      data.model,
      data.make              || null,
      data.serial_number,
      data.status            || 'active',
      data.sensor_type       || null,
      data.sensor_payloads   || null,
      data.uin               || null,
      data.day_rate          || null,
      data.insurance_expiry  || null,
      data.next_maintenance  || null,
    ]
  );
  const drone = result.rows[0];
  try { socket.emitToRole('admin', EVENTS.DRONE_CREATED, drone); } catch (_) {}

  // Immediate maintenance-due alert (doesn't wait for the daily scheduler)
  _checkMaintenanceDue(drone);

  return drone;
};

exports.getDrones = async ({ limit = 25, page = 1, search = '' } = {}) => {
  const safeLimit  = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage   = Math.max(Number(page) || 1, 1);
  const safeOffset = (safePage - 1) * safeLimit;

  const params = [safeLimit, safeOffset];
  const searchClause = search
    ? (params.push(`%${String(search).trim()}%`), `AND (name ILIKE $${params.length} OR serial_number ILIKE $${params.length} OR model ILIKE $${params.length} OR make ILIKE $${params.length})`)
    : '';

  const result = await db.query(
    `SELECT id, name, model, make, serial_number, status, sensor_type, sensor_payloads, uin, day_rate, insurance_expiry, next_maintenance, created_at, updated_at,
            COUNT(*) OVER() AS total_count
     FROM drones
     WHERE deleted_at IS NULL ${searchClause}
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  const total = result.rows[0] ? Number(result.rows[0].total_count) : 0;
  const rows  = result.rows.map(({ total_count, ...r }) => r);
  return { rows, total, page: safePage, limit: safeLimit };
};

exports.getDroneById = async (id) => {
  const result = await db.query(
    `SELECT id, name, model, make, serial_number, status, sensor_type, sensor_payloads, uin, day_rate, insurance_expiry, next_maintenance, created_at, updated_at
     FROM drones 
     WHERE id = $1 AND deleted_at IS NULL`, 
    [id]
  );
  if (!result.rows.length) throw Object.assign(new Error('Drone not found'), { statusCode: 404 });
  return result.rows[0];
};

exports.updateDrone = async (id, data) => {
  const result = await db.query(
    `UPDATE drones
     SET name              = COALESCE($1,  name),
         model             = COALESCE($2,  model),
         make              = COALESCE($3,  make),
         serial_number     = COALESCE($4,  serial_number),
         status            = COALESCE($5,  status),
         sensor_type       = COALESCE($6,  sensor_type),
         sensor_payloads   = COALESCE($7,  sensor_payloads),
         uin               = COALESCE($8,  uin),
         day_rate          = COALESCE($9,  day_rate),
         insurance_expiry  = COALESCE($10, insurance_expiry),
         next_maintenance  = COALESCE($11, next_maintenance)
     WHERE id = $12 AND deleted_at IS NULL
     RETURNING *`,
    [
      data.name             !== undefined ? data.name             : null,
      data.model            !== undefined ? data.model            : null,
      data.make             !== undefined ? data.make             : null,
      data.serial_number    !== undefined ? data.serial_number    : null,
      data.status           !== undefined ? data.status           : null,
      data.sensor_type      !== undefined ? data.sensor_type      : null,
      data.sensor_payloads  !== undefined ? data.sensor_payloads  : null,
      data.uin              !== undefined ? data.uin              : null,
      data.day_rate         !== undefined ? data.day_rate         : null,
      data.insurance_expiry !== undefined ? data.insurance_expiry : null,
      data.next_maintenance !== undefined ? data.next_maintenance : null,
      id,
    ]
  );
  if (!result.rows.length) throw Object.assign(new Error('Drone not found'), { statusCode: 404 });
  try { socket.emitToRole('admin', EVENTS.DRONE_UPDATED, result.rows[0]); } catch (_) {}

  // Re-check maintenance window after an edit (e.g. maintenance date moved nearer)
  _checkMaintenanceDue(result.rows[0]);

  return result.rows[0];
};

// FIX: deleteDrone — check allocations and maintenance logs
exports.deleteDrone = async (id) => {
  const activeAllocs = await db.query(
    'SELECT id FROM allocations WHERE drone_id=$1 AND end_date >= CURRENT_DATE', [id]
  );
  if (activeAllocs.rows.length > 0)
    throw Object.assign(
      new Error('Cannot delete drone: Active project allocations exist. Deallocate first.'),
      { statusCode: 409 }
    );

  const maintLogs = await db.query(
    'SELECT id FROM drone_maintenance_logs WHERE drone_id=$1 LIMIT 1', [id]
  );
  if (maintLogs.rows.length > 0)
    throw Object.assign(
      new Error('Cannot delete drone: Maintenance history exists. Retire the drone instead (status=retired).'),
      { statusCode: 409 }
    );

  const result = await db.query('UPDATE drones SET deleted_at = CURRENT_TIMESTAMP WHERE id=$1 RETURNING id', [id]);
  if (!result.rows.length) throw Object.assign(new Error('Drone not found'), { statusCode: 404 });
  try { socket.emitToRole('admin', EVENTS.DRONE_DELETED, { id }); } catch (_) {}
};

