const router = require('express').Router()
const { z } = require('zod')
const { query, tx } = require('../db')
const { AppError } = require('../utils/errors')
const { requireAuth, requireActive, requireCollege } = require('../middleware/auth')
const { assertUserTextIsAllowed } = require('../utils/text-moderation')

router.use(requireAuth, requireActive, requireCollege)

const searchSchema = z.object({
  keyword: z.string().trim().min(2).max(80),
})

router.get('/saved', async (req, res) => {
  const { rows } = await query(
    `SELECT id, keyword, created_at
       FROM saved_searches
      WHERE user_id = $1 AND college_id = $2
      ORDER BY created_at DESC`,
    [req.user.id, req.user.college_id],
  )
  res.json({ searches: rows })
})

router.post('/saved', async (req, res) => {
  const { keyword } = searchSchema.parse(req.body)
  assertUserTextIsAllowed([keyword])
  const savedSearch = await tx(async (db) => {
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id])
    const { rows: [existing] } = await db.query(
      `SELECT id, keyword, created_at FROM saved_searches
        WHERE user_id = $1 AND college_id = $2 AND lower(keyword) = lower($3)`,
      [req.user.id, req.user.college_id, keyword],
    )
    if (existing) return existing
    const { rows: [count] } = await db.query(
      'SELECT count(*)::int AS total FROM saved_searches WHERE user_id = $1 AND college_id = $2',
      [req.user.id, req.user.college_id],
    )
    if (count.total >= 20) throw new AppError(409, 'You can have up to 20 saved searches.')
    const { rows: [created] } = await db.query(
      `INSERT INTO saved_searches (user_id, college_id, keyword)
       VALUES ($1, $2, $3)
       RETURNING id, keyword, created_at`,
      [req.user.id, req.user.college_id, keyword],
    )
    return created
  })
  res.status(201).json({ search: savedSearch })
})

router.delete('/saved/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id)
  const { rowCount } = await query(
    'DELETE FROM saved_searches WHERE id = $1 AND user_id = $2 AND college_id = $3',
    [id, req.user.id, req.user.college_id],
  )
  if (!rowCount) throw new AppError(404, 'Saved search not found.')
  res.json({ success: true })
})

router.get('/notifications', async (req, res) => {
  const { rows } = await query(
    `SELECT n.id, n.item_id, n.title, n.message, n.is_read, n.created_at,
            i.title AS item_title
       FROM in_app_notifications n
       JOIN items i ON i.id = n.item_id
      WHERE n.user_id = $1
        AND i.college_id = $2
        AND i.status <> 'removed'
        AND NOT EXISTS (
          SELECT 1 FROM item_reports ir
           WHERE ir.marketplace_item_id = i.id AND ir.status = 'pending'
        )
        AND NOT EXISTS (
          SELECT 1 FROM admin_badge_overrides abo
           WHERE abo.marketplace_item_id = i.id
             AND abo.badge_id = 'under_review' AND abo.enabled
        )
      ORDER BY n.created_at DESC
      LIMIT 100`,
    [req.user.id, req.user.college_id],
  )
  res.json({ notifications: rows })
})

router.patch('/notifications/read', async (req, res) => {
  await query(
    'UPDATE in_app_notifications SET is_read = true WHERE user_id = $1 AND NOT is_read',
    [req.user.id],
  )
  res.json({ success: true })
})

module.exports = router
