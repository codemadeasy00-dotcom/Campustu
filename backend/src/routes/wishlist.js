const router = require('express').Router()
const { z } = require('zod')
const { query, tx } = require('../db')
const storage = require('../storage')
const { AppError } = require('../utils/errors')
const { requireAuth, requireCollege } = require('../middleware/auth')
const { buildUserBadges, ITEM_BADGES, applyBadgeOverrides } = require('../utils/user-badges')
const { notBlockedSql } = require('../utils/user-blocks')

router.use(requireAuth)

const addSchema = z.object({ item_ids: z.array(z.uuid()).min(1).max(30) })
const idParam = z.object({ itemId: z.uuid() })

// GET /wishlist -> the viewer's saved listings, newest first (including ones that were sold since)
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT i.id, i.title, i.price, i.condition, i.status, w.created_at AS added_at,
            u.display_name, u.email, u.email_verified_at, u.role, u.status AS seller_status,
            c.email_domain, c.status AS college_status, t.is_trusted,
            t.completed_handovers::int AS completed_handovers,
            (SELECT count(*)::int
               FROM item_claims ic
               JOIN lost_found_items lif ON lif.id = ic.item_id
              WHERE lif.user_id = u.id
                AND lif.lifecycle_status = 'resolved'
                AND ic.status = 'completed') AS completed_returns,
            (SELECT count(*)::int
               FROM item_reports ir
               LEFT JOIN items reported_items ON reported_items.id = ir.marketplace_item_id
               LEFT JOIN lost_found_items reported_lost_found ON reported_lost_found.id = ir.lost_found_item_id
              WHERE ir.status = 'pending'
                AND (reported_items.seller_id = u.id OR reported_lost_found.user_id = u.id)
            ) AS pending_reports_received,
            COALESCE((
              SELECT json_agg(json_build_object('badge_id', abo.badge_id, 'enabled', abo.enabled))
                FROM admin_badge_overrides abo WHERE abo.user_id = u.id
            ), '[]'::json) AS seller_badge_overrides,
            COALESCE((
              SELECT json_agg(json_build_object('badge_id', abo.badge_id, 'enabled', abo.enabled))
                FROM admin_badge_overrides abo WHERE abo.marketplace_item_id = i.id
            ), '[]'::json) AS item_badge_overrides,
            (SELECT p.storage_key FROM item_photos p WHERE p.item_id = i.id ORDER BY p.position LIMIT 1) AS photo_key
       FROM wishlists w
       JOIN items i ON i.id = w.item_id
       JOIN users u ON u.id = i.seller_id
       JOIN user_trust t ON t.user_id = i.seller_id
       LEFT JOIN colleges c ON c.id = u.college_id
      WHERE w.user_id = $1 AND i.status <> 'removed'
        AND ${notBlockedSql('$1', 'i.seller_id')}
        AND NOT (
          EXISTS (
            SELECT 1 FROM item_reports ir
             WHERE ir.marketplace_item_id = i.id AND ir.status = 'pending'
          ) OR EXISTS (
            SELECT 1 FROM admin_badge_overrides abo
             WHERE abo.marketplace_item_id = i.id
               AND abo.badge_id = 'under_review' AND abo.enabled
          )
        )
      ORDER BY w.created_at DESC, i.id`,
    [req.user.id]
  )
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      price: Number(r.price),
      condition: r.condition,
      status: r.status,
      added_at: r.added_at,
      photo: r.photo_key ? storage.urlFor(r.photo_key) : null,
      seller: {
        display_name: r.display_name,
        is_trusted: r.is_trusted,
        badges: buildUserBadges({
          email: r.email,
          email_verified_at: r.email_verified_at,
          email_domain: r.email_domain,
          college_status: r.college_status,
          role: r.role,
          status: r.seller_status,
          completed_handovers: r.completed_handovers,
          pending_reports_received: r.pending_reports_received,
          completed_returns: r.completed_returns,
          is_trusted: r.is_trusted,
        }, r.seller_badge_overrides),
      },
      badges: applyBadgeOverrides(
        r.status === 'sold' ? [{ id: 'claimed_resolved', label: 'Claimed / Resolved' }] : [],
        r.item_badge_overrides,
        ITEM_BADGES.marketplace_item,
      ),
    })),
  })
})

// POST /wishlist   body: { "item_ids": ["<uuid>", ...] }   (up to 30)
// Saves every listing that is still available at the viewer's college and is not their own.
// Anything else is skipped. Saving the same listing twice is harmless.
// Response: { added, already_saved, skipped }
router.post('/', requireCollege, async (req, res) => {
  const { item_ids } = addSchema.parse(req.body)
  const unique = [...new Set(item_ids)]

  const result = await tx(async (db) => {
    const { rows: ok } = await db.query(
      `SELECT id FROM items
        WHERE id = ANY($1::uuid[]) AND college_id = $2 AND status = 'available' AND seller_id <> $3
          AND ${notBlockedSql('$3', 'items.seller_id')}
          AND NOT EXISTS (
            SELECT 1 FROM item_reports ir
             WHERE ir.marketplace_item_id = items.id AND ir.status = 'pending'
          )
          AND NOT EXISTS (
            SELECT 1 FROM admin_badge_overrides abo
             WHERE abo.marketplace_item_id = items.id
               AND abo.badge_id = 'under_review' AND abo.enabled
          )`,
      [unique, req.user.college_id, req.user.id]
    )
    const okIds = ok.map((r) => r.id)
    let added = 0
    if (okIds.length) {
      const ins = await db.query(
        `INSERT INTO wishlists (user_id, item_id)
         SELECT $1::uuid, unnest($2::uuid[])
         ON CONFLICT DO NOTHING`,
        [req.user.id, okIds]
      )
      added = ins.rowCount
    }
    return { added, already_saved: okIds.length - added, skipped: unique.length - okIds.length }
  })

  res.status(201).json(result)
})

// DELETE /wishlist/:itemId
router.delete('/:itemId', async (req, res) => {
  const { itemId } = idParam.parse(req.params)
  const { rowCount } = await query('DELETE FROM wishlists WHERE user_id = $1 AND item_id = $2', [req.user.id, itemId])
  if (!rowCount) throw new AppError(404, 'That listing is not in your wishlist')
  res.json({ success: true })
})

module.exports = router
