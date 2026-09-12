/**
 * BD reminder engine — the daily follow-up digest + weekly summary.
 *
 * Per BD_MODULE_PLAN.md §8: email is an allow-list, not a change log. This is
 * the ONLY place BD sends mail, and it only ever mails admins — never a
 * prospect. Borrows email.service.sendEmail() as pure transport; every
 * template here is BD's own.
 */
const db = require('../../core/config/db');
const { emailQueue, addJob } = require('../../core/queues');
const emailService = require('../notification/email.service');
const config = require('./bd.config.service');
const { recomputeClientFollowUp } = require('./bd.touchpoints.service');
const env = require('../../core/config/env');

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const appUrl = () => env.appUrl;

const daysSince = (date) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));

const _admins = async () => {
  const { rows } = await db.query(
    `SELECT id, email, name FROM users WHERE role IN ('admin','super_admin') AND deleted_at IS NULL AND email IS NOT NULL`
  );
  return rows;
};

const _dueFollowups = async () => {
  const { rows } = await db.query(`
    SELECT f.*, c.name AS client_name, c.priority AS client_priority,
           ct.name AS contact_name, ch.channel_type, ch.value AS channel_value,
           t.subject AS touchpoint_subject
    FROM bd_followups f
    JOIN bd_clients c ON c.id = f.client_id AND c.deleted_at IS NULL
    LEFT JOIN bd_contacts ct ON ct.id = f.contact_id
    LEFT JOIN bd_channels ch ON ch.id = f.channel_id
    LEFT JOIN bd_touchpoints t ON t.id = f.touchpoint_id
    WHERE f.status IN ('pending','sent') AND f.due_at <= NOW()
    ORDER BY c.priority ASC, f.due_at ASC
  `);
  return rows;
};

const _rowHtml = (f) => `
  <tr>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:600;">${esc(f.client_priority)}</td>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;">
      <a href="${appUrl()}/bd/clients/${f.client_id}" style="color:#2563eb;text-decoration:none;">${esc(f.client_name)}</a>
    </td>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${esc(f.contact_name || '—')}</td>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${esc(f.channel_type || '')} ${esc(f.channel_value || '')}</td>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${esc(f.touchpoint_subject || f.note || '—')}</td>
    <td style="padding:8px;border-bottom:1px solid #e2e8f0;">${daysSince(f.due_at)}d</td>
  </tr>`;

const _digestHtml = (normal, escalated) => `
  <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;">
    <h2 style="color:#2563eb;margin-top:0;">Business Development — Follow-ups due</h2>
    <p>${normal.length + escalated.length} follow-up(s) need a check-in today.</p>
    ${normal.length ? `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f5f6fa;text-align:left;">
          <th style="padding:8px;">Priority</th><th style="padding:8px;">Client</th><th style="padding:8px;">Contact</th>
          <th style="padding:8px;">Channel</th><th style="padding:8px;">What was sent</th><th style="padding:8px;">Silent for</th>
        </tr></thead>
        <tbody>${normal.map(_rowHtml).join('')}</tbody>
      </table>` : ''}
    ${escalated.length ? `
      <h3 style="color:#dc2626;margin-top:24px;">Needs attention — repeated reminders, still no reply</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#fef2f2;text-align:left;">
          <th style="padding:8px;">Priority</th><th style="padding:8px;">Client</th><th style="padding:8px;">Contact</th>
          <th style="padding:8px;">Channel</th><th style="padding:8px;">What was sent</th><th style="padding:8px;">Silent for</th>
        </tr></thead>
        <tbody>${escalated.map(_rowHtml).join('')}</tbody>
      </table>` : ''}
    <div style="margin:25px 0;">
      <a href="${appUrl()}/bd/followups" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold;display:inline-block;">Open Follow-ups</a>
    </div>
    <p style="color:#64748b;font-size:12px;margin-bottom:0;">Niyamak — Business Development</p>
  </div>`;

// ── Daily sweep — the only automatic BD email besides the weekly summary ─────
exports.runSweep = async () => {
  const settings = await config.getSettings();
  const due = await _dueFollowups();

  if (!due.length) {
    console.log('[BD Reminders] No follow-ups due — nothing to send.');
    return { sent: 0, escalated: 0 };
  }

  const maxReminders = settings?.max_reminders ?? 3;
  const escalationDays = settings?.escalation_days ?? 7;

  // A follow-up escalates once THIS send would push reminder_count to the cap —
  // it stops re-sending automatically and needs a human to act.
  const willEscalate = (f) => (f.reminder_count + 1) >= maxReminders;

  const normal    = due.filter(f => !willEscalate(f));
  const escalated = due.filter(f => willEscalate(f));

  // Recipients: each follow-up's assignee, falling back to every admin; plus
  // any extra admins configured in bd_settings.notify_user_ids get the full digest.
  const admins = await _admins();
  const adminById = new Map(admins.map(a => [a.id, a]));
  const extraIds = new Set(settings?.notify_user_ids || []);

  const byRecipient = new Map(); // userId -> { normal: [], escalated: [] }
  const assignTo = (userId, bucket, followup) => {
    if (!adminById.has(userId)) return;
    if (!byRecipient.has(userId)) byRecipient.set(userId, { normal: [], escalated: [] });
    byRecipient.get(userId)[bucket].push(followup);
  };

  for (const f of normal)    (f.assigned_to ? [f.assigned_to] : admins.map(a => a.id)).forEach(uid => assignTo(uid, 'normal', f));
  for (const f of escalated) (f.assigned_to ? [f.assigned_to] : admins.map(a => a.id)).forEach(uid => assignTo(uid, 'escalated', f));
  for (const extraId of extraIds) {
    if (!byRecipient.has(extraId)) byRecipient.set(extraId, { normal: [], escalated: [] });
    const bucket = byRecipient.get(extraId);
    for (const f of normal)    if (!bucket.normal.includes(f))    bucket.normal.push(f);
    for (const f of escalated) if (!bucket.escalated.includes(f)) bucket.escalated.push(f);
  }

  const digestEnabled = settings?.digest_enabled !== false;

  for (const [userId, { normal: n, escalated: e }] of byRecipient) {
    const admin = adminById.get(userId);
    if (!admin) continue;
    if (digestEnabled) {
      await addJob(emailQueue, 'send-email', {
        to: admin.email,
        subject: `BD: ${n.length + e.length} follow-up(s) due${e.length ? ` (${e.length} need attention)` : ''}`,
        html: _digestHtml(n, e),
      }, (data) => emailService.sendEmail(data)).catch(err => console.error('[BD Reminders] digest send failed:', err.message));
    } else {
      for (const f of [...n, ...e]) {
        await addJob(emailQueue, 'send-email', {
          to: admin.email,
          subject: `BD follow-up due: ${f.client_name}`,
          html: _digestHtml([f], []),
        }, (data) => emailService.sendEmail(data)).catch(err => console.error('[BD Reminders] send failed:', err.message));
      }
    }
  }

  // Persist reminder state — normal ones get pushed out by escalation_days;
  // escalated ones stop appearing in future sweeps (status leaves pending/sent).
  const conn = await db.connect();
  try {
    await conn.query('BEGIN');
    const touchedClients = new Set();

    for (const f of normal) {
      await conn.query(
        `UPDATE bd_followups SET status = 'sent', reminder_count = reminder_count + 1, last_reminded_at = NOW(),
           due_at = due_at + ($1 || ' days')::INTERVAL
         WHERE id = $2`,
        [String(escalationDays), f.id]
      );
      touchedClients.add(f.client_id);
    }
    for (const f of escalated) {
      await conn.query(
        `UPDATE bd_followups SET status = 'escalated', reminder_count = reminder_count + 1, last_reminded_at = NOW()
         WHERE id = $1`,
        [f.id]
      );
      touchedClients.add(f.client_id);
    }
    for (const clientId of touchedClients) {
      await recomputeClientFollowUp(clientId, conn);
    }
    await conn.query('COMMIT');
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }

  console.log(`[BD Reminders] Sweep complete — ${normal.length} reminded, ${escalated.length} escalated.`);
  return { sent: normal.length, escalated: escalated.length };
};

// ── Weekly summary — optional, off unless bd_settings.weekly_summary_enabled ─
exports.runWeeklySummary = async () => {
  const settings = await config.getSettings();
  if (!settings?.weekly_summary_enabled) {
    console.log('[BD Reminders] Weekly summary disabled — skipping.');
    return { sent: false };
  }

  const [newClients, statusMoves, outreachSent, stillAwaiting] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM bd_clients WHERE created_at >= NOW() - INTERVAL '7 days' AND deleted_at IS NULL`),
    db.query(`SELECT new_value->>'status' AS status, COUNT(*) FROM bd_activity_log
              WHERE action = 'CHANGE_STATUS' AND created_at >= NOW() - INTERVAL '7 days'
              GROUP BY new_value->>'status'`),
    db.query(`SELECT COUNT(*) FROM bd_touchpoints WHERE direction = 'outbound' AND created_at >= NOW() - INTERVAL '7 days'`),
    db.query(`SELECT COUNT(*) FROM bd_touchpoints WHERE response_status = 'awaiting'`),
  ]);

  // Weekly summary goes to every admin (unlike the daily digest, which is
  // per-assignee) — notify_user_ids are already admins so no extra lookup needed.
  const admins = await _admins();
  if (!admins.length) return { sent: false };

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;">
      <h2 style="color:#2563eb;margin-top:0;">Business Development — Weekly Summary</h2>
      <ul style="font-size:14px;line-height:1.8;">
        <li><strong>${newClients.rows[0].count}</strong> new lead(s) added this week</li>
        <li><strong>${outreachSent.rows[0].count}</strong> outreach touchpoint(s) logged this week</li>
        <li><strong>${stillAwaiting.rows[0].count}</strong> outreach still awaiting a reply</li>
        ${statusMoves.rows.map(r => `<li>${esc(r.count)} moved to <strong>${esc(r.status)}</strong></li>`).join('')}
      </ul>
      <div style="margin:25px 0;">
        <a href="${appUrl()}/bd" style="background:#2563eb;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold;display:inline-block;">Open BD Dashboard</a>
      </div>
      <p style="color:#64748b;font-size:12px;margin-bottom:0;">Niyamak — Business Development</p>
    </div>`;

  for (const admin of admins) {
    await addJob(emailQueue, 'send-email', {
      to: admin.email,
      subject: 'BD Weekly Summary',
      html,
    }, (data) => emailService.sendEmail(data)).catch(err => console.error('[BD Reminders] weekly summary send failed:', err.message));
  }

  console.log(`[BD Reminders] Weekly summary sent to ${admins.length} admin(s).`);
  return { sent: true, recipients: admins.length };
};
