const router = require('express').Router()
const { z } = require('zod')
const { query, tx } = require('../db')
const storage = require('../storage')
const { AppError } = require('../utils/errors')
const { requireAuth, requireCollege } = require('../middleware/auth')

router.use(requireAuth)

const addSchema = z.object({ item_ids: z.array(z.uuid()).min(1).max(30) })
const idParam = z.object({ itemId: z.uuid() })

// GET /wishlist -> the viewer's saved listings, newest first (including ones that were sold since)
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT i.id, i.title, i.price, i.condition, i.status, w.created_at AS added_at,
            u.display_name, t.is_trusted,
            (SELECT p.storage_key FROM item_photos p WHERE p.item_id = i.id ORDER BY p.position LIMIT 1) AS photo_key
       FROM wishlists w
       JOIN items i ON i.id = w.item_id
       JOIN users u ON u.id = i.seller_id
       JOIN user_trust t ON t.user_id = i.seller_id
      WHERE w.user_id = $1 AND i.status <> 'removed'
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
      seller: { display_name: r.display_name, is_trusted: r.is_trusted },
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
        WHERE id = ANY($1::uuid[]) AND college_id = $2 AND status = 'available' AND seller_id <> $3`,
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
