/**
 * Email Service — Nodemailer integration
 *
 * To activate: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in your .env
 * Works with Gmail, Zoho, Mailgun, SendGrid SMTP, etc.
 *
 * Usage:
 *   const email = require('./email.service');
 *   await email.sendEmail({ to: 'client@example.com', subject: 'Estimate Ready', html: '<p>...</p>' });
 */

const nodemailer = require('nodemailer');
const env = require('../../core/config/env');

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

// IMPORTANT: build the transporter ONCE and reuse it (pooled). Previously this
// created a NEW transporter per email → a fresh SMTP login every send. Under a
// burst (e.g. a folder upload's notifications) Gmail returns
// "454 4.7.0 Too many login attempts" and locks the account out, failing ALL
// mail. A single pooled connection logs in once and reuses it, rate-limited so
// we stay within Gmail's limits.
let _transporter = null;
const getTransporter = () => {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
    tls: { rejectUnauthorized: env.nodeEnv === 'production' },
    pool:           true,   // keep a persistent connection instead of logging in each time
    maxConnections: 1,      // one connection → one login, reused for every message
    maxMessages:    100,    // recycle the connection after 100 messages
    rateDelta:      1000,   // sliding window (ms)
    rateLimit:      5,      // ≤ 5 messages/sec — Gmail-friendly
  });
  return _transporter;
};

exports.sendEmail = async ({ to, subject, html, text }) => {
  // If SMTP is not configured, log and skip gracefully (dev mode)
  if (!env.smtp.host || !env.smtp.user) {
    console.log(`[Email Stub] To: ${to} | Subject: ${subject}`);
    return { skipped: true };
  }

  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from: `"${env.smtp.fromName}" <${env.smtp.fromEmail || env.smtp.user}>`,
    to,
    subject,
    html,
    text: text || '',
  });

  console.log(`[Email Sent] MessageId: ${info.messageId} → ${to}`);
  return info;
};

/**
 * Pre-built email templates
 */
exports.sendAllocationNotification = async ({ to, pilotName, projectName, startDate }) => {
  return exports.sendEmail({
    to,
    subject: `New Assignment: ${projectName}`,
    html: `
      <h2>Hi ${esc(pilotName)},</h2>
      <p>You have been assigned to project <strong>${esc(projectName)}</strong>.</p>
      <p>Start Date: <strong>${esc(startDate)}</strong></p>
      <p>Log in to Niyamak to view full details.</p>
    `,
  });
};

exports.sendDeliverableReady = async ({ to, clientName, projectName, downloadUrl }) => {
  return exports.sendEmail({
    to,
    subject: `Deliverable Ready — ${projectName}`,
    html: `
      <h2>Hi ${esc(clientName)},</h2>
      <p>Your deliverables for project <strong>${esc(projectName)}</strong> are ready.</p>
      <p><a href="${downloadUrl}">Click here to download</a></p>
    `,
  });
};
