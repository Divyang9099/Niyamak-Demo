const db           = require('../../core/config/db');
const audit        = require('../audit/audit.service');
const notifService = require('../notification/notification.service');
const socket       = require('../../core/socket/socket.gateway');
const EVENTS       = require('../../core/socket/socket.events');

exports.convertToProject = async (pipelineId, userId) => {
  // 1. Get pipeline + triggering user's name
  const pipelineResult = await db.query('SELECT * FROM pipeline WHERE id = $1', [pipelineId]);

  if (!pipelineResult.rows.length) {
    throw Object.assign(new Error('Pipeline not found'), { statusCode: 404 });
  }

  const p = pipelineResult.rows[0];

  const userRes = await db.query('SELECT name FROM users WHERE id = $1', [userId]);
  const triggeredBy = userRes.rows[0]?.name || 'a user';

  if (p.converted_project_id) {
    throw Object.assign(new Error('Pipeline already converted to a Project'), { statusCode: 409 });
  }
  if (p.stage === 'cancelled') {
    throw Object.assign(new Error('A cancelled opportunity cannot be converted.'), { statusCode: 409 });
  }
  if (p.stage !== 'onboarding') {
    throw Object.assign(new Error('Only an opportunity at the "Onboarding" stage can be converted to a project.'), { statusCode: 422 });
  }

  // Use a transaction since we are creating a project + allocation + updating pipeline
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Re-assert the not-yet-converted invariant under a row lock. The check at
    // line 20 was on an unlocked read; without this a double-click or retried
    // request could pass that stale check twice and create TWO projects from one
    // pipeline. FOR UPDATE serializes concurrent converts — the second waits here,
    // then sees converted_project_id set and aborts.
    const lockRes = await client.query(
      'SELECT converted_project_id FROM pipeline WHERE id = $1 FOR UPDATE',
      [pipelineId]
    );
    if (!lockRes.rows.length) {
      throw Object.assign(new Error('Pipeline not found'), { statusCode: 404 });
    }
    if (lockRes.rows[0].converted_project_id) {
      throw Object.assign(new Error('Pipeline already converted to a Project'), { statusCode: 409 });
    }

    // 2. Create project — starts at 'initiate' and is flagged needs_attention so the
    //    UI shows it red until core details + allocation are filled in.
    // Combine scope + notes so neither is lost on conversion.
    const descParts = [p.tentative_scope, p.notes].filter(Boolean);
    const description = descParts.length === 2
      ? `${p.tentative_scope}\n\n[Internal Notes]\n${p.notes}`
      : descParts[0] || null;

    const projectResult = await client.query(
      `
      INSERT INTO projects
      (name, client_name, project_type, status, state, latitude, longitude, description,
       start_date, end_date, contact_number, contact_email, po_number, work_order_number,
       needs_attention, created_by, source_pipeline_id, project_value)
      VALUES ($1, $2, $3, 'initiate', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE, $14, $15, $16)
      RETURNING *;
      `,
      [
        p.name,
        p.client_name,
        p.project_type,
        p.state         ?? null,
        p.latitude      ?? null,
        p.longitude     ?? null,
        description,
        p.estimated_start ?? null,
        p.estimated_end   ?? null,
        p.contact_number  ?? null,
        p.contact_email   ?? null,
        p.onboarding_po_number || null,
        p.onboarding_wo_number || null,
        userId,
        pipelineId,
        p.estimated_value ?? null,
      ]
    );

    const project = projectResult.rows[0];

    // 3. Create allocation (tentative → confirmed)
    if ((p.tentative_pilot || p.tentative_drone) && p.estimated_start && p.estimated_end) {
      await client.query(
        `
        INSERT INTO allocations
        (project_id, pilot_id, drone_id, start_date, end_date, is_pipeline)
        VALUES ($1, $2, $3, $4, $5, false)
        `,
        [
          project.id,
          p.tentative_pilot,
          p.tentative_drone,
          p.estimated_start, // Ensure start mapping
          p.estimated_end    // Ensure end mapping
        ]
      );

      // 3a. Mirror the allocated pilot into project_members (same as the normal
      //     allocation flow) so the converted pilot shows on the Members tab and
      //     can open the project. ON CONFLICT keeps the membership unique.
      if (p.tentative_pilot) {
        const pilotUser = await client.query(
          'SELECT user_id FROM pilots WHERE id = $1 AND deleted_at IS NULL',
          [p.tentative_pilot]
        );
        const pilotUserId = pilotUser.rows[0]?.user_id;
        if (pilotUserId) {
          await client.query(
            `INSERT INTO project_members (project_id, user_id, role)
             VALUES ($1, $2, 'pilot') ON CONFLICT DO NOTHING`,
            [project.id, pilotUserId]
          );
        }
      }
    }

    // 3b. Add converting user as project_manager in project_members
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'project_manager') ON CONFLICT DO NOTHING`,
      [project.id, userId]
    );

    // 3c. Carry ALL pipeline documents into the project's Documents tab so nothing
    //     is lost on conversion. First, pull every pipeline_documents row that has a
    //     file attached; then also include the three legacy URL fields on the pipeline
    //     row itself (in case old data predates the documents tab).
    const pipelineDocs = await client.query(
      `SELECT name, file_key, file_name FROM pipeline_documents
        WHERE pipeline_id = $1 AND file_key IS NOT NULL`,
      [pipelineId]
    );
    for (const d of pipelineDocs.rows) {
      await client.query(
        `INSERT INTO project_documents (project_id, file_name, file_key, category, version, uploaded_by)
         VALUES ($1, $2, $3, 'Pipeline Documents', 'v1', $4)
`,
        [project.id, d.file_name || d.name, d.file_key, userId]
      );
    }

    // Legacy URL fields (pre-documents-tab era)
    const legacyDocs = [
      { key: p.quotation_url,      name: 'Quotation',    category: 'Pipeline — Commercial Proposal' },
      { key: p.proposal_email_url, name: 'Confirmation', category: 'Pipeline — Pre-Confirmation'    },
      { key: p.onboarding_doc_url, name: 'Agreement',    category: 'Pipeline — Onboarding'          },
    ];
    for (const d of legacyDocs) {
      if (!d.key) continue;
      const extRaw = d.key.split('.').pop() || '';
      const ext = (!extRaw.includes('/') && extRaw.length > 0 && extRaw.length <= 8) ? `.${extRaw}` : '';
      await client.query(
        `INSERT INTO project_documents (project_id, file_name, file_key, category, version, uploaded_by)
         VALUES ($1, $2, $3, $4, 'v1', $5)
`,
        [project.id, `${d.name}${ext}`, d.key, d.category, userId]
      );
    }

    // 4. Re-link pipeline estimations to the new project
    await client.query(
      'UPDATE estimations SET project_id = $1 WHERE pipeline_id = $2 AND project_id IS NULL',
      [project.id, pipelineId]
    );

    // 5. Link back pipeline to project and lock it out of active funnel
    await client.query(
      'UPDATE pipeline SET converted_project_id=$1, stage=$2 WHERE id=$3',
      [project.id, 'converted', pipelineId]
    );

    // 📝 LOG AUDIT
    await audit.log({
      user_id: userId,
      action: 'CONVERT_PIPELINE',
      entity_type: 'pipeline',
      entity_id: pipelineId,
      new_value: { project_id: project.id },
      connection: client
    });

    await audit.log({
      user_id: userId,
      action: 'CREATE_PROJECT',
      entity_type: 'project',
      entity_id: project.id,
      new_value: project,
      connection: client
    });

    await client.query('COMMIT');

    // 🔔 NOTIFY other admin users about the new project (exclude triggering user)
    try {
      const admins = await db.query("SELECT id FROM users WHERE role='admin' AND id != $1", [userId]);
      await Promise.all(admins.rows.map(admin =>
        notifService.createNotification({
          user_id: admin.id,
          title:   'Pipeline Converted to Project',
          message: `Pipeline "${p.name}" has been converted to a confirmed project by ${triggeredBy}.`,
        })
      ));
    } catch (notifErr) {
      console.error('Notification error (non-fatal):', notifErr.message);
    }

    try {
      socket.emitToRole('admin', EVENTS.PIPELINE_CONVERTED, { pipelineId, project });
      socket.emitToRole('admin', EVENTS.PROJECT_CREATED, project);
    } catch (_) {}

    // Auto-create a project calendar marker so the project appears on the calendar
    // even before any pilot/drone allocation is made. The calendar service excludes
    // this marker automatically once an allocation exists (no duplication).
    if (p.estimated_start && p.estimated_end) {
      try {
        await db.query(
          `INSERT INTO calendar_events (title, event_type, resource_type, start_date, end_date, project_id)
           VALUES ($1, 'project', 'all', $2, $3, $4)`,
          [p.name, p.estimated_start, p.estimated_end, project.id]
        );
      } catch (_) {}
    }

    return project;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
