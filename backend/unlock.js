const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.DB_HOST, port: +process.env.DB_PORT,
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false }
});
pool.query("UPDATE users SET failed_login_attempts=0, locked_until=NULL")
  .then(r => { console.log('All users unlocked:', r.rowCount, 'rows'); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
