const db     = require('../../../../core/config/db');
const socket = require('../../../../core/socket/socket.gateway');
const EVENTS = require('../../../../core/socket/socket.events');

exports.addTeamDrone = async (projectId, droneId, userId) => {
  if (!droneId) throw Object.assign(new Error('drone_id is required'), { statusCode: 400 });

  const proj = await db.query('SELECT id FROM projects WHERE id=$1 AND deleted_at IS NULL', [projectId]);
  if (!proj.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  const drone = await db.query('SELECT id, name, model, status FROM drones WHERE id=$1 AND deleted_at IS NULL', [droneId]);
  if (!drone.rows.length) throw Object.assign(new Error('Drone not found'), { statusCode: 404 });

  // Check if already a formal allocation exists for this drone in this project
  const result = await db.query(
    `INSERT INTO project_drones (project_id, drone_id, added_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, drone_id) DO NOTHING
     RETURNING *`,
    [projectId, droneId, userId || null]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Drone is already on this project team'), { statusCode: 409 });
  }

  try { socket.emitToProject(projectId, EVENTS.ALLOCATION_UPDATED, { project_id: projectId }); } catch (_) {}
  try { socket.emitToAll(EVENTS.ALLOCATION_UPDATED, { project_id: projectId }); } catch (_) {}

  return { ...result.rows[0], drone: drone.rows[0] };
};

exports.getTeamDrones = async (projectId) => {
  const result = await db.query(
    `SELECT pd.id, pd.project_id, pd.drone_id, pd.notes, pd.created_at,
            d.name AS drone_name, d.model AS drone_model, d.status AS drone_status,
            d.make, d.serial_number, d.next_maintenance, d.day_rate
     FROM project_drones pd
     JOIN drones d ON pd.drone_id = d.id AND d.deleted_at IS NULL
     WHERE pd.project_id = $1
     ORDER BY d.name ASC`,
    [projectId]
  );
  return result.rows;
};

exports.removeTeamDrone = async (projectId, droneId) => {
  const result = await db.query(
    'DELETE FROM project_drones WHERE project_id=$1 AND drone_id=$2 RETURNING id',
    [projectId, droneId]
  );
  if (!result.rows.length) throw Object.assign(new Error('Team drone not found for this project'), { statusCode: 404 });

  try { socket.emitToProject(projectId, EVENTS.ALLOCATION_UPDATED, { project_id: projectId }); } catch (_) {}
  try { socket.emitToAll(EVENTS.ALLOCATION_UPDATED, { project_id: projectId }); } catch (_) {}
};
