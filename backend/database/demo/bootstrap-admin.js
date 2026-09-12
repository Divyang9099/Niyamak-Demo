/**
 * ═══════════════════════════════════════════════════════════════════════
 *  DEMO BOOTSTRAP — single real admin account
 * ═══════════════════════════════════════════════════════════════════════
 * Unlike seed-demo.js, this does NOT create any fictional company/pilot/
 * project data. It only creates ONE admin user so the client can log in
 * and build up their own data from scratch — a genuinely fresh account.
 *
 * SAFETY: same hard host guard as seed-demo.js — refuses to run against
 * anything but the known demo database. It never touches production.
 *
 * Usage: node database/demo/bootstrap-admin.js
 */
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const { assertDemoDatabase } = require('./lib/guard');
assertDemoDatabase();

const ADMIN_EMAIL = 'geoconkp@gmail.com';
const ADMIN_NAME = 'Admin';

const pool = new Pool({
  host: process.env.DB_HOST, port: +process.env.DB_PORT, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

async function main() {
  const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [ADMIN_EMAIL]);
  if (existing.rows.length > 0) {
    console.log(`⚠️  A user with email ${ADMIN_EMAIL} already exists (id=${existing.rows[0].id}) — nothing to do.`);
    console.log('   Use the "Forgot password" flow on the login page to (re)set its password.');
    return;
  }

  const tempPassword = crypto.randomBytes(9).toString('base64url'); // e.g. "kQ3f9xLp2mZ1aQ"
  const hash = await bcrypt.hash(tempPassword, 12);

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
    [ADMIN_NAME, ADMIN_EMAIL, hash]
  );

  console.log('═══════════════════════════════════════════════════════');
  console.log(' Admin account created');
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Email:    ', ADMIN_EMAIL);
  console.log(' Password: ', tempPassword);
  console.log('');
  console.log(' Log in once with this password, then either change it from');
  console.log(' the profile page or use "Forgot password" to set a new one');
  console.log(' via the email flow.');
}

main()
  .catch((err) => { console.error('❌ Bootstrap failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
