const db    = require('../../core/config/db');
const audit = require('../audit/audit.service');

// Client read routes are open to any authenticated role (dropdowns need it
// everywhere a project/pipeline gets created), but the row also carries the
// client-side contact's personal details, GSTIN (tax id), and internal notes —
// none of which a field pilot needs. Keep just enough for identification.
exports.redactClientForViewer = (row, viewer) => {
  if (!row || !viewer) return row;
  if (viewer.role === 'admin' || viewer.role === 'project_manager') return row;
  delete row.contact_person;
  delete row.contact_email;
  delete row.contact_number;
  delete row.gstin;
  delete row.notes;
  delete row.address;
  delete row.created_by;
  return row;
};

// ── CREATE ────────────────────────────────────────────────────────────────────
exports.createClient = async (data, userId) => {
  const name = (data.name || '').trim();
  if (!name) throw Object.assign(new Error('Client name is required'), { statusCode: 400 });

  try {
    const result = await db.query(
      `INSERT INTO clients
         (name, company_name, contact_person, contact_email, contact_number,
          gstin, address, city, state, website, notes, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        name,
        data.company_name   || null,
        data.contact_person || null,
        data.contact_email  || null,
        data.contact_number || null,
        data.gstin          || null,
        data.address        || null,
        data.city           || null,
        data.state          || null,
        data.website        || null,
        data.notes          || null,
        data.status === 'inactive' ? 'inactive' : 'active',
        userId              || null,
      ]
    );
    const client = result.rows[0];
    audit.log({ user_id: userId, action: 'CREATE_CLIENT', entity_type: 'client', entity_id: client.id, new_value: { name } })
      .catch(() => {});
    return client;
  } catch (err) {
    // Unique (case-insensitive) name violation — surface a clean 409 so the inline
    // "add client" UI can point the user at the existing record instead of 500ing.
    if (err.code === '23505') {
      throw Object.assign(new Error('A client with this name already exists.'), { statusCode: 409 });
    }
    throw err;
  }
};

// ── LIST (paginated + searchable) ─────────────────────────────────────────────
exports.getClients = async (query = {}) => {
  const safeLimit  = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const safePage   = Math.max(Number(query.page) || 1, 1);
  const safeOffset = (safePage - 1) * safeLimit;

  const conditions = ['c.deleted_at IS NULL'];
  const vals = [];

  if (query.search) {
    vals.push(`%${query.search.trim()}%`);
    conditions.push(
      `(c.name ILIKE $${vals.length} OR c.company_name ILIKE $${vals.length}
        OR c.contact_person ILIKE $${vals.length} OR c.city ILIKE $${vals.length}
        OR c.state ILIKE $${vals.length})`
    );
  }
  if (query.status === 'active' || query.status === 'inactive') {
    vals.push(query.status);
    conditions.push(`c.status = $${vals.length}`);
  }

  vals.push(safeLimit, safeOffset);
  const result = await db.query(
    `SELECT c.*,
            (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id AND p.deleted_at IS NULL) AS project_count,
            (SELECT COUNT(*) FROM pipeline pl WHERE pl.client_id = c.id AND pl.deleted_at IS NULL) AS pipeline_count,
            COUNT(*) OVER() AS total_count
     FROM clients c
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.name ASC
     LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
    vals
  );

  const total = Number(result.rows[0]?.total_count || 0);
  const rows  = result.rows.map(({ total_count, ...r }) => ({
    ...r,
    project_count:  Number(r.project_count),
    pipeline_count: Number(r.pipeline_count),
  }));
  return { rows, total, page: safePage, limit: safeLimit };
};

// ── GET ONE (with linked projects + pipelines) ────────────────────────────────
exports.getClientById = async (id) => {
  const result = await db.query('SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!result.rows.length) throw Object.assign(new Error('Client not found'), { statusCode: 404 });
  const client = result.rows[0];

  const [projects, pipelines] = await Promise.all([
    db.query(
      `SELECT id, name, status, project_type, start_date, end_date, project_value
       FROM projects WHERE client_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [id]
    ),
    db.query(
      `SELECT id, name, stage, project_type, estimated_value, estimated_start, estimated_end
       FROM pipeline WHERE client_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [id]
    ),
  ]);

  return { ...client, projects: projects.rows, pipelines: pipelines.rows };
};

// ── UPDATE ────────────────────────────────────────────────────────────────────
exports.updateClient = async (id, data, userId) => {
  const existing = await db.query('SELECT * FROM clients WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing.rows.length) throw Object.assign(new Error('Client not found'), { statusCode: 404 });

  const newName = data.name !== undefined ? String(data.name).trim() : undefined;
  if (newName !== undefined && !newName) {
    throw Object.assign(new Error('Client name cannot be empty'), { statusCode: 400 });
  }

  try {
    const result = await db.query(
      `UPDATE clients SET
         name           = COALESCE($1,  name),
         company_name   = COALESCE($2,  company_name),
         contact_person = COALESCE($3,  contact_person),
         contact_email  = COALESCE($4,  contact_email),
         contact_number = COALESCE($5,  contact_number),
         gstin          = COALESCE($6,  gstin),
         address        = COALESCE($7,  address),
         city           = COALESCE($8,  city),
         state          = COALESCE($9,  state),
         website        = COALESCE($10, website),
         notes          = COALESCE($11, notes),
         status         = COALESCE($12, status),
         updated_at     = NOW()
       WHERE id = $13 AND deleted_at IS NULL
       RETURNING *`,
      [
        newName !== undefined ? newName : null,
        data.company_name   !== undefined ? data.company_name   : null,
        data.contact_person !== undefined ? data.contact_person : null,
        data.contact_email  !== undefined ? data.contact_email  : null,
        data.contact_number !== undefined ? data.contact_number : null,
        data.gstin          !== undefined ? data.gstin          : null,
        data.address        !== undefined ? data.address        : null,
        data.city           !== undefined ? data.city           : null,
        data.state          !== undefined ? data.state          : null,
        data.website        !== undefined ? data.website        : null,
        data.notes          !== undefined ? data.notes          : null,
        (data.status === 'active' || data.status === 'inactive') ? data.status : null,
        id,
      ]
    );
    const client = result.rows[0];

    // Keep the denormalised client_name on linked projects/pipeline in sync on rename.
    if (newName && newName !== existing.rows[0].name) {
      await db.query('UPDATE projects SET client_name = $1 WHERE client_id = $2', [newName, id]).catch(() => {});
      await db.query('UPDATE pipeline SET client_name = $1 WHERE client_id = $2', [newName, id]).catch(() => {});
    }

    audit.log({ user_id: userId, action: 'UPDATE_CLIENT', entity_type: 'client', entity_id: id, new_value: { name: client.name } })
      .catch(() => {});
    return client;
  } catch (err) {
    if (err.code === '23505') {
      throw Object.assign(new Error('A client with this name already exists.'), { statusCode: 409 });
    }
    throw err;
  }
};

// ── DELETE (soft) ─────────────────────────────────────────────────────────────
// Projects/pipeline keep their client_name (history); their client_id remains but
// simply stops resolving to a live client. Nothing breaks.
exports.deleteClient = async (id, userId) => {
  const result = await db.query(
    `UPDATE clients SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL RETURNING id, name`,
    [id]
  );
  if (!result.rows.length) throw Object.assign(new Error('Client not found'), { statusCode: 404 });
  audit.log({ user_id: userId, action: 'DELETE_CLIENT', entity_type: 'client', entity_id: id, old_value: { name: result.rows[0].name } })
    .catch(() => {});
  return { deleted: true };
};

// ── Helper: resolve the canonical client name for a given client_id ───────────
// Returns { client_id, client_name } to store on a project/pipeline. If the id is
// missing/invalid it falls back to the free-text name the caller supplied.
exports.resolveClientForLink = async (clientId, fallbackName = null) => {
  if (!clientId) return { client_id: null, client_name: fallbackName };
  const r = await db.query('SELECT id, name FROM clients WHERE id = $1 AND deleted_at IS NULL', [clientId]);
  if (!r.rows.length) return { client_id: null, client_name: fallbackName };
  return { client_id: r.rows[0].id, client_name: r.rows[0].name };
};
