const crypto       = require('crypto');
const db           = require('../../core/config/db');
const bcrypt       = require('bcryptjs');
const emailService = require('../notification/email.service');
const socket       = require('../../core/socket/socket.gateway');
const EVENTS       = require('../../core/socket/socket.events');

// Field-level authorization (BOPLA guard): getPilots/getPilotById are readable
// by ANY authenticated role (dropdowns, allocation planning need it org-wide),
// but the row carries HR-only material — government ID document keys — that
// only the pilot themself and admin should ever see, plus per_day_rate (pay),
// which is legitimate for admin/PM costing but not for a colleague pilot to
// browse. contact_number/employee_id stay visible — needed for team coordination.
exports.redactPilotForViewer = (row, viewer) => {
  if (!row || !viewer || viewer.role === 'admin') return row;
  if (row.user_id === viewer.id) return row; // viewing your own record
  delete row.aadhaar_doc_key;
  delete row.passport_doc_key;
  delete row.certificate_doc_key;
  if (viewer.role !== 'project_manager') delete row.per_day_rate;
  return row;
};

exports.createPilot = async (data) => {
  let userId = data.user_id;
  let randomPassword = null;
  let newUserEmail = null;

  const client = await db.connect();
  let createdPilot;
  try {
    await client.query('BEGIN');

    const targetRole = data.crew_role === 'co_pilot' ? 'co_pilot' : 'pilot';

    if (!userId && data.email) {
      newUserEmail = data.email.trim();
      const userCheck = await client.query('SELECT id FROM users WHERE email = $1', [newUserEmail]);
      if (userCheck.rows.length > 0) {
        userId = userCheck.rows[0].id;
        await client.query("UPDATE users SET role = $1 WHERE id = $2", [targetRole, userId]);
      } else {
        // crypto.randomBytes produces cryptographically secure random passwords
        randomPassword = crypto.randomBytes(12).toString('base64url').slice(0, 12);
        const passwordHash = await bcrypt.hash(randomPassword, 12);

        const newUser = await client.query(
          `INSERT INTO users (name, email, password_hash, role, phone)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [data.name || newUserEmail.split('@')[0], newUserEmail, passwordHash, targetRole, data.phone || null]
        );
        userId = newUser.rows[0].id;
      }
    }

    if (!userId) {
      throw Object.assign(new Error('Cannot create pilot: User ID or valid Email required'), { statusCode: 400 });
    }

    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!userCheck.rows.length) {
      throw Object.assign(new Error('Cannot create pilot: User not found'), { statusCode: 404 });
    }

    const pilotCheck = await client.query('SELECT id FROM pilots WHERE user_id = $1', [userId]);
    if (pilotCheck.rows.length > 0) {
      throw Object.assign(new Error('Pilot profile already exists for this user account'), { statusCode: 409 });
    }

    const result = await client.query(
      `INSERT INTO pilots
         (user_id, license_number, license_expiry, status, base_location, certification, per_day_rate,
          contact_number, aadhaar_doc_key, passport_doc_key, certificate_doc_key, employee_id, employment_type, crew_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        userId,
        data.license_number      || 'PENDING',
        data.license_expiry      || null,
        data.status              || 'active',
        data.base_location       || null,
        data.certification       || null,
        data.per_day_rate        || null,
        data.contact_number      || null,
        data.aadhaar_doc_key     || null,
        data.passport_doc_key    || null,
        data.certificate_doc_key || null,
        data.employee_id         || null,
        data.employment_type     || 'full_time',
        data.crew_role           || 'pilot',
      ]
    );
    createdPilot = result.rows[0];

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Post-commit: email credentials ONLY for pilots (best-effort, non-fatal)
  // Co-pilots have no login credentials so no email is sent
  if (randomPassword && newUserEmail && createdPilot.crew_role !== 'co_pilot') {
    try {
      await emailService.sendEmail({
        to: newUserEmail,
        subject: 'Niyamak — Pilot Operations Access Credentials',
        html: `
          <div style="font-family: sans-serif; color: #111; line-height: 1.5;">
            <h2>Welcome to Niyamak Flight Operations</h2>
            <p>Hello <strong>${data.name || 'Pilot'}</strong>,</p>
            <p>An administrator has deployed your pilot profile on the Niyamak platform.</p>
            <div style="background: #1b1b1b; color: #fff; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #474747;">
              <p style="margin: 6px 0; font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Access Portal</p>
              <p style="margin: 6px 0;"><strong>Username / Email:</strong> ${newUserEmail}</p>
              <p style="margin: 6px 0;"><strong>Assigned Password:</strong> <code style="background: #353535; padding: 2px 6px; border-radius: 4px; color: #22c55e; font-weight: bold;">${randomPassword}</code></p>
            </div>
            <p>Please log in to review your scheduled mission operations and update your access credentials.</p>
            <p style="color: #666; font-size: 11px; margin-top: 24px; text-transform: uppercase; letter-spacing: 1px;">Niyamak Operational Command</p>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('[Pilot] Failed to send credentials email:', emailErr.message);
    }
    // Expose provisional password in response so admin can relay it manually if email fails
    createdPilot.provisional_password = randomPassword;
  }

  try { socket.emitToRole('admin', EVENTS.PILOT_CREATED, createdPilot); } catch (_) {}
  return createdPilot;
};

exports.getPilots = async ({ limit = 25, page = 1, search = '', crew_role = '' } = {}) => {
  const safeLimit  = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safePage   = Math.max(Number(page) || 1, 1);
  const safeOffset = (safePage - 1) * safeLimit;

  const params = [safeLimit, safeOffset];
  let searchClause = '';
  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    searchClause = `AND (LOWER(u.name) LIKE $${params.length} OR LOWER(p.license_number) LIKE $${params.length}
                    OR LOWER(p.employee_id) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`;
  }

  let roleClause = '';
  if (crew_role === 'pilot') {
    roleClause = `AND (p.crew_role = 'pilot' OR p.crew_role IS NULL)`;
  } else if (crew_role === 'co_pilot') {
    roleClause = `AND p.crew_role = 'co_pilot'`;
  }

  const result = await db.query(
    `SELECT p.id, p.user_id, p.license_number, p.license_expiry,
            p.base_location, p.status, p.certification,
            p.per_day_rate, p.employee_id, p.contact_number,
            p.aadhaar_doc_key, p.passport_doc_key, p.certificate_doc_key,
            p.employment_type, p.crew_role, p.deleted_at, p.updated_at,
            u.name, u.email, u.phone, u.avatar_url,
            COUNT(*) OVER() AS total_count
     FROM pilots p
     JOIN users u ON p.user_id = u.id
     WHERE p.deleted_at IS NULL ${searchClause} ${roleClause}
     ORDER BY p.id DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  const total = result.rows[0] ? Number(result.rows[0].total_count) : 0;
  const rows  = result.rows.map(({ total_count, ...r }) => r);
  return { rows, total, page: safePage, limit: safeLimit };
};

exports.getPilotById = async (id) => {
  const result = await db.query(
    `SELECT p.id, p.user_id, p.license_number, p.license_expiry,
            p.base_location, p.status, p.certification,
            p.per_day_rate, p.employee_id, p.contact_number,
            p.aadhaar_doc_key, p.passport_doc_key, p.certificate_doc_key,
            p.employment_type, p.crew_role, p.deleted_at, p.updated_at,
            u.name, u.email, u.phone, u.avatar_url
     FROM pilots p
     JOIN users u ON p.user_id = u.id
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id]
  );
  if (!result.rows.length) throw Object.assign(new Error('Pilot not found'), { statusCode: 404 });
  return result.rows[0];
};

exports.updatePilot = async (id, data) => {
  // 1. Get existing record to merge
  const check = await db.query('SELECT * FROM pilots WHERE id = $1', [id]);
  if (!check.rows.length) throw Object.assign(new Error('Pilot not found'), { statusCode: 404 });
  const existing = check.rows[0];

  // 2. Perform state-aware update
  const result = await db.query(
    `UPDATE pilots
     SET license_number      = $1,
         license_expiry      = $2,
         status              = $3,
         base_location       = $4,
         certification       = $5,
         per_day_rate        = $6,
         contact_number      = $7,
         aadhaar_doc_key     = COALESCE($8,  aadhaar_doc_key),
         passport_doc_key    = COALESCE($9,  passport_doc_key),
         certificate_doc_key = COALESCE($10, certificate_doc_key),
         employee_id         = $11,
         employment_type     = $12,
         crew_role           = $13
     WHERE id = $14 AND deleted_at IS NULL
     RETURNING *`,
    [
      data.license_number      !== undefined ? data.license_number      : existing.license_number,
      // Empty string from a cleared date field must become NULL — Postgres rejects
      // '' for a DATE column, which previously made the whole update fail.
      data.license_expiry      !== undefined ? (data.license_expiry || null) : existing.license_expiry,
      data.status              !== undefined ? data.status              : existing.status,
      data.base_location       !== undefined ? data.base_location       : existing.base_location,
      data.certification       !== undefined ? data.certification       : existing.certification,
      // Same for the numeric rate — '' is not a valid NUMERIC.
      data.per_day_rate        !== undefined ? (data.per_day_rate === '' ? null : data.per_day_rate) : existing.per_day_rate,
      data.contact_number      !== undefined ? data.contact_number      : existing.contact_number,
      data.aadhaar_doc_key     || null,
      data.passport_doc_key    || null,
      data.certificate_doc_key || null,
      data.employee_id         !== undefined ? data.employee_id         : existing.employee_id,
      data.employment_type     !== undefined ? data.employment_type     : existing.employment_type,
      data.crew_role           !== undefined ? data.crew_role           : existing.crew_role,
      id
    ]
  );
  try { socket.emitToRole('admin', EVENTS.PILOT_UPDATED, result.rows[0]); } catch (_) {}
  return result.rows[0];
};

// FIX: deletePilot — check active allocations before deleting
exports.deletePilot = async (id) => {
  // Check for active allocations
  const activeAllocs = await db.query(
    `SELECT id FROM allocations
     WHERE pilot_id=$1 AND end_date >= CURRENT_DATE`,
    [id]
  );
  if (activeAllocs.rows.length > 0)
    throw Object.assign(
      new Error('Cannot delete pilot: Active project allocations exist. Deallocate first.'),
      { statusCode: 409 }
    );

  const result = await db.query('UPDATE pilots SET deleted_at = CURRENT_TIMESTAMP WHERE id=$1 RETURNING id', [id]);
  if (!result.rows.length) throw Object.assign(new Error('Pilot not found'), { statusCode: 404 });
  try { socket.emitToRole('admin', EVENTS.PILOT_DELETED, { id }); } catch (_) {}
};

// ADD: getAvailability — spec requires GET /resources/pilots/:id/availability
exports.getAvailability = async (pilotId, startDate, endDate) => {
  if (!startDate || !endDate)
    throw Object.assign(new Error('start and end date query params are required'), { statusCode: 400 });

  const pilot = await db.query('SELECT p.*, u.name FROM pilots p JOIN users u ON p.user_id=u.id WHERE p.id=$1', [pilotId]);
  if (!pilot.rows.length) throw Object.assign(new Error('Pilot not found'), { statusCode: 404 });

  // Check allocations in date range
  const conflicts = await db.query(
    `SELECT a.*, proj.name as project_name
     FROM allocations a
     JOIN projects proj ON a.project_id=proj.id
     WHERE (a.pilot_id=$1 OR a.copilot_id=$1) AND (a.start_date <= $3 AND a.end_date >= $2)`,
    [pilotId, startDate, endDate]
  );

  // Check leave events in date range
  const leaveEvents = await db.query(
    `SELECT * FROM calendar_events
     WHERE resource_type IN ('pilot','copilot','all')
       AND (resource_id=$1 OR resource_type='all')
       AND event_type='leave'
       AND (start_date <= $3 AND end_date >= $2)`,
    [pilotId, startDate, endDate]
  );

  // License expiry checks — mirrors the hard/soft logic in allocation.service._checkPilot
  const p = pilot.rows[0];
  const expiryStr  = p.license_expiry ? String(p.license_expiry).substring(0, 10) : null;
  const startStr   = String(startDate).substring(0, 10);
  const endStr     = String(endDate).substring(0, 10);

  let license_expired            = false; // hard block — already expired before window starts
  let license_expiring_in_window = false; // soft warning — expires during the window
  let license_expiry_date        = expiryStr;

  if (expiryStr) {
    if (expiryStr < startStr) {
      license_expired = true;
    } else if (expiryStr <= endStr) {
      license_expiring_in_window = true;
    }
  }

  const isAvailable = conflicts.rows.length === 0 && leaveEvents.rows.length === 0 && !license_expired;

  return {
    pilot: p,
    is_available: isAvailable,
    conflicts: conflicts.rows,
    leave_events: leaveEvents.rows,
    license_expired,
    license_expiring_in_window,
    license_expiry_date,
  };
};
