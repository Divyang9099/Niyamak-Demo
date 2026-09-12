const db = require('../../core/config/db');

/**
 * Append-only audit logger — immutable record of every system action.
 * Called internally by services after mutations.
 */
exports.log = async ({ user_id, action, entity_type, entity_id, old_value = null, new_value = null, connection = null }) => {
  const conn = connection || db;
  await conn.query(
    `
    INSERT INTO activity_logs
    (user_id, action, entity_type, entity_id, old_value, new_value)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      user_id || null,
      action,
      entity_type || null,
      entity_id || null,
      old_value ? JSON.stringify(old_value) : null,
      new_value ? JSON.stringify(new_value) : null,
    ]
  );
};

/**
 * Retrieve audit logs — admin only, filterable by entity and action.
 */
// FIX getLogs — add action filter parameter
exports.getLogs = async ({ entity_type, entity_id, action, limit = 50, page = 1 } = {}) => {
  const conditions = ['1=1'];
  const values = [];

  if (entity_type) { values.push(entity_type); conditions.push(`a.entity_type=$${values.length}`); }
  if (entity_id)   { values.push(entity_id);   conditions.push(`a.entity_id=$${values.length}`); }
  if (action)      { values.push(action);       conditions.push(`a.action=$${values.length}`); }

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const safeOffset = (Math.max(Number(page) || 1, 1) - 1) * safeLimit;

  values.push(safeLimit);
  values.push(safeOffset);

  // Helper: safely extracts a text field from a stored JSON column (handles NULL and TEXT→JSONB cast)
  // Pattern: COALESCE(live_lookup, json_from_old_value, json_from_new_value)
  const result = await db.query(
    `SELECT a.*, u.name AS user_name,
      CASE a.entity_type
        WHEN 'project' THEN COALESCE(
          (SELECT name FROM projects WHERE id = a.entity_id::uuid),
          a.old_value::jsonb->>'name',
          a.new_value::jsonb->>'name'
        )
        WHEN 'deliverable' THEN COALESCE(
          (SELECT name FROM deliverables WHERE id = a.entity_id::uuid),
          a.old_value::jsonb->>'name',
          a.new_value::jsonb->>'name'
        )
        WHEN 'project_document' THEN COALESCE(
          (SELECT file_name FROM project_documents WHERE id = a.entity_id::uuid),
          a.old_value::jsonb->>'file_name',
          a.new_value::jsonb->>'file_name'
        )
        WHEN 'library_document' THEN COALESCE(
          (SELECT name FROM library_documents WHERE id = a.entity_id::uuid),
          a.old_value::jsonb->>'name',
          a.new_value::jsonb->>'name'
        )
        WHEN 'library_category' THEN COALESCE(
          (SELECT name FROM library_categories WHERE id = a.entity_id::uuid),
          a.old_value::jsonb->>'name',
          a.new_value::jsonb->>'name'
        )
        WHEN 'pilot' THEN COALESCE(
          (SELECT u2.name FROM pilots p JOIN users u2 ON p.user_id = u2.id WHERE p.id = a.entity_id::uuid),
          a.old_value::jsonb->>'name',
          a.new_value::jsonb->>'name'
        )
        WHEN 'drone' THEN COALESCE(
          (SELECT name FROM drones WHERE id = a.entity_id::uuid),
          a.old_value::jsonb->>'name',
          a.new_value::jsonb->>'name'
        )
        WHEN 'estimation' THEN COALESCE(
          (SELECT name FROM estimations WHERE id = a.entity_id::uuid),
          a.old_value::jsonb->>'name',
          a.new_value::jsonb->>'name'
        )
        WHEN 'allocation' THEN COALESCE(
          -- Live lookup (allocation still exists in DB)
          (SELECT pr.name || ' / ' || COALESCE(u2.name, '—')
           FROM allocations al
           JOIN  projects pr ON al.project_id = pr.id
           LEFT JOIN pilots p  ON al.pilot_id  = p.id
           LEFT JOIN users  u2 ON p.user_id    = u2.id
           WHERE al.id = a.entity_id::uuid),
          -- Fallback: project name from old_value (DELETE_ALLOCATION — allocation already gone)
          (SELECT name FROM projects WHERE id::text = (a.old_value::jsonb->>'project_id')),
          -- Fallback: project name from new_value top-level (ALLOCATE_RESOURCE)
          (SELECT name FROM projects WHERE id::text = (a.new_value::jsonb->>'project_id')),
          -- Fallback: project name from new_value.allocation (FORCE_ALLOCATION nests it one level)
          (SELECT name FROM projects WHERE id::text = (a.new_value::jsonb->'allocation'->>'project_id'))
        )
      END AS entity_name
     FROM activity_logs a
     LEFT JOIN users u ON a.user_id = u.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.created_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  const rows = result.rows;
  await _resolvePayloadIds(rows);
  return rows;
};

// Bulk-resolves UUID fields (pilot_id, drone_id, project_id, uploaded_by, user_id, overridden_by)
// in old_value / new_value across all rows — 4 queries max regardless of row count.
async function _resolvePayloadIds(rows) {
  const pilotIds = new Set(), droneIds = new Set(), projectIds = new Set(), userIds = new Set();

  for (const row of rows) {
    for (const key of ['old_value', 'new_value']) {
      try {
        const obj = row[key] ? (typeof row[key] === 'string' ? JSON.parse(row[key]) : row[key]) : null;
        if (!obj || typeof obj !== 'object') continue;
        if (obj.pilot_id)      pilotIds.add(obj.pilot_id);
        if (obj.drone_id)      droneIds.add(obj.drone_id);
        if (obj.project_id)    projectIds.add(obj.project_id);
        if (obj.uploaded_by)   userIds.add(obj.uploaded_by);
        if (obj.user_id)       userIds.add(obj.user_id);
        if (obj.overridden_by) userIds.add(obj.overridden_by);
      } catch (_) {}
    }
  }

  const [pilots, drones, projects, users] = await Promise.all([
    pilotIds.size   ? db.query(`SELECT p.id, u.name FROM pilots p JOIN users u ON p.user_id=u.id WHERE p.id=ANY($1::uuid[])`, [[...pilotIds]])   : { rows: [] },
    droneIds.size   ? db.query(`SELECT id, name FROM drones   WHERE id=ANY($1::uuid[])`, [[...droneIds]])   : { rows: [] },
    projectIds.size ? db.query(`SELECT id, name FROM projects WHERE id=ANY($1::uuid[])`, [[...projectIds]]) : { rows: [] },
    userIds.size    ? db.query(`SELECT id, name FROM users    WHERE id=ANY($1::uuid[])`, [[...userIds]])    : { rows: [] },
  ]);

  const pilotMap   = Object.fromEntries(pilots.rows.map(r   => [r.id, r.name]));
  const droneMap   = Object.fromEntries(drones.rows.map(r   => [r.id, r.name]));
  const projectMap = Object.fromEntries(projects.rows.map(r => [r.id, r.name]));
  const userMap    = Object.fromEntries(users.rows.map(r    => [r.id, r.name]));

  for (const row of rows) {
    for (const key of ['old_value', 'new_value']) {
      try {
        if (!row[key]) continue;
        const obj = typeof row[key] === 'string' ? JSON.parse(row[key]) : { ...row[key] };
        if (!obj || typeof obj !== 'object') continue;

        if (obj.pilot_id      && pilotMap[obj.pilot_id])        { obj.pilot       = pilotMap[obj.pilot_id];         delete obj.pilot_id; }
        if (obj.drone_id      && droneMap[obj.drone_id])        { obj.drone       = droneMap[obj.drone_id];         delete obj.drone_id; }
        if (obj.project_id    && projectMap[obj.project_id])    { obj.project     = projectMap[obj.project_id];     delete obj.project_id; }
        if (obj.uploaded_by   && userMap[obj.uploaded_by])      { obj.uploaded_by = userMap[obj.uploaded_by]; }
        if (obj.user_id       && userMap[obj.user_id])          { obj.user        = userMap[obj.user_id];           delete obj.user_id; }
        if (obj.overridden_by && userMap[obj.overridden_by])    { obj.overridden_by = userMap[obj.overridden_by]; }

        row[key] = obj; // replace with enriched parsed object
      } catch (_) {}
    }
  }
}
