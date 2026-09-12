const db     = require('../../core/config/db');
const audit  = require('../audit/audit.service');
const clientService = require('../client/client.service');
const socket = require('../../core/socket/socket.gateway');
const EVENTS = require('../../core/socket/socket.events');

// CREATE
exports.createPipeline = async (data, userId) => {
  if (data.win_probability !== undefined && (data.win_probability < 0 || data.win_probability > 100)) {
    throw Object.assign(new Error('win_probability must be between 0 and 100'), { statusCode: 400 });
  }

  // New opportunities always begin at 'inquiry'. Terminal stages can't be set on create.
  if (data.stage && data.stage !== 'inquiry') {
    throw Object.assign(new Error("New pipeline opportunities must start at the 'Inquiry' stage."), { statusCode: 400 });
  }
  // Resolve linked client (client_id) → canonical client_name for denormalised storage.
  const { client_id: resolvedClientId, client_name: resolvedClientName } =
    await clientService.resolveClientForLink(data.client_id, data.client_name);

  const query = `
    INSERT INTO pipeline
    (name, client_name, project_type, stage, estimated_value, win_probability,
     state, latitude, longitude, tentative_scope, notes,
     tentative_pilot, tentative_drone,
     enquiry_date, estimated_start, estimated_end, requirement, estimation_notes,
     contact_number, contact_email, created_by, client_id, sales_executive)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
    RETURNING *;
  `;

  const values = [
    data.name           ?? null,
    resolvedClientName  ?? null,
    data.project_type   ?? null,
    'inquiry',
    data.estimated_value  != null ? data.estimated_value  : null,
    data.win_probability  != null ? data.win_probability  : null,
    data.state          ?? null,
    data.latitude         != null ? data.latitude         : null,
    data.longitude        != null ? data.longitude        : null,
    data.tentative_scope  ?? null,
    data.notes            ?? null,
    data.tentative_pilot  ?? null,
    data.tentative_drone  ?? null,
    data.enquiry_date     ?? null,
    data.estimated_start  ?? null,
    data.estimated_end    ?? null,
    data.requirement      ?? null,
    data.estimation_notes ?? null,
    data.contact_number   ?? null,
    data.contact_email    ?? null,
    userId                ?? null,
    resolvedClientId,
    // Owner of the opportunity. A blank box means "nobody assigned yet", not "".
    (data.sales_executive || '').trim() || null,
  ];

  const result = await db.query(query, values);
  const pipeline = result.rows[0];

  // 📝 LOG AUDIT
  await audit.log({
    user_id: userId,
    action: 'CREATE_PIPELINE',
    entity_type: 'pipeline',
    entity_id: pipeline.id,
    new_value: pipeline
  });

  try { socket.emitToRole('admin', EVENTS.PIPELINE_CREATED, pipeline); } catch (_) {}

  return pipeline;
};

// GET ALL (Active Only)
exports.getPipelines = async (filters = {}) => {
  const limit  = Math.min(Number(filters.limit) || 25, 100);
  const page   = Math.max(Number(filters.page)  || 1, 1);
  const offset = (page - 1) * limit;

  const result = await db.query(
    `SELECT *, COUNT(*) OVER() AS total_count FROM pipeline
     WHERE converted_project_id IS NULL AND stage != 'cancelled'
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const total = result.rows[0] ? Number(result.rows[0].total_count) : 0;
  const rows  = result.rows.map(({ total_count, ...r }) => r);
  return { rows, total, page, limit };
};

// GET HISTORY (leads that left the active funnel — cancelled or converted)
exports.getPipelineHistory = async (filters = {}) => {
  const limit = Math.min(Number(filters.limit) || 100, 200);
  const result = await db.query(
    `SELECT p.*,
            pr.name   AS converted_project_name,
            pr.status AS converted_project_status,
            CASE WHEN p.converted_project_id IS NOT NULL THEN 'converted' ELSE 'cancelled' END AS outcome,
            COALESCE(p.updated_at, p.created_at) AS outcome_at
     FROM pipeline p
     LEFT JOIN projects pr ON p.converted_project_id = pr.id
     WHERE p.converted_project_id IS NOT NULL OR p.stage = 'cancelled'
     ORDER BY COALESCE(p.updated_at, p.created_at) DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

// GET CALENDAR VIEW (Active Pipeline Dates)
exports.getCalendarView = async (query) => {
  let dateFilter = '1=1';
  const values = [];

  if (query.start && query.end) {
    values.push(query.start, query.end);
    dateFilter = `(estimated_start <= $2 AND estimated_end >= $1)`;
  }

  const result = await db.query(
    `SELECT id, name AS title, estimated_start AS start, estimated_end AS end, stage, tentative_pilot, tentative_drone, state
     FROM pipeline
     WHERE converted_project_id IS NULL AND estimated_start IS NOT NULL
     AND stage NOT IN ('cancelled', 'converted')
     AND ${dateFilter}
     ORDER BY estimated_start ASC`,
    values
  );
  return result.rows;
};

// GET ONE
exports.getPipelineById = async (id) => {
  const result = await db.query(
    `SELECT p.*,
            u.name  AS tentative_pilot_name,
            d.name  AS tentative_drone_name,
            d.model AS tentative_drone_model
     FROM pipeline p
     LEFT JOIN pilots  pi ON pi.id = p.tentative_pilot
     LEFT JOIN users    u ON u.id  = pi.user_id
     LEFT JOIN drones   d ON d.id  = p.tentative_drone
     WHERE p.id = $1`,
    [id]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Pipeline record not found'), { statusCode: 404 });
  }
  return result.rows[0];
};

// GET STAGE DOCUMENTS (presigned download URLs for whatever attachments exist)
exports.getPipelineDocuments = async (id) => {
  const r = await db.query(
    'SELECT quotation_url, proposal_email_url, onboarding_doc_url FROM pipeline WHERE id=$1', [id]
  );
  if (!r.rows.length) throw Object.assign(new Error('Pipeline record not found'), { statusCode: 404 });
  const p = r.rows[0];
  const { getPresignedUrl } = require('../../core/utils/r2Download');

  const defs = [
    { stage: 'commercial_proposal', label: 'Quotation',           key: p.quotation_url },
    { stage: 'pre_confirmation',    label: 'Confirmation Proof',  key: p.proposal_email_url },
    { stage: 'onboarding',          label: 'Agreement',           key: p.onboarding_doc_url },
  ].filter(d => d.key);

  return Promise.all(defs.map(async (d) => {
    const ext = (d.key.split('.').pop() || '').slice(0, 8);
    const filename = `${d.label.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    return { stage: d.stage, label: d.label, filename, url: await getPresignedUrl(d.key, 3600, filename) };
  }));
};

// UPDATE
exports.updatePipeline = async (id, data, userId) => {
  // Check if already converted — cannot update converted records
  const current = await db.query('SELECT * FROM pipeline WHERE id=$1', [id]);
  if (!current.rows.length) throw Object.assign(new Error('Pipeline record not found'), { statusCode: 404 });
  if (current.rows[0].converted_project_id)
    throw Object.assign(new Error('Cannot update a converted pipeline record'), { statusCode: 409 });
  
  const existing = current.rows[0];

  const query = `
    UPDATE pipeline SET
      name             = COALESCE($1,  name),
      client_name      = COALESCE($2,  client_name),
      project_type     = COALESCE($3,  project_type),
      estimated_value  = COALESCE($4,  estimated_value),
      win_probability  = COALESCE($5,  win_probability),
      state            = COALESCE($6,  state),
      latitude         = COALESCE($7,  latitude),
      longitude        = COALESCE($8,  longitude),
      tentative_scope  = COALESCE($9,  tentative_scope),
      notes            = COALESCE($10, notes),
      tentative_pilot  = COALESCE($11, tentative_pilot),
      tentative_drone  = COALESCE($12, tentative_drone),
      enquiry_date     = COALESCE($13, enquiry_date),
      estimated_start  = COALESCE($14, estimated_start),
      estimated_end    = COALESCE($15, estimated_end),
      requirement      = COALESCE($16, requirement),
      estimation_notes = COALESCE($17, estimation_notes),
      contact_number   = COALESCE($18, contact_number),
      contact_email    = COALESCE($19, contact_email),
      onboarding_po_number = COALESCE($20, onboarding_po_number),
      onboarding_wo_number = COALESCE($21, onboarding_wo_number),
      sales_executive  = CASE WHEN $22::text IS NULL THEN sales_executive
                              ELSE NULLIF($22::text, '') END,
      updated_at       = NOW()
    WHERE id=$23 RETURNING *;`;

  const values = [
    data.name!==undefined ? data.name : null,
    data.client_name!==undefined ? data.client_name : null,
    data.project_type!==undefined ? data.project_type : null,
    data.estimated_value!==undefined ? data.estimated_value : null,
    data.win_probability!==undefined ? data.win_probability : null,
    data.state!==undefined ? data.state : null,
    data.latitude!==undefined ? data.latitude : null,
    data.longitude!==undefined ? data.longitude : null,
    data.tentative_scope!==undefined ? data.tentative_scope : null,
    data.notes!==undefined ? data.notes : null,
    data.tentative_pilot!==undefined ? data.tentative_pilot : null,
    data.tentative_drone!==undefined ? data.tentative_drone : null,
    data.enquiry_date!==undefined ? data.enquiry_date : null,
    data.estimated_start!==undefined ? data.estimated_start : null,
    data.estimated_end!==undefined ? data.estimated_end : null,
    data.requirement!==undefined ? data.requirement : null,
    data.estimation_notes!==undefined ? data.estimation_notes : null,
    data.contact_number!==undefined ? data.contact_number : null,
    data.contact_email!==undefined ? data.contact_email : null,
    data.onboarding_po_number!==undefined ? data.onboarding_po_number : null,
    data.onboarding_wo_number!==undefined ? data.onboarding_wo_number : null,
    data.sales_executive!==undefined ? String(data.sales_executive).trim() : null,
    id,
  ];

  const result = await db.query(query, values);
  if (!result.rows.length) throw Object.assign(new Error('Pipeline record not found'), { statusCode: 404 });
  const updated = result.rows[0];

  // ── Client link — resolve client_id → canonical client_name (kept in sync) ──
  if (data.client_id !== undefined) {
    const { client_id: rcid, client_name: rcname } =
      await clientService.resolveClientForLink(data.client_id, data.client_name);
    await db.query(
      'UPDATE pipeline SET client_id = $1, client_name = COALESCE($2, client_name) WHERE id = $3',
      [rcid, rcname, id]
    );
    updated.client_id = rcid;
    if (rcname) updated.client_name = rcname;
  }

  // 📝 LOG AUDIT
  await audit.log({
    user_id: userId,
    action: 'UPDATE_PIPELINE',
    entity_type: 'pipeline',
    entity_id: id,
    old_value: existing,
    new_value: updated
  });

  try { socket.emitToRole('admin', EVENTS.PIPELINE_UPDATED, updated); } catch (_) {}

  return updated;
};

// DELETE — permanently removes a lead (used from the History view for
// cancelled/converted leads). A converted lead's project is kept; only its
// back-link is cleared. Attached document files are cleaned from R2 best-effort.
exports.deletePipeline = async (id, userId) => {
  // Collect attached files before the CASCADE wipes the rows.
  const docs = await db.query(
    'SELECT file_key FROM pipeline_documents WHERE pipeline_id=$1 AND file_key IS NOT NULL', [id]
  );

  // Clear the project back-link so the FK doesn't block deleting converted leads.
  await db.query('UPDATE projects SET source_pipeline_id=NULL WHERE source_pipeline_id=$1', [id]);

  const result = await db.query('DELETE FROM pipeline WHERE id=$1 RETURNING id, name', [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error('Pipeline record not found'), { statusCode: 404 });
  }

  // Best-effort R2 cleanup of attached documents.
  try {
    const { deleteFromR2 } = require('../../core/utils/r2Upload');
    docs.rows.forEach(d => deleteFromR2(d.file_key).catch(() => {}));
  } catch (_) {}

  await audit.log({
    user_id: userId,
    action: 'DELETE_PIPELINE',
    entity_type: 'pipeline',
    entity_id: id,
    old_value: { name: result.rows[0].name },
  });

  try { socket.emitToRole('admin', EVENTS.PIPELINE_DELETED, { id }); } catch (_) {}
};

// ── Pipeline stage lifecycle ────────────────────────────────────────────────
// Stages can be set freely (any → any) with NO document requirement. 'converted'
// is reachable only via the Convert action; 'cancelled' needs a reason.
const STAGE_LABEL = {
  inquiry: 'Inquiry', commercial_proposal: 'Commercial Proposal',
  pre_confirmation: 'Pre-Confirmation', onboarding: 'Onboarding',
  converted: 'Converted', cancelled: 'Cancelled',
};

const emailTriggers = require('../notification/emailTriggers.service');
const notifService  = require('../notification/notification.service');

// UPDATE STAGE — free movement, no artifact required.
// extras: { reason } — only used for cancellation.
exports.updateStage = async (id, stage, userId, extras = {}) => {
  if (stage === 'converted') {
    throw Object.assign(new Error("Use the Convert action to turn an onboarded opportunity into a project."), { statusCode: 400 });
  }
  const validStages = ['inquiry', 'commercial_proposal', 'pre_confirmation', 'onboarding', 'cancelled'];
  if (!validStages.includes(stage)) {
    throw Object.assign(new Error('Invalid pipeline stage'), { statusCode: 400 });
  }

  const current = await db.query('SELECT * FROM pipeline WHERE id=$1', [id]);
  if (!current.rows.length) throw Object.assign(new Error('Pipeline record not found'), { statusCode: 404 });
  const existing = current.rows[0];

  if (existing.converted_project_id || existing.stage === 'converted') {
    throw Object.assign(new Error('Cannot change the stage of a converted opportunity'), { statusCode: 409 });
  }

  const setCols = ['stage=$1'];
  const params  = [stage];

  if (stage === 'cancelled') {
    // ── Cancellation: reason required, archives out of the funnel ──
    if (!extras.reason || !extras.reason.trim()) {
      throw Object.assign(new Error('A cancellation reason is required.'), { statusCode: 400 });
    }
    params.push(extras.reason.trim());
    setCols.push(`cancel_reason=$${params.length}`);
  } else if (existing.stage === 'cancelled') {
    // Reopening a previously cancelled lead back into the funnel — clear the reason.
    setCols.push('cancel_reason=NULL');
  }

  setCols.push('updated_at=NOW()');
  params.push(id);

  const result = await db.query(
    `UPDATE pipeline SET ${setCols.join(', ')} WHERE id=$${params.length} RETURNING *`,
    params
  );
  const pipeline = result.rows[0];

  await audit.log({
    user_id: userId,
    action: stage === 'cancelled' ? 'CANCEL_PIPELINE' : 'UPDATE_PIPELINE_STAGE',
    entity_type: 'pipeline',
    entity_id: id,
    old_value: { stage: existing.stage },
    new_value: { stage: pipeline.stage, reason: extras.reason || undefined },
  });

  // Notifications — in-app to creator + admins, plus email
  try {
    const recipients = await db.query(
      `SELECT id FROM users WHERE deleted_at IS NULL AND (role='admin' OR id=$1)`,
      [existing.created_by || null]
    );
    const label = STAGE_LABEL[stage];
    await Promise.all(recipients.rows.map(r =>
      notifService.createNotification({
        user_id: r.id,
        title: stage === 'cancelled' ? 'Pipeline Cancelled' : 'Pipeline Stage Updated',
        message: stage === 'cancelled'
          ? `Opportunity "${pipeline.name}" was cancelled. Reason: ${extras.reason.trim()}`
          : `Opportunity "${pipeline.name}" moved to "${label}".`,
        entity_type: 'pipeline',
        entity_id: id,
      })
    ));
  } catch (e) { console.error('[Pipeline] Notif (stage) failed:', e.message); }

  emailTriggers.onPipelineStageChange({
    pipelineId: id, pipelineName: pipeline.name, createdBy: existing.created_by,
    stageLabel: STAGE_LABEL[stage],
    extra: stage === 'cancelled' ? `Reason: ${extras.reason.trim()}` : undefined,
  });

  try { socket.emitToRole('admin', EVENTS.PIPELINE_STAGE_CHANGED, pipeline); } catch (_) {}

  return pipeline;
};
