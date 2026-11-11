const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { migrate } = require('../scripts/migrate')

test('database migrations are serialized between application instances', async () => {
  const migrationDir = path.join(__dirname, '..', '..', 'db', 'migrations')
  const appliedFiles = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql'))
  const calls = []
  const client = {
    async query(text) {
      calls.push(text)
      if (text === 'SELECT name FROM schema_migrations') {
        return { rows: appliedFiles.map((name) => ({ name })) }
      }
      return { rows: [] }
    },
  }

  await migrate(client)

  assert.equal(calls[0], "SELECT pg_advisory_lock(hashtext('campustu:schema-migrations')::bigint)")
  assert.equal(calls[1].startsWith('CREATE TABLE IF NOT EXISTS schema_migrations'), true)
  assert.equal(calls.at(-1), "SELECT pg_advisory_unlock(hashtext('campustu:schema-migrations')::bigint)")
})

test('migration lock is released when migration work fails', async () => {
  const calls = []
  const client = {
    async query(text) {
      calls.push(text)
      if (text.startsWith('CREATE TABLE')) throw new Error('schema unavailable')
      return { rows: [] }
    },
  }

  await assert.rejects(migrate(client), /schema unavailable/)
  assert.equal(calls.at(-1), "SELECT pg_advisory_unlock(hashtext('campustu:schema-migrations')::bigint)")
})
