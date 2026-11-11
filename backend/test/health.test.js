const test = require('node:test')
const assert = require('node:assert/strict')
const app = require('../src/app')
const { pool } = require('../src/db')

async function withServer(run) {
  const server = app.listen(0)
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

test('health endpoint reports ready only when the database responds', async (t) => {
  const originalQuery = pool.query
  t.after(() => { pool.query = originalQuery })
  pool.query = async (text) => {
    assert.equal(text, 'SELECT 1')
    return { rows: [{ '?column?': 1 }] }
  }

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
  })
})

test('health endpoint reports service unavailable when the database cannot respond', async (t) => {
  const originalQuery = pool.query
  const originalConsoleError = console.error
  t.after(() => {
    pool.query = originalQuery
    console.error = originalConsoleError
  })
  pool.query = async () => { throw new Error('database unavailable') }
  console.error = () => {}

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { ok: false })
  })
})
