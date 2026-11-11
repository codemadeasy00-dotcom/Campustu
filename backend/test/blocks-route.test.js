const test = require('node:test')
const assert = require('node:assert/strict')
const app = require('../src/app')
const { pool } = require('../src/db')
const { signToken } = require('../src/middleware/auth')

const actorId = '8d69ca2e-fc32-4e27-b647-28ad6510f8ac'
const targetId = '9c746c68-d834-4f4a-9bfe-c2086449e46f'

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

test('block management requires authentication and cancels existing interactions', async (t) => {
  const originalQuery = pool.query
  const originalConnect = pool.connect
  const clientCalls = []
  t.after(() => {
    pool.query = originalQuery
    pool.connect = originalConnect
  })

  pool.query = async (text) => {
    if (text.startsWith('SELECT id, email, full_name')) {
      return {
        rows: [{
          id: actorId,
          email: 'student@example.edu',
          full_name: 'Student',
          display_name: 'Student',
          role: 'student',
          status: 'active',
          branch_id: null,
          admission_year: null,
          college_id: 1,
          auth_version: 0,
        }],
      }
    }
    if (text.startsWith('DELETE FROM user_blocks')) return { rows: [], rowCount: 1 }
    assert.fail(`Unexpected query: ${text}`)
  }
  pool.connect = async () => ({
    async query(text, params) {
      clientCalls.push({ text, params })
      if (text.startsWith('SELECT id, display_name, avatar_url')) {
        return { rows: [{ id: targetId, display_name: 'Other student', avatar_url: null }] }
      }
      if (text.startsWith('UPDATE item_claims')) return { rows: [] }
      return { rows: [] }
    },
    release() {},
  })

  const token = signToken(actorId, 0)
  await withServer(async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/api/blocks`)
    assert.equal(unauthenticated.status, 401)

    const selfBlock = await fetch(`${baseUrl}/api/blocks/${actorId}`, {
      method: 'POST',
      headers: { Cookie: `campustu_session=${token}` },
    })
    assert.equal(selfBlock.status, 400)

    const response = await fetch(`${baseUrl}/api/blocks/${targetId}`, {
      method: 'POST',
      headers: { Cookie: `campustu_session=${token}` },
    })
    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), {
      success: true,
      blocked_user: { id: targetId, display_name: 'Other student', avatar_url: null },
    })

    const unblock = await fetch(`${baseUrl}/api/blocks/${targetId}`, {
      method: 'DELETE',
      headers: { Cookie: `campustu_session=${token}` },
    })
    assert.equal(unblock.status, 200)
    assert.deepEqual(await unblock.json(), { success: true, unblocked: true })
  })

  assert.ok(clientCalls.some(({ text }) => text.startsWith('INSERT INTO user_blocks')))
  assert.ok(clientCalls.some(({ text, params }) => text.startsWith('UPDATE reservations') && params[0] === actorId))
  assert.ok(clientCalls.some(({ text, params }) => text.startsWith('UPDATE item_claims') && params[0] === actorId))
})
