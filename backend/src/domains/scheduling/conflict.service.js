const db = require('../../core/config/db');

/**
 * LIVE conflict detection.
 *
 * Instead of reading only the (manually-overridden) allocation_conflicts table,
 * this computes real scheduling clashes directly from current data: any time the
 * SAME pilot or the SAME drone is booked on two things whose date ranges overlap.
 *
 * "Bookings" = confirmed project allocations  +  tentative pipeline windows.
 * So it surfaces project↔project, project↔pipeline and pipeline↔pipeline clashes.
 *
 * Each returned row carries everything the UI needs to highlight + explain the
 * clash: the resource, both sides (name + kind + id) and the exact overlap window.
 */
exports.getConflicts = async () => {
  const { rows } = await db.query(`
    WITH bookings AS (
      -- Confirmed allocations
      SELECT a.id           AS entity_id,
             'project'       AS kind,
             a.pilot_id,
             a.copilot_id,
             a.drone_id,
             a.project_id    AS ref_id,
             p.name          AS ref_name,
             a.start_date    AS start_date,
             a.end_date      AS end_date
      FROM allocations a
      JOIN projects p ON p.id = a.project_id
        AND p.deleted_at  IS NULL
        AND p.archived_at IS NULL
        AND p.status NOT IN ('complete', 'cancelled')
      WHERE a.start_date IS NOT NULL
        AND a.end_date   IS NOT NULL
        AND a.end_date >= CURRENT_DATE - INTERVAL '30 days'

      UNION ALL

      -- Tentative pipeline windows
      SELECT pl.id,
             'pipeline',
             pl.tentative_pilot,
             NULL::uuid,
             pl.tentative_drone,
             pl.id,
             pl.name,
             pl.estimated_start,
             pl.estimated_end
      FROM pipeline pl
      WHERE pl.deleted_at IS NULL
        AND pl.converted_project_id IS NULL
        AND pl.stage NOT IN ('lost', 'converted', 'cancelled')
        AND pl.estimated_start IS NOT NULL
        AND pl.estimated_end   IS NOT NULL
        AND pl.estimated_end >= CURRENT_DATE - INTERVAL '30 days'
    ),
    crew_bookings AS (
      SELECT entity_id, kind, ref_id, ref_name, start_date, end_date, pilot_id   AS crew_id
      FROM bookings WHERE pilot_id IS NOT NULL
      UNION ALL
      SELECT entity_id, kind, ref_id, ref_name, start_date, end_date, copilot_id AS crew_id
      FROM bookings WHERE copilot_id IS NOT NULL
    )

    -- ── CREW double-bookings ──────────────────────────────────────────────
    SELECT
      ('pilot:' || b1.crew_id || ':' || b1.entity_id || ':' || b2.entity_id) AS id,
      CASE WHEN pi.crew_role = 'co_pilot' THEN 'copilot' ELSE 'pilot' END AS resource_type,
      pi.id          AS resource_id,
      u.name         AS resource_name,
      b1.crew_id     AS pilot_id,
      b2.crew_id     AS conflicting_pilot_id,
      NULL::uuid     AS drone_id,
      NULL::uuid     AS conflicting_drone_id,
      b1.entity_id   AS entity_a_id,
      b1.kind        AS source_a,
      b1.ref_id      AS ref_a_id,
      b1.ref_name    AS ref_a_name,
      b1.start_date::text AS start_a,
      b1.end_date::text   AS end_a,
      b2.entity_id   AS entity_b_id,
      b2.kind        AS source_b,
      b2.ref_id      AS ref_b_id,
      b2.ref_name    AS ref_b_name,
      b2.start_date::text AS start_b,
      b2.end_date::text   AS end_b,
      GREATEST(b1.start_date, b2.start_date)::text AS overlap_start,
      LEAST(b1.end_date,   b2.end_date)::text       AS overlap_end
    FROM crew_bookings b1
    JOIN crew_bookings b2
      ON b1.crew_id = b2.crew_id
     AND b1.entity_id < b2.entity_id
     AND b1.start_date <= b2.end_date
     AND b2.start_date <= b1.end_date
     -- Two allocations of the SAME project are one job window, not a clash
     AND NOT (b1.kind = 'project' AND b2.kind = 'project' AND b1.ref_id = b2.ref_id)
    JOIN pilots pi ON pi.id = b1.crew_id
    JOIN users  u  ON u.id  = pi.user_id

    UNION ALL

    -- ── DRONE double-bookings ──────────────────────────────────────────────
    SELECT
      ('drone:' || b1.entity_id || ':' || b2.entity_id),
      'drone',
      d.id,
      COALESCE(d.name, d.serial_number),
      NULL::uuid,
      NULL::uuid,
      b1.drone_id,
      b2.drone_id,
      b1.entity_id, b1.kind, b1.ref_id, b1.ref_name, b1.start_date::text, b1.end_date::text,
      b2.entity_id, b2.kind, b2.ref_id, b2.ref_name, b2.start_date::text, b2.end_date::text,
      GREATEST(b1.start_date, b2.start_date)::text,
      LEAST(b1.end_date,   b2.end_date)::text
    FROM bookings b1
    JOIN bookings b2
      ON b1.drone_id = b2.drone_id
     AND b1.entity_id < b2.entity_id
     AND b1.start_date <= b2.end_date
     AND b2.start_date <= b1.end_date
     -- Two allocations of the SAME project are one job window, not a clash
     AND NOT (b1.kind = 'project' AND b2.kind = 'project' AND b1.ref_id = b2.ref_id)
    JOIN drones d ON d.id = b1.drone_id
    WHERE b1.drone_id IS NOT NULL

    ORDER BY overlap_start ASC
  `);

  return rows.map(r => {
    const isPipeline = r.source_a === 'pipeline' || r.source_b === 'pipeline';
    return {
      ...r,
      conflict_type: isPipeline
        ? `${r.resource_type}_pipeline_overlap`
        : `${r.resource_type}_double_booking`,
      description:
        `${r.resource_name} is committed to "${r.ref_a_name}" (${r.source_a}) and ` +
        `"${r.ref_b_name}" (${r.source_b}) over the same window ` +
        `${r.overlap_start} → ${r.overlap_end}.`,
    };
  });
};

/**
 * Legacy: mark a stored override conflict resolved. Live conflicts are computed,
 * not stored, so they cannot be "resolved" with a flag — they clear once the
 * underlying allocation/pipeline dates change. Kept for the override table.
 */
exports.resolveConflict = async (id) => {
  const result = await db.query(
    'UPDATE allocation_conflicts SET resolved = true WHERE id = $1 RETURNING *',
    [id]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Conflict not found'), { statusCode: 404 });
  }
  return result.rows[0];
};
