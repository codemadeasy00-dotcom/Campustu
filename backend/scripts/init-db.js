// Creates all tables for a NEW empty database: base schema, then every migration.
// For a database that already has the base schema (v2), run `npm run db:migrate` instead.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const { migrate } = require('./migrate')
require('dotenv').config()

;(async () => {
  const client = new Client(require('../src/dbConfig')())
  await client.connect()
  try {
    const { rows } = await client.query(`SELECT to_regclass('public.users') AS t`)
    if (rows[0].t) {
      console.log('Tables already exist. To apply newer changes run: npm run db:migrate')
    } else {
      await client.query(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8'))
      console.log('Base schema created.')
      await migrate(client)
    }
  } finally {
    await client.end()
  }
})().catch((e) => { console.error(e.message); process.exit(1) })
