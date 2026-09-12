const pool = require('../../core/config/db');

/**
 * Helper to get days in month
 */
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * ── 1. ATTENDANCE MATRIX & LOGS ──────────────────────────────────
 */

const getAttendanceMatrix = async ({ month, year, search }) => {
  const parsedMonth = parseInt(month, 10);
  const parsedYear = parseInt(year, 10);

  const startDate = `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-01`;
  const totalDays = getDaysInMonth(parsedYear, parsedMonth);
  const endDate = `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`;

  let pilotQuery = `
    SELECT p.id as pilot_id, p.employee_id, u.id as user_id, u.name, u.email, u.phone,
           p.status as pilot_status, p.joining_date::text as joining_date,
           p.employment_type, p.designation, p.base_location, p.license_number,
           p.license_expiry::text as license_expiry
    FROM pilots p
    JOIN users u ON p.user_id = u.id
    WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL
  `;
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    pilotQuery += ` AND (u.name ILIKE $${params.length} OR p.employee_id ILIKE $${params.length})`;
  }

  pilotQuery += ` ORDER BY u.name ASC`;

  const pilotsResult = await pool.query(pilotQuery, params);
  const pilots = pilotsResult.rows;

  if (pilots.length === 0) {
    return { pilots: [], month: parsedMonth, year: parsedYear, totalDays };
  }

  const pilotIds = pilots.map(p => p.pilot_id);

  const attendanceQuery = `
    SELECT id, pilot_id, date::text as date, status, check_in, check_out, site_location, notes
    FROM pilot_attendance
    WHERE pilot_id = ANY($1) AND date >= $2 AND date <= $3
  `;

  const attendanceResult = await pool.query(attendanceQuery, [pilotIds, startDate, endDate]);

  const attendanceMap = {};
  attendanceResult.rows.forEach(record => {
    if (!attendanceMap[record.pilot_id]) {
      attendanceMap[record.pilot_id] = {};
    }
    attendanceMap[record.pilot_id][record.date] = record;
  });

  const enrichedPilots = pilots.map(pilot => {
    const pAttendance = attendanceMap[pilot.pilot_id] || {};
    let daysPresent = 0;
    let daysField = 0;
    let daysLeave = 0;
    let daysWfh = 0;
    let daysHalf = 0;
    let daysHoliday = 0;
    let daysOt = 0;

    Object.values(pAttendance).forEach(att => {
      if (att.status === 'present') daysPresent++;
      else if (att.status === 'on_field') daysField++;
      else if (att.status === 'on_leave') daysLeave++;
      else if (att.status === 'wfh') daysWfh++;
      else if (att.status === 'half_day') daysHalf++;
      else if (att.status === 'holiday') daysHoliday++;
      else if (att.status === 'ot') daysOt++;
    });

    return {
      ...pilot,
      attendance: pAttendance,
      summary: {
        daysPresent,
        daysField,
        daysLeave,
        daysWfh,
        daysHalf,
        daysHoliday,
        daysOt
      }
    };
  });

  return {
    pilots: enrichedPilots,
    month: parsedMonth,
    year: parsedYear,
    totalDays
  };
};

const saveDailyAttendance = async ({ pilot_id, date, status, check_in, check_out, site_location, notes }) => {
  const result = await pool.query(
    `INSERT INTO pilot_attendance (pilot_id, date, status, check_in, check_out, site_location, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (pilot_id, date) DO UPDATE
     SET status = EXCLUDED.status,
         check_in = EXCLUDED.check_in,
         check_out = EXCLUDED.check_out,
         site_location = EXCLUDED.site_location,
         notes = EXCLUDED.notes,
         updated_at = NOW()
     RETURNING id, pilot_id, date::text as date, status, check_in, check_out, site_location, notes`,
    [pilot_id, date, status, check_in || null, check_out || null, site_location || null, notes || null]
  );

  return result.rows[0];
};

const bulkSaveAttendance = async ({ date, records }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updatedRecords = [];

    for (const rec of records) {
      const res = await client.query(
        `INSERT INTO pilot_attendance (pilot_id, date, status, check_in, check_out, site_location, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (pilot_id, date) DO UPDATE
         SET status = EXCLUDED.status,
             check_in = EXCLUDED.check_in,
             check_out = EXCLUDED.check_out,
             site_location = EXCLUDED.site_location,
             notes = EXCLUDED.notes,
             updated_at = NOW()
         RETURNING id, pilot_id, date::text as date, status, check_in, check_out, site_location, notes`,
        [rec.pilot_id, date, rec.status, rec.check_in || null, rec.check_out || null, rec.site_location || null, rec.notes || null]
      );
      updatedRecords.push(res.rows[0]);
    }

    await client.query('COMMIT');
    return updatedRecords;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const dateRangeSaveAttendance = async ({ pilot_id, pilot_ids, start_date, end_date, status, site_location, notes }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const targets = (pilot_ids && Array.isArray(pilot_ids) && pilot_ids.length > 0) ? pilot_ids : [pilot_id];

    const start = new Date(start_date);
    const end = new Date(end_date);
    const dateList = [];

    const curr = new Date(start);
    while (curr <= end) {
      dateList.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }

    const saved = [];
    for (const pid of targets) {
      if (!pid) continue;
      for (const dt of dateList) {
        const res = await client.query(
          `INSERT INTO pilot_attendance (pilot_id, date, status, site_location, notes)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (pilot_id, date) DO UPDATE
           SET status = EXCLUDED.status,
               site_location = EXCLUDED.site_location,
               notes = EXCLUDED.notes,
               updated_at = NOW()
           RETURNING id, pilot_id, date::text as date, status, site_location, notes`,
          [pid, dt, status, site_location || null, notes || null]
        );
        saved.push(res.rows[0]);
      }
    }

    await client.query('COMMIT');
    return saved;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const updatePilotDetails = async ({ pilot_id, joining_date, employment_type, designation }) => {
  const result = await pool.query(
    `UPDATE pilots
     SET joining_date = $1,
         employment_type = COALESCE($2, employment_type),
         designation = COALESCE($3, designation),
         updated_at = NOW()
     WHERE id = $4
     RETURNING id, joining_date::text as joining_date, employment_type, designation`,
    [joining_date || null, employment_type, designation, pilot_id]
  );
  return result.rows[0];
};


/**
 * ── 2. LEAVE BALANCES & HOLIDAYS ─────────────────────────────────
 */

const getLeaveBalances = async ({ year, search }) => {
  const parsedYear = parseInt(year || new Date().getFullYear(), 10);
  const startDate = `${parsedYear}-01-01`;
  const endDate = `${parsedYear}-12-31`;

  let query = `
    SELECT p.id as pilot_id, p.employee_id, u.name, u.email,
           COALESCE(b.total_allowed_leaves, 18) as total_allowed_leaves,
           COALESCE(b.casual_leave, 6) as casual_leave,
           COALESCE(b.sick_leave, 6) as sick_leave,
           COALESCE(b.earned_leave, 6) as earned_leave,
           b.id as balance_id,
           COALESCE(
             (SELECT COUNT(*) FROM pilot_attendance pa WHERE pa.pilot_id = p.id AND pa.status = 'on_leave' AND pa.date >= $1 AND pa.date <= $2),
             0
           ) as leaves_taken
    FROM pilots p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN pilot_leave_balances b ON b.pilot_id = p.id AND b.year = $3
    WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL
  `;
  const params = [startDate, endDate, parsedYear];

  if (search) {
    params.push(`%${search}%`);
    query += ` AND (u.name ILIKE $${params.length} OR p.employee_id ILIKE $${params.length})`;
  }

  query += ` ORDER BY u.name ASC`;

  const result = await pool.query(query, params);

  return result.rows.map(row => ({
    ...row,
    total_allowed_leaves: parseFloat(row.total_allowed_leaves),
    leaves_taken: parseInt(row.leaves_taken, 10),
    leaves_remaining: Math.max(0, parseFloat(row.total_allowed_leaves) - parseInt(row.leaves_taken, 10))
  }));
};

const updatePilotLeaveBalance = async ({ pilot_id, year, total_allowed_leaves, casual_leave, sick_leave, earned_leave }) => {
  const parsedYear = parseInt(year, 10);
  const result = await pool.query(
    `INSERT INTO pilot_leave_balances (pilot_id, year, total_allowed_leaves, casual_leave, sick_leave, earned_leave)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (pilot_id, year) DO UPDATE
     SET total_allowed_leaves = EXCLUDED.total_allowed_leaves,
         casual_leave = EXCLUDED.casual_leave,
         sick_leave = EXCLUDED.sick_leave,
         earned_leave = EXCLUDED.earned_leave,
         updated_at = NOW()
     RETURNING *`,
    [pilot_id, parsedYear, total_allowed_leaves, casual_leave || 6, sick_leave || 6, earned_leave || 6]
  );
  return result.rows[0];
};

const getCompanyHolidays = async ({ year }) => {
  const parsedYear = parseInt(year || new Date().getFullYear(), 10);
  const result = await pool.query(
    `SELECT id, date::text as date, name, year, is_optional, created_at
     FROM company_holidays
     WHERE year = $1
     ORDER BY date ASC`,
    [parsedYear]
  );
  return result.rows;
};

const addCompanyHoliday = async ({ date, name, is_optional }) => {
  const parsedYear = new Date(date).getFullYear();
  const result = await pool.query(
    `INSERT INTO company_holidays (date, name, year, is_optional)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (date) DO UPDATE
     SET name = EXCLUDED.name,
         is_optional = EXCLUDED.is_optional
     RETURNING id, date::text as date, name, year, is_optional, created_at`,
    [date, name, parsedYear, is_optional || false]
  );
  return result.rows[0];
};

const deleteCompanyHoliday = async (id) => {
  await pool.query(`DELETE FROM company_holidays WHERE id = $1`, [id]);
  return { success: true };
};

module.exports = {
  getAttendanceMatrix,
  saveDailyAttendance,
  bulkSaveAttendance,
  dateRangeSaveAttendance,
  updatePilotDetails,
  getLeaveBalances,
  updatePilotLeaveBalance,
  getCompanyHolidays,
  addCompanyHoliday,
  deleteCompanyHoliday
};
