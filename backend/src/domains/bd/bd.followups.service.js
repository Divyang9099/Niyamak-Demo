const db    = require('../../core/config/db');
const audit = require('./bd.audit.service');
const { recomputeClientFollowUp } = require('./bd.touchpoints.service');
const { badRequest } = require('./bd.validation');

const notFound = () => Object.assign(new Error('Follow-up not found'), { statusCode: 404 });

// ── List — the follow-ups inbox (§7, /bd/followups) ───────────────────────────
exports.listFollowups = async (query = {}) => {
  const conditions = ['1=1'];
  const values = [];
  const push = (v) => { values.push(v); return `$${values.length}`; };

  if (query.status) {
    const statuses = String(query.status).split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length) conditions.push(`f.status = ANY(${push(statuses)}::TEXT[])`);
  } else if (!query.client_id) {
    // Default view (the cross-client inbox): only the still-open queue, not
    // completed/cancelled history. A single client's tab (client_id set,
    // no explicit status) instead shows full history — open AND closed.
    conditions.push(`f.status IN ('pending','sent','escalated')`);
  }

  if (query.client_id) conditions.push(`f.client_id = ${push(query.client_id)}`);
  if (query.due_before) conditions.push(`f.due_at <= ${push(query.due_before)}`);
  if (query.assigned_to) conditions.push(`f.assigned_to = ${push(query.assigned_to)}`);
  if (query.priority) {
    const vals = String(query.priority).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (vals.length) conditions.push(`c.priority = ANY(${push(vals)}::TEXT[])`);
  }

  const { rows } = await db.query(
    `SELECT f.*, c.name AS client_name, c.priority AS client_priority, c.logo_url AS client_logo_url,
            ct.name AS contact_name, ch.channel_type, ch.value AS channel_value,
            t.subject AS touchpoint_subject, u.name AS assigned_to_name
     FROM bd_followups f
     JOIN bd_clients c ON c.id = f.client_id AND c.deleted_at IS NULL
     LEFT JOIN bd_contacts ct ON ct.id = f.contact_id
     LEFT JOIN bd_channels ch ON ch.id = f.channel_id
     LEFT JOIN bd_touchpoints t ON t.id = f.touchpoint_id
     LEFT JOIN users u ON u.id = f.assigned_to
     WHERE ${conditions.join(' AND ')}
     ORDER BY f.due_at ASC`,
    values
  );
  return rows;
};

// ── Manual follow-up ───────────────────────────────────────────────────────
exports.createFollowup = async (data, userId) => {
  if (!data.client_id) throw badRequest('client_id is required');
  if (!data.due_at) throw badRequest('due_at is required');

  const dueAt = new Date(data.due_at);
  if (Number.isNaN(dueAt.getTime())) throw badRequest('Invalid due_at date');

  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const clientRes = await conn.query('SELECT bd_owner_id FROM bd_clients WHERE id = $1 AND deleted_at IS NULL', [data.client_id]);
    if (!clientRes.rows.length) throw Object.assign(new Error('Client not found'), { statusCode: 404 });

    const { rows } = await conn.query(
      `INSERT INTO bd_followups (client_id, touchpoint_id, contact_id, channel_id, due_at, assigned_to, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        data.client_id, data.touchpoint_id || null, data.contact_id || null, data.channel_id || null,
        dueAt, data.assigned_to || clientRes.rows[0].bd_owner_id || null, data.note || null, userId || null,
      ]
    );

    await recomputeClientFollowUp(data.client_id, conn);
    await audit.log({ user_id: userId, action: 'CREATE_FOLLOWUP', entity_type: 'followup', entity_id: rows[0].id, client_id: data.client_id, new_value: { due_at: dueAt }, connection: conn });

    await conn.query('COMMIT');
    return rows[0];
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};

// Fixed parameter list regardless of which fields change — COALESCE($n, col)
// is a no-op for whichever value is passed as NULL. Avoids fragile dynamic
// placeholder indexing.
const _transition = async (id, { status, due_at, note }, userId, action) => {
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');

    const existing = await conn.query('SELECT * FROM bd_followups WHERE id = $1', [id]);
    if (!existing.rows.length) throw notFound();
    const fu = existing.rows[0];

    const { rows } = await conn.query(
      `UPDATE bd_followups SET
         status       = $1,
         due_at       = COALESCE($2, due_at),
         note         = COALESCE($3, note),
         completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
         completed_by = CASE WHEN $1 = 'completed' THEN $4 ELSE completed_by END
       WHERE id = $5
       RETURNING *`,
      [status, due_at || null, note !== undefined ? note : null, userId || null, id]
    );

    await recomputeClientFollowUp(fu.client_id, conn);
    await audit.log({ user_id: userId, action, entity_type: 'followup', entity_id: id, client_id: fu.client_id, old_value: { status: fu.status, due_at: fu.due_at }, new_value: { status, due_at: due_at || fu.due_at }, connection: conn });

    await conn.query('COMMIT');
    return rows[0];
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
};

exports.completeFollowup = (id, userId) => _transition(id, { status: 'completed' }, userId, 'COMPLETE_FOLLOWUP');

exports.snoozeFollowup = (id, data, userId) => {
  if (!data.due_at) throw badRequest('due_at is required to snooze');
  const dueAt = new Date(data.due_at);
  if (Number.isNaN(dueAt.getTime())) throw badRequest('Invalid due_at date');
  return _transition(id, { status: 'pending', due_at: dueAt, note: data.note }, userId, 'SNOOZE_FOLLOWUP');
};

exports.cancelFollowup = (id, userId) => _transition(id, { status: 'cancelled' }, userId, 'CANCEL_FOLLOWUP');
