/**
 * Safety guard shared by every demo script (seed / reset / anything else
 * that touches the database or object storage in bulk).
 *
 * HARD RULE: these scripts must NEVER be able to run against the production
 * database, no matter what is in .env at the time. We check the actual
 * resolved DB_HOST against an explicit allow-list of demo hosts, not an
 * env flag (a flag can be copy-pasted between environments; a hostname
 * mismatch cannot).
 *
 * To point this at a different demo database later, add its host to
 * ALLOWED_DEMO_DB_HOSTS below — do NOT bypass the check.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const ALLOWED_DEMO_DB_HOSTS = [
  'ep-summer-butterfly-ayxbouho-pooler.c-5.us-east-2.aws.neon.tech',
];

// Bucket the demo file-generator/seed/reset scripts are allowed to write
// into. Everything they write is namespaced under DEMO_R2_PREFIX as well,
// so even a shared bucket only ever touches that one folder.
const ALLOWED_DEMO_R2_BUCKETS = ['matheran-a', 'varunaops-demo'];
const DEMO_R2_PREFIX = 'demo/';

function assertDemoDatabase() {
  const host = String(process.env.DB_HOST || '');
  if (!ALLOWED_DEMO_DB_HOSTS.includes(host)) {
    console.error('\n❌ REFUSING TO RUN.');
    console.error(`   backend/.env DB_HOST is "${host}".`);
    console.error(`   This script only runs against a known DEMO database host:`);
    for (const h of ALLOWED_DEMO_DB_HOSTS) console.error(`     - ${h}`);
    console.error('   This is a hard safety check to make it impossible to run demo');
    console.error('   seed/reset scripts against production by mistake.\n');
    process.exit(1);
  }
}

function assertDemoBucket() {
  const bucket = String(process.env.R2_BUCKET || '');
  if (!ALLOWED_DEMO_R2_BUCKETS.includes(bucket)) {
    console.error('\n❌ REFUSING TO RUN.');
    console.error(`   backend/.env R2_BUCKET is "${bucket}", not a recognized demo bucket.`);
    console.error(`   Allowed: ${ALLOWED_DEMO_R2_BUCKETS.join(', ')}\n`);
    process.exit(1);
  }
}

module.exports = { assertDemoDatabase, assertDemoBucket, DEMO_R2_PREFIX, ALLOWED_DEMO_DB_HOSTS, ALLOWED_DEMO_R2_BUCKETS };
