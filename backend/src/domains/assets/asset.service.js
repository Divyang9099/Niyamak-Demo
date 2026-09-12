const db     = require('../../core/config/db');
const socket = require('../../core/socket/socket.gateway');
const EVENTS = require('../../core/socket/socket.events');

// ── CREATE ────────────────────────────────────────────────────────────────────
exports.createAsset = async (data, userId) => {
  const result = await db.query(
    `INSERT INTO assets
       (name, asset_type, category, serial_number, model, manufacturer,
        status, purchase_date, purchase_price, current_value,
        warranty_expiry, maintenance_due, location,
        assigned_project_id, assigned_drone_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      data.name,
      data.asset_type          || 'other',
      data.category            || null,
      data.serial_number       || null,
      data.model               || null,
      data.manufacturer        || null,
      data.status              || 'active',
      data.purchase_date       || null,
      data.purchase_price      != null ? Number(data.purchase_price) : null,
      data.current_value       != null ? Number(data.current_value)  : null,
      data.warranty_expiry     || null,
      data.maintenance_due     || null,
      data.location            || null,
      data.assigned_project_id || null,
      data.assigned_drone_id   || null,
      data.notes               || null,
      userId                   || null,
    ]
  );
  const asset = result.rows[0];
  try { socket.emitToRole('admin',          EVENTS.ASSET_CREATED, asset); } catch (_) {}
  try { socket.emitToRole('project_manager', EVENTS.ASSET_CREATED, asset); } catch (_) {}
  return asset;
};

// ── LIST (paginated + filtered) ───────────────────────────────────────────────
exports.getAssets = async (query = {}) => {
  const safeLimit  = Math.min(Math.max(Number(query.limit)  || 50, 1), 200);
  const safePage   = Math.max(Number(query.page) || 1, 1);
  const safeOffset = (safePage - 1) * safeLimit;

  const conditions = ['a.deleted_at IS NULL'];
  const vals = [];

  if (query.search) {
    vals.push(`%${query.search}%`);
    conditions.push(`(a.name ILIKE $${vals.length} OR a.serial_number ILIKE $${vals.length} OR a.model ILIKE $${vals.length} OR a.manufacturer ILIKE $${vals.length})`);
  }
  if (query.status)     { vals.push(query.status);     conditions.push(`a.status = $${vals.length}`); }
  if (query.asset_type) { vals.push(query.asset_type); conditions.push(`a.asset_type = $${vals.length}`); }

  const where = conditions.join(' AND ');
  const order = query.sort_by === 'name' ? 'a.name ASC'
              : query.sort_by === 'warranty_expiry' ? 'a.warranty_expiry ASC NULLS LAST'
              : query.sort_by === 'purchase_date'   ? 'a.purchase_date DESC NULLS LAST'
              : 'a.created_at DESC';

  vals.push(safeLimit, safeOffset);
  const result = await db.query(
    `SELECT a.*,
            p.name  AS project_name,
            d.name  AS drone_name, d.serial_number AS drone_serial,
            u.name  AS created_by_name,
            COUNT(*) OVER() AS total_count
     FROM assets a
     LEFT JOIN projects p ON a.assigned_project_id = p.id AND p.deleted_at IS NULL
     LEFT JOIN drones   d ON a.assigned_drone_id   = d.id AND d.deleted_at IS NULL
     LEFT JOIN users    u ON a.created_by          = u.id AND u.deleted_at IS NULL
     WHERE ${where}
     ORDER BY ${order}
     LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
    vals
  );

  const total = Number(result.rows[0]?.total_count || 0);
  const rows  = result.rows.map(({ total_count, ...r }) => r);
  return { rows, total, page: safePage, limit: safeLimit };
};

// ── GET BY ID ─────────────────────────────────────────────────────────────────
exports.getAssetById = async (id) => {
  const result = await db.query(
    `SELECT a.*,
            p.name  AS project_name,
            d.name  AS drone_name, d.serial_number AS drone_serial,
            u.name  AS created_by_name
     FROM assets a
     LEFT JOIN projects p ON a.assigned_project_id = p.id
     LEFT JOIN drones   d ON a.assigned_drone_id   = d.id
     LEFT JOIN users    u ON a.created_by          = u.id
     WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [id]
  );
  if (!result.rows.length) throw Object.assign(new Error('Asset not found'), { statusCode: 404 });
  return result.rows[0];
};

// ── UPDATE ────────────────────────────────────────────────────────────────────
exports.updateAsset = async (id, data) => {
  const existing = await exports.getAssetById(id);

  const result = await db.query(
    `UPDATE assets SET
       name                = COALESCE($1,  name),
       asset_type          = COALESCE($2,  asset_type),
       category            = COALESCE($3,  category),
       serial_number       = COALESCE($4,  serial_number),
       model               = COALESCE($5,  model),
       manufacturer        = COALESCE($6,  manufacturer),
       status              = COALESCE($7,  status),
       purchase_date       = COALESCE($8,  purchase_date),
       purchase_price      = COALESCE($9,  purchase_price),
       current_value       = COALESCE($10, current_value),
       warranty_expiry     = COALESCE($11, warranty_expiry),
       maintenance_due     = COALESCE($12, maintenance_due),
       location            = COALESCE($13, location),
       assigned_project_id = $14,
       assigned_drone_id   = $15,
       notes               = COALESCE($16, notes),
       updated_at          = NOW()
     WHERE id = $17 AND deleted_at IS NULL
     RETURNING *`,
    [
      data.name            || null,
      data.asset_type      || null,
      data.category        || null,
      data.serial_number   || null,
      data.model           || null,
      data.manufacturer    || null,
      data.status          || null,
      data.purchase_date   || null,
      data.purchase_price  != null ? Number(data.purchase_price) : null,
      data.current_value   != null ? Number(data.current_value)  : null,
      data.warranty_expiry || null,
      data.maintenance_due || null,
      data.location        || null,
      'assigned_project_id' in data ? (data.assigned_project_id || null) : existing.assigned_project_id,
      'assigned_drone_id'   in data ? (data.assigned_drone_id   || null) : existing.assigned_drone_id,
      data.notes           || null,
      id,
    ]
  );
  if (!result.rows.length) throw Object.assign(new Error('Asset not found'), { statusCode: 404 });
  const updated = result.rows[0];
  try { socket.emitToRole('admin',          EVENTS.ASSET_UPDATED, updated); } catch (_) {}
  try { socket.emitToRole('project_manager', EVENTS.ASSET_UPDATED, updated); } catch (_) {}
  return updated;
};

// ── DELETE (soft) ─────────────────────────────────────────────────────────────
exports.deleteAsset = async (id) => {
  const result = await db.query(
    `UPDATE assets SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL RETURNING id, name`,
    [id]
  );
  if (!result.rows.length) throw Object.assign(new Error('Asset not found'), { statusCode: 404 });
  try { socket.emitToRole('admin',          EVENTS.ASSET_DELETED, { id }); } catch (_) {}
  try { socket.emitToRole('project_manager', EVENTS.ASSET_DELETED, { id }); } catch (_) {}
};

// ── SUMMARY COUNTS ────────────────────────────────────────────────────────────
exports.getAssetSummary = async () => {
  const result = await db.query(`
    SELECT
      COUNT(*)                                            AS total,
      COUNT(*) FILTER (WHERE status = 'active')          AS active,
      COUNT(*) FILTER (WHERE status = 'in_use')          AS in_use,
      COUNT(*) FILTER (WHERE status = 'maintenance')     AS maintenance,
      COUNT(*) FILTER (WHERE status = 'retired')         AS retired,
      COUNT(*) FILTER (
        WHERE warranty_expiry IS NOT NULL
          AND warranty_expiry >= CURRENT_DATE
          AND warranty_expiry <= CURRENT_DATE + INTERVAL '30 days'
      )                                                   AS warranty_expiring_soon,
      COUNT(*) FILTER (
        WHERE maintenance_due IS NOT NULL
          AND maintenance_due <= CURRENT_DATE + INTERVAL '7 days'
      )                                                   AS maintenance_due_soon
    FROM assets
    WHERE deleted_at IS NULL
  `);
  return result.rows[0];
};
