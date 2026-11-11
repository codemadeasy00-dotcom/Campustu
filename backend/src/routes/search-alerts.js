const router = require('express').Router()
const { z } = require('zod')
const { query, tx } = require('../db')
const { AppError } = require('../utils/errors')
const { requireAuth, requireActive, requireCollege } = require('../middleware/auth')
const { notBlockedSql } = require('../utils/user-blocks')
const { assertUserTextIsAllowed } = require('../utils/text-moderation')

router.use(requireAuth, requireActive, requireCollege)

const searchSchema = z.object({
  keyword: z.string().trim().min(2).max(80),
  category_id: z.preprocess(
    (value) => value === '' || value === null ? undefined : value,
    z.coerce.number().int().min(1).max(32767).optional(),
  ),
  branch_id: z.preprocess(
    (value) => value === '' || value === null ? undefined : value,
    z.coerce.number().int().min(1).max(32767).optional(),
  ),
})
const preferencesSchema = z.object({
  quiet_start: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  quiet_end: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  timezone: z.string().trim().min(1).max(64),
  auto_track_searches: z.boolean().optional(),
}).refine(
  (value) => Boolean(value.quiet_start) === Boolean(value.quiet_end),
  { message: 'Choose both quiet-hour times, or turn quiet hours off.' },
).refine(
  (value) => !value.quiet_start || value.quiet_start !== value.quiet_end,
  { message: 'Quiet-hour start and end must be different.' },
)

router.get('/saved', async (req, res) => {
  const { rows } = await query(
    `SELECT ss.id, ss.keyword, ss.category_id, ss.branch_id, ss.auto_tracked, ss.created_at,
            c.name AS category_name, b.name AS branch_name
       FROM saved_searches ss
       LEFT JOIN categories c ON c.id = ss.category_id
       LEFT JOIN branches b ON b.id = ss.branch_id
      WHERE ss.user_id = $1 AND ss.college_id = $2
      ORDER BY ss.created_at DESC`,
    [req.user.id, req.user.college_id],
  )
  res.json({ searches: rows })
})

router.post('/track', async (req, res) => {
  const data = searchSchema.parse(req.body)
  assertUserTextIsAllowed([data.keyword])
  const tracked = await tx(async (db) => {
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id])
    const { rows: [preferences] } = await db.query(
      'SELECT auto_track_searches FROM search_alert_preferences WHERE user_id = $1',
      [req.user.id],
    )
    if (preferences?.auto_track_searches === false) return false

    if (data.category_id) {
      const { rows } = await db.query(
        'SELECT id FROM categories WHERE id = $1 AND scope <> $2',
        [data.category_id, 'lost_found'],
      )
      if (!rows.length) throw new AppError(400, 'Choose a marketplace category.')
    }
    if (data.branch_id) {
      const { rows } = await db.query('SELECT id FROM branches WHERE id = $1', [data.branch_id])
      if (!rows.length) throw new AppError(400, 'Choose a valid campus branch.')
    }

    const criteria = [
      req.user.id,
      req.user.college_id,
      data.keyword,
      data.category_id ?? null,
      data.branch_id ?? null,
    ]
    const { rows: [existing] } = await db.query(
      `SELECT id FROM saved_searches
        WHERE user_id = $1 AND college_id = $2 AND lower(keyword) = lower($3)
          AND category_id IS NOT DISTINCT FROM $4::smallint
          AND branch_id IS NOT DISTINCT FROM $5::smallint`,
      criteria,
    )
    if (existing) return true

    const { rows: [count] } = await db.query(
      'SELECT count(*)::int AS total FROM saved_searches WHERE user_id = $1 AND college_id = $2',
      [req.user.id, req.user.college_id],
    )
    if (count.total >= 20) {
      await db.query(
        `DELETE FROM saved_searches
          WHERE id = (
            SELECT id FROM saved_searches
             WHERE user_id = $1 AND college_id = $2 AND auto_tracked
             ORDER BY created_at ASC
             LIMIT 1
          )`,
        [req.user.id, req.user.college_id],
      )
      const { rows: [updatedCount] } = await db.query(
        'SELECT count(*)::int AS total FROM saved_searches WHERE user_id = $1 AND college_id = $2',
        [req.user.id, req.user.college_id],
      )
      if (updatedCount.total >= 20) return false
    }

    await db.query(
      `INSERT INTO saved_searches
         (user_id, college_id, keyword, category_id, branch_id, auto_tracked)
       VALUES ($1, $2, $3, $4, $5, true)`,
      criteria,
    )
    return true
  })
  res.json({ tracked })
})

router.post('/saved', async (req, res) => {
  const data = searchSchema.parse(req.body)
  assertUserTextIsAllowed([data.keyword])
  const savedSearch = await tx(async (db) => {
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id])
    if (data.category_id) {
      const { rows: categoryRows } = await db.query(
        'SELECT id FROM categories WHERE id = $1 AND scope <> $2',
        [data.category_id, 'lost_found'],
      )
      if (!categoryRows.length) throw new AppError(400, 'Choose a marketplace category.')
    }
    if (data.branch_id) {
      const { rows: branchRows } = await db.query('SELECT id FROM branches WHERE id = $1', [data.branch_id])
      if (!branchRows.length) throw new AppError(400, 'Choose a valid campus branch.')
    }
    const { rows: [existing] } = await db.query(
      `SELECT id, keyword, category_id, branch_id, auto_tracked, created_at FROM saved_searches
        WHERE user_id = $1 AND college_id = $2 AND lower(keyword) = lower($3)
          AND category_id IS NOT DISTINCT FROM $4::smallint
          AND branch_id IS NOT DISTINCT FROM $5::smallint`,
      [req.user.id, req.user.college_id, data.keyword, data.category_id ?? null, data.branch_id ?? null],
    )
    if (existing) {
      if (existing.auto_tracked) {
        const { rows: [promoted] } = await db.query(
          `UPDATE saved_searches SET auto_tracked = false
            WHERE id = $1
            RETURNING id, keyword, category_id, branch_id, auto_tracked, created_at`,
          [existing.id],
        )
        return promoted
      }
      return existing
    }
    const { rows: [count] } = await db.query(
      'SELECT count(*)::int AS total FROM saved_searches WHERE user_id = $1 AND college_id = $2',
      [req.user.id, req.user.college_id],
    )
    if (count.total >= 20) throw new AppError(409, 'You can have up to 20 saved searches.')
    const { rows: [created] } = await db.query(
      `INSERT INTO saved_searches (user_id, college_id, keyword, category_id, branch_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, keyword, category_id, branch_id, auto_tracked, created_at`,
      [req.user.id, req.user.college_id, data.keyword, data.category_id ?? null, data.branch_id ?? null],
    )
    return created
  })
  res.status(201).json({ search: savedSearch })
})

router.delete('/automatic', async (req, res) => {
  const deleted = await tx(async (db) => {
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id])
    const { rowCount } = await db.query(
      'DELETE FROM saved_searches WHERE user_id = $1 AND college_id = $2 AND auto_tracked',
      [req.user.id, req.user.college_id],
    )
    return rowCount
  })
  res.json({ deleted })
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

router.get('/preferences', async (req, res) => {
  const { rows: [preferences] } = await query(
    `SELECT quiet_start, quiet_end, timezone, auto_track_searches
       FROM search_alert_preferences
      WHERE user_id = $1`,
    [req.user.id],
  )
  res.json({
    preferences: preferences || {
      quiet_start: null,
      quiet_end: null,
      timezone: 'UTC',
      auto_track_searches: true,
    },
  })
})

router.patch('/preferences', async (req, res) => {
  const preferences = preferencesSchema.parse(req.body)
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: preferences.timezone }).format(new Date())
  } catch {
    throw new AppError(400, 'Choose a supported time zone.')
  }
  const saved = await tx(async (db) => {
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id])
    const { rows: [updated] } = await db.query(
      `INSERT INTO search_alert_preferences
         (user_id, quiet_start, quiet_end, timezone, auto_track_searches, updated_at)
       VALUES ($1, $2, $3, $4, COALESCE($5::boolean, true), now())
       ON CONFLICT (user_id) DO UPDATE
         SET quiet_start = EXCLUDED.quiet_start,
             quiet_end = EXCLUDED.quiet_end,
             timezone = EXCLUDED.timezone,
             auto_track_searches = COALESCE($5::boolean, search_alert_preferences.auto_track_searches),
             updated_at = now()
       RETURNING quiet_start, quiet_end, timezone, auto_track_searches`,
      [
        req.user.id,
        preferences.quiet_start,
        preferences.quiet_end,
        preferences.timezone,
        preferences.auto_track_searches ?? null,
      ],
    )
    return updated
  })
  res.json({ preferences: saved })
})

router.get('/notifications', async (req, res) => {
  const { rows } = await query(
    `SELECT n.id, n.item_id, n.need_request_id, n.need_response_id,
            n.title, n.message, n.match_reasons, n.is_read, n.created_at,
            i.title AS item_title, request.title AS need_request_title,
            search.keyword AS saved_keyword
       FROM in_app_notifications n
       LEFT JOIN items i ON i.id = n.item_id
       LEFT JOIN need_board_requests request ON request.id = n.need_request_id
       LEFT JOIN need_board_responses response ON response.id = n.need_response_id
       LEFT JOIN saved_searches search ON search.id = n.search_id
      WHERE n.user_id = $1
        AND (
          (
            n.item_id IS NOT NULL
            AND i.college_id = $2
            AND i.status <> 'removed'
            AND ${notBlockedSql('$1', 'i.seller_id')}
            AND NOT EXISTS (
              SELECT 1 FROM item_reports ir
               WHERE ir.marketplace_item_id = i.id AND ir.status = 'pending'
            )
            AND NOT EXISTS (
              SELECT 1 FROM admin_badge_overrides abo
               WHERE abo.marketplace_item_id = i.id
                 AND abo.badge_id = 'under_review' AND abo.enabled
            )
          )
          OR
          (
            n.need_request_id IS NOT NULL
            AND request.college_id = $2
            AND (n.need_response_id IS NULL OR request.user_id = $1)
            AND (
              (n.need_response_id IS NULL AND ${notBlockedSql('$1', 'request.user_id')})
              OR (n.need_response_id IS NOT NULL AND ${notBlockedSql('$1', 'response.responder_id')})
            )
            AND (n.need_response_id IS NOT NULL OR (request.status = 'open' AND request.expires_at > now()))
          )
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
