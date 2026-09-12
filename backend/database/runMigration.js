// Run once: node database/runMigration.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true') ? { rejectUnauthorized: false } : { rejectUnauthorized: false },
});

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations/062_pipeline_sales_executive.sql'), 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('✅  062_pipeline_sales_executive applied successfully');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error('❌  Migration failed:', err.message); process.exit(1); });
