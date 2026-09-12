/**
 * ═══════════════════════════════════════════════════════════════════════
 *  DEMO DATA RESET — Niyamak / Varuna Ops
 * ═══════════════════════════════════════════════════════════════════════
 * Wipes ALL business/transactional data from the DEMO database and deletes
 * every file this seeder ever uploaded to the DEMO R2 bucket (everything
 * under the demo/ prefix) — so you can re-run seed-demo.js on a clean slate
 * any number of times.
 *
 * Left untouched on purpose (these are system reference/config data owned
 * by migrations, not "demo data"): schema_migrations, project_type_configs,
 * library_categories, bd_sectors, bd_departments, bd_settings,
 * weekly_report_settings, estimation_rate_cards, company_config,
 * scheduler_state. Re-running seed-demo.js overwrites company_config's
 * branding fields again regardless.
 *
 * SAFETY: same hard host/bucket guard as seed-demo.js — refuses to run
 * against anything but the known demo database/bucket. It never touches
 * production.
 *
 * Usage: node database/demo/reset-demo.js
 */
const { Pool } = require('pg');
const { assertDemoDatabase, assertDemoBucket, DEMO_R2_PREFIX } = require('./lib/guard');
assertDemoDatabase();
assertDemoBucket();

const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const pool = new Pool({
  host: process.env.DB_HOST, port: +process.env.DB_PORT, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const BUSINESS_TABLES = [
  'users', 'pilots', 'drones', 'drone_maintenance_logs', 'clients', 'assets',
  'bd_clients', 'bd_contacts', 'bd_channels', 'bd_touchpoints', 'bd_followups', 'bd_activity_log',
  'pipeline', 'pipeline_documents',
  'projects', 'project_members', 'project_scope', 'project_maps', 'project_kml_uploads',
  'project_documents', 'project_expenses', 'project_invoices', 'project_invoice_items',
  'deliverables', 'deliverable_versions', 'deliverable_bundles',
  'allocations', 'allocation_conflicts',
  'estimations', 'estimation_items',
  'library_documents', 'library_folders', 'library_tags', 'library_file_tags', 'library_versions',
  'pilot_attendance', 'pilot_leave_balances', 'pilot_payroll_settings', 'pilot_payroll_records', 'company_holidays',
  'calendar_events', 'notifications', 'activity_logs',
  'upload_sessions', 'user_notification_prefs', 'password_reset_tokens',
];

async function truncateBusinessTables() {
  const client = await pool.connect();
  try {
    console.log(`Truncating ${BUSINESS_TABLES.length} business/transactional tables (CASCADE)...`);
    await client.query(`TRUNCATE TABLE ${BUSINESS_TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);
    console.log('✅ All business/transactional data removed.');
  } finally {
    client.release();
  }
}

async function deleteDemoFiles() {
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY, secretAccessKey: process.env.R2_SECRET_KEY },
  });

  let token, total = 0;
  do {
    const list = await r2.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, Prefix: DEMO_R2_PREFIX, ContinuationToken: token }));
    const keys = (list.Contents || []).map((o) => ({ Key: o.Key }));
    if (keys.length) {
      await r2.send(new DeleteObjectsCommand({ Bucket: process.env.R2_BUCKET, Delete: { Objects: keys } }));
      total += keys.length;
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  console.log(`✅ Deleted ${total} demo file(s) from R2 bucket "${process.env.R2_BUCKET}" (prefix "${DEMO_R2_PREFIX}").`);
}

(async () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Resetting DEMO data →', process.env.DB_HOST);
  console.log(' Bucket              →', process.env.R2_BUCKET);
  console.log('═══════════════════════════════════════════════════════\n');
  try {
    await truncateBusinessTables();
    await deleteDemoFiles();
    console.log('\n✅ Demo environment is now empty. Run `node database/demo/seed-demo.js` to repopulate it.');
  } catch (err) {
    console.error('\n❌ Reset failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
