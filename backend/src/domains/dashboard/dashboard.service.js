const db = require('../../core/config/db');
const notifService = require('../notification/notification.service');
const { formatDateIST } = require('../../core/utils/dateUtils');
const { canViewRestrictedDocs, restrictedSqlFilter } = require('../../core/utils/docVisibility');

// admin OR super_admin. role.middleware elevates super_admin→admin everywhere else;
// the dashboard previously compared the raw role string, so super_admin fell into
// the member-scoped non-admin path (degraded view, financials stripped). Use this
// everywhere a full-admin view is intended.
const isAdmin = (u) => !!u && (u.role === 'admin' || u.role === 'super_admin');

/**
 * Scan and trigger notifications for overdue projects.
 * Pass a user object to scope to that user, or null to notify all affected users (cron mode).
 */
exports.triggerOverdueNotifications = async function triggerOverdueNotifications(user) {
    try {
        // Fetch overdue projects with their assigned members
        let projectSql = `
            SELECT p.id, p.name, p.end_date, pm.user_id
            FROM projects p
            JOIN project_members pm ON pm.project_id = p.id
            WHERE p.deleted_at IS NULL
              AND p.end_date < CURRENT_DATE
              AND p.status NOT IN ('complete', 'cancelled')
        `;
        const vals = [];

        if (user) {
            vals.push(user.id);
            projectSql += ` AND pm.user_id = $1`;
        }

        const overdue = await db.query(projectSql, vals);

        for (const row of overdue.rows) {
            // Dedup by project_id + user_id within last 24 hours (avoids re-notifying on read + spam)
            const existing = await db.query(
                `SELECT id FROM notifications
                 WHERE user_id=$1
                   AND title='Project Overdue Alert'
                   AND message LIKE $2
                   AND created_at > NOW() - INTERVAL '24 hours'`,
                [row.user_id, `%${row.id}%`]
            );
            if (existing.rows.length === 0) {
                await notifService.createNotification({
                    user_id:     row.user_id,
                    title:       'Project Overdue Alert',
                    message:     `CRITICAL: Project "${row.name}" has exceeded its deadline (${formatDateIST(row.end_date)}). Please update status.`,
                    entity_type: 'project',
                    entity_id:   row.id,
                });
            }
        }
    } catch (err) {
        console.error('Overdue check failed (non-fatal):', err.message);
    }
}

// SUMMARY
exports.getSummary = async (user) => {
  let projectFilter = '';
  let queryValues = [];

  if (user && !isAdmin(user)) {
    projectFilter = `WHERE id IN (SELECT project_id FROM project_members WHERE user_id = $1) OR id IN (SELECT project_id FROM allocations WHERE pilot_id IN (SELECT id FROM pilots WHERE user_id = $1))`;
    queryValues.push(user.id);
  }

  const [projectsRes, pipelineRes] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE status = 'initiate'        AND archived_at IS NULL) AS initiate,
        COUNT(*) FILTER (WHERE status = 'planned'         AND archived_at IS NULL) AS planned,
        COUNT(*) FILTER (WHERE status = 'on_going'        AND archived_at IS NULL) AS on_going,
        COUNT(*) FILTER (WHERE status = 'executed'        AND archived_at IS NULL) AS executed,
        COUNT(*) FILTER (WHERE status = 'post_processing' AND archived_at IS NULL) AS post_processing,
        COUNT(*) FILTER (WHERE status = 'complete')                                AS complete,
        COUNT(*) FILTER (WHERE status = 'cancelled')                               AS cancelled,
        COUNT(*) FILTER (
          WHERE needs_attention = TRUE
            AND status NOT IN ('complete','cancelled')
            AND archived_at IS NULL
        )                                                    AS needs_attention,
        COUNT(*) FILTER (
          WHERE end_date < CURRENT_DATE
            AND status NOT IN ('complete', 'cancelled')
            AND archived_at IS NULL
        )                                                    AS overdue,
        COALESCE(SUM(project_value), 0)                                                                     AS total_project_value,
        COALESCE(SUM(project_value) FILTER (WHERE status = 'initiate' AND archived_at IS NULL), 0)          AS initiate_value,
        COALESCE(SUM(project_value) FILTER (WHERE status = 'planned'  AND archived_at IS NULL), 0)          AS planned_value,
        COALESCE(SUM(project_value) FILTER (WHERE status = 'on_going' AND archived_at IS NULL), 0)          AS on_going_value,
        COALESCE(SUM(project_value) FILTER (WHERE status = 'executed' AND archived_at IS NULL), 0)          AS executed_value,
        COALESCE(SUM(project_value) FILTER (WHERE status = 'complete'), 0)                                  AS complete_value,
        COALESCE(SUM(project_value) FILTER (
          WHERE end_date < CURRENT_DATE
            AND status NOT IN ('complete', 'cancelled')
            AND archived_at IS NULL
        ), 0)                                                                                               AS overdue_value
      FROM projects
      WHERE deleted_at IS NULL AND status != 'cancelled' ${projectFilter ? `AND (${projectFilter.replace('WHERE ', '')})` : ''}
    `, queryValues),
    db.query(`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE stage = 'inquiry')            AS inquiry,
        COUNT(*) FILTER (WHERE stage = 'commercial_proposal') AS commercial_proposal,
        COUNT(*) FILTER (WHERE stage = 'pre_confirmation')   AS pre_confirmation,
        COUNT(*) FILTER (WHERE stage = 'onboarding')         AS onboarding,
        COALESCE(SUM(estimated_value), 0)                    AS total_estimated_value
      FROM pipeline
      WHERE deleted_at IS NULL AND converted_project_id IS NULL AND stage != 'cancelled'
    `),
  ]);

  const result = {
    projects: projectsRes.rows[0],
    pipeline:  pipelineRes.rows[0],
  };

  // Financial KPI values (₹) are ADMIN-ONLY. Never expose monetary figures to
  // pilots or project managers — strip the summed *_value fields (counts stay).
  if (!isAdmin(user)) {
    const p = result.projects || {};
    for (const k of ['total_project_value', 'initiate_value', 'planned_value',
                     'on_going_value', 'executed_value', 'complete_value', 'overdue_value']) {
      delete p[k];
    }
    if (result.pipeline) {
      if (user && user.role === 'project_manager') {
        // PMs may see pipeline counts, but never the summed ₹ value.
        delete result.pipeline.total_estimated_value;
      } else {
        // Pilots have no pipeline access (the pipeline module is admin/PM-only),
        // so drop the whole object — not just its value — including stage counts.
        delete result.pipeline;
      }
    }
  }

  return result;
};

// PROJECT LIST (FILTERED + SAFE PARAMETERIZED)
exports.getProjects = async (query, user) => {
  const conditions = ['deleted_at IS NULL', "status != 'cancelled'"];
  const values     = [];

  // include_archived=true → also surface archived projects (e.g. completed work
  // that's been archived) — used by the dashboard map, which should plot every
  // project regardless of archive state.
  const includeArchived = query.include_archived === 'true' || query.include_archived === true;
  if (!includeArchived) conditions.push('archived_at IS NULL');

  if (user && !isAdmin(user)) {
    values.push(user.id);
    conditions.push(`(id IN (SELECT project_id FROM project_members WHERE user_id = $${values.length}) OR id IN (SELECT project_id FROM allocations WHERE pilot_id IN (SELECT id FROM pilots WHERE user_id = $${values.length})))`);
  }

  if (query.status) {
    // Support a single status ("in_progress") or a comma-separated set ("enquiry,confirmed")
    const statuses = String(query.status).split(',').map(s => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      values.push(statuses[0]);
      conditions.push(`status = $${values.length}`);
    } else if (statuses.length > 1) {
      const placeholders = statuses.map(s => { values.push(s); return `$${values.length}`; });
      conditions.push(`status IN (${placeholders.join(', ')})`);
    }
  }

  if (query.type) {
    values.push(query.type);
    conditions.push(`project_type = $${values.length}`);
  }

  if (query.state) {
    values.push(query.state);
    conditions.push(`state = $${values.length}`);
  }

  if (query.search) {
    const term = `%${query.search}%`;
    values.push(term);
    const p = `$${values.length}`;
    conditions.push(`(name ILIKE ${p} OR client_name ILIKE ${p} OR COALESCE(po_number, '') ILIKE ${p})`);
  }

  if (query.overdue === 'true') {
    conditions.push(`end_date < CURRENT_DATE AND status NOT IN ('complete', 'cancelled')`);
  }

  if (query.needs_attention === 'true') {
    conditions.push(`needs_attention = TRUE AND status NOT IN ('complete','cancelled')`);
  }

  if (query.period === '24h') {
    conditions.push(`created_at > NOW() - INTERVAL '24 hours'`);
  }

  const allowedSortFields = ['created_at', 'name', 'status', 'start_date', 'end_date'];
  const sortField = allowedSortFields.includes(query.sort_by) ? query.sort_by : 'created_at';
  const sortDir   = query.sort_dir === 'asc' ? 'ASC' : 'DESC';

  let limit = query.limit ? parseInt(query.limit) : 25; // Default to 25
  let offset = query.offset ? parseInt(query.offset) : 0;

  // 🛡️ SECURITY: Enforce bounds on limit
  if (isNaN(limit) || limit <= 0) limit = 25;
  if (limit > 100) limit = 100; // Hard cap at 100 for safety
  if (isNaN(offset) || offset < 0) offset = 0;

  values.push(limit, offset);

  const sql = `
    SELECT * FROM projects
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${sortField} ${sortDir}
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const result = await db.query(sql, values);
  return result.rows;
};

// SINGLE PROJECT SUMMARY FOR DASHBOARD (ROLE-SCOPED)
exports.getProjectDetails = async (projectId, user) => {
  if (!user) {
    throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
  }

  const values = [projectId];
  let membershipFilter = '';

  if (!isAdmin(user)) {
    values.push(user.id);
    membershipFilter = `
      AND (p.id IN (
        SELECT pm.project_id
        FROM project_members pm
        WHERE pm.user_id = $2
      ) OR p.id IN (
        SELECT a.project_id
        FROM allocations a
        WHERE a.pilot_id IN (SELECT pl.id FROM pilots pl WHERE pl.user_id = $2)
      ))
    `;
  }

  // The document count must match the list the caller can actually open, so
  // restricted (Commercial) documents are excluded for anyone who cannot see them.
  const includeRestricted = await canViewRestrictedDocs(user, projectId);
  const docFilter = restrictedSqlFilter('d.category', includeRestricted, values.length + 1);
  values.push(...docFilter.params);

  const result = await db.query(
    `SELECT p.*,
            (SELECT COUNT(*) FROM allocations a WHERE a.project_id = p.id) as total_allocations,
            (SELECT COUNT(*) FROM project_documents d
              WHERE d.project_id = p.id AND ${docFilter.text}) as total_documents,
            (SELECT COUNT(*) FROM deliverables del WHERE del.project_id = p.id) as total_deliverables
     FROM projects p
     WHERE p.id = $1 AND p.deleted_at IS NULL
     ${membershipFilter}`,
    values
  );

  if (!result.rows.length) {
    throw Object.assign(new Error('Project not found or access denied.'), { statusCode: 404 });
  }

  return result.rows[0];
};

// RECENT ACTIVITY (ROLE-SCOPED)
exports.getActivity = async (user) => {
  const conditions = [`a.action NOT IN ('DOWNLOAD')`];
  const values = [];

  if (user && !isAdmin(user)) {
    values.push(user.id);
    const uidParam = `$${values.length}`;

    // Non-admin users only see own/team/assigned-project relevant activity
    conditions.push(`(
      a.user_id = ${uidParam}
      OR (
        a.entity_type = 'project'
        AND a.entity_id IN (
          SELECT pm.project_id FROM project_members pm WHERE pm.user_id = ${uidParam}
        )
      )
      OR (
        a.entity_type = 'deliverable'
        AND a.entity_id IN (
          SELECT d.id
          FROM deliverables d
          WHERE d.project_id IN (
            SELECT pm.project_id FROM project_members pm WHERE pm.user_id = ${uidParam}
          )
        )
      )
      OR (
        a.entity_type = 'allocation'
        AND a.entity_id IN (
          SELECT al.id
          FROM allocations al
          WHERE al.project_id IN (
            SELECT pm.project_id FROM project_members pm WHERE pm.user_id = ${uidParam}
          )
        )
      )
    )`);
  }

  const result = await db.query(
    `
    SELECT a.*, u.name AS user_name
    FROM activity_logs a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.created_at DESC
    LIMIT 15
    `,
    values
  );

  return result.rows;
};

// RESOURCE UTILIZATION (ADMIN FULL, PM SCOPED, PILOT FORBIDDEN)
exports.getUtilization = async (user) => {
  if (!user) {
    throw Object.assign(new Error('Authentication required.'), { statusCode: 401 });
  }

  if (user.role === 'pilot') {
    throw Object.assign(new Error('Access denied. Utilization is not available for pilot role.'), { statusCode: 403 });
  }

  // Admin: full system utilization
  if (isAdmin(user)) {
    const result = await db.query(`
      SELECT
        pl.id                       AS pilot_id,
        u.name                      AS pilot_name,
        COUNT(a.id)                 AS total_allocations,
        COUNT(DISTINCT a.project_id) AS project_count,
        COALESCE(SUM(a.end_date - a.start_date), 0) AS total_days_allocated
      FROM pilots pl
      LEFT JOIN users u ON pl.user_id = u.id
      LEFT JOIN allocations a ON pl.id = a.pilot_id AND EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = a.project_id
          AND p.deleted_at IS NULL
          AND p.archived_at IS NULL
          AND p.status != 'cancelled'
      )
      GROUP BY pl.id, u.name
      ORDER BY total_allocations DESC
    `);
    return result.rows;
  }

  // Project Manager: scoped to pilots allocated on PM's projects
  const result = await db.query(
    `
    SELECT
      pl.id                       AS pilot_id,
      u.name                      AS pilot_name,
      COUNT(a.id)                 AS total_allocations,
      COUNT(DISTINCT a.project_id) AS project_count,
      COALESCE(SUM(a.end_date - a.start_date), 0) AS total_days_allocated
    FROM pilots pl
    LEFT JOIN users u ON pl.user_id = u.id
    LEFT JOIN allocations a ON pl.id = a.pilot_id AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = a.project_id
        AND p.deleted_at IS NULL
        AND p.archived_at IS NULL
        AND p.status != 'cancelled'
        AND p.id IN (
          SELECT pm.project_id FROM project_members pm WHERE pm.user_id = $1
        )
    )
    GROUP BY pl.id, u.name
    ORDER BY total_allocations DESC
    `,
    [user.id]
  );

  return result.rows;
};

// UPCOMING PROJECTS (next 30 days)
exports.getUpcoming = async (user) => {
  let projectFilter = '1=1';
  let queryValues = [];

  if (user && !isAdmin(user)) {
    queryValues.push(user.id);
    projectFilter = `(id IN (SELECT project_id FROM project_members WHERE user_id = $1) OR id IN (SELECT project_id FROM allocations WHERE pilot_id IN (SELECT id FROM pilots WHERE user_id = $1)))`;
  }

  const result = await db.query(`
    SELECT * FROM projects
    WHERE deleted_at IS NULL AND archived_at IS NULL AND status != 'cancelled'
      AND start_date >= CURRENT_DATE
      AND start_date <= CURRENT_DATE + INTERVAL '30 days'
      AND ${projectFilter}
    ORDER BY start_date ASC
    LIMIT 10
  `, queryValues);
  return result.rows;
};

// ALERTS (starting soon + unallocated confirmed + expiring docs)
exports.getAlerts = async (user) => {
  let roleFilter = '1=1';
  const vals = [];

  if (user && !isAdmin(user)) {
    vals.push(user.id);
    roleFilter = `(p.id IN (SELECT project_id FROM project_members WHERE user_id = $1) OR p.id IN (SELECT project_id FROM allocations WHERE pilot_id IN (SELECT id FROM pilots WHERE user_id = $1)))`;
  }

  // 1. Projects starting in next 7 days
  const startingSoon = await db.query(`
    SELECT p.id, p.name, p.client_name, p.status, p.project_type, p.start_date
    FROM projects p
    WHERE p.deleted_at IS NULL AND p.archived_at IS NULL
      AND p.start_date >= CURRENT_DATE
      AND p.start_date <= CURRENT_DATE + INTERVAL '7 days'
      AND p.status NOT IN ('complete', 'cancelled')
      AND ${roleFilter}
    ORDER BY p.start_date ASC
    LIMIT 10
  `, vals);

  // 2. Planned projects with zero allocations (unallocated)
  const unallocated = await db.query(`
    SELECT p.id, p.name, p.client_name, p.start_date, p.end_date
    FROM projects p
    WHERE p.deleted_at IS NULL AND p.archived_at IS NULL
      AND p.status = 'planned'
      AND ${roleFilter}
      AND NOT EXISTS (
        SELECT 1 FROM allocations a WHERE a.project_id = p.id
      )
    ORDER BY p.start_date ASC
    LIMIT 10
  `, vals);

  // 3. Expiring library documents — placeholder until expiry_date column is added
  const expiringDocs = [];

  return {
    starting_soon:       startingSoon.rows,
    unallocated_confirmed: unallocated.rows,
    expiring_docs:       expiringDocs,
  };
};

// ── REMINDERS — full operational alert centre covering all modules ───────────
// Categories: projects (overdue/timeline/attention/unallocated),
//   resources (pilot license, drone maintenance & insurance),
//   deliverables (pending approval), pipeline (overdue leads / starting soon),
//   allocations (conflicts + over-scheduling)
exports.getReminders = async (user) => {
  const isPilot = user && user.role === 'pilot';

  let roleFilter = '1=1';
  const vals = [];
  if (user && !isAdmin(user)) {
    vals.push(user.id);
    roleFilter = `(p.id IN (SELECT project_id FROM project_members WHERE user_id = $1)
                  OR p.id IN (SELECT project_id FROM allocations WHERE pilot_id IN (SELECT id FROM pilots WHERE user_id = $1)))`;
  }

  const skip = Promise.resolve({ rows: [] });

  const [
    overdue, startingToday, startingWeek,
    endingWeek, endingMonth,
    needsAttention, unallocated,
    pilotLicenseExpiry, droneMaintenance, droneInsuranceExpiry,
    deliverablesPending,
    conflicts, overscheduled,
    pipelineThisWeek, pipelineOverdue,
  ] = await Promise.all([

    // ── PROJECTS ──────────────────────────────────────────────────────────────

    // 1. Overdue (past end_date, not complete/cancelled)
    db.query(`
      SELECT p.id, p.name, p.client_name, p.status, p.end_date
      FROM projects p
      WHERE p.deleted_at IS NULL AND p.archived_at IS NULL AND p.end_date < CURRENT_DATE
        AND p.status NOT IN ('complete','cancelled') AND ${roleFilter}
      ORDER BY p.end_date ASC LIMIT 25`, vals),

    // 2. Starting today
    db.query(`
      SELECT p.id, p.name, p.client_name, p.status, p.start_date
      FROM projects p
      WHERE p.deleted_at IS NULL AND p.archived_at IS NULL AND p.start_date = CURRENT_DATE
        AND p.status NOT IN ('complete','cancelled') AND ${roleFilter}
      ORDER BY p.name ASC LIMIT 25`, vals),

    // 3. Starting in next 7 days (excludes today)
    db.query(`
      SELECT p.id, p.name, p.client_name, p.status, p.start_date
      FROM projects p
      WHERE p.deleted_at IS NULL AND p.archived_at IS NULL
        AND p.start_date > CURRENT_DATE
        AND p.start_date <= CURRENT_DATE + INTERVAL '7 days'
        AND p.status NOT IN ('complete','cancelled') AND ${roleFilter}
      ORDER BY p.start_date ASC LIMIT 25`, vals),

    // 4. Ending this week (today → +7 days, deadline approaching)
    db.query(`
      SELECT p.id, p.name, p.client_name, p.status, p.end_date
      FROM projects p
      WHERE p.deleted_at IS NULL AND p.archived_at IS NULL
        AND p.end_date >= CURRENT_DATE
        AND p.end_date <= CURRENT_DATE + INTERVAL '7 days'
        AND p.status NOT IN ('complete','cancelled') AND ${roleFilter}
      ORDER BY p.end_date ASC LIMIT 25`, vals),

    // 5. Ending this month (8–30 days out)
    db.query(`
      SELECT p.id, p.name, p.client_name, p.status, p.end_date
      FROM projects p
      WHERE p.deleted_at IS NULL AND p.archived_at IS NULL
        AND p.end_date > CURRENT_DATE + INTERVAL '7 days'
        AND p.end_date <= CURRENT_DATE + INTERVAL '30 days'
        AND p.status NOT IN ('complete','cancelled') AND ${roleFilter}
      ORDER BY p.end_date ASC LIMIT 25`, vals),

    // 6. Needs attention (converted from pipeline, details incomplete)
    db.query(`
      SELECT p.id, p.name, p.client_name, p.status, p.start_date
      FROM projects p
      WHERE p.deleted_at IS NULL AND p.archived_at IS NULL AND p.needs_attention = TRUE
        AND p.status NOT IN ('complete','cancelled') AND ${roleFilter}
      ORDER BY p.created_at DESC LIMIT 25`, vals),

    // 7. Planned but zero allocations (nobody assigned yet)
    db.query(`
      SELECT p.id, p.name, p.client_name, p.start_date, p.end_date
      FROM projects p
      WHERE p.deleted_at IS NULL AND p.archived_at IS NULL AND p.status = 'planned'
        AND ${roleFilter}
        AND NOT EXISTS (SELECT 1 FROM allocations a WHERE a.project_id = p.id)
      ORDER BY p.start_date ASC NULLS LAST LIMIT 25`, vals),

    // ── RESOURCES ─────────────────────────────────────────────────────────────

    // 8. Pilot license expiring within 30 days
    isPilot ? skip : db.query(`
      SELECT pl.id, u.name, pl.license_expiry, pl.license_number
      FROM pilots pl
      JOIN users u ON pl.user_id = u.id AND u.deleted_at IS NULL
      WHERE pl.deleted_at IS NULL AND pl.status = 'active'
        AND pl.license_expiry IS NOT NULL
        AND pl.license_expiry >= CURRENT_DATE
        AND pl.license_expiry <= CURRENT_DATE + INTERVAL '30 days'
      ORDER BY pl.license_expiry ASC LIMIT 20`),

    // 9. Drone maintenance due within the next 7 days (upcoming only — a past
    //    next_maintenance date is just a logged record, not an active reminder)
    isPilot ? skip : db.query(`
      SELECT d.id, d.serial_number, d.name AS drone_name, d.model, d.next_maintenance
      FROM drones d
      WHERE d.deleted_at IS NULL AND d.status = 'active'
        AND d.next_maintenance IS NOT NULL
        AND d.next_maintenance >= CURRENT_DATE
        AND d.next_maintenance <= CURRENT_DATE + INTERVAL '7 days'
      ORDER BY d.next_maintenance ASC LIMIT 20`),

    // 10. Drone insurance expiring within 30 days
    isPilot ? skip : db.query(`
      SELECT d.id, d.serial_number, d.name AS drone_name, d.model, d.insurance_expiry
      FROM drones d
      WHERE d.deleted_at IS NULL AND d.status != 'retired'
        AND d.insurance_expiry IS NOT NULL
        AND d.insurance_expiry >= CURRENT_DATE
        AND d.insurance_expiry <= CURRENT_DATE + INTERVAL '30 days'
      ORDER BY d.insurance_expiry ASC LIMIT 20`),

    // ── DELIVERABLES ──────────────────────────────────────────────────────────

    // 11. Deliverables uploaded but awaiting approval for >1 day
    db.query(`
      SELECT del.id, del.name, del.status, del.uploaded_at,
             p.id AS project_id, p.name AS project_name
      FROM deliverables del
      JOIN projects p ON del.project_id = p.id
      WHERE p.deleted_at IS NULL AND p.archived_at IS NULL
        AND del.is_folder IS NOT TRUE
        AND del.status = 'uploaded'
        AND del.uploaded_at < NOW() - INTERVAL '1 day'
        AND p.status NOT IN ('complete','cancelled')
        AND ${roleFilter}
      ORDER BY del.uploaded_at ASC LIMIT 25`, vals),

    // ── ALLOCATION CONFLICTS ──────────────────────────────────────────────────

    // 12. Unresolved allocation conflicts (overrides logged)
    isPilot ? skip : db.query(`
      SELECT ac.id, ac.conflict_type, ac.override_reason, ac.overridden_at,
             p.id AS project_id, p.name AS project_name
      FROM allocation_conflicts ac
      JOIN allocations a ON ac.allocation_id = a.id
      JOIN projects p ON a.project_id = p.id
      WHERE p.deleted_at IS NULL AND p.archived_at IS NULL
        AND p.status NOT IN ('complete','cancelled')
        AND ac.resolved = FALSE
      ORDER BY ac.overridden_at DESC NULLS LAST LIMIT 25`),

    // 13. Over-scheduled: same pilot or drone on overlapping windows
    isPilot ? skip : db.query(`
      SELECT DISTINCT
        a1.id,
        COALESCE(u.name, 'Pilot') AS pilot_name,
        d.serial_number AS drone_serial,
        p1.name AS project_a, p2.name AS project_b,
        a1.start_date, a1.end_date
      FROM allocations a1
      JOIN allocations a2
        ON a1.id < a2.id
       AND a1.start_date <= a2.end_date AND a1.end_date >= a2.start_date
       AND ((a1.pilot_id IS NOT NULL AND a1.pilot_id = a2.pilot_id)
         OR (a1.drone_id IS NOT NULL AND a1.drone_id = a2.drone_id))
      JOIN projects p1 ON a1.project_id = p1.id AND p1.deleted_at IS NULL AND p1.archived_at IS NULL
      JOIN projects p2 ON a2.project_id = p2.id AND p2.deleted_at IS NULL AND p2.archived_at IS NULL
      LEFT JOIN pilots pl ON a1.pilot_id = pl.id AND pl.deleted_at IS NULL
      LEFT JOIN users u ON pl.user_id = u.id AND u.deleted_at IS NULL
      LEFT JOIN drones d ON a1.drone_id = d.id AND d.deleted_at IS NULL
      WHERE p1.status NOT IN ('complete','cancelled')
        AND p2.status NOT IN ('complete','cancelled')
      ORDER BY a1.start_date ASC LIMIT 25`),

    // ── PIPELINE ──────────────────────────────────────────────────────────────

    // 14. Pipeline leads with estimated_start this week (action required soon)
    isPilot ? skip : db.query(`
      SELECT pl.id, pl.name, pl.client_name, pl.stage, pl.estimated_start
      FROM pipeline pl
      WHERE pl.stage NOT IN ('converted','cancelled')
        AND pl.estimated_start IS NOT NULL
        AND pl.estimated_start >= CURRENT_DATE
        AND pl.estimated_start <= CURRENT_DATE + INTERVAL '7 days'
      ORDER BY pl.estimated_start ASC LIMIT 20`),

    // 15. Pipeline leads with estimated_end overdue (not converted/cancelled)
    isPilot ? skip : db.query(`
      SELECT pl.id, pl.name, pl.client_name, pl.stage, pl.estimated_end
      FROM pipeline pl
      WHERE pl.stage NOT IN ('converted','cancelled')
        AND pl.estimated_end IS NOT NULL
        AND pl.estimated_end < CURRENT_DATE
      ORDER BY pl.estimated_end ASC LIMIT 20`),
  ]);

  const groups = [
    overdue, startingToday, startingWeek, endingWeek, endingMonth,
    needsAttention, unallocated,
    pilotLicenseExpiry, droneMaintenance, droneInsuranceExpiry,
    deliverablesPending, conflicts, overscheduled,
    pipelineThisWeek, pipelineOverdue,
  ];

  return {
    overdue:                overdue.rows,
    starting_today:         startingToday.rows,
    starting_week:          startingWeek.rows,
    ending_week:            endingWeek.rows,
    ending_month:           endingMonth.rows,
    needs_attention:        needsAttention.rows,
    unallocated:            unallocated.rows,
    pilot_license_expiry:   pilotLicenseExpiry.rows,
    drone_maintenance:      droneMaintenance.rows,
    drone_insurance_expiry: droneInsuranceExpiry.rows,
    deliverables_pending:   deliverablesPending.rows,
    conflicts:              conflicts.rows,
    overscheduled:          overscheduled.rows,
    pipeline_this_week:     pipelineThisWeek.rows,
    pipeline_overdue:       pipelineOverdue.rows,
    total: groups.reduce((acc, r) => acc + r.rows.length, 0),
  };
};

// ── DRONE UTILIZATION — replaces the status-breakdown widget ────────────────
exports.getDroneUtilization = async (user) => {
  if (user && user.role === 'pilot') {
    throw Object.assign(new Error('Access denied.'), { statusCode: 403 });
  }
  const result = await db.query(`
    SELECT
      d.id            AS drone_id,
      d.serial_number,
      d.name          AS drone_name,
      d.model,
      d.status,
      COUNT(a.id)                                  AS total_allocations,
      COUNT(DISTINCT a.project_id)                 AS project_count,
      COALESCE(SUM(a.end_date - a.start_date), 0)  AS total_days_allocated,
      COUNT(a.id) FILTER (
        WHERE a.start_date <= CURRENT_DATE AND a.end_date >= CURRENT_DATE
      ) > 0                                        AS active_now
    FROM drones d
    LEFT JOIN allocations a ON d.id = a.drone_id AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = a.project_id
        AND p.deleted_at IS NULL
        AND p.archived_at IS NULL
        AND p.status != 'cancelled'
    )
    WHERE d.deleted_at IS NULL
    GROUP BY d.id, d.serial_number, d.name, d.model, d.status
    ORDER BY total_days_allocated DESC
  `);
  return result.rows;
};

// ── PILOT GANTT ──────────────────────────────────────────────────────────────
exports.getPilotGantt = async (user, query) => {
  if (user && user.role === 'pilot') {
    throw Object.assign(new Error('Access denied.'), { statusCode: 403 });
  }

  // Accept days param from frontend (30/60/90/180/365), cap at 365
  const futureDays = Math.min(Math.max(Number(query?.days) || 180, 30), 365);

  const pilotsRes = await db.query(`
    SELECT pl.id AS pilot_id, COALESCE(u.name, 'Unknown') AS pilot_name, pl.status AS pilot_status
    FROM pilots pl
    LEFT JOIN users u ON pl.user_id = u.id
    WHERE pl.status != 'inactive'
    ORDER BY u.name
  `);

  // Direct allocations (pilot allocated to project with explicit dates)
  const allocRes = await db.query(`
    SELECT
      a.pilot_id,
      p.id          AS project_id,
      p.name        AS project_name,
      p.status      AS project_status,
      a.start_date::text,
      a.end_date::text,
      'allocation'  AS source
    FROM allocations a
    JOIN projects p ON p.id = a.project_id
    WHERE a.pilot_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND p.archived_at IS NULL
      AND p.status != 'cancelled'
      AND a.start_date IS NOT NULL
      AND a.end_date   IS NOT NULL
      AND a.start_date <= CURRENT_DATE + ($1 || ' days')::interval
      AND a.end_date   >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY a.start_date
  `, [futureDays]);

  // Project membership — pilots who are project members but may not have an explicit allocation row
  // Use project start_date/end_date as the bar span
  const memberRes = await db.query(`
    SELECT
      pl.id         AS pilot_id,
      p.id          AS project_id,
      p.name        AS project_name,
      p.status      AS project_status,
      p.start_date::text,
      p.end_date::text,
      'member'      AS source
    FROM project_members pm
    JOIN pilots pl ON pl.user_id = pm.user_id
    JOIN projects p ON p.id = pm.project_id
    WHERE p.deleted_at IS NULL
      AND p.archived_at IS NULL
      AND p.status != 'cancelled'
      AND p.start_date IS NOT NULL
      AND p.end_date   IS NOT NULL
      AND p.start_date <= CURRENT_DATE + ($1 || ' days')::interval
      AND p.end_date   >= CURRENT_DATE - INTERVAL '30 days'
      -- exclude pilots already covered by a direct allocation on same project
      AND NOT EXISTS (
        SELECT 1 FROM allocations a2
        WHERE a2.pilot_id = pl.id AND a2.project_id = p.id
      )
    ORDER BY p.start_date
  `, [futureDays]);

  // Calendar events (leave / expo / training / maintenance)
  const eventRes = await db.query(`
    SELECT
      resource_id  AS pilot_id,
      title,
      event_type,
      start_date::text,
      end_date::text
    FROM calendar_events
    WHERE resource_type = 'pilot'
      AND event_type IN ('leave','expo','training','maintenance','meeting')
      AND start_date <= CURRENT_DATE + ($1 || ' days')::interval
      AND end_date   >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY start_date
  `, [futureDays]);

  // Pipeline leads tentatively assigned to this pilot
  const pilotPipelineRes = await db.query(`
    SELECT
      tentative_pilot AS pilot_id,
      id              AS pipeline_id,
      name            AS project_name,
      estimated_start::text AS start_date,
      estimated_end::text   AS end_date,
      'pipeline'      AS source
    FROM pipeline
    WHERE tentative_pilot IS NOT NULL
      AND deleted_at IS NULL
      AND converted_project_id IS NULL
      AND stage NOT IN ('lost', 'converted', 'cancelled')
      AND estimated_start IS NOT NULL
      AND estimated_end   IS NOT NULL
      AND estimated_start <= CURRENT_DATE + ($1 || ' days')::interval
      AND estimated_end   >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY estimated_start
  `, [futureDays]);

  const allocMap = {};
  for (const a of [...allocRes.rows, ...memberRes.rows]) {
    (allocMap[a.pilot_id] = allocMap[a.pilot_id] || []).push(a);
  }
  const eventMap = {};
  for (const e of eventRes.rows) {
    (eventMap[e.pilot_id] = eventMap[e.pilot_id] || []).push(e);
  }
  const pipelineMap = {};
  for (const p of pilotPipelineRes.rows) {
    (pipelineMap[p.pilot_id] = pipelineMap[p.pilot_id] || []).push(p);
  }

  return pilotsRes.rows.map(p => ({
    ...p,
    allocations: allocMap[p.pilot_id] || [],
    events:      eventMap[p.pilot_id] || [],
    pipeline:    pipelineMap[p.pilot_id] || [],
  }));
};

// ── DRONE GANTT ───────────────────────────────────────────────────────────────
exports.getDroneGantt = async (user, query) => {
  if (user && user.role === 'pilot') {
    throw Object.assign(new Error('Access denied.'), { statusCode: 403 });
  }

  const futureDays = Math.min(Math.max(Number(query?.days) || 180, 30), 365);

  const dronesRes = await db.query(`
    SELECT d.id AS drone_id,
           COALESCE(d.name, d.serial_number, 'Drone') AS drone_name,
           d.model, d.status AS drone_status
    FROM drones d
    WHERE d.deleted_at IS NULL AND d.status != 'retired'
    ORDER BY d.serial_number, d.name
  `);

  const allocRes = await db.query(`
    SELECT
      a.drone_id,
      p.id         AS project_id,
      p.name       AS project_name,
      p.status     AS project_status,
      a.start_date::text,
      a.end_date::text,
      'allocation' AS source
    FROM allocations a
    JOIN projects p ON p.id = a.project_id
    WHERE a.drone_id IS NOT NULL
      AND p.deleted_at IS NULL
      AND p.archived_at IS NULL
      AND p.status != 'cancelled'
      AND a.start_date IS NOT NULL
      AND a.end_date   IS NOT NULL
      AND a.start_date <= CURRENT_DATE + ($1 || ' days')::interval
      AND a.end_date   >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY a.start_date
  `, [futureDays]);

  const eventRes = await db.query(`
    SELECT
      resource_id  AS drone_id,
      title,
      event_type,
      start_date::text,
      end_date::text
    FROM calendar_events
    WHERE resource_type = 'drone'
      AND event_type IN ('maintenance','leave','expo','training')
      AND start_date <= CURRENT_DATE + ($1 || ' days')::interval
      AND end_date   >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY start_date
  `, [futureDays]);

  // Pipeline leads tentatively assigned to this drone
  const dronePipelineRes = await db.query(`
    SELECT
      tentative_drone AS drone_id,
      id              AS pipeline_id,
      name            AS project_name,
      estimated_start::text AS start_date,
      estimated_end::text   AS end_date,
      'pipeline'      AS source
    FROM pipeline
    WHERE tentative_drone IS NOT NULL
      AND deleted_at IS NULL
      AND converted_project_id IS NULL
      AND stage NOT IN ('lost', 'converted', 'cancelled')
      AND estimated_start IS NOT NULL
      AND estimated_end   IS NOT NULL
      AND estimated_start <= CURRENT_DATE + ($1 || ' days')::interval
      AND estimated_end   >= CURRENT_DATE - INTERVAL '30 days'
    ORDER BY estimated_start
  `, [futureDays]);

  const allocMap = {};
  for (const a of allocRes.rows) {
    (allocMap[a.drone_id] = allocMap[a.drone_id] || []).push(a);
  }
  const eventMap = {};
  for (const e of eventRes.rows) {
    (eventMap[e.drone_id] = eventMap[e.drone_id] || []).push(e);
  }
  const pipelineMap = {};
  for (const p of dronePipelineRes.rows) {
    (pipelineMap[p.drone_id] = pipelineMap[p.drone_id] || []).push(p);
  }

  return dronesRes.rows.map(d => ({
    ...d,
    allocations: allocMap[d.drone_id] || [],
    events:      eventMap[d.drone_id] || [],
    pipeline:    pipelineMap[d.drone_id] || [],
  }));
};

// EXPORT GLOBAL DATA
exports.exportGlobalData = async (user) => {
  let projectFilter = '1=1';
  const values = [];

  if (user && !isAdmin(user)) {
    values.push(user.id);
    projectFilter = `(id IN (SELECT project_id FROM project_members WHERE user_id = $1) OR id IN (SELECT project_id FROM allocations WHERE pilot_id IN (SELECT id FROM pilots WHERE user_id = $1)))`;
  }

  const result = await db.query(`
    SELECT id, name, client_name, project_type, status, state, district,
           start_date, end_date, po_number, created_at
    FROM projects WHERE deleted_at IS NULL AND ${projectFilter} ORDER BY created_at DESC
  `, values);
  const projects = result.rows;

  if (!projects || projects.length === 0) {
    return "No Data";
  }

  // Fixed, ordered column set (TC-DASH-07): id, name, client, type, status, state, district, dates, PO, created
  const columns = [
    { key: 'id',                header: 'ID' },
    { key: 'name',              header: 'Name' },
    { key: 'client_name',       header: 'Client' },
    { key: 'project_type',      header: 'Type' },
    { key: 'status',            header: 'Status' },
    { key: 'state',             header: 'State' },
    { key: 'district',          header: 'District' },
    { key: 'start_date',        header: 'Start Date' },
    { key: 'end_date',          header: 'End Date' },
    { key: 'po_number',         header: 'PO Number' },
    { key: 'created_at',        header: 'Created' },
  ];

  const esc = (val) => {
    if (val === null || val === undefined) return '""';
    let s = String(val);
    // Spreadsheet-formula injection guard: a value starting with = + - @ (or tab/CR)
    // is executed as a formula when the CSV is opened in Excel/LibreOffice. These
    // columns (name/client/po_number/state/district) are user-supplied, so prefix
    // such values with a single quote to force text interpretation (OWASP guidance).
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const headers = columns.map(c => c.header).join(',');
  const rows = projects.map(p => columns.map(c => esc(p[c.key])).join(','));

  return [headers, ...rows].join('\n');
};
