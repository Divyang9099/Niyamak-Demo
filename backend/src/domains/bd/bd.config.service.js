const db    = require('../../core/config/db');
const audit = require('./bd.audit.service');

const notFound = (what) => Object.assign(new Error(`${what} not found`), { statusCode: 404 });

// ── Sectors (dashboard sections) ────────────────────────────────────────────
exports.listSectors = async ({ activeOnly = false } = {}) => {
  const where = activeOnly ? 'WHERE is_active = TRUE' : '';
  const { rows } = await db.query(
    `SELECT * FROM bd_sectors ${where} ORDER BY sort_order, label`
  );
  return rows;
};

exports.createSector = async (data, userId) => {
  const key = String(data.key || '').trim();
  const label = String(data.label || '').trim();
  if (!key || !label) throw Object.assign(new Error('Sector key and label are required'), { statusCode: 400 });

  try {
    const { rows } = await db.query(
      `INSERT INTO bd_sectors (key, label, icon, color_token, sort_order, is_active)
       VALUES ($1, $2, $3, $4, COALESCE($5, 0), COALESCE($6, TRUE))
       RETURNING *`,
      [key, label, data.icon || null, data.color_token || null, data.sort_order, data.is_active]
    );
    audit.log({ user_id: userId, action: 'CREATE_SECTOR', entity_type: 'settings', entity_id: rows[0].id, new_value: { key, label } }).catch(() => {});
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw Object.assign(new Error('A sector with this key already exists'), { statusCode: 409 });
    throw err;
  }
};

exports.updateSector = async (id, data, userId) => {
  const { rows } = await db.query(
    `UPDATE bd_sectors SET
       label       = COALESCE($1, label),
       icon        = COALESCE($2, icon),
       color_token = COALESCE($3, color_token),
       sort_order  = COALESCE($4, sort_order),
       is_active   = COALESCE($5, is_active)
     WHERE id = $6
     RETURNING *`,
    [
      data.label       !== undefined ? data.label       : null,
      data.icon        !== undefined ? data.icon        : null,
      data.color_token !== undefined ? data.color_token : null,
      data.sort_order  !== undefined ? data.sort_order  : null,
      data.is_active   !== undefined ? data.is_active   : null,
      id,
    ]
  );
  if (!rows.length) throw notFound('Sector');
  audit.log({ user_id: userId, action: 'UPDATE_SECTOR', entity_type: 'settings', entity_id: id, new_value: data }).catch(() => {});
  return rows[0];
};

exports.deleteSector = async (id, userId) => {
  const { rows } = await db.query(`DELETE FROM bd_sectors WHERE id = $1 RETURNING key`, [id]);
  if (!rows.length) throw notFound('Sector');
  audit.log({ user_id: userId, action: 'DELETE_SECTOR', entity_type: 'settings', entity_id: id, old_value: rows[0] }).catch(() => {});
  return { deleted: true };
};

// ── Departments (contact dropdown) ──────────────────────────────────────────
exports.listDepartments = async ({ activeOnly = false } = {}) => {
  const where = activeOnly ? 'WHERE is_active = TRUE' : '';
  const { rows } = await db.query(
    `SELECT * FROM bd_departments ${where} ORDER BY sort_order, label`
  );
  return rows;
};

exports.createDepartment = async (data, userId) => {
  const key = String(data.key || '').trim();
  const label = String(data.label || '').trim();
  if (!key || !label) throw Object.assign(new Error('Department key and label are required'), { statusCode: 400 });

  try {
    const { rows } = await db.query(
      `INSERT INTO bd_departments (key, label, sort_order, is_active)
       VALUES ($1, $2, COALESCE($3, 0), COALESCE($4, TRUE))
       RETURNING *`,
      [key, label, data.sort_order, data.is_active]
    );
    audit.log({ user_id: userId, action: 'CREATE_DEPARTMENT', entity_type: 'settings', entity_id: rows[0].id, new_value: { key, label } }).catch(() => {});
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw Object.assign(new Error('A department with this key already exists'), { statusCode: 409 });
    throw err;
  }
};

exports.updateDepartment = async (id, data, userId) => {
  const { rows } = await db.query(
    `UPDATE bd_departments SET
       label      = COALESCE($1, label),
       sort_order = COALESCE($2, sort_order),
       is_active  = COALESCE($3, is_active)
     WHERE id = $4
     RETURNING *`,
    [
      data.label      !== undefined ? data.label      : null,
      data.sort_order !== undefined ? data.sort_order : null,
      data.is_active  !== undefined ? data.is_active   : null,
      id,
    ]
  );
  if (!rows.length) throw notFound('Department');
  audit.log({ user_id: userId, action: 'UPDATE_DEPARTMENT', entity_type: 'settings', entity_id: id, new_value: data }).catch(() => {});
  return rows[0];
};

exports.deleteDepartment = async (id, userId) => {
  const { rows } = await db.query(`DELETE FROM bd_departments WHERE id = $1 RETURNING key`, [id]);
  if (!rows.length) throw notFound('Department');
  audit.log({ user_id: userId, action: 'DELETE_DEPARTMENT', entity_type: 'settings', entity_id: id, old_value: rows[0] }).catch(() => {});
  return { deleted: true };
};

// ── Settings (single row) ───────────────────────────────────────────────────
exports.getSettings = async () => {
  const { rows } = await db.query(`SELECT * FROM bd_settings WHERE id = TRUE`);
  return rows[0] || null;
};

exports.updateSettings = async (data, userId) => {
  const { rows } = await db.query(
    `UPDATE bd_settings SET
       default_followup_days    = COALESCE($1,  default_followup_days),
       priority_a_followup_days = COALESCE($2,  priority_a_followup_days),
       escalation_days          = COALESCE($3,  escalation_days),
       max_reminders            = COALESCE($4,  max_reminders),
       reminder_hour_ist        = COALESCE($5,  reminder_hour_ist),
       digest_enabled           = COALESCE($6,  digest_enabled),
       notify_user_ids          = COALESCE($7::UUID[], notify_user_ids),
       weekly_summary_enabled   = COALESCE($8,  weekly_summary_enabled)
     WHERE id = TRUE
     RETURNING *`,
    [
      data.default_followup_days    !== undefined ? data.default_followup_days    : null,
      data.priority_a_followup_days !== undefined ? data.priority_a_followup_days : null,
      data.escalation_days          !== undefined ? data.escalation_days          : null,
      data.max_reminders            !== undefined ? data.max_reminders            : null,
      data.reminder_hour_ist        !== undefined ? data.reminder_hour_ist        : null,
      data.digest_enabled           !== undefined ? data.digest_enabled           : null,
      data.notify_user_ids          !== undefined ? data.notify_user_ids          : null,
      data.weekly_summary_enabled   !== undefined ? data.weekly_summary_enabled   : null,
    ]
  );
  audit.log({ user_id: userId, action: 'UPDATE_BD_SETTINGS', entity_type: 'settings', entity_id: null, new_value: data }).catch(() => {});
  return rows[0];
};
