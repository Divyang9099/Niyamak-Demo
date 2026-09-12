const db            = require('../../core/config/db');
const audit         = require('../audit/audit.service');
const notifService  = require('../notification/notification.service');
const emailTriggers = require('../notification/emailTriggers.service');
const allocationSvc = require('./submodules/resources/allocation.service');
const clientService = require('../client/client.service');
const socket        = require('../../core/socket/socket.gateway');
const EVENTS        = require('../../core/socket/socket.events');

// Field-level authorization (BOPLA guard): pilots get row-level access to their
// own assigned projects (see getProjects below), but the `projects` row itself
// carries commercially sensitive data — deal value, client's personal contact
// info, PO/work-order numbers, invoice location, cancellation notes, and
// internal linkage ids — that a field pilot has no business need to see, even
// on a project they're staffed on. Admins and project_managers get everything
// (they already have org-wide read access, per getProjects below).
const PILOT_REDACTED_FIELDS = [
  'project_value', 'po_number', 'work_order_number',
  'contact_person', 'contact_number', 'contact_email',
  'invoice_url', 'invoice_uploaded_at', 'cancel_reason',
  'source_pipeline_id', 'created_by', 'client_id', 'archived_by',
];

exports.redactForRole = (row, role) => {
  if (!row || role === 'admin' || role === 'project_manager') return row;
  for (const f of PILOT_REDACTED_FIELDS) delete row[f];
  return row;
};

exports.createProject = async (data, userId) => {
  const userLookup = await db.query('SELECT name FROM users WHERE id = $1', [userId]);
  const creatorName = userLookup.rows[0]?.name || 'a user';

  // Resolve the linked client (client_id) → canonical client_name for denormalised
  // storage. Falls back to the free-text name when no client_id was supplied.
  const { client_id: resolvedClientId, client_name: resolvedClientName } =
    await clientService.resolveClientForLink(data.client_id, data.client_name);

  const client = await db.connect();
  let project;
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO projects
       (name, client_name, project_type, status, start_date, end_date,
        state, district, location_name, latitude, longitude, description,
        po_number, work_order_number, contact_person, contact_number, contact_email,
        needs_attention, created_by, drone_flying_zone, project_value, client_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *;`,
      [
        data.name,
        resolvedClientName,
        data.project_type,
        data.status || 'initiate',
        data.start_date || null,
        data.end_date   || null,
        data.state      || null,
        data.district   || null,
        data.location_name || null,
        data.latitude   || null,
        data.longitude  || null,
        data.description || null,
        data.po_number  || null,
        data.work_order_number || null,
        data.contact_person    || null,
        data.contact_number    || null,
        data.contact_email     || null,
        data.needs_attention === true,
        userId,
        data.drone_flying_zone || null,
        data.project_value != null ? Number(data.project_value) : null,
        resolvedClientId,
      ]
    );
    project = result.rows[0];

    if (data.scope) {
      await client.query(
        `INSERT INTO project_scope (project_id, deliverables_expected, special_instructions)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id) DO NOTHING`,
        [project.id, JSON.stringify({ description: data.scope }), data.description || '']
      );
    }

    // Creator becomes project_manager member
    await client.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [project.id, userId, 'project_manager']
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  try {
    await audit.log({
      user_id: userId, action: 'CREATE_PROJECT',
      entity_type: 'project', entity_id: project.id, new_value: project,
    });
  } catch (auditErr) {
    console.error('[Project] Audit log failed (non-fatal):', auditErr.message);
  }

  try {
    const admins = await db.query("SELECT id FROM users WHERE role='admin' AND id != $1", [userId]);
    await Promise.all(admins.rows.map(admin =>
      notifService.createNotification({
        user_id:     admin.id,
        title:       'New Project Created',
        message:     `A new project "${project.name}" has been initiated by ${creatorName}.`,
        entity_type: 'project',
        entity_id:   project.id,
      })
    ));
  } catch (notifErr) {
    console.error('[Project] Notification error (non-fatal):', notifErr.message);
  }

  // Broadcast to all admins + the creator's user room; project room doesn't exist yet
  try {
    socket.emitToRole('admin', EVENTS.PROJECT_CREATED, project);
    socket.emitToUser(userId, EVENTS.PROJECT_CREATED, project);
  } catch (_) {}

  // Auto-create a project calendar marker so the project appears on the calendar
  // immediately after creation, even before any allocation is made.
  if (project.start_date && project.end_date) {
    try {
      await db.query(
        `INSERT INTO calendar_events (title, event_type, resource_type, start_date, end_date, project_id)
         VALUES ($1, 'project', 'all', $2, $3, $4)`,
        [project.name, project.start_date, project.end_date, project.id]
      );
    } catch (_) {}
  }

  return project;
};

// New operational lifecycle — strictly forward, no reversing (PRD lifecycle overhaul).
//   initiate → planned → on_going → executed → post_processing → complete
// `complete` is reached only via completeProject() (invoice required) and
// `cancelled` only via cancelProject() (reason required). Both are excluded here
// so the generic PUT /:id status path cannot reach them without their gates.
const PROJECT_STATUSES = ['initiate', 'planned', 'on_going', 'executed', 'post_processing', 'complete', 'cancelled'];
const ALLOWED_TRANSITIONS = {
  initiate:        ['planned'],
  planned:         ['on_going'],
  on_going:        ['executed'],
  executed:        ['post_processing'],
  post_processing: ['complete'],   // gated → completeProject()
  complete:        [],             // terminal
  cancelled:       [],             // terminal
};
const STATUS_LABEL = {
  initiate: 'Initiate', planned: 'Planned', on_going: 'On Going',
  executed: 'Executed', post_processing: 'Post Processing', complete: 'Complete', cancelled: 'Cancelled',
};

exports.updateProject = async (id, data, userId) => {
  const oldRes = await db.query('SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!oldRes.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });
  const old = oldRes.rows[0];

  if (data.status && data.status !== old.status) {
    // Gated transitions must go through their dedicated endpoints
    if (data.status === 'complete') {
      throw Object.assign(new Error('Use the Complete action — an invoice upload is required.'), { statusCode: 422 });
    }
    if (data.status === 'cancelled') {
      throw Object.assign(new Error('Use the Cancel action — a cancellation reason is required.'), { statusCode: 422 });
    }
    const allowed = ALLOWED_TRANSITIONS[old.status] ?? [];
    if (!allowed.includes(data.status)) {
      throw Object.assign(
        new Error(`Cannot move project from "${STATUS_LABEL[old.status] || old.status}" to "${STATUS_LABEL[data.status] || data.status}". Stages move forward only.`),
        { statusCode: 422 }
      );
    }
  }

  const result = await db.query(
    `UPDATE projects SET
       name              = COALESCE($1,  name),
       client_name       = COALESCE($2,  client_name),
       project_type      = COALESCE($3,  project_type),
       status            = COALESCE($4,  status),
       start_date        = COALESCE($5,  start_date),
       end_date          = COALESCE($6,  end_date),
       state             = COALESCE($7,  state),
       district          = COALESCE($8,  district),
       location_name     = COALESCE($9,  location_name),
       latitude          = COALESCE($10, latitude),
       longitude         = COALESCE($11, longitude),
       description       = COALESCE($12, description),
       po_number         = COALESCE($13, po_number),
       work_order_number = COALESCE($14, work_order_number),
       contact_person    = COALESCE($15, contact_person),
       contact_number    = COALESCE($16, contact_number),
       contact_email     = COALESCE($17, contact_email),
       -- Clear the "needs attention" flag once a converted project has core details + a start date
       needs_attention   = CASE WHEN needs_attention = TRUE
                                 AND COALESCE($18, start_date) IS NOT NULL
                                THEN FALSE ELSE needs_attention END,
       drone_flying_zone = COALESCE($19, drone_flying_zone),
       project_value     = CASE WHEN $20::numeric IS NOT NULL THEN $20::numeric ELSE project_value END,
       updated_at        = NOW()
     WHERE id = $21
     RETURNING *;`,
    [
      data.name            !== undefined ? data.name            : null,
      data.client_name     !== undefined ? data.client_name     : null,
      data.project_type    !== undefined ? data.project_type    : null,
      data.status          !== undefined ? data.status          : null,
      data.start_date      !== undefined ? data.start_date      : null,
      data.end_date        !== undefined ? data.end_date        : null,
      data.state           !== undefined ? data.state           : null,
      data.district        !== undefined ? data.district        : null,
      data.location_name   !== undefined ? data.location_name   : null,
      data.latitude        !== undefined ? data.latitude        : null,
      data.longitude       !== undefined ? data.longitude       : null,
      data.description     !== undefined ? data.description     : null,
      data.po_number       !== undefined ? data.po_number       : null,
      data.work_order_number !== undefined ? data.work_order_number : null,
      data.contact_person  !== undefined ? data.contact_person  : null,
      data.contact_number  !== undefined ? data.contact_number  : null,
      data.contact_email   !== undefined ? data.contact_email   : null,
      data.start_date      !== undefined ? data.start_date      : null,
      data.drone_flying_zone !== undefined ? data.drone_flying_zone : null,
      data.project_value   !== undefined ? Number(data.project_value) : null,
      id,
    ]
  );
  const project = result.rows[0];

  // ── Client link — resolve client_id → canonical client_name (kept in sync) ──
  if (data.client_id !== undefined) {
    const { client_id: rcid, client_name: rcname } =
      await clientService.resolveClientForLink(data.client_id, data.client_name);
    await db.query(
      'UPDATE projects SET client_id = $1, client_name = COALESCE($2, client_name) WHERE id = $3',
      [rcid, rcname, id]
    );
    project.client_id = rcid;
    if (rcname) project.client_name = rcname;
  }

  // ── Allocation update via allocationService (conflict-checked) ──────────────
  if (data.pilot_id !== undefined || data.drone_id !== undefined ||
      data.start_date !== undefined || data.end_date !== undefined) {
    const primaryRes = await db.query(
      'SELECT id, pilot_id, drone_id FROM allocations WHERE project_id=$1 AND is_primary=true ORDER BY created_at ASC LIMIT 1',
      [id]
    );
    const primary = primaryRes.rows[0];

    const newPilotId = data.pilot_id !== undefined ? data.pilot_id : (primary?.pilot_id ?? null);
    const newDroneId = data.drone_id !== undefined ? data.drone_id : (primary?.drone_id ?? null);

    if (primary) {
      if (newPilotId || newDroneId) {
        try {
          await allocationSvc.updateAllocation(primary.id, id, {
            pilot_id:   newPilotId,
            drone_id:   newDroneId,
            start_date: project.start_date,
            end_date:   project.end_date,
          }, userId);
        } catch (allocErr) {
          console.warn('[Project] Allocation update conflict (non-fatal):', allocErr.message);
        }
      } else {
        // Both resources cleared — remove primary allocation
        await db.query('DELETE FROM allocations WHERE id=$1', [primary.id]);
      }
    } else if (newPilotId || newDroneId) {
      try {
        await allocationSvc.createAllocation(id, {
          pilot_id:   newPilotId,
          drone_id:   newDroneId,
          start_date: project.start_date,
          end_date:   project.end_date,
          is_primary: true,
        }, userId);
      } catch (allocErr) {
        console.warn('[Project] Allocation create conflict (non-fatal):', allocErr.message);
      }
    }

    // Bind new pilot as project member + notify
    if (newPilotId && (!primary || newPilotId !== primary.pilot_id)) {
      try {
        const pilotUser = await db.query('SELECT user_id FROM pilots WHERE id=$1', [newPilotId]);
        if (pilotUser.rows[0]?.user_id) {
          await db.query(
            'INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
            [id, pilotUser.rows[0].user_id, 'pilot']
          );
          await notifService.createNotification({
            user_id:     pilotUser.rows[0].user_id,
            title:       'New Project Allocation',
            message:     `You have been allocated to project "${project.name}" from ${project.start_date} to ${project.end_date}.`,
            entity_type: 'project',
            entity_id:   id,
          });
        }
      } catch (e) { console.error('[Project] Notif error:', e.message); }
    }
  }

  // ── Scope update — UPSERT preserves structured scope fields ─────────────────
  if (data.scope !== undefined) {
    await db.query(
      `INSERT INTO project_scope (project_id, deliverables_expected, special_instructions)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id) DO UPDATE SET
         deliverables_expected = EXCLUDED.deliverables_expected,
         special_instructions  = EXCLUDED.special_instructions`,
      [id, JSON.stringify({ description: data.scope }), data.description || '']
    );
  }

  try {
    await audit.log({
      user_id: userId, action: 'UPDATE_PROJECT',
      entity_type: 'project', entity_id: id,
      old_value: old, new_value: project,
    });
  } catch (auditErr) {
    console.error('[Project] Audit log failed (non-fatal):', auditErr.message);
  }

  // Email triggers on status transitions
  if (data.status !== undefined && data.status !== old.status) {
    if (data.status === 'on_going') {
      emailTriggers.onProjectInProgress({ projectId: id, projectName: project.name });
    }
    // Generic transition email to all members for every forward move
    emailTriggers.onProjectStatusChange({
      projectId: id, projectName: project.name,
      status: data.status, statusLabel: STATUS_LABEL[data.status] || data.status,
    });
  }

  // Keep calendar marker in sync if name or dates changed
  if (data.name !== undefined || data.start_date !== undefined || data.end_date !== undefined) {
    try {
      await db.query(
        `UPDATE calendar_events
         SET title=$1, start_date=$2, end_date=$3
         WHERE project_id=$4 AND event_type='project'`,
        [project.name, project.start_date, project.end_date, id]
      );
    } catch (_) {}
  }

  // Broadcast update to all members in the project room
  try {
    socket.emitToProject(id, data.status && data.status !== old.status
      ? EVENTS.PROJECT_STATUS_CHANGED
      : EVENTS.PROJECT_UPDATED,
      project
    );
  } catch (_) {}

  // Notify project members on status change
  if (data.status && data.status !== old.status) {
    try {
      const members = await db.query('SELECT user_id FROM project_members WHERE project_id=$1', [id]);
      await Promise.all(members.rows.map(m =>
        notifService.createNotification({
          user_id:     m.user_id,
          title:       'Project Status Updated',
          message:     `Project "${project.name}" advanced to "${STATUS_LABEL[data.status] || data.status}".`,
          entity_type: 'project',
          entity_id:   id,
        })
      ));
    } catch (notifErr) {
      console.error('[Project] Notification error (non-fatal):', notifErr.message);
    }
  }

  return project;
};

exports.getProjects = async (user, filters = {}) => {
  const conditions = ['deleted_at IS NULL'];
  const values = [];

  // Filter out archived/cancelled projects by default unless explicitly requested
  if (!filters.status || !String(filters.status).split(',').map(s => s.trim()).includes('cancelled')) {
    conditions.push("status != 'cancelled'");
  }
  // Archived visibility:
  //   archived=true         → ONLY archived projects
  //   include_archived=true → BOTH archived and active (archiving only sets
  //                           archived_at, so a completed project stays 'complete'
  //                           — callers listing terminal work need to see them)
  //   (default)             → only active projects, archived hidden
  const includeArchived = filters.include_archived === 'true' || filters.include_archived === true;
  if (filters.archived === 'true' || filters.archived === true) {
    conditions.push("archived_at IS NOT NULL");
  } else if (!includeArchived) {
    conditions.push("archived_at IS NULL");
  }

  // Pilots are scoped to projects they are a member of or allocated to.
  // Admins and Project Managers have global read access to the full registry.
  if (user && user.role === 'pilot') {
    values.push(user.id);
    conditions.push(
      `(id IN (SELECT project_id FROM project_members WHERE user_id=$${values.length})` +
      ` OR id IN (SELECT project_id FROM allocations WHERE pilot_id IN (SELECT id FROM pilots WHERE user_id=$${values.length})))`
    );
  }
  if (filters.status) {
    // Support a single status or a comma-separated set (e.g. "enquiry,confirmed")
    const statuses = String(filters.status).split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      values.push(statuses[0]);
      conditions.push(`status=$${values.length}`);
    } else if (statuses.length > 1) {
      const placeholders = statuses.map(s => { values.push(s); return `$${values.length}`; });
      conditions.push(`status IN (${placeholders.join(', ')})`);
    }
  }
  if (filters.overdue === 'true' || filters.overdue === true) {
    conditions.push(`end_date < CURRENT_DATE AND status NOT IN ('complete', 'cancelled')`);
  }
  if (filters.type)       { values.push(filters.type);                conditions.push(`project_type=$${values.length}`); }
  if (filters.state)      { values.push(filters.state);               conditions.push(`state=$${values.length}`); }
  if (filters.search)     { values.push(`%${filters.search}%`);       conditions.push(`(name ILIKE $${values.length} OR client_name ILIKE $${values.length} OR po_number ILIKE $${values.length})`); }
  if (filters.start_date) { values.push(filters.start_date);          conditions.push(`start_date >= $${values.length}`); }
  if (filters.end_date)   { values.push(filters.end_date);            conditions.push(`end_date <= $${values.length}`); }

  const limit  = Math.min(Number(filters.limit) || 25, 100);
  const page   = Math.max(Number(filters.page)  || 1, 1);
  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await db.query(
    `SELECT *, COUNT(*) OVER() AS total_count FROM projects
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  const total = result.rows[0] ? Number(result.rows[0].total_count) : 0;
  const rows  = result.rows.map(({ total_count, ...r }) => r);
  return { rows, total, page, limit };
};

exports.getProjectById = async (id) => {
  const result = await db.query('SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL', [id]);
  return result.rows[0] || null;
};

// Returns the requesting user's role on a given project ('project_manager' | 'pilot' | 'admin'),
// or null if they are not a member. Used to gate write actions in the UI.
exports.getUserProjectRole = async (projectId, userId) => {
  if (!userId) return null;
  const result = await db.query(
    'SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2',
    [projectId, userId]
  );
  return result.rows.length ? result.rows[0].role : null;
};

// Bulk status update — admin/PM only (route guards enforce)
exports.bulkUpdateStatus = async (ids, status, userId) => {
  // Bulk path only allows the non-gated forward statuses
  const VALID = ['initiate','planned','on_going','executed','post_processing'];
  if (!VALID.includes(status)) {
    throw Object.assign(new Error('Invalid status for bulk update (complete/cancelled require their own action)'), { statusCode: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    throw Object.assign(new Error('ids array required'), { statusCode: 400 });
  }
  if (ids.length > 100) {
    throw Object.assign(new Error('Cannot update more than 100 projects at once'), { statusCode: 400 });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE projects SET status = $1 WHERE id = ANY($2::uuid[]) RETURNING id, name, status`,
      [status, ids]
    );
    for (const row of result.rows) {
      await audit.log({
        user_id: userId,
        action: 'BULK_UPDATE_STATUS',
        entity_type: 'project',
        entity_id: row.id,
        new_value: { status },
        connection: client,
      });
      socket.emitToProject(row.id, EVENTS.PROJECT_UPDATED, { id: row.id, status });
    }
    await client.query('COMMIT');
    return { updated: result.rowCount, projects: result.rows };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

// ── Complete a project (requires invoice) ──────────────────────────────────
// invoiceKey is the R2 object key produced by the upload layer.
exports.completeProject = async (id, invoiceKey, userId, invoiceFileName = null) => {
  const oldRes = await db.query('SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!oldRes.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });
  const old = oldRes.rows[0];

  if (old.status === 'complete') {
    throw Object.assign(new Error('Project is already complete'), { statusCode: 409 });
  }
  if (old.status !== 'post_processing') {
    throw Object.assign(new Error('Only a "Post Processing" project can be marked Complete.'), { statusCode: 422 });
  }
  // The requirement is "an invoice is on file", not "upload one right now". If no new
  // file was attached, fall back to an invoice already recorded against the project
  // (Invoices tab, or a previous completion) instead of blocking the user.
  let reusedExistingInvoice = false;
  if (!invoiceKey) {
    const onFile = await db.query(
      `SELECT file_key, file_name FROM project_invoices
        WHERE project_id = $1 AND file_key IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    if (onFile.rows.length) {
      invoiceKey      = onFile.rows[0].file_key;
      invoiceFileName = invoiceFileName || onFile.rows[0].file_name;
      reusedExistingInvoice = true;
    } else if (old.invoice_url) {
      invoiceKey = old.invoice_url;
      reusedExistingInvoice = true;
    } else {
      throw Object.assign(
        new Error('An invoice is required to complete the project. Add one in the Invoices tab or attach a file here.'),
        { statusCode: 400 }
      );
    }
  }

  const result = await db.query(
    `UPDATE projects
        SET status='complete', invoice_url=$2, invoice_uploaded_at=NOW(), archived_at=NOW(), archived_by=$3, updated_at=NOW()
      WHERE id=$1 RETURNING *`,
    [id, invoiceKey, userId || null]
  );
  const project = result.rows[0];

  // Mirror into project_invoices so the completion invoice actually shows up in the
  // Invoices tab — before this, it only lived on projects.invoice_url and the tab
  // (which lists project_invoices rows) looked empty even though a file was attached.
  // Skipped when we reused an invoice that is already listed there, to avoid duplicates.
  if (!reusedExistingInvoice) {
    try {
      await db.query(
        `INSERT INTO project_invoices
           (project_id, buyer_name, invoice_date, total_amount, file_key, file_name, status, notes, created_by)
         VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, 'confirmed', 'Auto-added from project completion', $6)`,
        [id, project.client_name || null, project.project_value || null, invoiceKey, invoiceFileName, userId]
      );
    } catch (e) { console.error('[Project] project_invoices mirror (complete) failed:', e.message); }
  }

  try {
    await audit.log({ user_id: userId, action: 'COMPLETE_PROJECT', entity_type: 'project', entity_id: id, old_value: old, new_value: project });
  } catch (e) { console.error('[Project] Audit (complete) failed:', e.message); }

  // In-app + email to all members
  try {
    const members = await db.query('SELECT user_id FROM project_members WHERE project_id=$1', [id]);
    await Promise.all(members.rows.map(m =>
      notifService.createNotification({
        user_id: m.user_id, title: 'Project Completed',
        message: `Project "${project.name}" has been marked Complete and the invoice is on file.`,
        entity_type: 'project', entity_id: id,
      })
    ));
  } catch (e) { console.error('[Project] Notif (complete) failed:', e.message); }

  emailTriggers.onProjectStatusChange({ projectId: id, projectName: project.name, status: 'complete', statusLabel: 'Complete' });

  try { socket.emitToProject(id, EVENTS.PROJECT_STATUS_CHANGED, project); } catch (_) {}
  return project;
};

// ── Cancel a project (requires reason; archives it) ─────────────────────────
exports.cancelProject = async (id, reason, userId) => {
  if (!reason || !reason.trim()) {
    throw Object.assign(new Error('A cancellation reason is required.'), { statusCode: 400 });
  }
  const oldRes = await db.query('SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!oldRes.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });
  const old = oldRes.rows[0];
  if (old.status === 'cancelled') {
    throw Object.assign(new Error('Project is already cancelled'), { statusCode: 409 });
  }
  if (old.status === 'complete') {
    throw Object.assign(new Error('A completed project cannot be cancelled.'), { statusCode: 422 });
  }

  const result = await db.query(
    `UPDATE projects
        SET status='cancelled', cancel_reason=$2, archived_at=NOW(), archived_by=$3, updated_at=NOW()
      WHERE id=$1 RETURNING *`,
    [id, reason.trim(), userId || null]
  );
  const project = result.rows[0];

  try {
    await audit.log({ user_id: userId, action: 'CANCEL_PROJECT', entity_type: 'project', entity_id: id, old_value: old, new_value: { status: 'cancelled', reason } });
  } catch (e) { console.error('[Project] Audit (cancel) failed:', e.message); }

  try {
    const members = await db.query('SELECT user_id FROM project_members WHERE project_id=$1', [id]);
    await Promise.all(members.rows.map(m =>
      notifService.createNotification({
        user_id: m.user_id, title: 'Project Cancelled',
        message: `Project "${project.name}" was cancelled and archived. Reason: ${reason.trim()}`,
        entity_type: 'project', entity_id: id,
      })
    ));
  } catch (e) { console.error('[Project] Notif (cancel) failed:', e.message); }

  emailTriggers.onProjectStatusChange({ projectId: id, projectName: project.name, status: 'cancelled', statusLabel: 'Cancelled', extra: `Reason: ${reason.trim()}` });

  try { socket.emitToProject(id, EVENTS.PROJECT_STATUS_CHANGED, project); } catch (_) {}
  return project;
};

exports.archiveProject = async (id, userId) => {
  // Archive is a non-destructive "move out of the active list" — it sets archived_at
  // and PRESERVES the project's current status (the archive list/restore/delete all
  // key off archived_at, so there is no need to overwrite status to 'cancelled',
  // which previously mislabelled archived complete/active projects as cancelled).
  const result = await db.query(
    `UPDATE projects
     SET archived_at=NOW(), archived_by=$2, updated_at=NOW()
     WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
    [id, userId || null]
  );
  if (!result.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  try {
    await audit.log({ user_id: userId, action: 'ARCHIVE_PROJECT', entity_type: 'project', entity_id: id, old_value: result.rows[0] });
  } catch (auditErr) {
    console.error('[Project] Audit log failed (non-fatal):', auditErr.message);
  }

  try { socket.emitToProject(id, EVENTS.PROJECT_STATUS_CHANGED, result.rows[0]); } catch (_) {}

  return result.rows[0];
};

exports.restoreProject = async (id, userId) => {
  // Restore (unarchive) — clears archived_at so the project reappears in the active list.
  const result = await db.query(
    `UPDATE projects
     SET status      = CASE WHEN status = 'cancelled' THEN 'initiate' ELSE status END,
         archived_at = NULL,
         archived_by = NULL,
         updated_at  = NOW()
     WHERE id=$1 AND deleted_at IS NULL RETURNING *`,
    [id]
  );
  if (!result.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  try {
    await audit.log({ user_id: userId, action: 'RESTORE_FROM_ARCHIVE', entity_type: 'project', entity_id: id, new_value: result.rows[0] });
  } catch (auditErr) {
    console.error('[Project] Audit log failed (non-fatal):', auditErr.message);
  }

  try { socket.emitToProject(id, EVENTS.PROJECT_STATUS_CHANGED, result.rows[0]); } catch (_) {}

  return result.rows[0];
};


exports.deleteProject = async (id, userId) => {
  const result = await db.query('UPDATE projects SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING *', [id]);
  if (!result.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

  try {
    await audit.log({
      user_id: userId, action: 'DELETE_PROJECT',
      entity_type: 'project', entity_id: id, old_value: result.rows[0],
    });
  } catch (auditErr) {
    console.error('[Project] Audit log failed (non-fatal):', auditErr.message);
  }

  try { socket.emitToProject(id, EVENTS.PROJECT_DELETED, { id }); } catch (_) {}

  return result.rows[0];
};
