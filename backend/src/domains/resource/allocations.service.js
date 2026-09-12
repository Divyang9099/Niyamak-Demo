const db = require('../../core/config/db');

// per_day_rate/day_rate are pay/rental-cost figures — legitimate for admin/PM
// allocation costing, not needed by a field pilot browsing the resource board.
exports.redactOverviewForViewer = (row, viewer) => {
  if (!row || !viewer) return row;
  if (viewer.role !== 'admin' && viewer.role !== 'project_manager') {
    delete row.per_day_rate;
    delete row.day_rate;
  }
  return row;
};

/**
 * Resource-first overview: ALL pilots + ALL drones, each decorated with
 * their nearest upcoming/active allocation (if one exists).
 * Returns rows even when the allocations table is empty so the UI always
 * shows every resource.
 */
exports.getResourcesOverview = async (filters = {}) => {
  const { type, search } = filters;

  const rows = await db.query(`
    SELECT
      CASE WHEN pi.crew_role = 'co_pilot' THEN 'copilot' ELSE 'pilot' END AS resource_type,
      pi.crew_role         AS crew_role,
      pi.id                AS resource_id,
      u.id                 AS pilot_user_id,
      u.name               AS resource_name,
      u.avatar_url,
      pi.status            AS resource_status,
      pi.license_number    AS resource_detail,
      pi.license_expiry,
      pi.per_day_rate,
      pi.base_location,
      NULL::text           AS make,
      NULL::text           AS serial_number,
      NULL::numeric        AS day_rate,
      NULL::date           AS next_maintenance,
      alloc.allocation_id,
      alloc.start_date,
      alloc.end_date,
      COALESCE(alloc.project_id,   mem.project_id)   AS project_id,
      COALESCE(alloc.project_name, mem.project_name) AS project_name,
      COALESCE(alloc.project_status, mem.project_status) AS project_status,
      COALESCE(alloc.project_state,  mem.project_state)  AS project_state,
      COALESCE(alloc.conflict_count, 0) AS conflict_count
    FROM pilots pi
    LEFT JOIN users u ON pi.user_id = u.id
    -- Primary: active/upcoming allocation record. Keyed off the PROJECT still being
    -- open (not complete/cancelled) rather than the allocation's own end_date — a
    -- project that overruns its originally-booked window must not make the pilot
    -- silently fall back to "Unassigned" while they're still actually on the job.
    LEFT JOIN LATERAL (
      SELECT
        a.id     AS allocation_id,
        a.start_date,
        a.end_date,
        p.id     AS project_id,
        p.name   AS project_name,
        p.status AS project_status,
        p.state  AS project_state,
        (SELECT COUNT(*) FROM allocation_conflicts
           WHERE allocation_id = a.id AND resolved = false) AS conflict_count
      FROM allocations a
      JOIN projects p ON a.project_id = p.id AND p.deleted_at IS NULL
      WHERE (a.pilot_id = pi.id OR a.copilot_id = pi.id) AND p.status NOT IN ('complete', 'cancelled')
      ORDER BY (a.end_date >= CURRENT_DATE) DESC,
               CASE WHEN a.end_date >= CURRENT_DATE THEN a.start_date END ASC,
               CASE WHEN a.end_date <  CURRENT_DATE THEN a.end_date   END DESC
      LIMIT 1
    ) alloc ON true
    -- Fallback: project membership when no allocation exists
    LEFT JOIN LATERAL (
      SELECT
        p.id     AS project_id,
        p.name   AS project_name,
        p.status AS project_status,
        p.state  AS project_state
      FROM project_members pm
      JOIN projects p ON pm.project_id = p.id
        AND p.deleted_at IS NULL
        AND p.status NOT IN ('complete', 'cancelled')
      WHERE pm.user_id = u.id
      ORDER BY p.updated_at DESC
      LIMIT 1
    ) mem ON alloc.allocation_id IS NULL
    WHERE pi.deleted_at IS NULL

    UNION ALL

    SELECT
      'drone'              AS resource_type,
      NULL::text           AS crew_role,
      d.id                 AS resource_id,
      NULL::uuid           AS pilot_user_id,
      d.name               AS resource_name,
      NULL                 AS avatar_url,
      d.status             AS resource_status,
      d.model              AS resource_detail,
      NULL::date           AS license_expiry,
      NULL::numeric        AS per_day_rate,
      NULL::text           AS base_location,
      d.make,
      d.serial_number,
      d.day_rate,
      d.next_maintenance,
      alloc.allocation_id,
      alloc.start_date,
      alloc.end_date,
      COALESCE(alloc.project_id,     tdm.project_id)     AS project_id,
      COALESCE(alloc.project_name,   tdm.project_name)   AS project_name,
      COALESCE(alloc.project_status, tdm.project_status) AS project_status,
      COALESCE(alloc.project_state,  tdm.project_state)  AS project_state,
      COALESCE(alloc.conflict_count, 0) AS conflict_count
    FROM drones d
    LEFT JOIN LATERAL (
      SELECT
        a.id     AS allocation_id,
        a.start_date,
        a.end_date,
        p.id     AS project_id,
        p.name   AS project_name,
        p.status AS project_status,
        p.state  AS project_state,
        (SELECT COUNT(*) FROM allocation_conflicts
           WHERE allocation_id = a.id AND resolved = false) AS conflict_count
      FROM allocations a
      JOIN projects p ON a.project_id = p.id AND p.deleted_at IS NULL
      WHERE a.drone_id = d.id AND p.status NOT IN ('complete', 'cancelled')
      ORDER BY (a.end_date >= CURRENT_DATE) DESC,
               CASE WHEN a.end_date >= CURRENT_DATE THEN a.start_date END ASC,
               CASE WHEN a.end_date <  CURRENT_DATE THEN a.end_date   END DESC
      LIMIT 1
    ) alloc ON true
    -- Fallback: team-drone assignment (project_drones) when the drone has no dated
    -- allocation — mirrors the pilots' project_members fallback above, so a drone
    -- attached to an open project is never wrongly shown as "Unassigned".
    LEFT JOIN LATERAL (
      SELECT
        p.id     AS project_id,
        p.name   AS project_name,
        p.status AS project_status,
        p.state  AS project_state
      FROM project_drones pd
      JOIN projects p ON pd.project_id = p.id
        AND p.deleted_at IS NULL
        AND p.status NOT IN ('complete', 'cancelled')
      WHERE pd.drone_id = d.id
      ORDER BY p.updated_at DESC
      LIMIT 1
    ) tdm ON alloc.allocation_id IS NULL
    WHERE d.deleted_at IS NULL

    ORDER BY resource_type, resource_name
  `);

  let data = rows.rows;

  if (type && type !== 'all') {
    data = data.filter(r => r.resource_type === type);
  }
  if (search) {
    const q = search.toLowerCase();
    data = data.filter(r =>
      r.resource_name?.toLowerCase().includes(q) ||
      r.resource_detail?.toLowerCase().includes(q) ||
      r.project_name?.toLowerCase().includes(q)
    );
  }

  return data;
};

/**
 * Full deployment history for a specific pilot.
 * Includes direct allocation rows (with explicit dates) UNION project-member
 * rows where no allocation row exists (uses project start/end as proxy).
 */
exports.getPilotHistory = async (pilotId) => {
  const result = await db.query(`
    SELECT * FROM (
      -- Direct allocation rows
      SELECT
        a.id              AS allocation_id,
        'allocation'      AS source,
        a.start_date,
        a.end_date,
        a.is_pipeline,
        p.id              AS project_id,
        p.name            AS project_name,
        p.status          AS project_status,
        p.state           AS project_state,
        d.id              AS drone_id,
        d.name            AS drone_name,
        d.model           AS drone_model,
        d.serial_number   AS drone_serial
      FROM allocations a
      JOIN projects p ON p.id = a.project_id AND p.deleted_at IS NULL
      LEFT JOIN drones d ON d.id = a.drone_id
      WHERE (a.pilot_id = $1 OR a.copilot_id = $1)

      UNION ALL

      -- Project-member rows (no direct allocation for same project)
      SELECT
        NULL::uuid        AS allocation_id,
        'member'          AS source,
        p.start_date,
        p.end_date,
        false             AS is_pipeline,
        p.id              AS project_id,
        p.name            AS project_name,
        p.status          AS project_status,
        p.state           AS project_state,
        NULL::uuid        AS drone_id,
        NULL::text        AS drone_name,
        NULL::text        AS drone_model,
        NULL::text        AS drone_serial
      FROM project_members pm
      JOIN projects p ON p.id = pm.project_id AND p.deleted_at IS NULL
      JOIN pilots pi ON pi.user_id = pm.user_id AND pi.id = $1
      WHERE NOT EXISTS (
        SELECT 1 FROM allocations a2
        WHERE (a2.pilot_id = $1 OR a2.copilot_id = $1) AND a2.project_id = p.id
      )
    ) combined
    ORDER BY COALESCE(start_date, '1970-01-01'::date) DESC
  `, [pilotId]);
  return result.rows;
};

/**
 * Full deployment history for a specific drone (all past + current allocations).
 */
exports.getDroneHistory = async (droneId) => {
  const result = await db.query(`
    SELECT
      a.id              AS allocation_id,
      a.start_date,
      a.end_date,
      a.is_pipeline,
      p.id              AS project_id,
      p.name            AS project_name,
      p.status          AS project_status,
      p.state           AS project_state,
      u.name            AS pilot_name,
      pi.id             AS pilot_id,
      pi.license_number AS pilot_license
    FROM allocations a
    JOIN projects p ON p.id = a.project_id AND p.deleted_at IS NULL
    LEFT JOIN pilots pi ON pi.id = a.pilot_id
    LEFT JOIN users u ON u.id = pi.user_id
    WHERE a.drone_id = $1
    ORDER BY COALESCE(a.start_date, '1970-01-01'::date) DESC
  `, [droneId]);
  return result.rows;
};

/**
 * Legacy: allocation-only view (kept for internal use / future reports)
 */
exports.getGlobalAllocations = async (filters = {}) => {
  const { status, pilot_id, drone_id } = filters;
  const conditions = ['p.deleted_at IS NULL'];
  const values = [];
  let idx = 1;
  if (status)   { conditions.push(`p.status = $${idx++}`);   values.push(status); }
  if (pilot_id) { conditions.push(`a.pilot_id = $${idx++}`); values.push(pilot_id); }
  if (drone_id) { conditions.push(`a.drone_id = $${idx++}`); values.push(drone_id); }

  const result = await db.query(
    `SELECT a.id AS allocation_id, a.start_date, a.end_date, a.is_pipeline,
            p.id AS project_id, p.name AS project_name, p.status AS project_status, p.state AS project_state,
            u.name AS pilot_name, u.email AS pilot_email,
            pi.id AS pilot_id, pi.license_number, pi.status AS pilot_status,
            d.id AS drone_id, d.name AS drone_name, d.model AS drone_model, d.status AS drone_status,
            (SELECT COUNT(*) FROM allocation_conflicts WHERE allocation_id = a.id AND resolved = false) AS conflict_count
     FROM allocations a
     JOIN projects p ON a.project_id = p.id
     LEFT JOIN pilots pi ON a.pilot_id = pi.id
     LEFT JOIN users u ON pi.user_id = u.id
     LEFT JOIN drones d ON a.drone_id = d.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.start_date DESC`,
    values
  );
  return result.rows;
};
