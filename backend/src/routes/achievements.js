const router = require('express').Router()
const { query } = require('../db')
const { requireAuth, requireCollege } = require('../middleware/auth')

router.use(requireAuth, requireCollege)

router.get('/', async (req, res) => {
  const { rows: [stats] } = await query(
    `SELECT
       (SELECT count(*)::int
          FROM items i
         WHERE i.seller_id = $1 AND i.status <> 'removed') AS items_posted,
       (SELECT count(*)::int
          FROM reservations r
         WHERE (r.buyer_id = $1 OR r.seller_id = $1) AND r.status = 'completed') AS completed_trades,
       (SELECT count(*)::int
          FROM lost_found_items lif
         WHERE lif.user_id = $1 AND lif.lifecycle_status = 'resolved') AS resolved_reports,
       (SELECT count(DISTINCT lif.id)::int
          FROM item_claims claim
          JOIN lost_found_items lif ON lif.id = claim.item_id
         WHERE claim.status = 'completed'
           AND lif.lifecycle_status = 'resolved'
           AND (claim.claimant_id = $1 OR lif.user_id = $1)) AS successful_returns,
       (SELECT count(*)::int
          FROM need_board_requests request
         WHERE request.user_id = $1) AS needs_posted,
       (SELECT count(*)::int
          FROM need_board_responses response
         WHERE response.responder_id = $1) AS need_responses,
       (SELECT min(COALESCE(r.completed_at, r.updated_at))
          FROM reservations r
         WHERE (r.buyer_id = $1 OR r.seller_id = $1) AND r.status = 'completed') AS first_trade_at,
       (SELECT COALESCE(r.completed_at, r.updated_at)
          FROM reservations r
         WHERE (r.buyer_id = $1 OR r.seller_id = $1) AND r.status = 'completed'
         ORDER BY COALESCE(r.completed_at, r.updated_at), r.id
         OFFSET 4 LIMIT 1) AS fifth_trade_at,
       (SELECT min(i.created_at)
          FROM items i
         WHERE i.seller_id = $1 AND i.status <> 'removed') AS first_listing_at,
       (SELECT i.created_at
          FROM items i
         WHERE i.seller_id = $1 AND i.status <> 'removed'
         ORDER BY i.created_at, i.id
         OFFSET 4 LIMIT 1) AS fifth_listing_at,
       (SELECT min(lif.updated_at)
          FROM lost_found_items lif
         WHERE lif.user_id = $1 AND lif.lifecycle_status = 'resolved') AS first_resolved_report_at,
       (SELECT min(COALESCE(claim.reviewed_at, lif.updated_at))
          FROM item_claims claim
          JOIN lost_found_items lif ON lif.id = claim.item_id
         WHERE claim.status = 'completed'
           AND lif.lifecycle_status = 'resolved'
           AND (claim.claimant_id = $1 OR lif.user_id = $1)) AS first_successful_return_at,
       (SELECT min(request.created_at)
          FROM need_board_requests request
         WHERE request.user_id = $1) AS first_need_at,
       (SELECT response.created_at
          FROM need_board_responses response
         WHERE response.responder_id = $1
         ORDER BY response.created_at, response.id
         LIMIT 1) AS first_need_response_at,
       (SELECT response.created_at
          FROM need_board_responses response
         WHERE response.responder_id = $1
         ORDER BY response.created_at, response.id
         OFFSET 2 LIMIT 1) AS third_need_response_at`,
    [req.user.id],
  )

  const achievements = [
    {
      id: 'first_listing',
      name: 'First Listing',
      description: 'Publish an item in the campus marketplace.',
      progress: Math.min(stats.items_posted, 1),
      target: 1,
      unlocked_at: stats.first_listing_at,
    },
    {
      id: 'campus_provider',
      name: 'Campus Provider',
      description: 'Publish five marketplace items.',
      progress: Math.min(stats.items_posted, 5),
      target: 5,
      unlocked_at: Number(stats.items_posted) >= 5 ? stats.fifth_listing_at : null,
    },
    {
      id: 'first_trade',
      name: 'First Handover',
      description: 'Complete a marketplace handover with both participants confirming.',
      progress: Math.min(stats.completed_trades, 1),
      target: 1,
      unlocked_at: stats.first_trade_at,
    },
    {
      id: 'trusted_trader',
      name: 'Trusted Trader',
      description: 'Complete five marketplace handovers.',
      progress: Math.min(stats.completed_trades, 5),
      target: 5,
      unlocked_at: Number(stats.completed_trades) >= 5 ? stats.fifth_trade_at : null,
    },
    {
      id: 'lost_and_found_helper',
      name: 'Lost & Found Helper',
      description: 'Resolve a Lost & Found report.',
      progress: Math.min(stats.resolved_reports, 1),
      target: 1,
      unlocked_at: stats.first_resolved_report_at,
    },
    {
      id: 'verified_return',
      name: 'Verified Return',
      description: 'Take part in a completed, verified Lost & Found handover.',
      progress: Math.min(stats.successful_returns, 1),
      target: 1,
      unlocked_at: stats.first_successful_return_at,
    },
    {
      id: 'campus_requester',
      name: 'Campus Requester',
      description: 'Post a need to the campus board.',
      progress: Math.min(stats.needs_posted, 1),
      target: 1,
      unlocked_at: stats.first_need_at,
    },
    {
      id: 'community_responder',
      name: 'Community Responder',
      description: 'Send three private responses to campus requests.',
      progress: Math.min(stats.need_responses, 3),
      target: 3,
      unlocked_at: Number(stats.need_responses) >= 3 ? stats.third_need_response_at : null,
    },
  ].map((achievement) => ({
    ...achievement,
    unlocked: Number(achievement.progress) >= achievement.target,
  }))

  res.json({
    stats: {
      items_posted: Number(stats.items_posted),
      completed_trades: Number(stats.completed_trades),
      resolved_reports: Number(stats.resolved_reports),
      successful_returns: Number(stats.successful_returns),
      needs_posted: Number(stats.needs_posted),
      need_responses: Number(stats.need_responses),
    },
    achievements,
  })
})

module.exports = router
