const router = require('express').Router()
const { z } = require('zod')
const { query } = require('../db')
const storage = require('../storage')
const { requireAuth, requireCollege } = require('../middleware/auth')
const { buildUserBadges, ITEM_BADGES, applyBadgeOverrides } = require('../utils/user-badges')

router.use(requireAuth)

const blankToUndefined = (v) => (v === '' || v === null ? undefined : v)
const kitQuery = z.object({
  semester: z.coerce.number().int().min(1).max(8),
  branch_id: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(32767).optional()),
})

const LISTINGS_PER_ITEM = 5

// GET /kits?semester=3&branch_id=1
// What a student needs for a semester, with the second-hand listings available right now at their college.
//  - A kit with no branch applies to every branch (for example a shared first year). It is merged with the
//    branch's own kit, so an item type needed by both appears once.
//  - Only listings that suit the branch and semester are offered (listings tagged "any" always suit).
//  - A student never sees their own listings here.
//  - Per item type: up to 5 listings, cheapest first, plus how many are available in total.
router.get('/', requireCollege, async (req, res) => {
  const { semester, branch_id } = kitQuery.parse(req.query)
  const branchId = branch_id ?? null

  const { rows: kits } = await query(
    `SELECT id, name, branch_id FROM kits
      WHERE semester = $1 AND (branch_id IS NULL OR branch_id = $2)
      ORDER BY branch_id NULLS FIRST, id`,
    [semester, branchId]
  )

  const { rows: needs } = await query(
    `SELECT ki.item_type_id, it.name, it.description,
            MAX(ki.quantity)::int AS quantity, bool_and(ki.is_optional) AS is_optional
       FROM kit_items ki
       JOIN kits k ON k.id = ki.kit_id
       JOIN item_types it ON it.id = ki.item_type_id
      WHERE k.semester = $1 AND (k.branch_id IS NULL OR k.branch_id = $2)
      GROUP BY ki.item_type_id, it.name, it.description
      ORDER BY bool_and(ki.is_optional), it.name`,
    [semester, branchId]
  )

  const byType = new Map()
  if (needs.length) {
    const { rows } = await query(
      `SELECT * FROM (
         SELECT i.item_type_id, i.id, i.title, i.price, i.condition,
                u.id AS seller_id, u.display_name, u.email, u.email_verified_at,
                u.role, u.status AS seller_status, c.email_domain, c.status AS college_status,
                t.is_trusted, t.completed_handovers::int AS completed_handovers,
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
                (SELECT p.storage_key FROM item_photos p WHERE p.item_id = i.id ORDER BY p.position LIMIT 1) AS photo_key,
                count(*) OVER (PARTITION BY i.item_type_id)::int AS available_count,
                row_number() OVER (PARTITION BY i.item_type_id ORDER BY i.price ASC, i.created_at DESC, i.id) AS rn
           FROM items i
           JOIN users u ON u.id = i.seller_id
           JOIN user_trust t ON t.user_id = i.seller_id
           LEFT JOIN colleges c ON c.id = u.college_id
          WHERE i.college_id = $1 AND i.status = 'available' AND i.seller_id <> $2
            AND i.item_type_id = ANY($3::int[])
            AND ($4::int IS NULL OR i.branch_id IS NULL OR i.branch_id = $4)
            AND (i.semester IS NULL OR i.semester = $5)
            AND NOT EXISTS (
              SELECT 1 FROM item_reports ir
               WHERE ir.marketplace_item_id = i.id AND ir.status = 'pending'
            )
            AND NOT EXISTS (
              SELECT 1 FROM admin_badge_overrides abo
               WHERE abo.marketplace_item_id = i.id
                 AND abo.badge_id = 'under_review' AND abo.enabled
            )
       ) x
       WHERE rn <= $6
       ORDER BY item_type_id, rn`,
      [req.user.college_id, req.user.id, needs.map((n) => n.item_type_id), branchId, semester, LISTINGS_PER_ITEM]
    )
    for (const r of rows) {
      if (!byType.has(r.item_type_id)) byType.set(r.item_type_id, [])
      byType.get(r.item_type_id).push(r)
    }
  }

  res.json({
    semester,
    branch_id: branchId,
    kits,
    items: needs.map((n) => {
      const listings = byType.get(n.item_type_id) || []
      return {
        item_type_id: n.item_type_id,
        name: n.name,
        description: n.description,
        quantity: n.quantity,
        is_optional: n.is_optional,
        available_count: listings.length ? listings[0].available_count : 0,
        listings: listings.map((l) => ({
          id: l.id,
          title: l.title,
          price: Number(l.price),
          condition: l.condition,
          photo: l.photo_key ? storage.urlFor(l.photo_key) : null,
          seller: {
            display_name: l.display_name,
            is_trusted: l.is_trusted,
            badges: buildUserBadges({
              email: l.email,
              email_verified_at: l.email_verified_at,
              role: l.role,
              status: l.seller_status,
              email_domain: l.email_domain,
              college_status: l.college_status,
              completed_handovers: l.completed_handovers,
              pending_reports_received: l.pending_reports_received,
              completed_returns: l.completed_returns,
              is_trusted: l.is_trusted,
            }, l.seller_badge_overrides),
          },
          badges: applyBadgeOverrides([], l.item_badge_overrides, ITEM_BADGES.marketplace_item),
        })),
      }
    }),
  })
})

module.exports = router
