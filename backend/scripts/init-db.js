// Creates all tables by running ../db/schema.sql. Safe to run twice: it stops if tables exist.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

(async () => {
  const client = new Client(require('../src/dbConfig')());
  await client.connect();
  const { rows } = await client.query(`SELECT to_regclass('public.users') AS t`);
  if (rows[0].t) {
    console.log('Tables already exist, nothing to do.');
  } else {
    await client.query(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8'));
    console.log('Database schema created.');
  }
  await client.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
