const pool = require('../../core/config/db');

/**
 * Helper to get days in month
 */
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}


/**
 * ── 1. ATTENDANCE SERVICES ──────────────────────────────────────
 */

const getAttendanceMatrix = async ({ month, year, search }) => {
  const now = new Date();
  const parsedMonth = parseInt(month, 10) || (now.getMonth() + 1);
  const parsedYear = parseInt(year, 10) || now.getFullYear();
  
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
    WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL AND p.employment_type IS DISTINCT FROM 'freelance'
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
    SELECT id, pilot_id, date::text as date, status, check_in, check_out, notes
    FROM pilot_attendance
    WHERE pilot_id = ANY($1) AND date >= $2 AND date <= $3
  `;

  const attendanceResult = await pool.query(attendanceQuery, [pilotIds, startDate, endDate]);

  // Group attendance by pilot_id and date
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

const saveDailyAttendance = async ({ pilot_id, date, status, check_in, check_out, notes }) => {
  const result = await pool.query(
    `INSERT INTO pilot_attendance (pilot_id, date, status, check_in, check_out, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (pilot_id, date) DO UPDATE
     SET status = EXCLUDED.status,
         check_in = EXCLUDED.check_in,
         check_out = EXCLUDED.check_out,
         notes = EXCLUDED.notes,
         updated_at = NOW()
     RETURNING id, pilot_id, date::text as date, status, check_in, check_out, notes`,
    [pilot_id, date, status, check_in || null, check_out || null, notes || null]
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
        `INSERT INTO pilot_attendance (pilot_id, date, status, check_in, check_out, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (pilot_id, date) DO UPDATE
         SET status = EXCLUDED.status,
             check_in = EXCLUDED.check_in,
             check_out = EXCLUDED.check_out,
             notes = EXCLUDED.notes,
             updated_at = NOW()
         RETURNING id, pilot_id, date::text as date, status, check_in, check_out, notes`,
        [rec.pilot_id, date, rec.status, rec.check_in || null, rec.check_out || null, rec.notes || null]
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

const dateRangeSaveAttendance = async ({ pilot_id, pilot_ids, start_date, end_date, status, notes }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const targets = (pilot_ids && Array.isArray(pilot_ids) && pilot_ids.length > 0) ? pilot_ids : [pilot_id];
    
    // Generate array of dates between start_date and end_date
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
        const parts = dt.split('-');
        const d = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
        const isSunday = d.getUTCDay() === 0;

        let resolvedStatus = status;
        if (isSunday) {
          if (status === 'on_field') {
            resolvedStatus = 'ot';
          } else {
            resolvedStatus = 'off';
          }
        }

        const res = await client.query(
          `INSERT INTO pilot_attendance (pilot_id, date, status, notes)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (pilot_id, date) DO UPDATE
           SET status = EXCLUDED.status,
               notes = EXCLUDED.notes,
               updated_at = NOW()
           RETURNING id, pilot_id, date::text as date, status, notes`,
          [pid, dt, resolvedStatus, notes || null]
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


/**
 * ── 2. LEAVE BALANCES & HOLIDAYS SERVICES ───────────────────────
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
    WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL AND p.employment_type IS DISTINCT FROM 'freelance'
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


/**
 * ── 3. SALARY & BONUS SETTINGS SERVICES ─────────────────────────
 */

const getPayrollSettings = async () => {
  const query = `
    SELECT p.id as pilot_id, p.employee_id, u.name, u.email,
           COALESCE(s.base_monthly_salary, p.per_day_rate * 30, 0) as base_monthly_salary,
           COALESCE(s.field_per_diem_bonus, 0) as field_per_diem_bonus,
           COALESCE(s.unapproved_absent_deduction, 0) as unapproved_absent_deduction,
           COALESCE(s.per_flight_bonus, 0) as per_flight_bonus,
           COALESCE(s.custom_bonus_default, 0) as custom_bonus_default,
           COALESCE(s.custom_deduction_default, 0) as custom_deduction_default,
           s.id as setting_id
    FROM pilots p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN pilot_payroll_settings s ON s.pilot_id = p.id
    WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL AND p.employment_type IS DISTINCT FROM 'freelance'
    ORDER BY u.name ASC
  `;
  const result = await pool.query(query);
  return result.rows.map(r => ({
    ...r,
    base_monthly_salary: parseFloat(r.base_monthly_salary),
    field_per_diem_bonus: parseFloat(r.field_per_diem_bonus),
    unapproved_absent_deduction: parseFloat(r.unapproved_absent_deduction),
    per_flight_bonus: parseFloat(r.per_flight_bonus),
    custom_bonus_default: parseFloat(r.custom_bonus_default),
    custom_deduction_default: parseFloat(r.custom_deduction_default),
  }));
};

const updatePayrollSettings = async ({
  pilot_id,
  base_monthly_salary,
  field_per_diem_bonus,
  unapproved_absent_deduction,
  per_flight_bonus,
  custom_bonus_default,
  custom_deduction_default
}) => {
  const result = await pool.query(
    `INSERT INTO pilot_payroll_settings (
       pilot_id, base_monthly_salary, field_per_diem_bonus, unapproved_absent_deduction,
       per_flight_bonus, custom_bonus_default, custom_deduction_default
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (pilot_id) DO UPDATE
     SET base_monthly_salary = EXCLUDED.base_monthly_salary,
         field_per_diem_bonus = EXCLUDED.field_per_diem_bonus,
         unapproved_absent_deduction = EXCLUDED.unapproved_absent_deduction,
         per_flight_bonus = EXCLUDED.per_flight_bonus,
         custom_bonus_default = EXCLUDED.custom_bonus_default,
         custom_deduction_default = EXCLUDED.custom_deduction_default,
         updated_at = NOW()
     RETURNING *`,
    [
      pilot_id,
      base_monthly_salary || 0,
      field_per_diem_bonus || 0,
      unapproved_absent_deduction || 0,
      per_flight_bonus || 0,
      custom_bonus_default || 0,
      custom_deduction_default || 0
    ]
  );
  return result.rows[0];
};


/**
 * ── 4. MONTHLY PAYROLL CALCULATOR SERVICES ─────────────────────
 */

const calculateMonthlyPayroll = async ({ month, year, search }) => {
  const now = new Date();
  const parsedMonth = parseInt(month, 10) || (now.getMonth() + 1);
  const parsedYear = parseInt(year, 10) || now.getFullYear();
  const workingDays = getDaysInMonth(parsedYear, parsedMonth);

  const startDate = `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-01`;
  const endDate = `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-${String(workingDays).padStart(2, '0')}`;

  let pilotQuery = `
    SELECT p.id as pilot_id, p.employee_id, u.name, u.email,
           COALESCE(s.base_monthly_salary, p.per_day_rate * $1, 0) as config_base_salary,
           COALESCE(s.field_per_diem_bonus, 0) as config_field_bonus,
           COALESCE(s.unapproved_absent_deduction, 0) as config_absent_cut,
           COALESCE(s.custom_bonus_default, 0) as config_custom_bonus,
           COALESCE(s.custom_deduction_default, 0) as config_custom_deduction
    FROM pilots p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN pilot_payroll_settings s ON s.pilot_id = p.id
    WHERE p.deleted_at IS NULL AND u.deleted_at IS NULL AND p.employment_type IS DISTINCT FROM 'freelance'
  `;
  const params = [workingDays];

  if (search) {
    params.push(`%${search}%`);
    pilotQuery += ` AND (u.name ILIKE $${params.length} OR p.employee_id ILIKE $${params.length})`;
  }

  pilotQuery += ` ORDER BY u.name ASC`;

  const pilotsResult = await pool.query(pilotQuery, params);
  const pilots = pilotsResult.rows;

  if (pilots.length === 0) {
    return { month: parsedMonth, year: parsedYear, records: [] };
  }

  const pilotIds = pilots.map(p => p.pilot_id);

  // Fetch attendance counts for this month
  const attendanceQuery = `
    SELECT pilot_id, status, COUNT(*) as count
    FROM pilot_attendance
    WHERE pilot_id = ANY($1) AND date >= $2 AND date <= $3
    GROUP BY pilot_id, status
  `;
  const attRes = await pool.query(attendanceQuery, [pilotIds, startDate, endDate]);

  const attCounts = {};
  attRes.rows.forEach(r => {
    if (!attCounts[r.pilot_id]) attCounts[r.pilot_id] = {};
    attCounts[r.pilot_id][r.status] = parseInt(r.count, 10);
  });

  // Fetch saved payroll records if any exist for this month/year
  const savedQuery = `
    SELECT * FROM pilot_payroll_records
    WHERE pilot_id = ANY($1) AND month = $2 AND year = $3
  `;
  const savedRes = await pool.query(savedQuery, [pilotIds, parsedMonth, parsedYear]);
  const savedMap = {};
  savedRes.rows.forEach(r => {
    savedMap[r.pilot_id] = r;
  });

  const records = pilots.map(pilot => {
    const counts = attCounts[pilot.pilot_id] || {};
    const daysPresent = counts['present'] || 0;
    const daysOnField = counts['on_field'] || 0;
    const daysLeave   = counts['on_leave'] || 0;
    const daysWfh     = counts['wfh'] || 0;
    const daysHalf    = counts['half_day'] || 0;
    const daysOt      = counts['ot'] || 0;

    const saved = savedMap[pilot.pilot_id];

    if (saved) {
      return {
        id: saved.id,
        pilot_id: pilot.pilot_id,
        name: pilot.name,
        employee_id: pilot.employee_id,
        email: pilot.email,
        working_days: saved.working_days,
        days_present: parseFloat(saved.days_present),
        days_on_field: parseFloat(saved.days_on_field),
        days_leave: parseFloat(saved.days_leave),
        days_absent: parseFloat(saved.days_absent || 0),
        days_wfh: parseFloat(saved.days_wfh || 0),
        days_ot: parseFloat(saved.days_ot || 0),
        days_half: parseFloat(saved.days_half),
        base_salary: parseFloat(saved.base_salary),
        field_bonus_total: parseFloat(saved.field_bonus_total),
        custom_bonus: parseFloat(saved.custom_bonus),
        bonus_notes: saved.bonus_notes || '',
        unpaid_absent_cut: parseFloat(saved.unpaid_absent_cut),
        custom_deduction: parseFloat(saved.custom_deduction),
        deduction_notes: saved.deduction_notes || '',
        net_salary: parseFloat(saved.net_salary),
        status: saved.status,
        is_saved: true
      };
    }

    // Auto-calculate defaults based on settings + attendance
    const baseSalary = parseFloat(pilot.config_base_salary);
    const fieldBonusTotal = daysOnField * parseFloat(pilot.config_field_bonus);
    const customBonus = parseFloat(pilot.config_custom_bonus);
    // WFH is a paid state, so only half days result in a 0.5 unapproved deduction cut
    const unpaidAbsentCut = (daysHalf * 0.5) * parseFloat(pilot.config_absent_cut);
    const customDeduction = parseFloat(pilot.config_custom_deduction);

    const netSalary = Math.max(0, baseSalary + fieldBonusTotal + customBonus - unpaidAbsentCut - customDeduction);

    return {
      pilot_id: pilot.pilot_id,
      name: pilot.name,
      employee_id: pilot.employee_id,
      email: pilot.email,
      working_days: workingDays,
      days_present: daysPresent,
      days_on_field: daysOnField,
      days_leave: daysLeave,
      days_absent: 0,
      days_wfh: daysWfh,
      days_ot: daysOt,
      days_half: daysHalf,
      base_salary: baseSalary,
      field_bonus_total: fieldBonusTotal,
      custom_bonus: customBonus,
      bonus_notes: '',
      unpaid_absent_cut: unpaidAbsentCut,
      custom_deduction: customDeduction,
      deduction_notes: '',
      net_salary: netSalary,
      status: 'draft',
      is_saved: false
    };
  });

  return {
    month: parsedMonth,
    year: parsedYear,
    workingDays,
    records
  };
};

const savePayrollRecord = async ({
  pilot_id,
  month,
  year,
  working_days,
  days_present,
  days_on_field,
  days_leave,
  days_absent,
  days_wfh,
  days_ot,
  days_half,
  base_salary,
  field_bonus_total,
  custom_bonus,
  bonus_notes,
  unpaid_absent_cut,
  custom_deduction,
  deduction_notes,
  status
}) => {
  const net_salary = Math.max(
    0,
    parseFloat(base_salary || 0) +
    parseFloat(field_bonus_total || 0) +
    parseFloat(custom_bonus || 0) -
    parseFloat(unpaid_absent_cut || 0) -
    parseFloat(custom_deduction || 0)
  );

  const result = await pool.query(
    `INSERT INTO pilot_payroll_records (
       pilot_id, month, year, working_days, days_present, days_on_field, days_leave,
       days_absent, days_wfh, days_ot, days_half, base_salary, field_bonus_total, custom_bonus, bonus_notes,
       unpaid_absent_cut, custom_deduction, deduction_notes, net_salary, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     ON CONFLICT (pilot_id, month, year) DO UPDATE
     SET working_days = EXCLUDED.working_days,
         days_present = EXCLUDED.days_present,
         days_on_field = EXCLUDED.days_on_field,
         days_leave = EXCLUDED.days_leave,
         days_absent = EXCLUDED.days_absent,
         days_wfh = EXCLUDED.days_wfh,
         days_ot = EXCLUDED.days_ot,
         days_half = EXCLUDED.days_half,
         base_salary = EXCLUDED.base_salary,
         field_bonus_total = EXCLUDED.field_bonus_total,
         custom_bonus = EXCLUDED.custom_bonus,
         bonus_notes = EXCLUDED.bonus_notes,
         unpaid_absent_cut = EXCLUDED.unpaid_absent_cut,
         custom_deduction = EXCLUDED.custom_deduction,
         deduction_notes = EXCLUDED.deduction_notes,
         net_salary = EXCLUDED.net_salary,
         status = EXCLUDED.status,
         updated_at = NOW()
     RETURNING *`,
    [
      pilot_id, month, year, working_days || 30, days_present || 0, days_on_field || 0,
      days_leave || 0, days_absent || 0, days_wfh || 0, days_ot || 0, days_half || 0, base_salary || 0, field_bonus_total || 0,
      custom_bonus || 0, bonus_notes || null, unpaid_absent_cut || 0, custom_deduction || 0,
      deduction_notes || null, net_salary, status || 'draft'
    ]
  );
  return result.rows[0];
};

const saveBulkPayrollRecords = async ({ month, year, records }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saved = [];

    for (const rec of records) {
      const net_salary = Math.max(
        0,
        parseFloat(rec.base_salary || 0) +
        parseFloat(rec.field_bonus_total || 0) +
        parseFloat(rec.custom_bonus || 0) -
        parseFloat(rec.unpaid_absent_cut || 0) -
        parseFloat(rec.custom_deduction || 0)
      );

      const res = await client.query(
        `INSERT INTO pilot_payroll_records (
           pilot_id, month, year, working_days, days_present, days_on_field, days_leave,
           days_absent, days_wfh, days_ot, days_half, base_salary, field_bonus_total, custom_bonus, bonus_notes,
           unpaid_absent_cut, custom_deduction, deduction_notes, net_salary, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         ON CONFLICT (pilot_id, month, year) DO UPDATE
         SET working_days = EXCLUDED.working_days,
             days_present = EXCLUDED.days_present,
             days_on_field = EXCLUDED.days_on_field,
             days_leave = EXCLUDED.days_leave,
             days_absent = EXCLUDED.days_absent,
             days_wfh = EXCLUDED.days_wfh,
             days_ot = EXCLUDED.days_ot,
             days_half = EXCLUDED.days_half,
             base_salary = EXCLUDED.base_salary,
             field_bonus_total = EXCLUDED.field_bonus_total,
             custom_bonus = EXCLUDED.custom_bonus,
             bonus_notes = EXCLUDED.bonus_notes,
             unpaid_absent_cut = EXCLUDED.unpaid_absent_cut,
             custom_deduction = EXCLUDED.custom_deduction,
             deduction_notes = EXCLUDED.deduction_notes,
             net_salary = EXCLUDED.net_salary,
             status = EXCLUDED.status,
             updated_at = NOW()
         RETURNING *`,
        [
          rec.pilot_id, month, year, rec.working_days || 30, rec.days_present || 0, rec.days_on_field || 0,
          rec.days_leave || 0, rec.days_absent || 0, rec.days_wfh || 0, rec.days_ot || 0, rec.days_half || 0, rec.base_salary || 0, rec.field_bonus_total || 0,
          rec.custom_bonus || 0, rec.bonus_notes || null, rec.unpaid_absent_cut || 0, rec.custom_deduction || 0,
          rec.deduction_notes || null, net_salary, rec.status || 'draft'
        ]
      );
      saved.push(res.rows[0]);
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

module.exports = {
  getAttendanceMatrix,
  saveDailyAttendance,
  bulkSaveAttendance,
  updatePilotDetails,
  dateRangeSaveAttendance,
  getLeaveBalances,
  updatePilotLeaveBalance,
  getCompanyHolidays,
  addCompanyHoliday,
  deleteCompanyHoliday,
  getPayrollSettings,
  updatePayrollSettings,
  calculateMonthlyPayroll,
  savePayrollRecord,
  saveBulkPayrollRecords
};
