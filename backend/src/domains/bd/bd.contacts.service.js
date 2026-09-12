const db    = require('../../core/config/db');
const audit = require('./bd.audit.service');
const { badRequest } = require('./bd.validation');

const notFound = () => Object.assign(new Error('Contact not found'), { statusCode: 404 });

const assertClientExists = async (clientId, conn = db) => {
  const { rows } = await conn.query('SELECT id FROM bd_clients WHERE id = $1 AND deleted_at IS NULL', [clientId]);
  if (!rows.length) throw Object.assign(new Error('Client not found'), { statusCode: 404 });
};

exports.listContacts = async (clientId) => {
  const { rows } = await db.query(
    `SELECT * FROM bd_contacts WHERE client_id = $1 AND deleted_at IS NULL ORDER BY sort_order, created_at`,
    [clientId]
  );
  return rows;
};

exports.createContact = async (clientId, data, userId) => {
  const name = String(data.name || '').trim();
  if (!name) throw badRequest('Contact name is required');

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    await assertClientExists(clientId, conn);

    // Only one primary contact per client — demote any existing primary first.
    if (data.is_primary) {
      await conn.query(`UPDATE bd_contacts SET is_primary = FALSE WHERE client_id = $1 AND deleted_at IS NULL`, [clientId]);
    }

    const { rows } = await conn.query(
      `INSERT INTO bd_contacts
         (client_id, name, designation, department, is_primary, is_decision_maker, notes, sort_order, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        clientId,
        name,
        data.designation || null,
        data.department  || null,
        Boolean(data.is_primary),
        Boolean(data.is_decision_maker),
        data.notes || null,
        data.sort_order || 0,
        userId || null,
      ]
    );

    await conn.query(`UPDATE bd_clients SET contact_count = contact_count + 1, last_activity_at = NOW() WHERE id = $1`, [clientId]);
    await audit.log({ user_id: userId, action: 'CREATE_CONTACT', entity_type: 'contact', entity_id: rows[0].id, client_id: clientId, new_value: { name }, connection: conn });

    await conn.query('COMMIT');
    return rows[0];
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};

exports.updateContact = async (contactId, data, userId) => {
  const existing = await db.query('SELECT * FROM bd_contacts WHERE id = $1 AND deleted_at IS NULL', [contactId]);
  if (!existing.rows.length) throw notFound();
  const clientId = existing.rows[0].client_id;

  const newName = data.name !== undefined ? String(data.name).trim() : undefined;
  if (newName !== undefined && !newName) throw badRequest('Contact name cannot be empty');

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    if (data.is_primary === true) {
      await conn.query(`UPDATE bd_contacts SET is_primary = FALSE WHERE client_id = $1 AND deleted_at IS NULL AND id != $2`, [clientId, contactId]);
    }

    const { rows } = await conn.query(
      `UPDATE bd_contacts SET
         name              = COALESCE($1, name),
         designation       = COALESCE($2, designation),
         department        = COALESCE($3, department),
         is_primary        = COALESCE($4, is_primary),
         is_decision_maker = COALESCE($5, is_decision_maker),
         notes             = COALESCE($6, notes),
         sort_order        = COALESCE($7, sort_order)
       WHERE id = $8 AND deleted_at IS NULL
       RETURNING *`,
      [
        newName !== undefined ? newName : null,
        data.designation        !== undefined ? data.designation        : null,
        data.department         !== undefined ? data.department         : null,
        data.is_primary         !== undefined ? data.is_primary         : null,
        data.is_decision_maker  !== undefined ? data.is_decision_maker  : null,
        data.notes              !== undefined ? data.notes              : null,
        data.sort_order         !== undefined ? data.sort_order         : null,
        contactId,
      ]
    );

    await audit.log({ user_id: userId, action: 'UPDATE_CONTACT', entity_type: 'contact', entity_id: contactId, client_id: clientId, old_value: existing.rows[0], new_value: rows[0], connection: conn });
    await conn.query('COMMIT');
    return rows[0];
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};

// Soft-deletes the contact AND its channels together — bd_channels has
// ON DELETE CASCADE for a hard delete, but contacts are soft-deleted, so the
// cascade must be mirrored here or the contact's channels would linger "live".
exports.deleteContact = async (contactId, userId) => {
  const existing = await db.query('SELECT * FROM bd_contacts WHERE id = $1 AND deleted_at IS NULL', [contactId]);
  if (!existing.rows.length) throw notFound();
  const clientId = existing.rows[0].client_id;

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    await conn.query(`UPDATE bd_contacts SET deleted_at = NOW() WHERE id = $1`, [contactId]);
    await conn.query(`UPDATE bd_channels SET deleted_at = NOW() WHERE contact_id = $1 AND deleted_at IS NULL`, [contactId]);
    await conn.query(`UPDATE bd_clients SET contact_count = GREATEST(contact_count - 1, 0) WHERE id = $1`, [clientId]);
    await audit.log({ user_id: userId, action: 'DELETE_CONTACT', entity_type: 'contact', entity_id: contactId, client_id: clientId, old_value: { name: existing.rows[0].name }, connection: conn });
    await conn.query('COMMIT');
    return { deleted: true };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};
