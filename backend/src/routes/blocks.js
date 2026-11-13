const router = require('express').Router()
const { z } = require('zod')
const { query, tx } = require('../db')
const { AppError } = require('../utils/errors')
const { lockUserPair } = require('../utils/user-blocks')
const { requireAuth, requireActive } = require('../middleware/auth')
const storage = require('../storage')

const userIdSchema = z.uuid()

function serializeBlockedUser({ avatar_key, ...user }) {
  return {
    ...user,
    avatar_url: avatar_key ? storage.urlFor(avatar_key) : null,
  }
}

router.use(requireAuth, requireActive)

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT blocked.id, blocked.display_name, blocked.avatar_key, user_blocks.created_at
       FROM user_blocks
       JOIN users blocked ON blocked.id = user_blocks.blocked_id
      WHERE user_blocks.blocker_id = $1
        AND blocked.deleted_at IS NULL
      ORDER BY user_blocks.created_at DESC`,
    [req.user.id],
  )
  res.json({ blocked_users: rows.map(serializeBlockedUser) })
})

router.post('/:userId', async (req, res) => {
  const blockedId = userIdSchema.parse(req.params.userId)
  if (blockedId === req.user.id) throw new AppError(400, 'You cannot block your own account.')

  const blockedUser = await tx(async (db) => {
    await lockUserPair(db, req.user.id, blockedId)
    const { rows: [user] } = await db.query(
      `SELECT id, display_name, avatar_key
         FROM users
        WHERE id = $1 AND deleted_at IS NULL
        FOR SHARE`,
      [blockedId],
    )
    if (!user) throw new AppError(404, 'User not found.')

    await db.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id)
       VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [req.user.id, blockedId],
    )
    await db.query(
      `UPDATE reservations
          SET status = 'cancelled', updated_at = now()
        WHERE status IN ('requested', 'accepted')
          AND ((buyer_id = $1 AND seller_id = $2) OR (buyer_id = $2 AND seller_id = $1))`,
      [req.user.id, blockedId],
    )
    const { rows: cancelledClaims } = await db.query(
      `UPDATE item_claims claim
          SET status = 'rejected', handover_code = NULL, reviewed_at = now()
         FROM lost_found_items item
        WHERE claim.item_id = item.id
          AND claim.status IN ('pending', 'approved')
          AND ((claim.claimant_id = $1 AND item.user_id = $2)
            OR (claim.claimant_id = $2 AND item.user_id = $1))
        RETURNING claim.id, claim.item_id, claim.pre_claim_status`,
      [req.user.id, blockedId],
    )
    const claimIds = cancelledClaims.map(({ id }) => id)
    if (claimIds.length) {
      await db.query(
        `WITH cancelled_claims AS (
           SELECT item_id, max(pre_claim_status) FILTER (WHERE pre_claim_status IS NOT NULL) AS previous_status
             FROM item_claims
            WHERE id = ANY($1::uuid[])
            GROUP BY item_id
         )
         UPDATE lost_found_items item
            SET status = COALESCE(cancelled_claims.previous_status, item.status),
                lifecycle_status = CASE
                  WHEN cancelled_claims.previous_status IS NULL THEN 'closed'
                  ELSE 'active'
                END,
                updated_at = now()
           FROM cancelled_claims
          WHERE item.id = cancelled_claims.item_id
            AND item.lifecycle_status = 'claim_pending'
            AND NOT EXISTS (
              SELECT 1 FROM item_claims claim
               WHERE claim.item_id = item.id AND claim.status IN ('pending', 'approved')
            )`,
        [claimIds],
      )
    }
    return user
  })

  res.status(201).json({ success: true, blocked_user: serializeBlockedUser(blockedUser) })
})

router.delete('/:userId', async (req, res) => {
  const blockedId = userIdSchema.parse(req.params.userId)
  const { rowCount } = await query(
    'DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [req.user.id, blockedId],
  )
  res.json({ success: true, unblocked: rowCount > 0 })
})

module.exports = router
