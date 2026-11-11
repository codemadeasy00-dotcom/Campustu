const { AppError } = require('./errors')

function notBlockedSql(userExpression, otherUserExpression) {
  return `NOT EXISTS (
    SELECT 1
      FROM user_blocks block_filter
     WHERE (block_filter.blocker_id = ${userExpression} AND block_filter.blocked_id = ${otherUserExpression})
        OR (block_filter.blocker_id = ${otherUserExpression} AND block_filter.blocked_id = ${userExpression})
  )`
}

async function assertUsersNotBlocked(db, userId, otherUserId) {
  if (!userId || !otherUserId || userId === otherUserId) return
  const runQuery = typeof db === 'function' ? db : db.query.bind(db)
  const { rows } = await runQuery(
    `SELECT 1
       FROM user_blocks
      WHERE (blocker_id = $1 AND blocked_id = $2)
         OR (blocker_id = $2 AND blocked_id = $1)
      LIMIT 1`,
    [userId, otherUserId],
  )
  if (rows.length) throw new AppError(403, 'You cannot interact with this user.')
}

async function lockUserPair(db, userId, otherUserId) {
  if (!userId || !otherUserId || userId === otherUserId) return
  const runQuery = typeof db === 'function' ? db : db.query.bind(db)
  await runQuery(
    'SELECT id FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [[userId, otherUserId]],
  )
}

async function lockAndAssertUsersNotBlocked(db, userId, otherUserId) {
  await lockUserPair(db, userId, otherUserId)
  await assertUsersNotBlocked(db, userId, otherUserId)
}

module.exports = {
  assertUsersNotBlocked,
  lockAndAssertUsersNotBlocked,
  lockUserPair,
  notBlockedSql,
}
