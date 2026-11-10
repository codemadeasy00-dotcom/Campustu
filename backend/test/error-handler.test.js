const { test } = require('node:test')
const assert = require('node:assert/strict')
const { errorHandler } = require('../src/middleware/errorHandler')

test('database schema errors return an actionable migration message', () => {
  const originalConsoleError = console.error
  console.error = () => {}
  try {
    const response = {
      statusCode: null,
      body: null,
      status(statusCode) {
        this.statusCode = statusCode
        return this
      },
      json(body) {
        this.body = body
        return this
      },
    }

    errorHandler({ code: '42P01' }, {}, response, () => {})

    assert.equal(response.statusCode, 503)
    assert.deepEqual(response.body, {
      error: 'A required database update has not been applied. Please try again later.',
      code: 'DATABASE_MIGRATION_REQUIRED',
    })
  } finally {
    console.error = originalConsoleError
  }
})
