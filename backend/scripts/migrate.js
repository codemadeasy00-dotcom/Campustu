// Applies any new files from db/migrations (in name order) that have not been applied yet.
// Usage: npm run db:migrate     Safe to run any time; it remembers what it already applied.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
require('dotenv').config()

async function migrate(client, migrationDir = path.join(__dirname, '..', '..', 'db', 'migrations')) {
  if (!fs.existsSync(migrationDir)) {
    throw new Error(`Database migrations directory is missing: ${migrationDir}`)
  }
  const files = fs.readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort()

  await client.query("SELECT pg_advisory_lock(hashtext('campustu:schema-migrations')::bigint)")
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
    let applied = 0
    for (const file of files) {
      if (done.has(file)) continue
      console.log('Applying', file)
      await client.query(fs.readFileSync(path.join(migrationDir, file), 'utf8'))
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      applied++
    }
    console.log(applied ? `Applied ${applied} migration(s).` : 'Database is up to date.')
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('campustu:schema-migrations')::bigint)")
  }
}

module.exports = { migrate }

if (require.main === module) {
  ;(async () => {
    const client = new Client(require('../src/dbConfig')())
    await client.connect()
    try {
      await migrate(client)
    } finally {
      await client.end()
    }
  })().catch((e) => { console.error(e.message); process.exit(1) })
}
