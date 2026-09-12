const db    = require('../../core/config/db');
const audit = require('./bd.audit.service');
const { CHANNEL_TYPES, OWNER_TYPES, badRequest, assertIn, normalizeChannelValue } = require('./bd.validation');

const notFound = () => Object.assign(new Error('Channel not found'), { statusCode: 404 });

exports.listChannels = async (clientId, { owner_type, contact_id, channel_type } = {}) => {
  const conditions = ['client_id = $1', 'deleted_at IS NULL'];
  const values = [clientId];

  if (owner_type)   { values.push(owner_type);   conditions.push(`owner_type = $${values.length}`); }
  if (contact_id)   { values.push(contact_id);   conditions.push(`contact_id = $${values.length}`); }
  if (channel_type) { values.push(channel_type); conditions.push(`channel_type = $${values.length}`); }

  // latest_open_touchpoint_id — the checkbox grid needs to know WHICH touchpoint
  // a "Reply" tick should attach its response to; the rollup columns alone don't
  // carry that reference.
  const { rows } = await db.query(
    `SELECT bc.*,
            (SELECT id FROM bd_touchpoints t
             WHERE t.channel_id = bc.id AND t.response_status = 'awaiting'
             ORDER BY t.occurred_at DESC LIMIT 1) AS latest_open_touchpoint_id
     FROM bd_channels bc
     WHERE ${conditions.join(' AND ')} ORDER BY sort_order, created_at`,
    values
  );
  return rows;
};

exports.createChannel = async (clientId, data, userId) => {
  const ownerType = data.owner_type;
  assertIn(ownerType, OWNER_TYPES, 'owner_type');
  assertIn(data.channel_type, CHANNEL_TYPES, 'channel_type');

  if (ownerType === 'contact' && !data.contact_id) {
    throw badRequest('contact_id is required when owner_type is "contact"');
  }
  if (ownerType === 'client' && data.contact_id) {
    throw badRequest('contact_id must not be set when owner_type is "client"');
  }

  const value = normalizeChannelValue(data.channel_type, data.value);

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const clientCheck = await conn.query('SELECT id FROM bd_clients WHERE id = $1 AND deleted_at IS NULL', [clientId]);
    if (!clientCheck.rows.length) throw Object.assign(new Error('Client not found'), { statusCode: 404 });

    if (data.contact_id) {
      const contactCheck = await conn.query(
        'SELECT id FROM bd_contacts WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL',
        [data.contact_id, clientId]
      );
      if (!contactCheck.rows.length) throw Object.assign(new Error('Contact not found on this client'), { statusCode: 404 });
    }

    if (data.is_primary) {
      await conn.query(
        `UPDATE bd_channels SET is_primary = FALSE
         WHERE client_id = $1 AND channel_type = $2 AND deleted_at IS NULL
           AND owner_type = $3 AND (contact_id = $4 OR ($4 IS NULL AND contact_id IS NULL))`,
        [clientId, data.channel_type, ownerType, data.contact_id || null]
      );
    }

    let result;
    try {
      result = await conn.query(
        `INSERT INTO bd_channels
           (client_id, owner_type, contact_id, channel_type, value, label, sort_order, is_primary, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          clientId,
          ownerType,
          data.contact_id || null,
          data.channel_type,
          value,
          data.label || null,
          data.sort_order || 0,
          Boolean(data.is_primary),
          userId || null,
        ]
      );
    } catch (err) {
      if (err.code === '23505') throw Object.assign(new Error('This address is already saved on this client'), { statusCode: 409 });
      throw err;
    }

    await audit.log({ user_id: userId, action: 'CREATE_CHANNEL', entity_type: 'channel', entity_id: result.rows[0].id, client_id: clientId, new_value: { channel_type: data.channel_type, value }, connection: conn });
    await conn.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};

exports.updateChannel = async (channelId, data, userId) => {
  const existing = await db.query('SELECT * FROM bd_channels WHERE id = $1 AND deleted_at IS NULL', [channelId]);
  if (!existing.rows.length) throw notFound();
  const ch = existing.rows[0];

  const value = data.value !== undefined ? normalizeChannelValue(ch.channel_type, data.value) : undefined;

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    if (data.is_primary === true) {
      await conn.query(
        `UPDATE bd_channels SET is_primary = FALSE
         WHERE client_id = $1 AND channel_type = $2 AND deleted_at IS NULL AND id != $3
           AND owner_type = $4 AND (contact_id = $5 OR ($5 IS NULL AND contact_id IS NULL))`,
        [ch.client_id, ch.channel_type, channelId, ch.owner_type, ch.contact_id]
      );
    }

    let result;
    try {
      result = await conn.query(
        `UPDATE bd_channels SET
           value      = COALESCE($1, value),
           label      = COALESCE($2, label),
           sort_order = COALESCE($3, sort_order),
           is_primary = COALESCE($4, is_primary)
         WHERE id = $5 AND deleted_at IS NULL
         RETURNING *`,
        [
          value            !== undefined ? value            : null,
          data.label       !== undefined ? data.label       : null,
          data.sort_order  !== undefined ? data.sort_order  : null,
          data.is_primary  !== undefined ? data.is_primary  : null,
          channelId,
        ]
      );
    } catch (err) {
      if (err.code === '23505') throw Object.assign(new Error('This address is already saved on this client'), { statusCode: 409 });
      throw err;
    }

    await audit.log({ user_id: userId, action: 'UPDATE_CHANNEL', entity_type: 'channel', entity_id: channelId, client_id: ch.client_id, old_value: ch, new_value: result.rows[0], connection: conn });
    await conn.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};

exports.deleteChannel = async (channelId, userId) => {
  const { rows } = await db.query(
    `UPDATE bd_channels SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [channelId]
  );
  if (!rows.length) throw notFound();
  audit.log({ user_id: userId, action: 'DELETE_CHANNEL', entity_type: 'channel', entity_id: channelId, client_id: rows[0].client_id, old_value: { value: rows[0].value } }).catch(() => {});
  return { deleted: true };
};

// Bulk sort_order update — items: [{ id, sort_order }]
exports.reorderChannels = async (items, userId) => {
  if (!Array.isArray(items) || !items.length) throw badRequest('items must be a non-empty array');

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    for (const item of items) {
      await conn.query(
        `UPDATE bd_channels SET sort_order = $1 WHERE id = $2 AND deleted_at IS NULL`,
        [Number(item.sort_order) || 0, item.id]
      );
    }
    await conn.query('COMMIT');
    return { reordered: items.length };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};
