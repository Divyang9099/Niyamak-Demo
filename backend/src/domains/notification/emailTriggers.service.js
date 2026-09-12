/**
 * Email triggers (PRD §11.2) — central place to enqueue the 6 PRD-mandated
 * email events. All triggers:
 *   - Respect user_notification_prefs (skip if email_enabled=false for category)
 *   - Use emailQueue with synchronous fallback when Redis is degraded
 *   - Never throw — best-effort, errors logged only
 *
 * The 6 events:
 *   1. allocation        → email pilot when assigned to a project
 *   2. project_status    → email PM + pilot when status flips to 'in_progress'
 *   3. deliverable       → email PM when pilot uploads a deliverable
 *   4. project_status    → email Admins + PM when status flips to 'delivered'
 *   5. expiry            → equipment maintenance due in 7 days (cron)
 *   6. expiry            → pilot license expiring in 30 days (cron)
 */

const db = require('../../core/config/db');
const env = require('../../core/config/env');
const { emailQueue, addJob } = require('../../core/queues');
const emailService = require('./email.service');
// const waTriggers = require('./whatsappTriggers.service'); // WhatsApp — uncomment after adding WHATSAPP_PHONE_ID + WHATSAPP_ACCESS_TOKEN to .env

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─── prefs-aware send ─────────────────────────────────────────────────────
const _prefAllows = async (userId, category) => {
  if (!userId) return true;
  try {
    const r = await db.query(
      'SELECT email_enabled FROM user_notification_prefs WHERE user_id = $1 AND category = $2',
      [userId, category]
    );
    if (!r.rows.length) return true; // default = enabled
    return r.rows[0].email_enabled !== false;
  } catch {
    return true;
  }
};

// Enqueue (or run sync if Redis down) — never throws
const _enqueue = (job) => {
  return addJob(emailQueue, 'send-email', job, (data) => emailService.sendEmail(data))
    .catch((e) => console.error('[EmailTrigger] enqueue failed:', e.message));
};

// ─── 0. New user welcome → email credentials to the new user ─────────────
exports.onUserWelcome = async ({ userName, userEmail, userPhone, userRole, plainPassword, appUrl }) => {
  // waTriggers.onUserWelcome({ userName, userPhone, userRole }).catch(() => {});
  if (!userEmail) return;
  const roleLabel = {
    admin:           'Administrator',
    project_manager: 'Project Manager',
    pilot:           'Pilot',
  }[userRole] || userRole;

  const url = appUrl || env.appUrl;

  await _enqueue({
    to: userEmail,
    subject: 'Welcome to Niyamak — Your Login Credentials',
    html: `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;padding:0;background:#F5F6FA;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FA;padding:40px 20px;">
          <tr><td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.07);">

              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#6366F1,#4F46E5);padding:32px 40px;text-align:center;">
                  <p style="margin:0;color:#C7D2FE;font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">Niyamak</p>
                  <h1 style="margin:8px 0 0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">Welcome aboard, ${esc(userName)}!</h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding:36px 40px;">
                  <p style="margin:0 0 20px;color:#64748B;font-size:15px;line-height:1.6;">
                    Your account has been created on <strong style="color:#1E293B;">Niyamak</strong> —
                    the drone operations management platform. Here are your login credentials:
                  </p>

                  <!-- Credentials box -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:20px 24px;">
                        <table width="100%" cellpadding="6" cellspacing="0">
                          <tr>
                            <td style="color:#94A3B8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;width:110px;">Role</td>
                            <td style="color:#1E293B;font-size:14px;font-weight:700;">${esc(roleLabel)}</td>
                          </tr>
                          <tr>
                            <td style="color:#94A3B8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">Email</td>
                            <td style="color:#6366F1;font-size:14px;font-weight:700;font-family:monospace;">${esc(userEmail)}</td>
                          </tr>
                          <tr>
                            <td style="color:#94A3B8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">Password</td>
                            <td style="color:#1E293B;font-size:14px;font-weight:700;font-family:monospace;letter-spacing:0.08em;background:#FEF9C3;padding:4px 8px;border-radius:6px;">${esc(plainPassword)}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- CTA -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                    <tr>
                      <td align="center">
                        <a href="${url}/login" style="display:inline-block;background:#6366F1;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.04em;">
                          Sign in to Niyamak →
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:0;color:#94A3B8;font-size:13px;line-height:1.6;">
                    <strong style="color:#1E293B;">Security tip:</strong> Change your password after your first login via
                    <em>Profile → Change Password</em>.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:20px 40px;text-align:center;">
                  <p style="margin:0;color:#CBD5E1;font-size:11px;">
                    This email was sent automatically. Do not reply. &copy; Niyamak
                  </p>
                </td>
              </tr>

            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `,
  }).catch((e) => console.error('[EmailTrigger] onUserWelcome failed:', e.message));
};

// ─── 1. Allocation → email pilot ──────────────────────────────────────────
exports.onAllocation = async ({ pilotUserId, pilotName, pilotEmail, pilotPhone, projectName, startDate, endDate, droneName }) => {
  // waTriggers.onAllocation({ pilotUserId, pilotPhone, pilotName, projectName, startDate, droneName }).catch(() => {});
  if (!pilotEmail) return;
  if (!(await _prefAllows(pilotUserId, 'allocation'))) return;
  await _enqueue({
    to: pilotEmail,
    subject: `New project assignment: ${projectName}`,
    html: `
      <h2>Hi ${esc(pilotName)},</h2>
      <p>You have been assigned to project <strong>${esc(projectName)}</strong>.</p>
      <p><strong>Window:</strong> ${esc(startDate)} → ${esc(endDate)}</p>
      <p>Log in to Niyamak to view the full brief.</p>
    `,
  });
};

// ─── 2. Project status → 'in_progress' → email PM + pilot ─────────────────
exports.onProjectInProgress = async ({ projectId, projectName }) => {
  try {
    const r = await db.query(
      `SELECT DISTINCT u.id AS user_id, u.email, u.name, pm.role
         FROM project_members pm
         JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = $1
          AND pm.role IN ('project_manager', 'pilot')
          AND u.email IS NOT NULL`,
      [projectId]
    );
    for (const m of r.rows) {
      if (!(await _prefAllows(m.user_id, 'project_status'))) continue;
      await _enqueue({
        to: m.email,
        subject: `Project in progress: ${projectName}`,
        html: `
          <h2>Hi ${esc(m.name)},</h2>
          <p>Project <strong>${esc(projectName)}</strong> has moved to <strong>In Progress</strong>.</p>
          <p>Field operations are now active.</p>
        `,
      });
    }
  } catch (e) {
    console.error('[EmailTrigger] onProjectInProgress failed:', e.message);
  }
};

// ─── 2b. Generic project status change → email all members ────────────────
exports.onProjectStatusChange = async ({ projectId, projectName, status, statusLabel, extra }) => {
  // waTriggers.onProjectStatusChange({ projectId, projectName, statusLabel: statusLabel || status }).catch(() => {});
  try {
    const r = await db.query(
      `SELECT DISTINCT u.id AS user_id, u.email, u.name
         FROM project_members pm
         JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = $1 AND u.email IS NOT NULL`,
      [projectId]
    );
    for (const m of r.rows) {
      if (!(await _prefAllows(m.user_id, 'project_status'))) continue;
      await _enqueue({
        to: m.email,
        subject: `Project ${statusLabel || status}: ${projectName}`,
        html: `
          <h2>Hi ${esc(m.name)},</h2>
          <p>Project <strong>${esc(projectName)}</strong> has advanced to
             <strong>${esc(statusLabel || status)}</strong>.</p>
          ${extra ? `<p>${esc(extra)}</p>` : ''}
          <p>Log in to Niyamak to view the latest project status.</p>
        `,
      });
    }
  } catch (e) {
    console.error('[EmailTrigger] onProjectStatusChange failed:', e.message);
  }
};

// ─── 2c. Pipeline stage change → email creator + admins ───────────────────
exports.onPipelineStageChange = async ({ pipelineId, pipelineName, createdBy, stageLabel, extra }) => {
  // waTriggers.onPipelineStageChange({ pipelineId, pipelineName, createdBy, stageLabel }).catch(() => {});
  try {
    const recipients = await db.query(
      `SELECT DISTINCT u.id AS user_id, u.email, u.name
         FROM users u
        WHERE u.email IS NOT NULL AND u.deleted_at IS NULL
          AND (u.role = 'admin' OR u.id = $1)`,
      [createdBy || null]
    );
    for (const m of recipients.rows) {
      if (!(await _prefAllows(m.user_id, 'project_status'))) continue;
      await _enqueue({
        to: m.email,
        subject: `Pipeline ${stageLabel}: ${pipelineName}`,
        html: `
          <h2>Hi ${esc(m.name)},</h2>
          <p>Pipeline opportunity <strong>${esc(pipelineName)}</strong> has moved to
             <strong>${esc(stageLabel)}</strong>.</p>
          ${extra ? `<p>${esc(extra)}</p>` : ''}
          <p>Log in to Niyamak to review the opportunity.</p>
        `,
      });
    }
  } catch (e) {
    console.error('[EmailTrigger] onPipelineStageChange failed:', e.message);
  }
};

// ─── 3. Deliverable uploaded → email PM ──────────────────────────────────
exports.onDeliverableUploaded = async ({ projectId, projectName, deliverableName, uploaderName }) => {
  // waTriggers.onDeliverableUploaded({ projectId, projectName, deliverableName }).catch(() => {});
  try {
    const r = await db.query(
      `SELECT DISTINCT u.id AS user_id, u.email, u.name
         FROM project_members pm
         JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = $1
          AND pm.role = 'project_manager'
          AND u.email IS NOT NULL`,
      [projectId]
    );
    for (const m of r.rows) {
      if (!(await _prefAllows(m.user_id, 'project_status'))) continue;
      await _enqueue({
        to: m.email,
        subject: `Deliverable uploaded: ${projectName}`,
        html: `
          <h2>Hi ${esc(m.name)},</h2>
          <p>A new deliverable was uploaded to <strong>${esc(projectName)}</strong>.</p>
          <p><strong>Deliverable:</strong> ${esc(deliverableName)}<br>
             <strong>Uploaded by:</strong> ${esc(uploaderName || 'system')}</p>
          <p>Review and approve in Niyamak.</p>
        `,
      });
    }
  } catch (e) {
    console.error('[EmailTrigger] onDeliverableUploaded failed:', e.message);
  }
};

// ─── 4. Project status → 'complete' → email Admins + PM ─────────────────
exports.onProjectDelivered = async ({ projectId, projectName }) => {
  try {
    // Admins (system-wide)
    const adminsR = await db.query(
      `SELECT id AS user_id, email, name FROM users
        WHERE role = 'admin' AND email IS NOT NULL AND deleted_at IS NULL`
    );
    // Project's PMs
    const pmsR = await db.query(
      `SELECT DISTINCT u.id AS user_id, u.email, u.name
         FROM project_members pm
         JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = $1
          AND pm.role = 'project_manager'
          AND u.email IS NOT NULL`,
      [projectId]
    );

    // Dedupe in case an admin is also a PM on the project
    const seen = new Set();
    const recipients = [...adminsR.rows, ...pmsR.rows].filter((u) => {
      if (seen.has(u.user_id)) return false;
      seen.add(u.user_id);
      return true;
    });

    for (const u of recipients) {
      if (!(await _prefAllows(u.user_id, 'project_status'))) continue;
      await _enqueue({
        to: u.email,
        subject: `Project complete: ${projectName}`,
        html: `
          <h2>Hi ${esc(u.name)},</h2>
          <p>Project <strong>${esc(projectName)}</strong> has been marked <strong>Complete</strong>.</p>
          <p>All deliverables are now finalised.</p>
        `,
      });
    }
  } catch (e) {
    console.error('[EmailTrigger] onProjectDelivered failed:', e.message);
  }
};

// ─── 3b. Deliverable approved → email the pilot who uploaded it ──────────
exports.onDeliverableApproved = async ({ uploaderUserId, uploaderEmail, uploaderPhone, uploaderName, deliverableName, projectName }) => {
  // waTriggers.onDeliverableApproved({ uploaderUserId, uploaderPhone, uploaderName, deliverableName, projectName }).catch(() => {});
  if (!uploaderEmail) return;
  if (!(await _prefAllows(uploaderUserId, 'project_status'))) return;
  await _enqueue({
    to: uploaderEmail,
    subject: `Deliverable approved: ${deliverableName}`,
    html: `
      <h2>Hi ${esc(uploaderName)},</h2>
      <p>Your deliverable <strong>${esc(deliverableName)}</strong> on project
         <strong>${esc(projectName)}</strong> has been <strong style="color:#16a34a;">approved</strong>.</p>
      <p>Log in to Niyamak to view the full project status.</p>
    `,
  });
};

// ─── 3c. Deliverable rejected → email the pilot with reason ──────────────
exports.onDeliverableRejected = async ({ uploaderUserId, uploaderEmail, uploaderPhone, uploaderName, deliverableName, projectName, reason }) => {
  // waTriggers.onDeliverableRejected({ uploaderUserId, uploaderPhone, uploaderName, deliverableName, projectName, reason }).catch(() => {});
  if (!uploaderEmail) return;
  if (!(await _prefAllows(uploaderUserId, 'project_status'))) return;
  await _enqueue({
    to: uploaderEmail,
    subject: `Deliverable rejected: ${deliverableName}`,
    html: `
      <h2>Hi ${esc(uploaderName)},</h2>
      <p>Your deliverable <strong>${esc(deliverableName)}</strong> on project
         <strong>${esc(projectName)}</strong> has been <strong style="color:#dc2626;">rejected</strong>.</p>
      ${reason ? `<p><strong>Reason:</strong> ${esc(reason)}</p>` : ''}
      <p>Please log in to Niyamak, review the feedback, and resubmit a corrected file.</p>
    `,
  });
};

// ─── 3d. Member added to project → email the added user ──────────────────
exports.onMemberAdded = async ({ userId, userEmail, userPhone, userName, projectName, role }) => {
  // waTriggers.onMemberAdded({ userId, userPhone, userName, projectName, role }).catch(() => {});
  if (!userEmail) return;
  if (!(await _prefAllows(userId, 'project_status'))) return;
  const roleLabel = (role || '').replace('_', ' ');
  await _enqueue({
    to: userEmail,
    subject: `You've been added to project: ${projectName}`,
    html: `
      <h2>Hi ${esc(userName)},</h2>
      <p>You have been added to project <strong>${esc(projectName)}</strong>
         as <strong>${esc(roleLabel)}</strong>.</p>
      <p>Log in to Niyamak to view the project details, scope, and documents.</p>
    `,
  });
};

// ─── 5. Drone maintenance due in 7 days → email Admins (PRD §11.2) ───────
exports.onDroneMaintenanceDue = async ({ droneId, droneName, serialNumber, maintenanceDate }) => {
  // waTriggers.onDroneMaintenanceDue({ droneName, serialNumber, maintenanceDate }).catch(() => {});
  try {
    const admins = await db.query(
      `SELECT id AS user_id, email, name FROM users
        WHERE role = 'admin' AND email IS NOT NULL AND deleted_at IS NULL`
    );
    for (const a of admins.rows) {
      if (!(await _prefAllows(a.user_id, 'expiry'))) continue;
      await _enqueue({
        to: a.email,
        subject: `Drone maintenance due: ${esc(droneName || serialNumber)}`,
        html: `
          <h2>Hi ${esc(a.name)},</h2>
          <p>Drone <strong>${esc(droneName || 'Unit')}</strong> (S/N: <code>${esc(serialNumber)}</code>)
             is due for scheduled maintenance on <strong>${esc(maintenanceDate)}</strong>.</p>
          <p>Please plan accordingly to avoid deployment downtime.</p>
        `,
      });
    }
  } catch (e) {
    console.error('[EmailTrigger] onDroneMaintenanceDue failed:', e.message);
  }
};

// ─── 6. Pilot license expiring in 30 days → email Admin + Pilot (PRD §11.2) ─
exports.onPilotLicenseExpiring = async ({ pilotUserId, pilotName, pilotEmail, pilotPhone, expiryDate }) => {
  // waTriggers.onPilotLicenseExpiring({ pilotUserId, pilotName, pilotPhone, expiryDate }).catch(() => {});
  try {
    // Email the pilot themselves
    if (pilotEmail && (await _prefAllows(pilotUserId, 'expiry'))) {
      await _enqueue({
        to: pilotEmail,
        subject: 'Action required: Pilot license expiring soon',
        html: `
          <h2>Hi ${esc(pilotName)},</h2>
          <p>Your drone pilot license is set to expire on <strong>${esc(expiryDate)}</strong>.</p>
          <p>Please initiate the renewal process immediately to maintain your flight eligibility.</p>
        `,
      });
    }
    // Also notify all admins
    const admins = await db.query(
      `SELECT id AS user_id, email, name FROM users
        WHERE role = 'admin' AND email IS NOT NULL AND deleted_at IS NULL`
    );
    for (const a of admins.rows) {
      if (!(await _prefAllows(a.user_id, 'expiry'))) continue;
      await _enqueue({
        to: a.email,
        subject: `Pilot license expiring: ${esc(pilotName)}`,
        html: `
          <h2>Hi ${esc(a.name)},</h2>
          <p>Pilot <strong>${esc(pilotName)}</strong> has a license expiring on
             <strong>${esc(expiryDate)}</strong>.</p>
          <p>Please ensure the renewal is tracked and approved before the expiry date.</p>
        `,
      });
    }
  } catch (e) {
    console.error('[EmailTrigger] onPilotLicenseExpiring failed:', e.message);
  }
};
