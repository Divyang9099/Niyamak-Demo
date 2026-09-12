const db    = require('../../core/config/db');
const audit = require('./bd.audit.service');
const { PRIORITIES, CLIENT_STATUSES, badRequest, assertIn } = require('./bd.validation');

const notFound = () => Object.assign(new Error('Client not found'), { statusCode: 404 });

// Whitelisted sortable columns — never interpolate req.query.sort_by directly.
const SORT_COLUMNS = {
  name:            'c.name',
  priority:        'c.priority',
  status:          'c.status',
  created_at:      'c.created_at',
  last_activity_at:   'c.last_activity_at',
  next_follow_up_at:  'c.next_follow_up_at',
};

// Status display order used everywhere a client list needs "WIP first, cancelled last".
const STATUS_RANK_SQL = `CASE c.status
  WHEN 'wip'              THEN 1
  WHEN 'to_be_initiated'  THEN 2
  WHEN 'closed_onboard'   THEN 3
  WHEN 'closed_cancelled' THEN 4
  ELSE 5 END`;

/**
 * One filter builder shared by list / dashboard / stats / export so the four
 * views can never drift (BD_MODULE_PLAN.md §9.2).
 */
const buildFilters = (query = {}) => {
  const conditions = ['c.deleted_at IS NULL'];
  const values = [];
  const push = (v) => { values.push(v); return `$${values.length}`; };

  if (query.search) {
    const p = push(`%${String(query.search).trim()}%`);
    conditions.push(`(
      c.name ILIKE ${p}
      OR EXISTS (SELECT 1 FROM bd_contacts ct WHERE ct.client_id = c.id AND ct.deleted_at IS NULL AND ct.name ILIKE ${p})
      OR EXISTS (SELECT 1 FROM bd_channels ch WHERE ch.client_id = c.id AND ch.deleted_at IS NULL AND ch.value ILIKE ${p})
    )`);
  }

  if (query.sector) {
    const keys = String(query.sector).split(',').map(s => s.trim()).filter(Boolean);
    if (keys.length) conditions.push(`c.sectors && ${push(keys)}::TEXT[]`);
  }

  if (query.priority) {
    const vals = String(query.priority).split(',').map(s => s.trim().toUpperCase()).filter(v => PRIORITIES.includes(v));
    if (vals.length) conditions.push(`c.priority = ANY(${push(vals)}::TEXT[])`);
  }

  if (query.status) {
    const vals = String(query.status).split(',').map(s => s.trim()).filter(v => CLIENT_STATUSES.includes(v));
    if (vals.length) conditions.push(`c.status = ANY(${push(vals)}::TEXT[])`);
  }

  if (query.bd_owner) {
    const ids = String(query.bd_owner).split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length) conditions.push(`c.bd_owner_id = ANY(${push(ids)}::UUID[])`);
  }

  if (query.followup === 'overdue') {
    conditions.push(`c.next_follow_up_at IS NOT NULL AND c.next_follow_up_at < NOW()`);
  } else if (query.followup === 'due_today') {
    conditions.push(`c.next_follow_up_at IS NOT NULL AND c.next_follow_up_at::DATE = NOW()::DATE`);
  } else if (query.followup === 'due_week') {
    conditions.push(`c.next_follow_up_at IS NOT NULL AND c.next_follow_up_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'`);
  } else if (query.followup === 'none') {
    conditions.push(`c.next_follow_up_at IS NULL`);
  }

  if (query.last_contacted === 'never') {
    conditions.push(`c.last_activity_at IS NULL`);
  } else if (query.last_contacted === 'stale30') {
    conditions.push(`c.last_activity_at IS NOT NULL AND c.last_activity_at < NOW() - INTERVAL '30 days'`);
  }

  if (query.created_from) conditions.push(`c.created_at >= ${push(query.created_from)}`);
  if (query.created_to)   conditions.push(`c.created_at <= ${push(query.created_to)}`);

  if (query.has_logo === 'true')  conditions.push(`c.logo_url IS NOT NULL`);
  if (query.has_logo === 'false') conditions.push(`c.logo_url IS NULL`);

  return { where: conditions.join(' AND '), values };
};

// ── CREATE ───────────────────────────────────────────────────────────────────
exports.createClient = async (data, userId) => {
  const name = String(data.name || '').trim();
  if (!name) throw badRequest('Client name is required');

  const priority = (data.priority || 'C').toUpperCase();
  assertIn(priority, PRIORITIES, 'priority');

  const sectors = Array.isArray(data.sectors) ? data.sectors : [];

  try {
    const { rows } = await db.query(
      `INSERT INTO bd_clients
         (name, details, bd_owner_id, priority, sectors, website, city, state, address, notes, created_by)
       VALUES ($1,$2,$3,$4,$5::TEXT[],$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        name,
        data.details || null,
        data.bd_owner_id || userId || null,   // defaults to the creating admin
        priority,
        sectors,
        data.website || null,
        data.city    || null,
        data.state   || null,
        data.address || null,
        data.notes   || null,
        userId || null,
      ]
    );
    const client = rows[0];
    audit.log({ user_id: userId, action: 'CREATE_CLIENT', entity_type: 'client', entity_id: client.id, client_id: client.id, new_value: { name, priority, sectors } }).catch(() => {});
    return client;
  } catch (err) {
    if (err.code === '23505') throw Object.assign(new Error('A BD client with this name already exists'), { statusCode: 409 });
    throw err;
  }
};

// ── LIST ─────────────────────────────────────────────────────────────────────
exports.getClients = async (query = {}) => {
  const safeLimit  = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const safePage   = Math.max(Number(query.page) || 1, 1);
  const safeOffset = (safePage - 1) * safeLimit;

  const { where, values } = buildFilters(query);

  const sortCol = SORT_COLUMNS[query.sort_by] || 'c.priority';
  const sortDir = String(query.sort_dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  // Default ordering: priority A→B→C, then status (WIP first), then most recently active.
  const orderBy = query.sort_by
    ? `${sortCol} ${sortDir}, c.priority ASC, ${STATUS_RANK_SQL} ASC`
    : `c.priority ASC, ${STATUS_RANK_SQL} ASC, c.last_activity_at DESC NULLS LAST`;

  const listValues = [...values, safeLimit, safeOffset];
  const result = await db.query(
    `SELECT c.*, u.name AS bd_owner_name, COUNT(*) OVER() AS total_count,
       EXISTS (
         SELECT 1 FROM bd_touchpoints t
         WHERE t.client_id = c.id AND t.response_status IN ('positive', 'negative', 'neutral', 'bounced')
       ) AS has_responded
     FROM bd_clients c
     LEFT JOIN users u ON u.id = c.bd_owner_id
     WHERE ${where}
     ORDER BY ${orderBy}
     LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues
  );

  const total = Number(result.rows[0]?.total_count || 0);
  const rows  = result.rows.map(({ total_count, ...r }) => r);
  return { rows, total, page: safePage, limit: safeLimit };
};

// ── EXPORT — every client + every one of their contacts, for the "Clients" +
// "Contacts" Excel workbook. Reuses buildFilters so an export from a filtered
// board/table view matches exactly what's on screen; independent of either
// view's loaded state so it works the same from Board or Table. ─────────────
exports.exportClients = async (query = {}) => {
  const { where, values } = buildFilters(query);

  const [clientsRes, sectorsRes] = await Promise.all([
    db.query(
      `SELECT c.*, u.name AS bd_owner_name
       FROM bd_clients c
       LEFT JOIN users u ON u.id = c.bd_owner_id
       WHERE ${where}
       ORDER BY c.priority ASC, ${STATUS_RANK_SQL} ASC, c.name ASC`,
      values
    ),
    db.query(`SELECT key, label FROM bd_sectors`),
  ]);

  // sectors[] stores keys ('solar') — map to labels ('Solar') for a readable sheet.
  const sectorLabel = Object.fromEntries(sectorsRes.rows.map(s => [s.key, s.label]));
  const clients = clientsRes.rows.map(c => ({
    ...c,
    primary_sector_label: Array.isArray(c.sectors) && c.sectors.length ? (sectorLabel[c.sectors[0]] || c.sectors[0]) : '',
    sectors_label: (c.sectors || []).map(k => sectorLabel[k] || k).join(', '),
  }));

  const clientIds = clients.map(c => c.id);
  let contacts = [];
  if (clientIds.length) {
    const contactsRes = await db.query(
      `SELECT ct.*, c.name AS client_name, d.label AS department_label,
              (SELECT value FROM bd_channels WHERE contact_id = ct.id AND channel_type = 'email'    AND deleted_at IS NULL ORDER BY is_primary DESC, sort_order LIMIT 1) AS email,
              (SELECT value FROM bd_channels WHERE contact_id = ct.id AND channel_type = 'phone'    AND deleted_at IS NULL ORDER BY is_primary DESC, sort_order LIMIT 1) AS phone,
              (SELECT value FROM bd_channels WHERE contact_id = ct.id AND channel_type = 'whatsapp' AND deleted_at IS NULL ORDER BY is_primary DESC, sort_order LIMIT 1) AS whatsapp,
              (SELECT value FROM bd_channels WHERE contact_id = ct.id AND channel_type = 'linkedin' AND deleted_at IS NULL ORDER BY is_primary DESC, sort_order LIMIT 1) AS linkedin
       FROM bd_contacts ct
       JOIN bd_clients c ON c.id = ct.client_id
       LEFT JOIN bd_departments d ON d.key = ct.department
       WHERE ct.client_id = ANY($1::UUID[]) AND ct.deleted_at IS NULL
       ORDER BY c.name, ct.sort_order, ct.created_at`,
      [clientIds]
    );
    contacts = contactsRes.rows;
  }

  return { clients, contacts };
};

// ── GET ONE (with contacts + channels + open follow-ups) ─────────────────────
exports.getClientById = async (id) => {
  const result = await db.query(
    `SELECT c.*, u.name AS bd_owner_name
     FROM bd_clients c
     LEFT JOIN users u ON u.id = c.bd_owner_id
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [id]
  );
  if (!result.rows.length) throw notFound();
  const client = result.rows[0];

  const [contacts, channels, followups] = await Promise.all([
    db.query(
      `SELECT * FROM bd_contacts WHERE client_id = $1 AND deleted_at IS NULL ORDER BY sort_order, created_at`,
      [id]
    ),
    db.query(
      `SELECT * FROM bd_channels WHERE client_id = $1 AND deleted_at IS NULL ORDER BY owner_type, contact_id NULLS FIRST, sort_order`,
      [id]
    ),
    db.query(
      `SELECT * FROM bd_followups WHERE client_id = $1 AND status IN ('pending','sent','escalated') ORDER BY due_at ASC`,
      [id]
    ),
  ]);

  return { ...client, contacts: contacts.rows, channels: channels.rows, open_followups: followups.rows };
};

// ── UPDATE ───────────────────────────────────────────────────────────────────
exports.updateClient = async (id, data, userId) => {
  const existing = await db.query('SELECT * FROM bd_clients WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing.rows.length) throw notFound();

  const newName = data.name !== undefined ? String(data.name).trim() : undefined;
  if (newName !== undefined && !newName) throw badRequest('Client name cannot be empty');

  let priority = data.priority !== undefined ? String(data.priority).toUpperCase() : undefined;
  if (priority !== undefined) assertIn(priority, PRIORITIES, 'priority');

  const sectors = data.sectors !== undefined ? (Array.isArray(data.sectors) ? data.sectors : []) : undefined;

  try {
    const { rows } = await db.query(
      `UPDATE bd_clients SET
         name        = COALESCE($1,  name),
         details     = COALESCE($2,  details),
         bd_owner_id = COALESCE($3,  bd_owner_id),
         priority    = COALESCE($4,  priority),
         sectors     = COALESCE($5::TEXT[], sectors),
         website     = COALESCE($6,  website),
         city        = COALESCE($7,  city),
         state       = COALESCE($8,  state),
         address     = COALESCE($9,  address),
         notes       = COALESCE($10, notes)
       WHERE id = $11 AND deleted_at IS NULL
       RETURNING *`,
      [
        newName !== undefined ? newName : null,
        data.details     !== undefined ? data.details     : null,
        data.bd_owner_id !== undefined ? data.bd_owner_id : null,
        priority         !== undefined ? priority         : null,
        sectors          !== undefined ? sectors          : null,
        data.website     !== undefined ? data.website     : null,
        data.city        !== undefined ? data.city        : null,
        data.state       !== undefined ? data.state       : null,
        data.address     !== undefined ? data.address     : null,
        data.notes       !== undefined ? data.notes       : null,
        id,
      ]
    );
    const client = rows[0];
    audit.log({ user_id: userId, action: 'UPDATE_CLIENT', entity_type: 'client', entity_id: id, client_id: id, old_value: existing.rows[0], new_value: client }).catch(() => {});
    return client;
  } catch (err) {
    if (err.code === '23505') throw Object.assign(new Error('A BD client with this name already exists'), { statusCode: 409 });
    throw err;
  }
};

// ── PATCH status ─────────────────────────────────────────────────────────────
exports.updateStatus = async (id, { status, status_reason }, userId) => {
  assertIn(status, CLIENT_STATUSES, 'status');
  if (status === 'closed_cancelled' && !String(status_reason || '').trim()) {
    throw badRequest('A reason is required when cancelling');
  }

  const existing = await db.query('SELECT status FROM bd_clients WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing.rows.length) throw notFound();

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE bd_clients SET status = $1, status_reason = $2, status_changed_at = NOW()
       WHERE id = $3 AND deleted_at IS NULL RETURNING *`,
      [status, status === 'closed_cancelled' ? status_reason : null, id]
    );

    // Closing a client (onboard or cancel) cancels any still-open follow-ups.
    if (status === 'closed_onboard' || status === 'closed_cancelled') {
      await client.query(
        `UPDATE bd_followups SET status = 'cancelled' WHERE client_id = $1 AND status IN ('pending','sent','escalated')`,
        [id]
      );
    }

    await audit.log({ user_id: userId, action: 'CHANGE_STATUS', entity_type: 'client', entity_id: id, client_id: id, old_value: existing.rows[0], new_value: { status, status_reason }, connection: client });
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// ── PATCH priority (quick change from the dashboard card) ────────────────────
exports.updatePriority = async (id, priority, userId) => {
  priority = String(priority || '').toUpperCase();
  assertIn(priority, PRIORITIES, 'priority');

  const existing = await db.query('SELECT priority FROM bd_clients WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!existing.rows.length) throw notFound();

  const { rows } = await db.query(
    `UPDATE bd_clients SET priority = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
    [priority, id]
  );
  audit.log({ user_id: userId, action: 'CHANGE_PRIORITY', entity_type: 'client', entity_id: id, client_id: id, old_value: existing.rows[0], new_value: { priority } }).catch(() => {});
  return rows[0];
};

// ── DELETE (soft) ────────────────────────────────────────────────────────────
exports.deleteClient = async (id, userId) => {
  const { rows } = await db.query(
    `UPDATE bd_clients SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, name`,
    [id]
  );
  if (!rows.length) throw notFound();
  audit.log({ user_id: userId, action: 'DELETE_CLIENT', entity_type: 'client', entity_id: id, client_id: id, old_value: { name: rows[0].name } }).catch(() => {});
  return { deleted: true };
};

// ── Logo (R2 key only — controller handles upload/stream via bd.controller.js) ─
exports.setLogoKey = async (id, key) => {
  const prev = await db.query('SELECT logo_url FROM bd_clients WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!prev.rows.length) throw notFound();
  await db.query('UPDATE bd_clients SET logo_url = $1 WHERE id = $2', [key, id]);
  return prev.rows[0].logo_url; // old key, so caller can clean it up
};

exports.getLogoKey = async (id) => {
  const { rows } = await db.query('SELECT logo_url FROM bd_clients WHERE id = $1', [id]);
  const key = rows[0]?.logo_url;
  if (!key) throw Object.assign(new Error('No logo set'), { statusCode: 404 });
  return key;
};

exports.removeLogoKey = async (id) => {
  const { rows } = await db.query('SELECT logo_url FROM bd_clients WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!rows.length) throw notFound();
  const key = rows[0].logo_url;
  await db.query('UPDATE bd_clients SET logo_url = NULL WHERE id = $1', [id]);
  return key;
};

// ── Dashboard — sector-grouped, priority-ordered board (§6.1) ────────────────
exports.getDashboard = async (query = {}) => {
  const { where, values } = buildFilters(query);

  const [sectorsRes, clientsRes] = await Promise.all([
    db.query(`SELECT * FROM bd_sectors WHERE is_active = TRUE ORDER BY sort_order, label`),
    db.query(
      `SELECT c.*, u.name AS bd_owner_name,
         EXISTS (
           SELECT 1 FROM bd_touchpoints t
           WHERE t.client_id = c.id AND t.response_status IN ('positive', 'negative', 'neutral', 'bounced')
         ) AS has_responded
       FROM bd_clients c
       LEFT JOIN users u ON u.id = c.bd_owner_id
       WHERE ${where}
       ORDER BY c.priority ASC, ${STATUS_RANK_SQL} ASC, c.last_activity_at DESC NULLS LAST`,
      values
    ),
  ]);

  const clients = clientsRes.rows;

  // Each client is shown under exactly one column — its primary sector
  // (sectors[0], see BDClientForm's "make primary" picker). Falls through to
  // the next tagged sector that's still active if the primary one was since
  // deactivated, so a client is never silently dropped off the board.
  const activeKeys = new Set(sectorsRes.rows.map(s => s.key));
  const primarySectorOf = (c) => Array.isArray(c.sectors) ? c.sectors.find(k => activeKeys.has(k)) : undefined;

  const sections = sectorsRes.rows.map(sector => ({
    ...sector,
    clients: clients.filter(c => primarySectorOf(c) === sector.key),
  }));

  const unassigned = clients.filter(c => !primarySectorOf(c));

  return { sections, unassigned };
};

// ── Stats — KPI tiles + dashboard charts ──────────────────────────────────
exports.getStats = async () => {
  const [statsRes, sectorRes] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*)                                                   AS total,
        COUNT(*) FILTER (WHERE priority = 'A')                     AS priority_a,
        COUNT(*) FILTER (WHERE priority = 'B')                     AS priority_b,
        COUNT(*) FILTER (WHERE priority = 'C')                     AS priority_c,
        COUNT(*) FILTER (WHERE status = 'to_be_initiated')         AS to_be_initiated,
        COUNT(*) FILTER (WHERE status = 'wip')                     AS wip,
        COUNT(*) FILTER (WHERE status = 'closed_onboard')          AS onboarded,
        COUNT(*) FILTER (WHERE status = 'closed_cancelled')        AS cancelled,
        (SELECT COUNT(*) FROM bd_followups f
          JOIN bd_clients fc ON fc.id = f.client_id AND fc.deleted_at IS NULL
          WHERE f.status IN ('pending','sent','escalated') AND f.due_at <= NOW()) AS followups_due
      FROM bd_clients WHERE deleted_at IS NULL
    `),
    db.query(`
      SELECT s.key, s.label, s.icon, COUNT(c.id) AS count
      FROM bd_sectors s
      LEFT JOIN bd_clients c ON c.sectors[1] = s.key AND c.deleted_at IS NULL
      WHERE s.is_active = TRUE
      GROUP BY s.id, s.key, s.label, s.icon, s.sort_order
      ORDER BY s.sort_order
    `),
  ]);
  const r = statsRes.rows[0];
  return {
    total:            Number(r.total),
    priority_a:       Number(r.priority_a),
    priority_b:       Number(r.priority_b),
    priority_c:       Number(r.priority_c),
    to_be_initiated:  Number(r.to_be_initiated),
    wip:              Number(r.wip),
    onboarded:        Number(r.onboarded),
    cancelled:        Number(r.cancelled),
    followups_due:    Number(r.followups_due),
    sector_breakdown: sectorRes.rows.map(s => ({ ...s, count: Number(s.count) })),
  };
};

exports.buildFilters = buildFilters;
