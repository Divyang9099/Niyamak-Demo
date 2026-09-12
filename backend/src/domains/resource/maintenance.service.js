const db = require('../../core/config/db');

// LOG A MAINTENANCE EVENT
exports.logMaintenance = async (droneId, data) => {
  const { maintenance_type, description, performed_by, performed_at, next_due, cost } = data;

  const drone = await db.query('SELECT id FROM drones WHERE id = $1', [droneId]);
  if (!drone.rows.length) throw Object.assign(new Error('Drone not found'), { statusCode: 404 });

  // Insert log
  const result = await db.query(
    `INSERT INTO drone_maintenance_logs
     (drone_id, maintenance_type, description, performed_by, performed_at, next_due, cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [droneId, maintenance_type || null, description || null, performed_by || null,
     performed_at || null, next_due || null, cost || null]
  );

  // Update the drone's maintenance dates
  if (performed_at || next_due) {
    await db.query(
      `UPDATE drones
       SET last_maintenance = COALESCE($1, last_maintenance),
           next_maintenance = COALESCE($2, next_maintenance)
       WHERE id = $3`,
      [performed_at || null, next_due || null, droneId]
    );
  }

  return result.rows[0];
};

// GET MAINTENANCE HISTORY FOR A DRONE
exports.getMaintenanceLogs = async (droneId) => {
  const drone = await db.query('SELECT id FROM drones WHERE id = $1', [droneId]);
  if (!drone.rows.length) throw Object.assign(new Error('Drone not found'), { statusCode: 404 });

  const result = await db.query(
    'SELECT * FROM drone_maintenance_logs WHERE drone_id = $1 ORDER BY performed_at DESC, created_at DESC',
    [droneId]
  );
  return result.rows;
};
