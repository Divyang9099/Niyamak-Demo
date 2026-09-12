const db           = require('../../../../core/config/db');
const audit        = require('../../../audit/audit.service');
const notifService = require('../../../notification/notification.service');
const emailTriggers = require('../../../notification/emailTriggers.service');
const socket       = require('../../../../core/socket/socket.gateway');
const EVENTS       = require('../../../../core/socket/socket.events');
const { todayIST, formatDateIST } = require('../../../../core/utils/dateUtils');

// ─── Internal: run conflict checks inside a client transaction ────────────────
// Uses pg_advisory_xact_lock to prevent race conditions — two simultaneous
// allocation requests for the same pilot/drone cannot both pass the check.
// ─── Internal: run conflict checks inside a client transaction ────────────────
// Uses pg_advisory_xact_lock to prevent race conditions — two simultaneous
// allocation requests for the same pilot/copilot/drone cannot both pass the check.
const _acquireResourceLocks = async (client, pilot_id, copilot_id, drone_id) => {
  // Advisory locks are INTEGER-sized; hash the UUID string to a stable int.
  if (pilot_id) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [pilot_id]);
  }
  if (copilot_id) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [copilot_id]);
  }
  if (drone_id) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [drone_id]);
  }
};

const _checkPilot = async (client, pilot_id, start_date, end_date, excludeAllocationId = null, excludeProjectId = null, isCopilot = false) => {
  const conflicts = [];
  const labelPrefix = isCopilot ? 'Co-Pilot' : 'Pilot';
  const conflictTypePrefix = isCopilot ? 'copilot' : 'pilot';

  // Existence + status + license expiry (PRD §10.2, §4.4)
  const pilotCheck = await client.query(
    'SELECT status, license_expiry, license_number FROM pilots WHERE id = $1 AND deleted_at IS NULL',
    [pilot_id]
  );
  if (!pilotCheck.rows.length) throw Object.assign(new Error(`${labelPrefix} not found`), { statusCode: 404 });

  const pilot = pilotCheck.rows[0];

  if (pilot.status !== 'active') {
    throw Object.assign(
      new Error(`${labelPrefix} is not active (status: ${pilot.status})`),
      { statusCode: 409 }
    );
  }

  // License expiry gate — pushed as a soft conflict so force=true can override (same pattern as drone insurance)
  if (pilot.license_expiry) {
    const expiryStr  = String(pilot.license_expiry).substring(0, 10);
    const allocStart = String(start_date).substring(0, 10);
    if (expiryStr < allocStart) {
      // Hard block — expired BEFORE the allocation window starts; cannot fly at all
      throw Object.assign(
        new Error(`${labelPrefix} license has expired (expired: ${expiryStr}). Renewal required before allocation.`),
        { statusCode: 409 }
      );
    }
    // License expires DURING the allocation window — warn via conflict so PM can override with reason
    const allocEnd = String(end_date).substring(0, 10);
    if (expiryStr >= allocStart && expiryStr <= allocEnd) {
      conflicts.push({
        type: `${conflictTypePrefix}_license_expiring_during_allocation`,
        conflicting_allocation_id: null,
        expiry_date: pilot.license_expiry,
      });
    }
  }

  // Date-range overlap check. Excludes the allocation being updated AND any
  // allocation in the SAME project — two allocations of one project share the
  // same job window and must never be reported as a double-booking.
  const overlapParams = [pilot_id, start_date, end_date];
  let overlapSql = `SELECT id FROM allocations
                     WHERE (pilot_id = $1 OR copilot_id = $1) AND (start_date < $3 AND end_date > $2)`;
  if (excludeAllocationId) { overlapParams.push(excludeAllocationId); overlapSql += ` AND id != $${overlapParams.length}`; }
  if (excludeProjectId)    { overlapParams.push(excludeProjectId);    overlapSql += ` AND project_id != $${overlapParams.length}`; }
  const pilotConflict = await client.query(overlapSql, overlapParams);
  if (pilotConflict.rows.length > 0) {
    conflicts.push({ type: conflictTypePrefix, conflicting_allocation_id: pilotConflict.rows[0].id });
  }

  // Calendar event conflicts (leave / training) — pushed to conflicts[] so force=true can override
  const eventConflict = await client.query(
    `SELECT id, event_type FROM calendar_events
     WHERE resource_id = $1 AND (resource_type = 'pilot' OR resource_type = 'copilot')
     AND event_type IN ('leave', 'training')
     AND (start_date <= $3 AND end_date >= $2)`,
    [pilot_id, start_date, end_date]
  );
  if (eventConflict.rows.length > 0) {
    conflicts.push({
      type: `${conflictTypePrefix}_${eventConflict.rows[0].event_type}`,
      conflicting_allocation_id: null,
      calendar_event_id: eventConflict.rows[0].id,
    });
  }

  return conflicts;
};

const _checkDrone = async (client, drone_id, start_date, end_date, excludeAllocationId = null, excludeProjectId = null) => {
  const conflicts = [];

  // Existence + status + insurance + maintenance
  const droneCheck = await client.query(
    'SELECT status, insurance_expiry, next_maintenance FROM drones WHERE id = $1 AND deleted_at IS NULL',
    [drone_id]
  );
  if (!droneCheck.rows.length) throw Object.assign(new Error('Drone not found'), { statusCode: 404 });
  const drone = droneCheck.rows[0];

  if (drone.status !== 'active') {
    throw Object.assign(
      new Error(`Drone is not available (status: ${drone.status})`),
      { statusCode: 409 }
    );
  }

  // Insurance expiry — pushed to conflicts[] so force=true can override (expired but usable with override)
  if (drone.insurance_expiry && String(drone.insurance_expiry).substring(0, 10) < todayIST()) {
    conflicts.push({
      type: 'drone_insurance_expired',
      conflicting_allocation_id: null,
      expiry_date: drone.insurance_expiry,
    });
  }

  // Scheduled maintenance window check — string comparison on YYYY-MM-DD
  if (drone.next_maintenance) {
    const maintStr  = String(drone.next_maintenance).substring(0, 10);
    const allocStart = String(start_date).substring(0, 10);
    const allocEnd   = String(end_date).substring(0, 10);
    if (maintStr >= allocStart && maintStr <= allocEnd) {
      conflicts.push({
        type: 'drone_maintenance',
        conflicting_allocation_id: null,
        maintenance_date: drone.next_maintenance,
      });
    }
  }

  // Date-range overlap check. Excludes the allocation being updated AND any
  // allocation in the SAME project (same job window, not a double-booking).
  const overlapParams = [drone_id, start_date, end_date];
  let overlapSql = `SELECT id FROM allocations WHERE drone_id = $1 AND (start_date < $3 AND end_date > $2)`;
  if (excludeAllocationId) { overlapParams.push(excludeAllocationId); overlapSql += ` AND id != $${overlapParams.length}`; }
  if (excludeProjectId)    { overlapParams.push(excludeProjectId);    overlapSql += ` AND project_id != $${overlapParams.length}`; }
  const droneConflict = await client.query(overlapSql, overlapParams);
  if (droneConflict.rows.length > 0) {
    conflicts.push({ type: 'drone', conflicting_allocation_id: droneConflict.rows[0].id });
  }

  // Calendar event conflicts (maintenance)
  const eventConflict = await client.query(
    `SELECT id FROM calendar_events
     WHERE resource_id = $1 AND resource_type = 'drone'
     AND event_type = 'maintenance'
     AND (start_date <= $3 AND end_date >= $2)`,
    [drone_id, start_date, end_date]
  );
  if (eventConflict.rows.length > 0) {
    throw Object.assign(
      new Error('Drone has a conflicting maintenance calendar block in this date range'),
      { statusCode: 409 }
    );
  }

  return conflicts;
};

// ─── CREATE ───────────────────────────────────────────────────────────────────
exports.createAllocation = async (projectId, data, userId) => {
  const { start_date, end_date, force, override_reason, is_primary = true } = data;
  // Normalise empty-string dropdown values ("") to NULL so Postgres doesn't reject
  // them as invalid uuid input; an allocation may legitimately have no pilot, co-pilot or drone.
  const pilot_id   = data.pilot_id   || null;
  const copilot_id = data.copilot_id || null;
  const drone_id   = data.drone_id   || null;

  if (!pilot_id && !copilot_id && !drone_id) {
    throw Object.assign(new Error('Select at least a pilot, co-pilot, or drone'), { statusCode: 400 });
  }
  if (pilot_id && copilot_id && pilot_id === copilot_id) {
    throw Object.assign(new Error('The same crew member cannot be both pilot and co-pilot'), { statusCode: 400 });
  }

  if (!start_date || !end_date) {
    throw Object.assign(new Error('start_date and end_date are required'), { statusCode: 400 });
  }
  if (String(start_date).substring(0, 10) > String(end_date).substring(0, 10)) {
    throw Object.assign(new Error('start_date cannot be after end_date'), { statusCode: 400 });
  }
  if (force && !override_reason) {
    throw Object.assign(new Error('override_reason is required when force=true'), { statusCode: 400 });
  }

  const client = await db.connect();
  let allocation;
  try {
    await client.query('BEGIN');

    // Advisory locks prevent simultaneous allocations for the same resources
    await _acquireResourceLocks(client, pilot_id, copilot_id, drone_id);

    // Project existence check
    const project = await client.query(
      'SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL', [projectId]
    );
    if (!project.rows.length) throw Object.assign(new Error('Project not found'), { statusCode: 404 });

    // ── Uniqueness guard: one allocation per resource per project ─────────────
    const dupConds = [];
    const dupParams = [projectId];
    if (pilot_id)   { dupParams.push(pilot_id);   dupConds.push(`pilot_id = $${dupParams.length}`); }
    if (copilot_id) { dupParams.push(copilot_id); dupConds.push(`copilot_id = $${dupParams.length}`); }
    if (drone_id)   { dupParams.push(drone_id);   dupConds.push(`drone_id = $${dupParams.length}`); }
    if (dupConds.length) {
      const dup = await client.query(
        `SELECT id, pilot_id, copilot_id, drone_id FROM allocations
         WHERE project_id = $1 AND (${dupConds.join(' OR ')}) LIMIT 1`,
        dupParams
      );
      if (dup.rows.length) {
        let which = 'resource';
        if (dup.rows[0].pilot_id === pilot_id && pilot_id) which = 'pilot';
        else if (dup.rows[0].copilot_id === copilot_id && copilot_id) which = 'co-pilot';
        else if (dup.rows[0].drone_id === drone_id && drone_id) which = 'drone';
        throw Object.assign(
          new Error(`This ${which} is already allocated to this project. Edit the existing allocation instead of adding a duplicate.`),
          { statusCode: 409 }
        );
      }
    }

    const conflicts = [];
    if (pilot_id) {
      const pc = await _checkPilot(client, pilot_id, start_date, end_date, null, projectId, false);
      conflicts.push(...pc);
    }
    if (copilot_id) {
      const cpc = await _checkPilot(client, copilot_id, start_date, end_date, null, projectId, true);
      conflicts.push(...cpc);
    }
    if (drone_id) {
      const dc = await _checkDrone(client, drone_id, start_date, end_date, null, projectId);
      conflicts.push(...dc);
    }

    if (conflicts.length > 0 && !force) {
      const err = Object.assign(new Error('Resource conflict detected'), {
        statusCode: 409,
        conflictPayload: conflicts,
      });
      throw err;
    }

    // ── Fill the empty seat on the matching window, don't stack a second card ──
    // One allocation = one job window with a pilot / co-pilot / drone seat. Allocating
    // a co-pilot for a window that already has a pilot+drone booking has to fill that
    // booking's empty co-pilot seat; otherwise the Resources tab shows two half-empty
    // cards for the same dates. A seat that is already taken forces a new row, which is
    // what keeps a genuinely separate crew (and the primary/secondary split) intact.
    const seatConds = ['project_id = $1', 'start_date = $2', 'end_date = $3', 'is_primary = $4'];
    if (pilot_id)   seatConds.push('pilot_id IS NULL');
    if (copilot_id) seatConds.push('copilot_id IS NULL');
    if (drone_id)   seatConds.push('drone_id IS NULL');
    const mergeTarget = await client.query(
      `SELECT id FROM allocations WHERE ${seatConds.join(' AND ')}
       ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [projectId, start_date, end_date, is_primary]
    );

    const result = mergeTarget.rows.length
      ? await client.query(
          `UPDATE allocations
              SET pilot_id   = COALESCE($2, pilot_id),
                  copilot_id = COALESCE($3, copilot_id),
                  drone_id   = COALESCE($4, drone_id)
            WHERE id = $1
            RETURNING *`,
          [mergeTarget.rows[0].id, pilot_id || null, copilot_id || null, drone_id || null]
        )
      : await client.query(
          `INSERT INTO allocations (project_id, pilot_id, copilot_id, drone_id, start_date, end_date, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [projectId, pilot_id || null, copilot_id || null, drone_id || null, start_date, end_date, is_primary]
        );
    allocation = result.rows[0];

    // Write conflict records (with full override info)
    if (conflicts.length > 0) {
      for (const c of conflicts) {
        await client.query(
          `INSERT INTO allocation_conflicts
           (allocation_id, conflicting_allocation_id, conflict_type, override_reason, overridden_by, overridden_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [allocation.id, c.conflicting_allocation_id || null, c.type, override_reason || null, userId || null]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // ── Post-commit: audit + notifications (non-critical, best-effort) ──────────
  try {
    await audit.log({
      user_id: userId,
      action: force ? 'FORCE_ALLOCATION' : 'ALLOCATE_RESOURCE',
      entity_type: 'allocation',
      entity_id: allocation.id,
      new_value: force ? { allocation, override_reason } : allocation,
    });
  } catch (auditErr) {
    console.error('[Allocation] Audit log failed (non-fatal):', auditErr.message);
  }

  // Handle Pilot post-commit membership + notification
  if (pilot_id) {
    try {
      const pilotInfo = await db.query(
        `SELECT p.user_id, u.name AS pilot_name, u.email AS pilot_email, u.role AS user_role
           FROM pilots p
           LEFT JOIN users u ON p.user_id = u.id
          WHERE p.id = $1`, [pilot_id]
      );
      const projectInfo = await db.query('SELECT name FROM projects WHERE id = $1', [projectId]);
      const projectName = projectInfo.rows[0]?.name || projectId;
      const pilot = pilotInfo.rows[0];

      if (pilot?.user_id) {
        await db.query(
          'INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [projectId, pilot.user_id, 'pilot']
        );
        if (pilot.user_role !== 'co_pilot') {
          await notifService.createNotification({
            user_id:     pilot.user_id,
            title:       'New Project Allocation',
            message:     `You have been allocated to project "${projectName}" from ${start_date} to ${end_date}.`,
            entity_type: 'project',
            entity_id:   projectId,
          });
        }
      }

      if (pilot?.pilot_email && pilot.user_role !== 'co_pilot') {
        emailTriggers.onAllocation({
          pilotUserId: pilot.user_id,
          pilotName:   pilot.pilot_name,
          pilotEmail:  pilot.pilot_email,
          projectName,
          startDate:   formatDateIST(start_date),
          endDate:     formatDateIST(end_date),
        });
      }
    } catch (notifErr) {
      console.error('[Allocation] Pilot notification failed (non-fatal):', notifErr.message);
    }
  }

  // Handle Co-Pilot post-commit membership (NO emails or in-app notifications)
  if (copilot_id) {
    try {
      const copilotInfo = await db.query(
        'SELECT p.user_id FROM pilots p WHERE p.id = $1', [copilot_id]
      );
      const copilot = copilotInfo.rows[0];
      if (copilot?.user_id) {
        await db.query(
          'INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [projectId, copilot.user_id, 'pilot']
        );
      }
    } catch (copilotErr) {
      console.error('[Allocation] Co-pilot member sync failed (non-fatal):', copilotErr.message);
    }
  }

  try {
    socket.emitToProject(projectId, EVENTS.ALLOCATION_CREATED, allocation);
    socket.emitToAll(EVENTS.ALLOCATION_CREATED, { project_id: projectId });
  } catch (_) {}

  return allocation;
};

// ─── GET ──────────────────────────────────────────────────────────────────────
// Returns formal allocations PLUS project members who are pilots/co-pilots but not yet
// formally allocated — enriched for the Resources tab.
exports.getAllocations = async (projectId) => {
  // 1. Formal allocations (with Pilot, Co-Pilot, and Drone)
  const allocResult = await db.query(
    `SELECT a.*,
            u.name AS pilot_name, p.status AS pilot_status, p.license_expiry AS pilot_license_expiry,
            p.license_number AS pilot_license_number,
            cu.name AS copilot_name, cp.status AS copilot_status, cp.license_expiry AS copilot_license_expiry,
            cp.license_number AS copilot_license_number,
            d.name AS drone_name, d.model AS drone_model, d.status AS drone_status,
            d.next_maintenance AS drone_next_maintenance,
            false AS is_member_only,
            'allocation' AS row_kind
     FROM allocations a
     LEFT JOIN pilots p  ON a.pilot_id = p.id
     LEFT JOIN users u   ON p.user_id = u.id
     LEFT JOIN pilots cp ON a.copilot_id = cp.id
     LEFT JOIN users cu  ON cp.user_id = cu.id
     LEFT JOIN drones d  ON a.drone_id = d.id
     WHERE a.project_id = $1
     ORDER BY a.is_primary DESC, a.start_date ASC`,
    [projectId]
  );

  // Allocated IDs to avoid duplicating in team sections
  const allocatedPilotIds = allocResult.rows
    .filter(r => r.pilot_id)
    .map(r => r.pilot_id);

  const allocatedCopilotIds = allocResult.rows
    .filter(r => r.copilot_id)
    .map(r => r.copilot_id);

  const allocatedDroneIds = allocResult.rows
    .filter(r => r.drone_id)
    .map(r => r.drone_id);

  // 2. Team Pilots (project members where crew_role = 'pilot' without formal allocation)
  const memberResult = await db.query(
    `SELECT
       pm.id        AS id,
       $1::uuid     AS project_id,
       pi.id        AS pilot_id,
       NULL::uuid   AS copilot_id,
       NULL::uuid   AS drone_id,
       NULL::date   AS start_date,
       NULL::date   AS end_date,
       pm.role      AS member_role,
       true         AS is_primary,
       true         AS is_member_only,
       'team_pilot' AS row_kind,
       pm.user_id   AS pilot_member_user_id,
       u.name       AS pilot_name,
       pi.status    AS pilot_status,
       pi.license_expiry AS pilot_license_expiry,
       pi.license_number AS pilot_license_number,
       NULL::text   AS copilot_name,
       NULL::text   AS copilot_status,
       NULL::date   AS copilot_license_expiry,
       NULL::text   AS copilot_license_number,
       NULL::text   AS drone_name,
       NULL::text   AS drone_model,
       NULL::text   AS drone_status,
       NULL::date   AS drone_next_maintenance
     FROM project_members pm
     JOIN users u   ON pm.user_id = u.id
     JOIN pilots pi ON u.id = pi.user_id AND (pi.crew_role = 'pilot' OR pi.crew_role IS NULL) AND pi.deleted_at IS NULL
     WHERE pm.project_id = $1
       ${allocatedPilotIds.length ? `AND pi.id NOT IN (${allocatedPilotIds.map((_, i) => `$${i + 2}`).join(',')})` : ''}
     ORDER BY u.name ASC`,
    allocatedPilotIds.length ? [projectId, ...allocatedPilotIds] : [projectId]
  );

  // 3. Team Co-Pilots (project members where crew_role = 'co_pilot' without formal allocation)
  const teamCopilotResult = await db.query(
    `SELECT
       pm.id          AS id,
       $1::uuid       AS project_id,
       NULL::uuid     AS pilot_id,
       pi.id          AS copilot_id,
       NULL::uuid     AS drone_id,
       NULL::date     AS start_date,
       NULL::date     AS end_date,
       pm.role        AS member_role,
       true           AS is_primary,
       true           AS is_member_only,
       'team_copilot' AS row_kind,
       pm.user_id     AS pilot_member_user_id,
       NULL::text     AS pilot_name,
       NULL::text     AS pilot_status,
       NULL::date     AS pilot_license_expiry,
       NULL::text     AS pilot_license_number,
       u.name         AS copilot_name,
       pi.status      AS copilot_status,
       pi.license_expiry AS copilot_license_expiry,
       pi.license_number AS copilot_license_number,
       NULL::text     AS drone_name,
       NULL::text     AS drone_model,
       NULL::text     AS drone_status,
       NULL::date     AS drone_next_maintenance
     FROM project_members pm
     JOIN users u   ON pm.user_id = u.id
     JOIN pilots pi ON u.id = pi.user_id AND pi.crew_role = 'co_pilot' AND pi.deleted_at IS NULL
     WHERE pm.project_id = $1
       ${allocatedCopilotIds.length ? `AND pi.id NOT IN (${allocatedCopilotIds.map((_, i) => `$${i + 2}`).join(',')})` : ''}
     ORDER BY u.name ASC`,
    allocatedCopilotIds.length ? [projectId, ...allocatedCopilotIds] : [projectId]
  );

  // 4. Team Drones (project_drones — no date range)
  const teamDroneResult = await db.query(
    `SELECT
       pd.id        AS id,
       $1::uuid     AS project_id,
       NULL::uuid   AS pilot_id,
       NULL::uuid   AS copilot_id,
       d.id         AS drone_id,
       NULL::date   AS start_date,
       NULL::date   AS end_date,
       NULL::text   AS member_role,
       true         AS is_primary,
       true         AS is_member_only,
       'team_drone' AS row_kind,
       NULL::uuid   AS pilot_member_user_id,
       NULL::text   AS pilot_name,
       NULL::text   AS pilot_status,
       NULL::date   AS pilot_license_expiry,
       NULL::text   AS pilot_license_number,
       NULL::text   AS copilot_name,
       NULL::text   AS copilot_status,
       NULL::date   AS copilot_license_expiry,
       NULL::text   AS copilot_license_number,
       d.name       AS drone_name,
       d.model      AS drone_model,
       d.status     AS drone_status,
       d.next_maintenance AS drone_next_maintenance
     FROM project_drones pd
     JOIN drones d ON pd.drone_id = d.id AND d.deleted_at IS NULL
     WHERE pd.project_id = $1
       ${allocatedDroneIds.length ? `AND d.id NOT IN (${allocatedDroneIds.map((_, i) => `$${i + 2}`).join(',')})` : ''}
     ORDER BY d.name ASC`,
    allocatedDroneIds.length ? [projectId, ...allocatedDroneIds] : [projectId]
  );

  return [...allocResult.rows, ...memberResult.rows, ...teamCopilotResult.rows, ...teamDroneResult.rows];
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
exports.updateAllocation = async (allocationId, projectId, data, userId) => {
  const { pilot_id, copilot_id, drone_id, start_date, end_date, force, override_reason } = data;

  if (force && !override_reason) {
    throw Object.assign(new Error('override_reason is required when force=true'), { statusCode: 400 });
  }

  // Scope to the URL project: the allocation must belong to the project whose
  // access the route guards already verified. A 404 for a mismatched id prevents
  // cross-project tampering via a project the caller merely manages.
  const existingResult = await db.query('SELECT * FROM allocations WHERE id = $1 AND project_id = $2', [allocationId, projectId]);
  if (!existingResult.rows.length) throw Object.assign(new Error('Allocation not found'), { statusCode: 404 });
  const existing = existingResult.rows[0];

  // Empty string from a "— No pilot —" / "— No drone —" dropdown means "clear it"
  // (NULL), not the literal "" — which Postgres rejects as invalid uuid input.
  const final_pilot   = pilot_id   !== undefined ? (pilot_id   || null) : existing.pilot_id;
  const final_copilot = copilot_id !== undefined ? (copilot_id || null) : existing.copilot_id;
  const final_drone   = drone_id   !== undefined ? (drone_id   || null) : existing.drone_id;
  const final_start   = start_date !== undefined ? start_date : existing.start_date;
  const final_end     = end_date   !== undefined ? end_date   : existing.end_date;

  if (!final_start || !final_end) {
    throw Object.assign(new Error('start_date and end_date cannot be null'), { statusCode: 400 });
  }
  if (!final_pilot && !final_copilot && !final_drone) {
    throw Object.assign(new Error('Select at least a pilot, co-pilot, or drone'), { statusCode: 400 });
  }
  if (final_pilot && final_copilot && final_pilot === final_copilot) {
    throw Object.assign(new Error('The same crew member cannot be both pilot and co-pilot'), { statusCode: 400 });
  }
  if (String(final_start).substring(0, 10) > String(final_end).substring(0, 10)) {
    throw Object.assign(new Error('start_date cannot be after end_date'), { statusCode: 400 });
  }

  const client = await db.connect();
  let updated;
  try {
    await client.query('BEGIN');
    await _acquireResourceLocks(client, final_pilot, final_copilot, final_drone);

    // Uniqueness guard — the chosen pilot/copilot/drone must not already be on ANOTHER
    // allocation within the same project (excludes this allocation itself).
    const dupConds = [];
    const dupParams = [existing.project_id, allocationId];
    if (final_pilot)   { dupParams.push(final_pilot);   dupConds.push(`pilot_id = $${dupParams.length}`); }
    if (final_copilot) { dupParams.push(final_copilot); dupConds.push(`copilot_id = $${dupParams.length}`); }
    if (final_drone)   { dupParams.push(final_drone);   dupConds.push(`drone_id = $${dupParams.length}`); }
    if (dupConds.length) {
      const dup = await client.query(
        `SELECT id, pilot_id, copilot_id, drone_id FROM allocations
         WHERE project_id = $1 AND id != $2 AND (${dupConds.join(' OR ')}) LIMIT 1`,
        dupParams
      );
      if (dup.rows.length) {
        let which = 'resource';
        if (dup.rows[0].pilot_id === final_pilot && final_pilot) which = 'pilot';
        else if (dup.rows[0].copilot_id === final_copilot && final_copilot) which = 'co-pilot';
        else if (dup.rows[0].drone_id === final_drone && final_drone) which = 'drone';
        throw Object.assign(
          new Error(`This ${which} is already allocated to this project on another allocation.`),
          { statusCode: 409 }
        );
      }
    }

    const conflicts = [];
    if (final_pilot) {
      const pc = await _checkPilot(client, final_pilot, final_start, final_end, allocationId, existing.project_id, false);
      conflicts.push(...pc);
    }
    if (final_copilot) {
      const cpc = await _checkPilot(client, final_copilot, final_start, final_end, allocationId, existing.project_id, true);
      conflicts.push(...cpc);
    }
    if (final_drone) {
      const dc = await _checkDrone(client, final_drone, final_start, final_end, allocationId, existing.project_id);
      conflicts.push(...dc);
    }

    if (conflicts.length > 0 && !force) {
      throw Object.assign(new Error('Resource conflict detected'), {
        statusCode: 409,
        conflictPayload: conflicts,
      });
    }

    const result = await client.query(
      `UPDATE allocations
       SET pilot_id = $1, copilot_id = $2, drone_id = $3, start_date = $4, end_date = $5
       WHERE id = $6 RETURNING *`,
      [final_pilot, final_copilot, final_drone, final_start, final_end, allocationId]
    );
    if (!result.rows.length) throw Object.assign(new Error('Allocation not found'), { statusCode: 404 });
    updated = result.rows[0];

    if (conflicts.length > 0) {
      for (const c of conflicts) {
        await client.query(
          `INSERT INTO allocation_conflicts
           (allocation_id, conflicting_allocation_id, conflict_type, override_reason, overridden_by, overridden_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [allocationId, c.conflicting_allocation_id || null, c.type, override_reason || null, userId || null]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  try {
    await audit.log({
      user_id: userId,
      action: force ? 'FORCE_UPDATE_ALLOCATION' : 'UPDATE_ALLOCATION',
      entity_type: 'allocation',
      entity_id: allocationId,
      old_value: existing,
      new_value: force ? { updated, override_reason } : updated,
    });
  } catch (auditErr) {
    console.error('[Allocation] Audit log failed (non-fatal):', auditErr.message);
  }

  // Ensure members sync for updated pilot / co-pilot
  if (final_pilot) {
    db.query('SELECT user_id FROM pilots WHERE id = $1', [final_pilot])
      .then(r => {
        if (r.rows[0]?.user_id) {
          return db.query(
            'INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
            [existing.project_id, r.rows[0].user_id, 'pilot']
          );
        }
      }).catch(() => {});
  }
  if (final_copilot) {
    db.query('SELECT user_id FROM pilots WHERE id = $1', [final_copilot])
      .then(r => {
        if (r.rows[0]?.user_id) {
          return db.query(
            'INSERT INTO project_members (project_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
            [existing.project_id, r.rows[0].user_id, 'pilot']
          );
        }
      }).catch(() => {});
  }

  try {
    socket.emitToProject(existing.project_id, EVENTS.ALLOCATION_UPDATED, updated);
    socket.emitToAll(EVENTS.ALLOCATION_UPDATED, { project_id: existing.project_id });
  } catch (_) {}

  return updated;
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteAllocation = async (allocationId, projectId, userId) => {
  // Scope to the URL project (see updateAllocation note) so a caller can't delete
  // another project's allocation by supplying its id.
  const existing = await db.query('SELECT * FROM allocations WHERE id = $1 AND project_id = $2', [allocationId, projectId]);
  if (!existing.rows.length) throw Object.assign(new Error('Allocation not found'), { statusCode: 404 });

  const { project_id } = existing.rows[0];
  await db.query('DELETE FROM allocations WHERE id = $1', [allocationId]);

  try {
    await audit.log({
      user_id: userId,
      action: 'DELETE_ALLOCATION',
      entity_type: 'allocation',
      entity_id: allocationId,
      old_value: existing.rows[0],
    });
  } catch (auditErr) {
    console.error('[Allocation] Audit log failed (non-fatal):', auditErr.message);
  }

  try {
    socket.emitToProject(project_id, EVENTS.ALLOCATION_DELETED, { id: allocationId });
    socket.emitToAll(EVENTS.ALLOCATION_DELETED, { id: allocationId, project_id });
  } catch (_) {}
};
