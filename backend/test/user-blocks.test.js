const test = require('node:test')
const assert = require('node:assert/strict')
const { AppError } = require('../src/utils/errors')
const {
  assertUsersNotBlocked,
  lockAndAssertUsersNotBlocked,
  notBlockedSql,
} = require('../src/utils/user-blocks')

test('block visibility filter excludes either direction of a blocked pair', () => {
  const filter = notBlockedSql('$1', 'item.seller_id')
  assert.match(filter, /blocker_id = \$1 AND block_filter\.blocked_id = item\.seller_id/)
  assert.match(filter, /blocker_id = item\.seller_id AND block_filter\.blocked_id = \$1/)
})

test('blocked users cannot interact in either direction', async () => {
  const calls = []
  const db = {
    async query(text, params) {
      calls.push({ text, params })
      if (text.startsWith('SELECT 1')) return { rows: [{ '?column?': 1 }] }
      return { rows: [] }
    },
  }

  await assert.rejects(
    assertUsersNotBlocked(db, 'student-a', 'student-b'),
    (error) => error instanceof AppError && error.status === 403,
  )
  assert.deepEqual(calls[0].params, ['student-a', 'student-b'])
})

test('pair locking is ordered before the block check', async () => {
  const calls = []
  const db = {
    async query(text, params) {
      calls.push({ text, params })
      return { rows: [] }
    },
  }

  await lockAndAssertUsersNotBlocked(db, 'student-b', 'student-a')

  assert.match(calls[0].text, /ORDER BY id FOR UPDATE/)
  assert.deepEqual(calls[0].params, [['student-b', 'student-a']])
  assert.match(calls[1].text, /FROM user_blocks/)
})
