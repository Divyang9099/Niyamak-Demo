const db = require('../../core/config/db');

exports.list = async ({ activeOnly = false } = {}) => {
  const where = activeOnly ? 'WHERE is_active = TRUE' : '';
  const { rows } = await db.query(
    `SELECT id, key, label, icon, default_scope_unit, default_deliverables,
            default_estimation_params, sort_order, is_active, created_at, updated_at
       FROM project_type_configs
       ${where}
       ORDER BY sort_order, label`
  );
  return rows;
};

exports.create = async (data) => {
  const { rows } = await db.query(
    `INSERT INTO project_type_configs
       (key, label, icon, default_scope_unit, default_deliverables, default_estimation_params, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5::TEXT[], $6::JSONB, COALESCE($7, 0), COALESCE($8, TRUE))
     RETURNING *`,
    [
      data.key,
      data.label,
      data.icon || null,
      data.default_scope_unit || null,
      data.default_deliverables || [],
      JSON.stringify(data.default_estimation_params || {}),
      data.sort_order,
      data.is_active,
    ]
  );
  return rows[0];
};

exports.update = async (id, data) => {
  const { rows } = await db.query(
    `UPDATE project_type_configs SET
       label                     = COALESCE($1, label),
       icon                      = COALESCE($2, icon),
       default_scope_unit        = COALESCE($3, default_scope_unit),
       default_deliverables      = COALESCE($4::TEXT[], default_deliverables),
       default_estimation_params = COALESCE($5::JSONB, default_estimation_params),
       sort_order                = COALESCE($6, sort_order),
       is_active                 = COALESCE($7, is_active)
     WHERE id = $8
     RETURNING *`,
    [
      data.label                   !== undefined ? data.label                   : null,
      data.icon                    !== undefined ? data.icon                    : null,
      data.default_scope_unit      !== undefined ? data.default_scope_unit      : null,
      data.default_deliverables    !== undefined ? data.default_deliverables    : null,
      data.default_estimation_params !== undefined ? JSON.stringify(data.default_estimation_params) : null,
      data.sort_order              !== undefined ? data.sort_order              : null,
      data.is_active               !== undefined ? data.is_active               : null,
      id,
    ]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Project type not found'), { statusCode: 404 });
  }
  return rows[0];
};

exports.remove = async (id) => {
  const { rows } = await db.query(
    `DELETE FROM project_type_configs WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Project type not found'), { statusCode: 404 });
  }
  return rows[0];
};
