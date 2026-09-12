const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true') ? { rejectUnauthorized: false } : false,
});

const migrationsDir = path.join(__dirname, '../../../database/migrations');

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

(async () => {
  const client = await pool.connect();
  let applied = 0, skipped = 0;
  try {
    // 1. Ensure the tracking table exists.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        checksum    TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 3. All migration files in lexical order (001, 002, …).
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    // 2b. Baseline an EXISTING database. If the tracking table is empty but the
    // schema already exists (core `users` table present), this DB was migrated
    // before tracking existed. Re-running early migrations (e.g. 001's
    // non-idempotent CREATE TRIGGER) would fail, so we record every current
    // migration as already-applied WITHOUT executing it.
    const trackCount = (await client.query('SELECT COUNT(*)::int AS n FROM schema_migrations')).rows[0].n;
    if (trackCount === 0) {
      const hasSchema = (await client.query(
        `SELECT to_regclass('public.users') IS NOT NULL AS exists`
      )).rows[0].exists;
      if (hasSchema) {
        console.log('🧭 Existing schema detected with no tracking rows — baselining all current migrations as applied.');
        for (const file of files) {
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
          await client.query(
            'INSERT INTO schema_migrations (filename, checksum) VALUES ($1,$2) ON CONFLICT (filename) DO NOTHING',
            [file, md5(sql)]
          );
        }
        console.log(`✅ Baselined ${files.length} migration(s). Future runs apply only NEW files.`);
      }
    }

    // 2. Which migrations have already run?
    const doneRes = await client.query('SELECT filename, checksum FROM schema_migrations');
    const done = new Map(doneRes.rows.map(r => [r.filename, r.checksum]));

    console.log(`🔍 Found ${files.length} migration file(s); ${done.size} already applied.`);

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const checksum = md5(sql);

      if (done.has(file)) {
        // Already applied — warn if the file changed after the fact.
        if (done.get(file) !== checksum) {
          console.warn(`⚠️  ${file} already applied but its checksum changed since. ` +
                       `Migrations should be immutable — create a new migration instead of editing this one.`);
        }
        skipped++;
        continue;
      }

      // 4. Apply the new migration inside a transaction; record it atomically.
      console.log(`🚀 Applying ${file} ...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [file, checksum]
        );
        await client.query('COMMIT');
        applied++;
        console.log(`✅ ${file} applied.`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ ${file} failed (rolled back):`, err.message);
        if (err.detail) console.error('   detail:', err.detail);
        throw err; // stop — do not continue past a failed migration
      }
    }

    console.log(`\n📦 Migrations complete — ${applied} applied, ${skipped} skipped (already current).`);
  } catch (err) {
    console.error('\n❌ Migration run aborted:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
