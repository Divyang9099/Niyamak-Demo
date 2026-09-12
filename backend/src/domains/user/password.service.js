const crypto  = require('crypto');
const bcrypt   = require('bcryptjs');
const pool     = require('../../core/config/db');
const mailer   = require('../../core/utils/mailer');
const sessionGuard = require('../../core/utils/sessionGuard');

// Neutral — avoids leaking whether an email exists in the system
const NEUTRAL_MESSAGE = 'If an account exists with that email, a reset code has been sent.';

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

/**
 * CHANGE PASSWORD (authenticated — requires current password)
 */
exports.changePassword = async (userId, currentPassword, newPassword) => {
  if (!currentPassword || !newPassword) {
    throw Object.assign(new Error('Current password and new password are required'), { statusCode: 400 });
  }
  if (newPassword.length < 8) {
    throw Object.assign(new Error('New password must be at least 8 characters'), { statusCode: 400 });
  }

  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!result.rows.length) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!valid) {
    throw Object.assign(new Error('Current password is incorrect'), { statusCode: 401 });
  }

  const password_hash = await bcrypt.hash(newPassword, 12);
  // H-4: invalidate existing sessions on password change so a stolen token can't
  // outlive the password it was issued under. The user re-authenticates afterward.
  await pool.query(
    'UPDATE users SET password_hash = $1, tokens_valid_after = NOW() WHERE id = $2',
    [password_hash, userId]
  );
  sessionGuard.invalidate(userId);

  return { message: 'Password changed successfully.' };
};

/**
 * FORGOT PASSWORD
 * Generates a 6-digit OTP, stores it with a 1-hour expiry, Sends via Email.
 */
exports.forgotPassword = async (email) => {
  if (!email) throw Object.assign(new Error('Email is required'), { statusCode: 400 });

  const cleanEmail = String(email).trim().toLowerCase();
  console.log(`[ForgotPassword] Request for: ${cleanEmail}`);

  // Member gate: only registered users may reset. Non-members are told plainly.
  const userRes = await pool.query('SELECT id, name, email, role FROM users WHERE LOWER(email) = $1', [cleanEmail]);
  if (!userRes.rows.length) {
    console.warn(`[ForgotPassword] ❌ Not a member: ${cleanEmail}`);
    throw Object.assign(
      new Error('This email is not registered in our software. Please check the spelling or contact your administrator.'),
      { statusCode: 400 }
    );
  }

  const user = userRes.rows[0];

  // Co-pilots have no software access — reject password reset
  if (user.role === 'co_pilot') {
    console.warn(`[ForgotPassword] ❌ Co-pilot crew record attempted password reset: ${cleanEmail}`);
    throw Object.assign(
      new Error('This email is not registered for web access in our software. Please contact your administrator.'),
      { statusCode: 400 }
    );
  }

  console.log(`[ForgotPassword] ✓ Member found: ${user.name} <${user.email}>`);

  // Invalidate any old unused tokens/OTPs for this user
  await pool.query(
    'UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE',
    [user.id]
  );

  // Generate a 6-digit numeric OTP (H-2: cryptographically secure RNG, not Math.random)
  const otp = crypto.randomInt(100000, 1000000).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await pool.query(
    'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, hashedOtp, expiresAt]
  );
  console.log(`[ForgotPassword] OTP generated + stored (expires ${expiresAt.toISOString()})`);

  // Send Email — if this fails the user MUST know (no silent success), otherwise
  // they sit on the reset page forever waiting for a code that never arrives.
  try {
    await mailer.sendEmail({
      to: user.email,
      subject: 'Niyamak — Password Reset Code',
      text: `Hello ${user.name},\n\nYour password reset code is: ${otp}\n\nThis code expires in 1 hour. If you did not request this, please ignore this email.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 600px;">
          <h2 style="color: #002444;">NIYAMAK</h2>
          <p>Hello <strong>${esc(user.name)}</strong>,</p>
          <p>You requested a password reset. Use the code below to complete the process:</p>
          <div style="background: #f2f4f6; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 12px; color: #002444;">${otp}</span>
          </div>
          <p style="color: #73777f; font-size: 14px;">This code expires in <strong>1 hour</strong>. If you did not request this, you can safely ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin-top: 20px;" />
          <p style="color: #43474e; font-size: 12px;">© 2026 Niyamak • Drone Operations Platform</p>
        </div>
      `,
    });
  } catch (err) {
    console.error(`[ForgotPassword] ❌ Email send failed for ${user.email}: ${err.message}`);
    throw Object.assign(
      new Error('We could not send the reset email right now. Please try again in a moment or contact your administrator.'),
      { statusCode: 502 }
    );
  }

  console.log(`[ForgotPassword] ✅ Reset code emailed to ${user.email}`);
  return { message: 'A reset code has been sent to your email.' };
};

/**
 * RESET PASSWORD
 * Validates the 6-digit OTP, checks expiry, hashes new password.
 */
// H-1: a reset code is retired after this many wrong guesses (defence-in-depth
// alongside the IP rate-limit on /reset-password). 1e6-space OTP is no longer
// brute-forceable: 5 tries then the code dies and a new one must be requested.
const MAX_RESET_ATTEMPTS = 5;

exports.resetPassword = async (email, token, newPassword) => {
  if (!email || !token || !newPassword) {
    throw Object.assign(new Error('Email, reset code and new password are required'), { statusCode: 400 });
  }
  if (newPassword.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters'), { statusCode: 400 });
  }

  // M-7: match email case-insensitively (forgotPassword stores via LOWER(email)).
  const cleanEmail = String(email).trim().toLowerCase();

  const result = await pool.query(
    `SELECT prt.*, u.id AS uid
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
      WHERE LOWER(u.email) = $1 AND prt.used = FALSE
      ORDER BY prt.created_at DESC`,
    [cleanEmail]
  );
  if (!result.rows.length) {
    throw Object.assign(new Error('Invalid or expired reset code'), { statusCode: 400 });
  }

  const now = new Date();
  const active = result.rows.filter(r => new Date(r.expires_at) > now);
  if (!active.length) {
    throw Object.assign(new Error('Reset code has expired. Please request a new one.'), { statusCode: 400 });
  }

  // All live codes already exhausted → retire them and force a new request.
  if (active.every(r => r.attempts >= MAX_RESET_ATTEMPTS)) {
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = ANY($1)', [active.map(r => r.id)]);
    throw Object.assign(
      new Error('Too many incorrect attempts. Please request a new reset code.'),
      { statusCode: 429 }
    );
  }

  // Match the submitted code against the non-exhausted live codes.
  let record = null;
  for (const r of active) {
    if (r.attempts >= MAX_RESET_ATTEMPTS) continue;
    if (await bcrypt.compare(token, r.token)) { record = r; break; }
  }

  if (!record) {
    // Wrong code — burn one attempt on each live code; retire any that hit the cap.
    const ids = active.map(r => r.id);
    await pool.query('UPDATE password_reset_tokens SET attempts = attempts + 1 WHERE id = ANY($1)', [ids]);
    await pool.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE id = ANY($1) AND attempts >= $2',
      [ids, MAX_RESET_ATTEMPTS]
    );
    throw Object.assign(new Error('Invalid or expired reset code'), { statusCode: 400 });
  }

  // Success — update password, invalidate existing sessions (H-4), mark code used.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const password_hash = await bcrypt.hash(newPassword, 12);
    await client.query(
      'UPDATE users SET password_hash = $1, tokens_valid_after = NOW() WHERE id = $2',
      [password_hash, record.uid]
    );
    await client.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [record.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  sessionGuard.invalidate(record.uid); // clear the 30s cache so the kill is immediate
  return { message: 'Password reset successful. You can now log in with your new password.' };
};
