const { Pool, types } = require('pg')
require('dotenv').config()

// Return Postgres DATE (OID 1082) as raw "YYYY-MM-DD" instead of a JS Date.
// Prevents server-local-timezone parsing that shifted dates back a day on JSON round-trip.
types.setTypeParser(1082, (val) => val)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err)
})

const query = (text, params) => pool.query(text, params)

module.exports = { query, pool }
