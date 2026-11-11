const router = require('express').Router()
const { z } = require('zod')
const { query, tx } = require('../db')
const { AppError } = require('../utils/errors')
const { requireAuth, requireActive, requireCollege } = require('../middleware/auth')
const { assertUserTextIsAllowed } = require('../utils/text-moderation')
const { notifySearchAlertUser } = require('../utils/search-alerts')
const { lockAndAssertUsersNotBlocked, notBlockedSql } = require('../utils/user-blocks')

router.use(requireAuth, requireActive, requireCollege)

const optionalId = (max) => z.preprocess(
  (value) => value === '' || value === null ? undefined : value,
  z.coerce.number().int().min(1).max(max).optional(),
)

const createSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).default(''),
  category_id: optionalId(32767),
  branch_id: optionalId(32767),
  expires_in_hours: z.coerce.number().int().refine(
    (value) => [6, 12, 24, 72, 168].includes(value),
    'Choose a request duration of 6, 12, 24, 72, or 168 hours.',
  ).default(24),
})

const responseSchema = z.object({
  offer_type: z.enum(['listing', 'loan_offer']),
  item_id: z.uuid().optional(),
  message: z.string().trim().min(1).max(500),
}).refine(
  (value) => value.offer_type !== 'listing' || Boolean(value.item_id),
  { message: 'Select a listing to share.', path: ['item_id'] },
)

const statusSchema = z.object({ status: z.enum(['fulfilled', 'closed']) })
const idSchema = z.uuid()
const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category_id: optionalId(32767),
  branch_id: optionalId(32767),
  mine: z.enum(['true', 'false']).default('false'),
})

const requestSelect = `
  SELECT request.id, request.user_id, request.college_id, request.branch_id,
         request.category_id, request.title, request.description, request.expires_at,
         CASE WHEN request.status = 'open' AND request.expires_at <= now()
              THEN 'expired' ELSE request.status END AS status,
         request.created_at, request.updated_at,
         owner.display_name AS owner_name,
         branch.name AS branch_name,
         category.name AS category_name,
         (SELECT count(*)::int FROM need_board_responses response
           WHERE response.request_id = request.id
             AND ${notBlockedSql('$2', 'response.responder_id')}) AS response_count,
         EXISTS (
           SELECT 1 FROM need_board_responses response
            WHERE response.request_id = request.id AND response.responder_id = $2
         ) AS has_responded
    FROM need_board_requests request
    JOIN users owner ON owner.id = request.user_id
    LEFT JOIN branches branch ON branch.id = request.branch_id
    LEFT JOIN categories category ON category.id = request.category_id`

router.get('/', async (req, res) => {
  const filters = querySchema.parse(req.query)
  const params = [req.user.college_id, req.user.id]
  const where = ['request.college_id = $1', notBlockedSql('$2', 'request.user_id')]

  if (filters.mine === 'true') {
    where.push('request.user_id = $2')
  } else {
    where.push("(request.status = 'open' AND request.expires_at > now())")
  }
  if (filters.q) {
    params.push(filters.q)
    where.push(
      `to_tsvector('simple', concat_ws(' ', request.title, request.description)) ` +
      `@@ plainto_tsquery('simple', $${params.length})`,
    )
  }
  if (filters.category_id) {
    params.push(filters.category_id)
    where.push(`request.category_id = $${params.length}`)
  }
  if (filters.branch_id) {
    params.push(filters.branch_id)
    where.push(`(request.branch_id = $${params.length} OR request.branch_id IS NULL)`)
  }

  const { rows } = await query(
    `${requestSelect}
      WHERE ${where.join(' AND ')}
      ORDER BY (request.user_id = $2) DESC, request.created_at DESC
      LIMIT 100`,
    params,
  )
  res.json({ requests: rows })
})

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body)
  assertUserTextIsAllowed([data.title, data.description])

  const created = await tx(async (db) => {
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id])
    const { rows: [activeCount] } = await db.query(
      `SELECT count(*)::int AS total
         FROM need_board_requests
        WHERE user_id = $1 AND status = 'open' AND expires_at > now()`,
      [req.user.id],
    )
    if (activeCount.total >= 10) {
      throw new AppError(409, 'You can have up to 10 active campus requests at a time.')
    }
    if (data.category_id) {
      const { rows } = await db.query(
        `SELECT id FROM categories WHERE id = $1 AND scope <> 'lost_found'`,
        [data.category_id],
      )
      if (!rows.length) throw new AppError(400, 'Choose a marketplace category.')
    }
    if (data.branch_id) {
      const { rows } = await db.query('SELECT id FROM branches WHERE id = $1', [data.branch_id])
      if (!rows.length) throw new AppError(400, 'Choose a valid campus branch.')
    }

    const { rows: [request] } = await db.query(
      `INSERT INTO need_board_requests
         (user_id, college_id, branch_id, category_id, title, description, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + ($7::int * interval '1 hour'))
       RETURNING id, user_id, college_id, branch_id, category_id, title, description,
                 expires_at, status, created_at, updated_at`,
      [
        req.user.id,
        req.user.college_id,
        data.branch_id ?? req.user.branch_id ?? null,
        data.category_id ?? null,
        data.title,
        data.description,
        data.expires_in_hours,
      ],
    )

    const { rows: alerts } = await db.query(
      `INSERT INTO in_app_notifications
         (user_id, search_id, need_request_id, title, message, match_reasons)
       SELECT ss.user_id, ss.id, $2, 'A saved search has a new campus request',
              format('A student posted a request matching "%s".', ss.keyword),
              to_jsonb(array_remove(ARRAY[
                format('Keyword: %s', ss.keyword),
                CASE WHEN ss.category_id IS NOT NULL THEN format('Category: %s', matched_category.name) END,
                CASE WHEN ss.branch_id IS NOT NULL THEN format('Branch: %s', matched_branch.name) END,
                'Same campus'
              ]::text[], NULL))
         FROM saved_searches ss
         JOIN users recipient ON recipient.id = ss.user_id
         LEFT JOIN categories matched_category ON matched_category.id = ss.category_id
         LEFT JOIN branches matched_branch ON matched_branch.id = ss.branch_id
        WHERE ss.college_id = $1
          AND ss.user_id <> $3
          AND ${notBlockedSql('ss.user_id', '$3')}
          AND recipient.status = 'active'
          AND recipient.deleted_at IS NULL
          AND recipient.college_id = ss.college_id
          AND (ss.category_id IS NULL OR ss.category_id = $4)
          AND (ss.branch_id IS NULL OR $5 IS NULL OR ss.branch_id = $5)
          AND to_tsvector('simple', concat_ws(' ', $6::text, $7::text))
              @@ plainto_tsquery('simple', ss.keyword)
       ON CONFLICT (search_id, need_request_id)
         WHERE search_id IS NOT NULL AND need_request_id IS NOT NULL
       DO NOTHING
       RETURNING user_id, title, message`,
      [
        req.user.college_id,
        request.id,
        req.user.id,
        data.category_id ?? null,
        data.branch_id ?? req.user.branch_id ?? null,
        data.title,
        data.description,
      ],
    )
    return { request, alerts }
  })

  await Promise.all([...new Set(created.alerts.map((alert) => alert.user_id))].map((userId) => (
    notifySearchAlertUser(userId, {
      title: 'A saved search has a new campus request',
      body: `A new campus request matches one of your saved searches.`,
      url: `/needs/${encodeURIComponent(created.request.id)}`,
    }).catch((error) => {
      console.error(`Could not send saved-search request push to account ${userId}:`, error)
    })
  )))

  res.status(201).json({ request: created.request })
})

router.get('/:id', async (req, res) => {
  const id = idSchema.parse(req.params.id)
  const { rows: [request] } = await query(
    `${requestSelect}
      WHERE request.id = $1
        AND request.college_id = $3
        AND ${notBlockedSql('$2', 'request.user_id')}
        AND (
          (request.status = 'open' AND request.expires_at > now())
          OR request.user_id = $2
        )`,
    [id, req.user.id, req.user.college_id],
  )
  if (!request) throw new AppError(404, 'Campus request not found.')

  let responses = []
  if (request.user_id === req.user.id) {
    const { rows } = await query(
      `SELECT response.id, response.responder_id, response.offer_type, response.item_id,
              response.message, response.created_at,
              responder.display_name AS responder_name,
              item.title AS item_title
         FROM need_board_responses response
         JOIN users responder ON responder.id = response.responder_id
         LEFT JOIN items item ON item.id = response.item_id
        WHERE response.request_id = $1
          AND ${notBlockedSql('$2', 'response.responder_id')}
        ORDER BY response.created_at`,
      [id, req.user.id],
    )
    responses = rows
  }
  res.json({ request, responses })
})

router.post('/:id/responses', async (req, res) => {
  const id = idSchema.parse(req.params.id)
  const data = responseSchema.parse(req.body)
  assertUserTextIsAllowed([data.message])

  const result = await tx(async (db) => {
    const { rows: [request] } = await db.query(
      `SELECT id, user_id, college_id, title, status, expires_at
         FROM need_board_requests
        WHERE id = $1 AND college_id = $2
        FOR UPDATE`,
      [id, req.user.college_id],
    )
    if (!request || request.status !== 'open' || new Date(request.expires_at) <= new Date()) {
      throw new AppError(404, 'This campus request is no longer open.')
    }
    if (request.user_id === req.user.id) {
      throw new AppError(400, 'You cannot respond to your own campus request.')
    }
    await lockAndAssertUsersNotBlocked(db, req.user.id, request.user_id)
    const { rows: [existing] } = await db.query(
      'SELECT id FROM need_board_responses WHERE request_id = $1 AND responder_id = $2',
      [id, req.user.id],
    )
    if (existing) throw new AppError(409, 'You have already responded to this request.')

    if (data.item_id) {
      const { rows: [item] } = await db.query(
        `SELECT i.id
           FROM items i
          WHERE i.id = $1 AND i.college_id = $2 AND i.seller_id = $3 AND i.status = 'available'
            AND NOT EXISTS (
              SELECT 1 FROM item_reports ir
               WHERE ir.marketplace_item_id = i.id AND ir.status = 'pending'
            )
            AND NOT EXISTS (
              SELECT 1 FROM admin_badge_overrides abo
               WHERE abo.marketplace_item_id = i.id
                 AND abo.badge_id = 'under_review' AND abo.enabled
            )`,
        [data.item_id, req.user.college_id, req.user.id],
      )
      if (!item) throw new AppError(400, 'Choose one of your available, unflagged listings.')
    }

    const { rows: [response] } = await db.query(
      `INSERT INTO need_board_responses (request_id, responder_id, offer_type, item_id, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, request_id, responder_id, offer_type, item_id, message, created_at`,
      [id, req.user.id, data.offer_type, data.item_id ?? null, data.message],
    )
    await db.query(
      `INSERT INTO in_app_notifications
         (user_id, need_request_id, need_response_id, title, message)
       VALUES ($1, $2, $3, 'Someone responded to your campus request', $4)`,
      [
        request.user_id,
        request.id,
        response.id,
        `${req.user.display_name} responded to "${request.title}".`,
      ],
    )
    return { request, response }
  })

  notifySearchAlertUser(result.request.user_id, {
    title: 'Someone responded to your campus request',
    body: `${req.user.display_name} responded to "${result.request.title}".`,
    url: `/needs/${encodeURIComponent(id)}`,
  }).catch((error) => {
    console.error(`Could not send campus request response push to account ${result.request.user_id}:`, error)
  })

  res.status(201).json({ response: result.response })
})

router.patch('/:id/status', async (req, res) => {
  const id = idSchema.parse(req.params.id)
  const { status } = statusSchema.parse(req.body)
  const { rows: [request] } = await query(
    `UPDATE need_board_requests
        SET status = $3, updated_at = now()
      WHERE id = $1 AND user_id = $2 AND college_id = $4 AND status = 'open'
      RETURNING id, status, updated_at`,
    [id, req.user.id, status, req.user.college_id],
  )
  if (!request) throw new AppError(404, 'Open campus request not found.')
  res.json({ request })
})

module.exports = router
