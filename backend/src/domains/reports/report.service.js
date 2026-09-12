/**
 * report.service.js — orchestrates the weekly report:
 *   gather data → render HTML → resolve recipients → send via mailer
 */
const db       = require('../../core/config/db');
const mailer   = require('../../core/utils/mailer');
const data     = require('./report.data');
const template = require('./report.template');
const env      = require('../../core/config/env');

/** Fetch (or create) the singleton settings row */
exports.getSettings = async () => {
  const res = await db.query('SELECT * FROM weekly_report_settings WHERE id = 1');
  return res.rows[0];
};

/** Persist settings, returns updated row */
exports.updateSettings = async (patch) => {
  const allowed = ['enabled','send_day','send_hour_ist','recipients','include_admins','include_pms'];
  const sets = [], vals = [];
  allowed.forEach(k => {
    if (patch[k] !== undefined) {
      sets.push(`${k} = $${vals.length + 1}`);
      vals.push(patch[k]);
    }
  });
  if (!sets.length) return exports.getSettings();
  sets.push(`updated_at = NOW()`);
  vals.push(1);
  const res = await db.query(
    `UPDATE weekly_report_settings SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
    vals
  );
  return res.rows[0];
};

/** Resolve the full recipient list from settings */
const resolveRecipients = async (settings) => {
  const emails = new Set();

  if (settings.include_admins) {
    const res = await db.query(`SELECT email FROM users WHERE role='admin' AND deleted_at IS NULL AND email IS NOT NULL`);
    res.rows.forEach(r => emails.add(r.email.trim().toLowerCase()));
  }
  if (settings.include_pms) {
    const res = await db.query(`SELECT email FROM users WHERE role='project_manager' AND deleted_at IS NULL AND email IS NOT NULL`);
    res.rows.forEach(r => emails.add(r.email.trim().toLowerCase()));
  }
  (settings.recipients || []).forEach(e => { if (e && e.trim()) emails.add(e.trim().toLowerCase()); });
  return [...emails];
};

/** Build data + render + send to resolved recipients. Returns { sentTo, skipped } */
exports.sendReport = async () => {
  const settings = await exports.getSettings();
  const recipients = await resolveRecipients(settings);

  if (!recipients.length) {
    console.log('[WeeklyReport] No recipients configured — skipping send.');
    return { sentTo: [], skipped: true, reason: 'no_recipients' };
  }

  const reportData = await data.gather();
  const html = template.build(reportData, env.appUrl);
  const text = template.buildText(reportData);

  const subject = `📊 Niyamak Weekly Report — ${reportData.weekRange}`;

  const results = { sentTo: [], errors: [] };
  for (const email of recipients) {
    try {
      await mailer.sendEmail({ to: email, subject, html, text });
      results.sentTo.push(email);
    } catch (e) {
      console.error(`[WeeklyReport] Failed to send to ${email}: ${e.message}`);
      results.errors.push({ email, error: e.message });
    }
  }

  // Record last_sent_at
  await db.query(`UPDATE weekly_report_settings SET last_sent_at = NOW() WHERE id = 1`);
  console.log(`[WeeklyReport] Sent to ${results.sentTo.length} recipient(s). Errors: ${results.errors.length}`);
  return results;
};

/** Preview data only (no email sent) — for the frontend preview pane */
exports.getPreviewData = async () => data.gather();
