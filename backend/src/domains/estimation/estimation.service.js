const db = require('../../core/config/db');

// FIX createEstimation — add userId parameter
exports.createEstimation = async (data, cost, userId) => {
  if (data.project_id) {
    const proj = await db.query('SELECT id FROM projects WHERE id=$1', [data.project_id]);
    if (!proj.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });
  }
  const details = { inputs: data, breakdown: cost };
  const result = await db.query(
    `INSERT INTO estimations
     (project_id, pipeline_id, client_name, project_type, total_cost, margin, tax, details, created_by, name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *;`,
    [data.project_id||null, data.pipeline_id||null, data.client_name||null, data.project_type||null,
     cost.total, cost.margin, cost.tax, JSON.stringify(details), userId || null, data.name || null]
  );
  return result.rows[0];
};

exports.getEstimations = async (user, filters = {}) => {
  const limit  = Math.min(Number(filters.limit)  || 25, 100);
  const page   = Math.max(Number(filters.page)   || 1, 1);
  const offset = (page - 1) * limit;

  const conditions = [];
  const values = [];

  if (filters.project_id)  { values.push(filters.project_id);  conditions.push(`e.project_id=$${values.length}`); }
  if (filters.pipeline_id) { values.push(filters.pipeline_id); conditions.push(`e.pipeline_id=$${values.length}`); }

  if (user.role !== 'admin' && !filters.project_id) {
    values.push(user.id);
    conditions.push(
      `(e.project_id IN (SELECT project_id FROM project_members WHERE user_id=$${values.length}) OR e.project_id IS NULL)`
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit, offset);

  const result = await db.query(
    `SELECT e.*, p.name AS project_name, COUNT(*) OVER() AS total_count
       FROM estimations e
       LEFT JOIN projects p ON p.id = e.project_id
     ${where}
     ORDER BY e.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  const total = result.rows[0] ? Number(result.rows[0].total_count) : 0;
  const rows  = result.rows.map(({ total_count, ...r }) => r);
  return { rows, total, page, limit };
};

// GET ONE
exports.getEstimationById = async (id) => {
  const result = await db.query('SELECT * FROM estimations WHERE id = $1', [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error('Estimation not found'), { statusCode: 404 });
  }
  return result.rows[0];
};

// UPDATE
exports.updateEstimation = async (id, data, cost) => {
  const details = { inputs: data, breakdown: cost };

  // Guard: if a pipeline_id is supplied but the pipeline was deleted, clear it rather
  // than letting PostgreSQL throw an FK constraint violation.
  let pipelineId = data.pipeline_id || null;
  if (pipelineId) {
    const pCheck = await db.query('SELECT id FROM pipeline WHERE id = $1', [pipelineId]);
    if (!pCheck.rows.length) pipelineId = null;
  }

  const result = await db.query(
    `UPDATE estimations
     SET total_cost   = $1,
         margin       = $2,
         tax          = $3,
         details      = $4,
         client_name  = COALESCE($5, client_name),
         project_type = COALESCE($6, project_type),
         pipeline_id  = $7,
         project_id   = COALESCE($8, project_id),
         name         = COALESCE($9, name)
     WHERE id = $10
     RETURNING *;`,
    [cost.total, cost.margin, cost.tax, JSON.stringify(details),
     data.client_name || null, data.project_type || null,
     pipelineId, data.project_id || null, data.name || null, id]
  );

  if (!result.rows.length) {
    throw Object.assign(new Error('Estimation not found'), { statusCode: 404 });
  }

  return result.rows[0];
};

// RENAME (lightweight — only updates the name column)
exports.renameEstimation = async (id, name) => {
  if (!name || !name.trim()) {
    throw Object.assign(new Error('name is required'), { statusCode: 400 });
  }
  const result = await db.query(
    `UPDATE estimations SET name = $1 WHERE id = $2 RETURNING *;`,
    [name.trim(), id]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Estimation not found'), { statusCode: 404 });
  }
  return result.rows[0];
};

// DELETE
exports.deleteEstimation = async (id) => {
  const result = await db.query('DELETE FROM estimations WHERE id = $1 RETURNING id', [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error('Estimation not found'), { statusCode: 404 });
  }
};

// CLONE
exports.cloneEstimation = async (id, userId) => {
  const original = await exports.getEstimationById(id); // ✅ FIX: was `this.getEstimationById` — crashes in CommonJS

  // Append "(Copy)" to the cloned name so the user can distinguish it
  const clonedName = original.name ? `${original.name} (Copy)` : null;

  const clone = await db.query(
    `
    INSERT INTO estimations
    (project_id, client_name, project_type, total_cost, margin, tax, details, created_by, name)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
    `,
    [
      original.project_id,
      original.client_name,
      original.project_type,
      original.total_cost,
      original.margin,
      original.tax,
      original.details,
      userId,
      clonedName,
    ]
  );

  return clone.rows[0];
};
