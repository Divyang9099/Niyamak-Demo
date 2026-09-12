const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465, // true for 465, false for other ports
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass,
  },
  // Pooled + rate-limited so bursts don't trigger the provider's rate limits.
  pool:           true,
  maxConnections: 1,
  maxMessages:    100,
  rateDelta:      1000,
  rateLimit:      5,
});

// Verify the SMTP connection once at startup so misconfiguration is loud and
// obvious in the logs instead of failing silently on the first send.
exports.verifyConnection = async () => {
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) {
    console.warn('⚠️  [Mailer] SMTP not fully configured — emails will FAIL. ' +
      `host=${env.smtp.host || 'MISSING'} user=${env.smtp.user || 'MISSING'} pass=${env.smtp.pass ? 'set' : 'MISSING'}`);
    return false;
  }
  try {
    await transporter.verify();
    console.log(`✅ [Mailer] SMTP ready → ${env.smtp.host}:${env.smtp.port} as ${env.smtp.user} (from: ${env.smtp.fromEmail || env.smtp.user})`);
    return true;
  } catch (err) {
    console.error(`❌ [Mailer] SMTP connection FAILED → ${env.smtp.host}:${env.smtp.port} | ${err.message}`);
    return false;
  }
};

exports.sendEmail = async ({ to, subject, text, html }) => {
  const from = `"${env.smtp.fromName}" <${env.smtp.fromEmail || env.smtp.user}>`;
  console.log(`📧 [Mailer] Sending → to=${to} | from=${from} | subject="${subject}"`);
  try {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    console.log(`✅ [Mailer] Sent → ${to} | messageId=${info.messageId} | response=${info.response}`);
    return info;
  } catch (error) {
    console.error(`❌ [Mailer] Send FAILED → ${to} | code=${error.code || 'n/a'} | ${error.message}`);
    throw error;
  }
};
