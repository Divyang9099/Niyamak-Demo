const db = require('../../core/config/db');

/**
 * BD's own append-only audit log (bd_activity_log) — deliberately separate
 * from the global activity_logs table so the module stays independent
 * (see BD_MODULE_PLAN.md §0). Mirrors domains/audit/audit.service.js's shape.
 */
exports.log = async ({ user_id, action, entity_type, entity_id, client_id = null, old_value = null, new_value = null, connection = null }) => {
  const conn = connection || db;
  await conn.query(
    `INSERT INTO bd_activity_log
     (user_id, action, entity_type, entity_id, client_id, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      user_id || null,
      action,
      entity_type,
      entity_id || null,
      client_id || null,
      old_value ? JSON.stringify(old_value) : null,
      new_value ? JSON.stringify(new_value) : null,
    ]
  );
};

exports.getLogs = async ({ client_id, entity_type, limit = 50, page = 1 } = {}) => {
  const conditions = ['1=1'];
  const values = [];

  if (client_id)   { values.push(client_id);   conditions.push(`a.client_id = $${values.length}`); }
  if (entity_type) { values.push(entity_type); conditions.push(`a.entity_type = $${values.length}`); }

  const safeLimit  = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const safeOffset = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;

  values.push(safeLimit);
  values.push(safeOffset);

  const result = await db.query(
    `SELECT a.*, u.name AS user_name
     FROM bd_activity_log a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  return result.rows;
};
