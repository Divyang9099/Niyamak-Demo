const db = require('../../core/config/db');

// Accept either a single value or a comma-separated list; return null or an array.
const toArray = (v) => {
  if (v === undefined || v === null || v === '') return null;
  if (Array.isArray(v)) return v.filter(Boolean);
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
};

exports.getCalendar = async (query) => {
  const pilots    = toArray(query.pilot);
  const drones    = toArray(query.drone);
  const projects  = toArray(query.project);
  const pipelines = toArray(query.pipeline);

  // 1. CONFIRMED ALLOCATIONS — multi-select AND filters (pilot AND drone AND project)
  let allocationWhere = '1=1';
  const allocationValues = [];
  if (pilots)   { allocationValues.push(pilots);   allocationWhere += ` AND (pl.id = ANY($${allocationValues.length}::uuid[]) OR cpl.id = ANY($${allocationValues.length}::uuid[]))`; }
  if (drones)   { allocationValues.push(drones);   allocationWhere += ` AND d.id    = ANY($${allocationValues.length}::uuid[])`; }
  if (projects) { allocationValues.push(projects); allocationWhere += ` AND a.project_id = ANY($${allocationValues.length}::uuid[])`; }

  const allocations = await db.query(`
    SELECT a.id, 'project' as type, a.start_date, a.end_date,
           p.name as title, p.name as project_name,
           pil.name as pilot_name, cpu.name as copilot_name, d.name as drone_name,
           pl.id as pilot_id, cpl.id as copilot_id, d.id as drone_id, a.project_id
    FROM allocations a
    LEFT JOIN projects p  ON a.project_id = p.id
    LEFT JOIN pilots pl   ON a.pilot_id = pl.id
    LEFT JOIN users pil   ON pl.user_id = pil.id
    LEFT JOIN pilots cpl  ON a.copilot_id = cpl.id
    LEFT JOIN users cpu   ON cpl.user_id = cpu.id
    LEFT JOIN drones d    ON a.drone_id = d.id
    WHERE p.deleted_at IS NULL AND p.archived_at IS NULL AND p.status != 'cancelled' AND ${allocationWhere}
  `, allocationValues);

  // 2. PIPELINE (TENTATIVE) — multi-select pilot/drone/pipeline
  let pipelineWhere = "deleted_at IS NULL AND stage NOT IN ('lost', 'converted', 'cancelled') AND estimated_start IS NOT NULL AND converted_project_id IS NULL";
  const pipelineValues = [];
  if (pilots)    { pipelineValues.push(pilots);    pipelineWhere += ` AND tentative_pilot = ANY($${pipelineValues.length}::uuid[])`; }
  if (drones)    { pipelineValues.push(drones);    pipelineWhere += ` AND tentative_drone = ANY($${pipelineValues.length}::uuid[])`; }
  if (pipelines) { pipelineValues.push(pipelines); pipelineWhere += ` AND id = ANY($${pipelineValues.length}::uuid[])`; }

  const pipeline = await db.query(`
    SELECT id, 'pipeline' as type, estimated_start as start_date,
           estimated_end as end_date, name as title, name as project_name,
           tentative_pilot as pilot_id, tentative_drone as drone_id
    FROM pipeline WHERE ${pipelineWhere}`,
    pipelineValues
  );

  // 3. MANUAL EVENTS — leave, training, maintenance, expo
  let eventWhere = "event_type != 'project'";
  const eventValues = [];
  if (pilots || drones) {
    const filters = ["resource_type = 'all'"];
    if (pilots) {
      eventValues.push(pilots);
      filters.push(`(resource_type IN ('pilot','copilot') AND resource_id = ANY($${eventValues.length}::uuid[]))`);
    }
    if (drones) {
      eventValues.push(drones);
      filters.push(`(resource_type = 'drone' AND resource_id = ANY($${eventValues.length}::uuid[]))`);
    }
    eventWhere += ` AND (${filters.join(' OR ')})`;
  }

  const events = await db.query(
    `SELECT id, event_type as type, start_date, end_date, title, project_id, resource_type, resource_id
     FROM calendar_events
     WHERE ${eventWhere}`,
    eventValues
  );

  // 4. PROJECT MARKERS — multi-select project
  let markerWhere = `ce.event_type = 'project'
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = ce.project_id
        AND p.deleted_at IS NULL
        AND p.archived_at IS NULL
        AND p.status != 'cancelled'
    )
    AND NOT EXISTS (
      SELECT 1 FROM allocations a WHERE a.project_id = ce.project_id
    )`;
  const markerValues = [];
  if (projects) { markerValues.push(projects); markerWhere += ` AND ce.project_id = ANY($${markerValues.length}::uuid[])`; }

  const markers = await db.query(
    `SELECT ce.id, 'project' as type, ce.start_date, ce.end_date,
            ce.title, ce.project_id, p.name as project_name,
            NULL::text as pilot_name, NULL::text as copilot_name, NULL::text as drone_name,
            NULL::uuid as pilot_id, NULL::uuid as copilot_id, NULL::uuid as drone_id
     FROM calendar_events ce
     LEFT JOIN projects p ON ce.project_id = p.id
     WHERE ${markerWhere}`,
    markerValues
  );

  return [...allocations.rows, ...pipeline.rows, ...events.rows, ...markers.rows];
};
