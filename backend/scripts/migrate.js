// Applies any new files from db/migrations (in name order) that have not been applied yet.
// Usage: npm run db:migrate     Safe to run any time; it remembers what it already applied.
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
require('dotenv').config()

async function migrate(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`)
  const dir = path.join(__dirname, '..', '..', 'db', 'migrations')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : []
  const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
  let applied = 0
  for (const file of files) {
    if (done.has(file)) continue
    console.log('Applying', file)
    await client.query(fs.readFileSync(path.join(dir, file), 'utf8')) // each file has its own BEGIN/COMMIT
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    applied++
  }
  console.log(applied ? `Applied ${applied} migration(s).` : 'Database is up to date.')
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
