const router = require('express').Router()
const { z } = require('zod')
const { query } = require('../db')
const storage = require('../storage')
const { requireAuth, requireCollege } = require('../middleware/auth')

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
                u.display_name, t.is_trusted,
                (SELECT p.storage_key FROM item_photos p WHERE p.item_id = i.id ORDER BY p.position LIMIT 1) AS photo_key,
                count(*) OVER (PARTITION BY i.item_type_id)::int AS available_count,
                row_number() OVER (PARTITION BY i.item_type_id ORDER BY i.price ASC, i.created_at DESC, i.id) AS rn
           FROM items i
           JOIN users u ON u.id = i.seller_id
           JOIN user_trust t ON t.user_id = i.seller_id
          WHERE i.college_id = $1 AND i.status = 'available' AND i.seller_id <> $2
            AND i.item_type_id = ANY($3::int[])
            AND ($4::int IS NULL OR i.branch_id IS NULL OR i.branch_id = $4)
            AND (i.semester IS NULL OR i.semester = $5)
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
          seller: { display_name: l.display_name, is_trusted: l.is_trusted },
        })),
      }
    }),
  })
})

module.exports = router
