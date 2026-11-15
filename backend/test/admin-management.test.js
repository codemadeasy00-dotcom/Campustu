const test = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')
const app = require('../src/app')
const config = require('../src/config')
const { pool } = require('../src/db')
const { signToken } = require('../src/middleware/auth')

const adminId = 'c363a326-9ec8-49e3-8dfb-0f2078a48daf'
const blockerId = 'bd6fa2ef-12b9-4ad4-af98-f3ef5bd81d47'
const blockedId = '26ee8da0-5613-4f4e-ac2f-9f3510d1eea9'

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

function adminCookies() {
  const authToken = signToken(adminId, 0)
  const adminToken = jwt.sign(
    { sub: adminId, pver: 1 },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: 1800 },
  )
  return `campustu_session=${authToken}; campustu_admin_session=${adminToken}`
}

test('admin can inspect saved post coordinates and remove block relationships with audit reason', async (t) => {
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
          id: adminId,
          email: 'admin@example.edu',
          full_name: 'Admin',
          display_name: 'Admin',
          role: 'admin',
          status: 'active',
          branch_id: null,
          admission_year: null,
          college_id: 1,
          auth_version: 0,
        }],
      }
    }
    if (text.startsWith('SELECT admin_password_hash, admin_password_version')) {
      return { rows: [{ admin_password_hash: 'configured', admin_password_version: 1 }] }
    }
    if (text.startsWith('SELECT lif.id,') && text.includes('FROM lost_found_items lif')) {
      return {
        rows: [{
          id: 'a0e35850-4160-460e-9fd4-9c79e00d20df',
          post_type: 'lost_found',
          title: 'Lost notebook',
          latitude: '12.97160000',
          longitude: '77.59460000',
          location_name: 'Library',
          owner_name: 'Student',
        }, {
          id: 'fef17770-9b1d-4051-876f-bd0db4dd0ee4',
          post_type: 'marketplace',
          title: 'Used calculator',
          latitude: null,
          longitude: null,
          location_name: 'Student Center',
          owner_name: 'Seller',
        }],
      }
    }
    if (text.startsWith('SELECT user_blocks.blocker_id')) {
      return {
        rows: [{
          blocker_id: blockerId,
          blocker_name: 'First student',
          blocker_email: 'first@example.edu',
          blocked_id: blockedId,
          blocked_name: 'Second student',
          blocked_email: 'second@example.edu',
          created_at: '2026-12-01T10:00:00.000Z',
        }],
      }
    }
    assert.fail(`Unexpected query: ${text}`)
  }
  pool.connect = async () => ({
    async query(text, params) {
      clientCalls.push({ text, params })
      if (text.startsWith('SELECT blocker_id, blocked_id')) {
        return { rows: [{ blocker_id: blockerId, blocked_id: blockedId }] }
      }
      return { rows: [] }
    },
    release() {},
  })

  await withServer(async (baseUrl) => {
    const headers = { Cookie: adminCookies() }
    const locked = await fetch(`${baseUrl}/api/admin/post-locations`, {
      headers: { Cookie: `campustu_session=${signToken(adminId, 0)}` },
    })
    assert.equal(locked.status, 403)

    const locations = await fetch(`${baseUrl}/api/admin/post-locations`, { headers })
    assert.equal(locations.status, 200)
    const locationData = await locations.json()
    assert.equal(locationData.posts[0].latitude, '12.97160000')
    assert.equal(locationData.posts[0].longitude, '77.59460000')
    assert.equal(locationData.posts[1].latitude, null)
    assert.equal(locationData.posts[1].longitude, null)

    const blocks = await fetch(`${baseUrl}/api/admin/blocks?q=first`, { headers })
    assert.equal(blocks.status, 200)
    assert.equal((await blocks.json()).blocks[0].blocked_email, 'second@example.edu')

    const response = await fetch(`${baseUrl}/api/admin/blocks/${blockerId}/${blockedId}`, {
      method: 'DELETE',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Reviewed the safety request' }),
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { success: true, removed: true })
  })

  assert.ok(clientCalls.some(({ text }) => text.startsWith('DELETE FROM user_blocks')))
  const audit = clientCalls.find(({ text }) => text.startsWith('INSERT INTO admin_audit_logs'))
  assert.ok(audit)
  assert.equal(JSON.parse(audit.params[5]).reason, 'Reviewed the safety request')
})
