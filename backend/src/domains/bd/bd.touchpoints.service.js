const db    = require('../../core/config/db');
const audit = require('./bd.audit.service');
const { INTERACTION_TYPES, DIRECTIONS, RESPONSE_STATUSES, badRequest, assertIn } = require('./bd.validation');

const notFoundTouchpoint = () => Object.assign(new Error('Touchpoint not found'), { statusCode: 404 });
const notFoundChannel    = () => Object.assign(new Error('Channel not found'), { statusCode: 404 });

// channel_type → the touchpoint interaction_type it represents when logged via
// the checkbox grid (D2/D3 — one channel table drives all address types).
const CHANNEL_TO_INTERACTION = { email: 'email', phone: 'call', linkedin: 'linkedin', whatsapp: 'whatsapp' };

// response_status → the channel's resting state after a reply is logged.
const RESPONSE_TO_CHANNEL_STATUS = {
  positive:     'responded',
  negative:     'responded',
  neutral:      'responded',
  bounced:      'bounced',
  no_response:  'unreachable', // admin manually closed the loop — nothing ever came back
};

const INTERACTION_TO_CHANNEL = {
  email: 'email',
  call: 'phone',
  linkedin: 'linkedin',
  whatsapp: 'whatsapp'
};

// Recomputes bd_clients.next_follow_up_at as the earliest still-open follow-up.
// Called after any insert/complete/cancel of a bd_followups row so the client
// rollup can never drift from the follow-up table it's derived from.
const recomputeClientFollowUp = async (clientId, conn) => {
  await conn.query(
    `UPDATE bd_clients SET
       next_follow_up_at = (SELECT MIN(due_at) FROM bd_followups WHERE client_id = $1 AND status IN ('pending','sent')),
       last_activity_at  = NOW()
     WHERE id = $1`,
    [clientId]
  );
};
exports.recomputeClientFollowUp = recomputeClientFollowUp;

const recomputeChannelStats = async (channelId, conn) => {
  if (!channelId) return;

  const tpRes = await conn.query(
    'SELECT * FROM bd_touchpoints WHERE channel_id = $1 ORDER BY occurred_at DESC',
    [channelId]
  );

  if (tpRes.rows.length === 0) {
    await conn.query(
      `UPDATE bd_channels SET
         outreach_count   = 0,
         last_outreach_at = NULL,
         last_response_at = NULL,
         channel_status   = 'not_contacted',
         last_remark      = NULL
       WHERE id = $1`,
      [channelId]
    );
    return;
  }

  const outreachCount = tpRes.rows.length;
  const latestOutreach = tpRes.rows[0];
  const latestResponse = tpRes.rows.find(r => r.response_status && r.response_status !== 'awaiting');

  let channelStatus = 'contacted';
  if (latestOutreach.response_status === 'awaiting') {
    channelStatus = 'awaiting_response';
  } else if (latestOutreach.response_status) {
    channelStatus = RESPONSE_TO_CHANNEL_STATUS[latestOutreach.response_status] || 'responded';
  }

  await conn.query(
    `UPDATE bd_channels SET
       outreach_count   = $1,
       last_outreach_at = $2,
       last_response_at = $3,
       channel_status   = $4,
       last_remark      = $5
     WHERE id = $6`,
    [
      outreachCount,
      latestOutreach.occurred_at,
      latestResponse ? latestResponse.response_at || latestResponse.occurred_at : null,
      channelStatus,
      latestOutreach.remark || null,
      channelId
    ]
  );
};
exports.recomputeChannelStats = recomputeChannelStats;

// ── Log outreach — the checkbox "Sent" action (D2) ────────────────────────────
// One transaction: touchpoint + channel rollup + follow-up + client rollup + audit.
exports.logOutreach = async (channelId, data, userId) => {
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const chRes = await conn.query('SELECT * FROM bd_channels WHERE id = $1 AND deleted_at IS NULL', [channelId]);
    if (!chRes.rows.length) throw notFoundChannel();
    const channel = chRes.rows[0];

    const clientRes = await conn.query('SELECT priority FROM bd_clients WHERE id = $1 AND deleted_at IS NULL', [channel.client_id]);
    if (!clientRes.rows.length) throw Object.assign(new Error('Client not found'), { statusCode: 404 });
    const priority = clientRes.rows[0].priority;

    const settingsRes = await conn.query('SELECT * FROM bd_settings WHERE id = TRUE');
    const settings = settingsRes.rows[0] || { default_followup_days: 3, priority_a_followup_days: 2 };

    const occurredAt = data.occurred_at ? new Date(data.occurred_at) : new Date();
    if (Number.isNaN(occurredAt.getTime())) throw badRequest('Invalid occurred_at date');

    const followupDays = priority === 'A' ? settings.priority_a_followup_days : settings.default_followup_days;
    const nextFollowUpAt = data.next_follow_up_at
      ? new Date(data.next_follow_up_at)
      : new Date(occurredAt.getTime() + followupDays * 24 * 60 * 60 * 1000);

    const interactionType = CHANNEL_TO_INTERACTION[channel.channel_type] || 'other';

    const tpRes = await conn.query(
      `INSERT INTO bd_touchpoints
         (client_id, contact_id, channel_id, interaction_type, direction, occurred_at, subject, summary, response_status, next_follow_up_at, created_by)
       VALUES ($1,$2,$3,$4,'outbound',$5,$6,$7,'awaiting',$8,$9)
       RETURNING *`,
      [channel.client_id, channel.contact_id, channel.id, interactionType, occurredAt, data.subject || null, data.summary || null, nextFollowUpAt, userId || null]
    );
    const touchpoint = tpRes.rows[0];

    await recomputeChannelStats(channel.id, conn);

    const fuRes = await conn.query(
      `INSERT INTO bd_followups (client_id, touchpoint_id, contact_id, channel_id, due_at, assigned_to, note, created_by)
       SELECT $1, $2, $3, $4, $5, bd_owner_id, $6, $7 FROM bd_clients WHERE id = $1
       RETURNING *`,
      [channel.client_id, touchpoint.id, channel.contact_id, channel.id, nextFollowUpAt, data.note || null, userId || null]
    );

    await conn.query(`UPDATE bd_clients SET touchpoint_count = touchpoint_count + 1 WHERE id = $1`, [channel.client_id]);
    await recomputeClientFollowUp(channel.client_id, conn);

    await audit.log({
      user_id: userId, action: 'LOG_OUTREACH', entity_type: 'touchpoint', entity_id: touchpoint.id,
      client_id: channel.client_id, new_value: { channel_id: channel.id, occurred_at: occurredAt }, connection: conn,
    });

    await conn.query('COMMIT');
    return { touchpoint, followup: fuRes.rows[0] };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};

// ── Log response — the checkbox "Reply" action ────────────────────────────────
// Updates the SAME touchpoint row (response_* columns), closes the linked
// follow-up, and updates the channel + client rollups.
exports.logResponse = async (touchpointId, data, userId) => {
  assertIn(data.response_status, RESPONSE_STATUSES.filter(s => s !== 'awaiting'), 'response_status');

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const tpRes = await conn.query('SELECT * FROM bd_touchpoints WHERE id = $1', [touchpointId]);
    if (!tpRes.rows.length) throw notFoundTouchpoint();
    const existing = tpRes.rows[0];

    const responseAt = data.response_at ? new Date(data.response_at) : new Date();
    if (Number.isNaN(responseAt.getTime())) throw badRequest('Invalid response_at date');

    const updRes = await conn.query(
      `UPDATE bd_touchpoints SET
         response_status  = $1,
         response_at      = $2,
         response_summary = $3,
         remark           = COALESCE($4, remark),
         outcome          = COALESCE($5, outcome)
       WHERE id = $6
       RETURNING *`,
      [data.response_status, responseAt, data.response_summary || null, data.remark || null, data.outcome || null, touchpointId]
    );
    const touchpoint = updRes.rows[0];

    if (touchpoint.channel_id) {
      await recomputeChannelStats(touchpoint.channel_id, conn);
    }

    // Close whichever follow-up was chasing this exact outreach.
    await conn.query(
      `UPDATE bd_followups SET status = 'completed', completed_at = NOW(), completed_by = $1
       WHERE touchpoint_id = $2 AND status IN ('pending','sent','escalated')`,
      [userId || null, touchpointId]
    );

    await recomputeClientFollowUp(touchpoint.client_id, conn);

    await audit.log({
      user_id: userId, action: 'LOG_RESPONSE', entity_type: 'touchpoint', entity_id: touchpointId,
      client_id: touchpoint.client_id, old_value: { response_status: existing.response_status }, new_value: { response_status: data.response_status }, connection: conn,
    });

    await conn.query('COMMIT');
    return touchpoint;
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};

// ── Manual touchpoint (meeting, site visit, unprompted inbound call, etc.) ───
// Mirrors logOutreach's follow-up scheduling rule (BD_MODULE_PLAN.md §8.2):
// logged as "awaiting" a reply → a bd_followups row is scheduled automatically
// (explicit next_follow_up_at overrides the settings-based default). Without
// this, a touchpoint logged here from the Communication Log tab would never
// appear on the Follow-ups tab or update the client's next-follow-up KPI,
// unlike the same scenario logged via the channel checkbox grid.
exports.createManualTouchpoint = async (data, userId) => {
  assertIn(data.interaction_type, INTERACTION_TYPES, 'interaction_type');
  assertIn(data.direction, DIRECTIONS, 'direction');
  if (!data.client_id) throw badRequest('client_id is required');

  const occurredAt = data.occurred_at ? new Date(data.occurred_at) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw badRequest('Invalid occurred_at date');

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const clientRes = await conn.query('SELECT id, priority, bd_owner_id FROM bd_clients WHERE id = $1 AND deleted_at IS NULL', [data.client_id]);
    if (!clientRes.rows.length) throw Object.assign(new Error('Client not found'), { statusCode: 404 });
    const client = clientRes.rows[0];

    const responseStatus = data.response_status && RESPONSE_STATUSES.includes(data.response_status) ? data.response_status : 'awaiting';

    let nextFollowUpAt = null;
    if (responseStatus === 'awaiting') {
      if (data.next_follow_up_at) {
        nextFollowUpAt = new Date(data.next_follow_up_at);
        if (Number.isNaN(nextFollowUpAt.getTime())) throw badRequest('Invalid next_follow_up_at date');
      } else {
        const settingsRes = await conn.query('SELECT * FROM bd_settings WHERE id = TRUE');
        const settings = settingsRes.rows[0] || { default_followup_days: 3, priority_a_followup_days: 2 };
        const followupDays = client.priority === 'A' ? settings.priority_a_followup_days : settings.default_followup_days;
        nextFollowUpAt = new Date(occurredAt.getTime() + followupDays * 24 * 60 * 60 * 1000);
      }
    }

    let channelId = data.channel_id || null;
    if (!channelId && data.contact_id) {
      const mappedType = INTERACTION_TO_CHANNEL[data.interaction_type];
      if (mappedType) {
        const chRes = await conn.query(
          `SELECT id FROM bd_channels 
           WHERE client_id = $1 AND contact_id = $2 AND channel_type = $3 AND deleted_at IS NULL
           ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
          [data.client_id, data.contact_id, mappedType]
        );
        if (chRes.rows.length) {
          channelId = chRes.rows[0].id;
        }
      }
    }

    const { rows } = await conn.query(
      `INSERT INTO bd_touchpoints
         (client_id, contact_id, channel_id, interaction_type, direction, occurred_at, subject, summary, response_status, response_at, response_summary, remark, outcome, next_follow_up_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        data.client_id, data.contact_id || null, channelId,
        data.interaction_type, data.direction, occurredAt,
        data.subject || null, data.summary || null, responseStatus,
        responseStatus !== 'awaiting' ? new Date() : null,
        data.response_summary || null, data.remark || null, data.outcome || null,
        nextFollowUpAt,
        userId || null,
      ]
    );
    const touchpoint = rows[0];

    let followup = null;
    if (nextFollowUpAt) {
      const fuRes = await conn.query(
        `INSERT INTO bd_followups (client_id, touchpoint_id, contact_id, channel_id, due_at, assigned_to, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [data.client_id, touchpoint.id, data.contact_id || null, channelId, nextFollowUpAt, client.bd_owner_id || null, null, userId || null]
      );
      followup = fuRes.rows[0];
      await recomputeClientFollowUp(data.client_id, conn);
    }

    await recomputeChannelStats(channelId, conn);

    await conn.query(`UPDATE bd_clients SET touchpoint_count = touchpoint_count + 1, last_activity_at = NOW() WHERE id = $1`, [data.client_id]);
    await audit.log({ user_id: userId, action: 'LOG_MANUAL_TOUCHPOINT', entity_type: 'touchpoint', entity_id: touchpoint.id, client_id: data.client_id, new_value: { interaction_type: data.interaction_type }, connection: conn });

    await conn.query('COMMIT');
    return { ...touchpoint, followup };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};

// ── Correction — edit a past entry, never delete it (D2) ─────────────────────
exports.correctTouchpoint = async (touchpointId, data, userId) => {
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const existingRes = await conn.query('SELECT * FROM bd_touchpoints WHERE id = $1', [touchpointId]);
    if (!existingRes.rows.length) throw notFoundTouchpoint();
    const existing = existingRes.rows[0];

    const contactId = data.contact_id !== undefined ? data.contact_id : existing.contact_id;
    const interactionType = data.interaction_type !== undefined ? data.interaction_type : existing.interaction_type;
    
    let channelId = data.channel_id !== undefined ? data.channel_id : existing.channel_id;

    if (data.channel_id === undefined && (data.contact_id !== undefined || data.interaction_type !== undefined)) {
      if (contactId) {
        const mappedType = INTERACTION_TO_CHANNEL[interactionType];
        if (mappedType) {
          const chRes = await conn.query(
            `SELECT id FROM bd_channels 
             WHERE client_id = $1 AND contact_id = $2 AND channel_type = $3 AND deleted_at IS NULL
             ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
            [existing.client_id, contactId, mappedType]
          );
          channelId = chRes.rows.length ? chRes.rows[0].id : null;
        } else {
          channelId = null;
        }
      } else {
        channelId = null;
      }
    }

    const { rows } = await conn.query(
      `UPDATE bd_touchpoints SET
         contact_id        = $1,
         interaction_type  = $2,
         channel_id        = $3,
         subject           = COALESCE($4, subject),
         summary           = COALESCE($5, summary),
         occurred_at       = COALESCE($6, occurred_at),
         response_status   = COALESCE($7, response_status),
         response_at       = COALESCE($8, response_at),
         response_summary  = COALESCE($9, response_summary),
         remark            = COALESCE($10, remark),
         outcome           = COALESCE($11, outcome),
         is_corrected      = TRUE
       WHERE id = $12
       RETURNING *`,
      [
        contactId,
        interactionType,
        channelId,
        data.subject          !== undefined ? data.subject          : null,
        data.summary          !== undefined ? data.summary          : null,
        data.occurred_at      !== undefined ? new Date(data.occurred_at) : null,
        data.response_status  !== undefined ? data.response_status  : null,
        data.response_at      !== undefined ? new Date(data.response_at) : null,
        data.response_summary !== undefined ? data.response_summary : null,
        data.remark           !== undefined ? data.remark           : null,
        data.outcome          !== undefined ? data.outcome           : null,
        touchpointId,
      ]
    );

    const updated = rows[0];

    if (existing.channel_id && existing.channel_id !== updated.channel_id) {
      await recomputeChannelStats(existing.channel_id, conn);
    }
    if (updated.channel_id) {
      await recomputeChannelStats(updated.channel_id, conn);
    }

    await audit.log({
      user_id: userId, action: 'CORRECT_TOUCHPOINT', entity_type: 'touchpoint', entity_id: touchpointId,
      client_id: existing.client_id, old_value: existing, new_value: updated, connection: conn,
    });

    await conn.query('COMMIT');
    return updated;
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};

// ── List (Communication Log tab) ─────────────────────────────────────────────
exports.listTouchpoints = async (clientId, query = {}) => {
  const conditions = ['t.client_id = $1'];
  const values = [clientId];

  if (query.channel_id) { values.push(query.channel_id); conditions.push(`t.channel_id = $${values.length}`); }
  if (query.channel_type) {
    values.push(query.channel_type);
    conditions.push(`t.channel_id IN (SELECT id FROM bd_channels WHERE channel_type = $${values.length})`);
  }
  if (query.interaction_type) { values.push(query.interaction_type); conditions.push(`t.interaction_type = $${values.length}`); }
  if (query.direction)        { values.push(query.direction);        conditions.push(`t.direction = $${values.length}`); }
  if (query.response_status)  { values.push(query.response_status);  conditions.push(`t.response_status = $${values.length}`); }
  if (query.contact_id)       { values.push(query.contact_id);       conditions.push(`t.contact_id = $${values.length}`); }
  if (query.from) { values.push(query.from); conditions.push(`t.occurred_at >= $${values.length}`); }
  if (query.to)   { values.push(query.to);   conditions.push(`t.occurred_at <= $${values.length}`); }

  const safeLimit  = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const safePage   = Math.max(Number(query.page) || 1, 1);
  const safeOffset = (safePage - 1) * safeLimit;
  values.push(safeLimit, safeOffset);

  const result = await db.query(
    `SELECT t.*, c.name AS contact_name, ch.channel_type AS channel_type_display, ch.value AS channel_value, u.name AS created_by_name,
            COUNT(*) OVER() AS total_count
     FROM bd_touchpoints t
     LEFT JOIN bd_contacts c ON c.id = t.contact_id
     LEFT JOIN bd_channels ch ON ch.id = t.channel_id
     LEFT JOIN users u ON u.id = t.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY t.occurred_at DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  const total = Number(result.rows[0]?.total_count || 0);
  const rows  = result.rows.map(({ total_count, ...r }) => r);
  return { rows, total, page: safePage, limit: safeLimit };
};

exports.deleteTouchpoint = async (touchpointId, userId) => {
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const tpRes = await conn.query('SELECT * FROM bd_touchpoints WHERE id = $1', [touchpointId]);
    if (!tpRes.rows.length) throw notFoundTouchpoint();
    const touchpoint = tpRes.rows[0];

    await conn.query('DELETE FROM bd_touchpoints WHERE id = $1', [touchpointId]);
    await conn.query('DELETE FROM bd_followups WHERE touchpoint_id = $1', [touchpointId]);

    if (touchpoint.channel_id) {
      await recomputeChannelStats(touchpoint.channel_id, conn);
    }

    await conn.query(
      `UPDATE bd_clients SET 
         touchpoint_count = GREATEST(0, touchpoint_count - 1),
         last_activity_at = NOW() 
       WHERE id = $1`,
      [touchpoint.client_id]
    );

    await recomputeClientFollowUp(touchpoint.client_id, conn);

    await audit.log({
      user_id: userId,
      action: 'DELETE_TOUCHPOINT',
      entity_type: 'touchpoint',
      entity_id: touchpointId,
      client_id: touchpoint.client_id,
      old_value: touchpoint,
      connection: conn,
    });

    await conn.query('COMMIT');
    return { id: touchpointId, client_id: touchpoint.client_id };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};
