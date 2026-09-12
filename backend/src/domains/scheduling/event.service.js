const db     = require('../../core/config/db');
const socket = require('../../core/socket/socket.gateway');
const EVENTS = require('../../core/socket/socket.events');

exports.createEvent = async (data) => {
  const query = `
    INSERT INTO calendar_events
    (title, event_type, resource_type, resource_id, start_date, end_date, location, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *;
  `;

  const values = [
    data.title || null,
    data.event_type || null,
    data.resource_type || 'all',
    data.resource_id || null,
    data.start_date || null,
    data.end_date || null,
    data.location || null,
    data.notes || null,
  ];

  const result = await db.query(query, values);
  const event = result.rows[0];
  try { socket.emitToAll(EVENTS.CALENDAR_EVENT_CREATED, event); } catch (_) {}
  return event;
};

exports.getEvents = async () => {
  const result = await db.query('SELECT * FROM calendar_events ORDER BY start_date ASC');
  return result.rows;
};

// A PM may manage org-wide events, but must NOT edit/delete another project's
// auto-created project marker. For non-admins, when the target row is a project
// marker (event_type='project' with a project_id), require PM membership on it.
async function assertEventWritable(id, user) {
  const r = await db.query('SELECT event_type, project_id FROM calendar_events WHERE id = $1', [id]);
  if (!r.rows.length) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
  const row = r.rows[0];
  const admin = user && (user.role === 'admin' || user.role === 'super_admin');
  if (!admin && row.event_type === 'project' && row.project_id) {
    const m = await db.query(
      "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2 AND role = 'project_manager'",
      [row.project_id, user?.id]
    );
    if (!m.rows.length) {
      throw Object.assign(new Error('Not a project manager on this project.'), { statusCode: 403 });
    }
  }
  return row;
}

exports.updateEvent = async (id, data, user) => {
  await assertEventWritable(id, user);
  const query = `
    UPDATE calendar_events
    SET
      title = COALESCE($1, title),
      start_date = COALESCE($2, start_date),
      end_date = COALESCE($3, end_date),
      location = COALESCE($4, location),
      notes = COALESCE($5, notes)
    WHERE id = $6
    RETURNING *;
  `;

  const values = [
    data.title !== undefined ? data.title : null,
    data.start_date !== undefined ? data.start_date : null,
    data.end_date !== undefined ? data.end_date : null,
    data.location !== undefined ? data.location : null,
    data.notes !== undefined ? data.notes : null,
    id
  ];

  const result = await db.query(query, values);
  if (!result.rows.length) {
    throw Object.assign(new Error('Event not found'), { statusCode: 404 });
  }

  const event = result.rows[0];
  try { socket.emitToAll(EVENTS.CALENDAR_EVENT_UPDATED, event); } catch (_) {}
  return event;
};

exports.deleteEvent = async (id, user) => {
  await assertEventWritable(id, user);
  const result = await db.query('DELETE FROM calendar_events WHERE id=$1 RETURNING id', [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error('Event not found'), { statusCode: 404 });
  }
  try { socket.emitToAll(EVENTS.CALENDAR_EVENT_DELETED, { id }); } catch (_) {}
};
