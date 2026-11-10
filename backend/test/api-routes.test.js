const { test } = require('node:test')
const assert = require('node:assert/strict')
const app = require('../src/app')

test('student core APIs are mounted behind authentication', async () => {
  const server = app.listen(0)
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const { port } = server.address()

    for (const path of [
      '/api/achievements',
      '/api/search-alerts/saved',
      '/api/search-alerts/preferences',
      '/api/needs',
      '/api/search?q=calculator',
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`)
      assert.equal(response.status, 401, `${path} should require authentication instead of returning 404`)
      assert.deepEqual(await response.json(), { error: 'Please log in' })
    }

    const trackSearch = await fetch(`http://127.0.0.1:${port}/api/search-alerts/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: 'calculator' }),
    })
    assert.equal(trackSearch.status, 401, 'automatic search tracking should require authentication')
    assert.deepEqual(await trackSearch.json(), { error: 'Please log in' })

    const deleteAutomatic = await fetch(`http://127.0.0.1:${port}/api/search-alerts/automatic`, {
      method: 'DELETE',
    })
    assert.equal(deleteAutomatic.status, 401, 'automatic search history deletion should require authentication')
    assert.deepEqual(await deleteAutomatic.json(), { error: 'Please log in' })
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
})
