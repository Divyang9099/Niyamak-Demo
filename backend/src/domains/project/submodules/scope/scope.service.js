const db = require('../../../../core/config/db');

exports.createScope = async (projectId, data) => {
  const project = await db.query('SELECT id FROM projects WHERE id=$1', [projectId]);
  if (!project.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  const existing = await db.query('SELECT id FROM project_scope WHERE project_id=$1', [projectId]);
  if (existing.rows.length > 0)
    throw Object.assign(new Error('Scope already exists for this project'), { statusCode: 409 });

  const result = await db.query(
    `INSERT INTO project_scope
     (project_id,scope_type,area_hectares,length_km,asset_count,deliverables_expected,special_instructions)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *;`,
    [projectId, data.scope_type||null, data.area_hectares||null, data.length_km||null,
     data.asset_count||null,
     data.deliverables_expected ? JSON.stringify(data.deliverables_expected) : null,
     data.special_instructions||null]
  );
  return result.rows[0];
};

// FIX: Return null instead of throwing 404 (spec says "Returns null not 404 if no scope yet")
exports.getScope = async (projectId) => {
  const result = await db.query('SELECT * FROM project_scope WHERE project_id=$1', [projectId]);
  return result.rows[0] || null;  // ← was throwing 404, spec says return null
};

// Upsert — safe for both create and update paths; ProjectForm always calls PUT
exports.updateScope = async (projectId, data) => {
  const project = await db.query('SELECT id FROM projects WHERE id=$1', [projectId]);
  if (!project.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  const deJson = data.deliverables_expected ? JSON.stringify(data.deliverables_expected) : null;

  const result = await db.query(
    `INSERT INTO project_scope
       (project_id, scope_type, area_hectares, length_km, asset_count, deliverables_expected, special_instructions)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (project_id) DO UPDATE SET
       scope_type            = COALESCE(EXCLUDED.scope_type,            project_scope.scope_type),
       area_hectares         = COALESCE(EXCLUDED.area_hectares,         project_scope.area_hectares),
       length_km             = COALESCE(EXCLUDED.length_km,             project_scope.length_km),
       asset_count           = COALESCE(EXCLUDED.asset_count,           project_scope.asset_count),
       deliverables_expected = COALESCE(EXCLUDED.deliverables_expected, project_scope.deliverables_expected),
       special_instructions  = COALESCE(EXCLUDED.special_instructions,  project_scope.special_instructions)
     RETURNING *;`,
    [projectId, data.scope_type||null, data.area_hectares||null, data.length_km||null,
     data.asset_count||null, deJson, data.special_instructions||null]
  );
  return result.rows[0];
};
