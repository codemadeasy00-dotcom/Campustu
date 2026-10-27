const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  ...require('./dbConfig')(),
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
pool.on('error', (err) => console.error('Unexpected Postgres pool error', err));

const query = (text, params) => pool.query(text, params);

// Run several queries in one transaction: await tx(async (client) => { ... })
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
