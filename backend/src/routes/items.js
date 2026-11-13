const router = require('express').Router()
const crypto = require('crypto')
const { z } = require('zod')
const config = require('../config')
const { query, tx } = require('../db')
const storage = require('../storage')
const { processPhoto } = require('../utils/images')
const { assertUserTextIsAllowed } = require('../utils/text-moderation')
const { createImageUpload } = require('../utils/image-upload')
const { AppError } = require('../utils/errors')
const { buildUserBadges, ITEM_BADGES, applyBadgeOverrides } = require('../utils/user-badges')
const { requireAuth, requireActive, requireCollege } = require('../middleware/auth')
const { requireImageUploadsEnabled, requireMarketplaceWritable } = require('../middleware/system-controls')
const { findBarterCycles } = require('../utils/barter-cycles')
const { notifySearchAlertUser } = require('../utils/search-alerts')
const { lockAndAssertUsersNotBlocked, notBlockedSql } = require('../utils/user-blocks')

router.use(requireAuth)
router.use(requireMarketplaceWritable)

// Photos are held in memory only long enough to be checked, cleaned and saved.
const upload = createImageUpload(config.maxPhotosPerItem)

// multipart forms send everything as text, and empty optional fields as ''.
const blankToUndefined = (v) => (v === '' || v === null ? undefined : v)
const optInt = (min, max) => z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).optional())

const createSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
    category_id: optInt(1, 32767),
    item_type_id: optInt(1, 2147483647),
    condition: z.enum(['like_new', 'good', 'fair', 'worn']),
    price: z.preprocess(blankToUndefined, z.coerce.number().min(0).max(100000)),
    branch_id: optInt(1, 32767),
    semester: optInt(1, 8),
    preferred_place: z.preprocess(blankToUndefined, z.string().trim().max(120).optional()),
    share_email: z.preprocess(
      (value) => value === 'true' ? true : value === 'false' ? false : value,
      z.boolean().default(false)
    ),
    wanted_category_ids: z.preprocess((value) => {
      if (value === undefined || value === '') return []
      if (typeof value !== 'string') return value
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    }, z.array(z.coerce.number().int().min(1).max(32767)).max(8).default([])),
  })
  .refine((d) => d.category_id || d.item_type_id, { message: 'Send category_id or item_type_id', path: ['category_id'] })

const idParam = z.object({ id: z.uuid() })
// Marketplace browse filters. Every filter is optional; blank values are ignored.
const optNum = z.preprocess(blankToUndefined, z.coerce.number().min(0).max(1000000).optional())
const conditionList = z.preprocess(
  (v) => (blankToUndefined(v) === undefined ? undefined : String(v).split(',').map((c) => c.trim()).filter(Boolean)),
  z.array(z.enum(['like_new', 'good', 'fair', 'worn'])).max(4).optional()
)
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(12),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.preprocess(blankToUndefined, z.string().trim().max(80).optional()),
  category_id: optInt(1, 32767),
  item_type_id: optInt(1, 2147483647),
  condition: conditionList,
  min_price: optNum,
  max_price: optNum,
  branch_id: optInt(1, 32767),
  semester: optInt(1, 8),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
})

const statusSchema = z.object({ status: z.enum(['available', 'sold']) })
const reservationActionSchema = z.object({ action: z.enum(['accept', 'decline', 'cancel']) })

// Columns every listing query needs. Photos come back as an ordered array of storage keys.
const ITEM_SELECT = `
  SELECT i.id, i.seller_id, i.college_id, i.category_id, i.item_type_id, i.title, i.description, i.condition,
         i.price, i.status, i.branch_id, i.semester, i.preferred_place, i.created_at,
         u.display_name AS seller_name, u.email AS seller_email_address, u.email_verified_at,
         u.role AS seller_role, u.status AS seller_status,
         c.email_domain, c.status AS college_status,
         t.trust_score::int AS trust_score, t.is_trusted, t.completed_handovers::int AS completed_handovers,
         (SELECT count(*)::int
            FROM item_claims ic
            JOIN lost_found_items lif ON lif.id = ic.item_id
           WHERE lif.user_id = u.id
             AND lif.lifecycle_status = 'resolved'
             AND ic.status = 'completed') AS completed_returns,
         EXISTS (
           SELECT 1 FROM item_reports ir
            WHERE ir.marketplace_item_id = i.id AND ir.status = 'pending'
         ) AS has_pending_reports,
         EXISTS (
           SELECT 1
             FROM item_reports ir
             LEFT JOIN items reported_marketplace ON reported_marketplace.id = ir.marketplace_item_id
             LEFT JOIN lost_found_items reported_lost_found ON reported_lost_found.id = ir.lost_found_item_id
            WHERE ir.status = 'pending'
              AND (reported_marketplace.seller_id = u.id OR reported_lost_found.user_id = u.id)
         ) AS seller_has_pending_reports,
         COALESCE((
           SELECT json_agg(json_build_object('badge_id', abo.badge_id, 'enabled', abo.enabled))
             FROM admin_badge_overrides abo
            WHERE abo.user_id = u.id
         ), '[]'::json) AS seller_badge_overrides,
         COALESCE((
           SELECT json_agg(json_build_object('badge_id', abo.badge_id, 'enabled', abo.enabled))
             FROM admin_badge_overrides abo
            WHERE abo.marketplace_item_id = i.id
         ), '[]'::json) AS item_badge_overrides,
         EXISTS (
           SELECT 1 FROM admin_badge_overrides abo
            WHERE abo.marketplace_item_id = i.id
              AND abo.badge_id = 'under_review' AND abo.enabled
         ) AS has_admin_review_badge,
         CASE WHEN i.share_email AND u.email_verified_at IS NOT NULL THEN u.email END AS seller_email,
         COALESCE((
           SELECT array_agg(wanted_category.name ORDER BY wanted_category.name)
             FROM item_wants iw
             JOIN categories wanted_category ON wanted_category.id = iw.category_id
            WHERE iw.item_id = i.id
         ), '{}') AS wanted_categories,
         COALESCE((SELECT array_agg(p.storage_key ORDER BY p.position) FROM item_photos p WHERE p.item_id = i.id), '{}') AS photo_keys
    FROM items i
    JOIN users u ON u.id = i.seller_id
    JOIN user_trust t ON t.user_id = i.seller_id
    LEFT JOIN colleges c ON c.id = u.college_id`

function shape(row, viewer) {
  const canSeeModeration = viewer?.role === 'admin' || viewer?.id === row.seller_id
  const itemBadges = applyBadgeOverrides([
    ...(row.has_pending_reports ? [{ id: 'under_review', label: 'Under Moderation Review' }] : []),
    ...(row.status === 'sold' ? [{ id: 'claimed_resolved', label: 'Claimed / Resolved' }] : []),
  ], row.item_badge_overrides, ITEM_BADGES.marketplace_item)
    .filter((badge) => badge.id !== 'under_review' || canSeeModeration)
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    condition: row.condition,
    price: Number(row.price),
    status: row.status,
    under_review: itemBadges.some(({ id }) => id === 'under_review'),
    badges: itemBadges,
    category_id: row.category_id,
    item_type_id: row.item_type_id,
    branch_id: row.branch_id,
    semester: row.semester,
    preferred_place: row.preferred_place,
    wanted_categories: row.wanted_categories,
    created_at: row.created_at,
    photos: row.photo_keys.map((k) => storage.urlFor(k)),
    seller: {
      id: row.seller_id,
      display_name: row.seller_name,
      trust_score: row.trust_score,
      is_trusted: row.is_trusted,
      contact_email: row.seller_email,
      badges: buildUserBadges({
        email: row.seller_email_address,
        email_verified_at: row.email_verified_at,
        email_domain: row.email_domain,
        college_status: row.college_status,
        role: row.seller_role,
        status: row.seller_status,
        completed_handovers: row.completed_handovers,
        pending_reports_received: row.seller_has_pending_reports,
        is_trusted: row.is_trusted,
        completed_returns: row.completed_returns,
      }, row.seller_badge_overrides),
    },
  }
}

// A student only ever sees listings from their own college (admins see all).
function visibleTo(viewer, row) {
  if (!row) return false
  if (viewer.role === 'admin') return true
  if (row.status === 'removed' && viewer.id !== row.seller_id) return false
  if (row.has_pending_reports && viewer.id !== row.seller_id) return false
  if (row.has_admin_review_badge && viewer.id !== row.seller_id) return false
  return row.college_id === viewer.college_id
}

async function loadItem(id, viewer) {
  const { rows } = await query(
    `${ITEM_SELECT} WHERE i.id = $1
      AND ($3 IN ('admin', 'super_admin') OR ${notBlockedSql('$2', 'i.seller_id')})`,
    [id, viewer.id, viewer.role],
  )
  return visibleTo(viewer, rows[0]) ? shape(rows[0], viewer) : null
}

// POST /items  (multipart/form-data: fields + up to 5 files in "photos")
router.post('/', requireActive, requireCollege, requireImageUploadsEnabled, upload.array('photos', config.maxPhotosPerItem), async (req, res) => {
  const data = createSchema.parse(req.body)
  assertUserTextIsAllowed([data.title, data.description, data.preferred_place])
  const files = req.files || []
  if (files.length < 1) throw new AppError(400, 'Add at least one photo')

  // --- trust limits: new users can list, but only cheaper items and a few at a time
  const { rows: [trust] } = await query('SELECT is_trusted FROM user_trust WHERE user_id = $1', [req.user.id])
  if (!trust.is_trusted) {
    if (data.price > config.newUserMaxPrice) {
      throw new AppError(403, `New accounts can list items up to Rs ${config.newUserMaxPrice}. Complete handovers to become trusted`, 'TRUST_PRICE_LIMIT')
    }
    const { rows: [c] } = await query(
      `SELECT count(*)::int AS n FROM items WHERE seller_id = $1 AND status IN ('available', 'reserved')`,
      [req.user.id]
    )
    if (c.n >= config.newUserMaxActiveListings) {
      throw new AppError(403, `New accounts can have ${config.newUserMaxActiveListings} active listings at a time`, 'TRUST_LISTING_LIMIT')
    }
  }

  // --- resolve category: an item type decides the category
  let categoryId = data.category_id
  if (data.item_type_id) {
    const { rows } = await query('SELECT category_id FROM item_types WHERE id = $1', [data.item_type_id])
    if (!rows[0]) throw new AppError(400, 'Unknown item_type_id')
    categoryId = rows[0].category_id
  } else {
    const { rows } = await query('SELECT scope FROM categories WHERE id = $1', [categoryId])
    if (!rows[0] || rows[0].scope === 'lost_found') throw new AppError(400, 'Unknown or unsuitable category_id')
  }

  // --- clean photos, save them, then write the DB rows in one transaction
  const itemId = crypto.randomUUID()
  const wantedCategoryIds = [...new Set(data.wanted_category_ids)]
  if (wantedCategoryIds.length) {
    const { rows: eligibleCategories } = await query(
      `SELECT id FROM categories
        WHERE id = ANY($1::smallint[]) AND scope <> 'lost_found'`,
      [wantedCategoryIds],
    )
    if (eligibleCategories.length !== wantedCategoryIds.length) {
      throw new AppError(400, 'Wanted categories must be marketplace categories.')
    }
  }
  const cleaned = await Promise.all(files.map((f) => processPhoto(f.buffer)))
  const keys = cleaned.map(() => `items/${itemId}/${crypto.randomUUID()}.webp`)
  const storedKeys = []

  try {
    for (let i = 0; i < keys.length; i++) {
      storedKeys.push(await storage.save(keys[i], cleaned[i]))
    }

    const matchingAlerts = await tx(async (db) => {
      // college_id is filled in by a database trigger from the seller's college
      await db.query(
        `INSERT INTO items (id, seller_id, category_id, item_type_id, title, description, condition,
                            price, branch_id, semester, preferred_place, share_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [itemId, req.user.id, categoryId, data.item_type_id ?? null, data.title, data.description ?? null,
         data.condition, data.price.toFixed(2), data.branch_id ?? null, data.semester ?? null,
         data.preferred_place ?? null, data.share_email]
      )
      for (let i = 0; i < storedKeys.length; i++) {
        await db.query('INSERT INTO item_photos (item_id, storage_key, position) VALUES ($1, $2, $3)', [itemId, storedKeys[i], i])
      }
      for (const wantedCategoryId of wantedCategoryIds) {
        await db.query(
          'INSERT INTO item_wants (item_id, user_id, category_id) VALUES ($1, $2, $3)',
          [itemId, req.user.id, wantedCategoryId],
        )
      }
      const { rows: alerts } = await db.query(
        `INSERT INTO in_app_notifications (user_id, search_id, item_id, title, message, match_reasons)
         SELECT ss.user_id, ss.id, $2, 'A saved search has a new match',
                format('A new item, "%s", matches your saved search "%s".', $3::text, ss.keyword),
                to_jsonb(array_remove(ARRAY[
                  format('Keyword: %s', ss.keyword),
                  CASE WHEN ss.category_id IS NOT NULL THEN format('Category: %s', search_category.name) END,
                  CASE WHEN ss.branch_id IS NOT NULL THEN format('Branch: %s', search_branch.name) END,
                  'Same campus'
                ]::text[], NULL))
           FROM saved_searches ss
           JOIN users recipient ON recipient.id = ss.user_id
           LEFT JOIN categories search_category ON search_category.id = ss.category_id
           LEFT JOIN branches search_branch ON search_branch.id = ss.branch_id
          WHERE ss.college_id = $1
            AND ss.user_id <> $4
            AND ${notBlockedSql('ss.user_id', '$4')}
            AND recipient.status = 'active'
            AND recipient.deleted_at IS NULL
            AND recipient.college_id = ss.college_id
            AND (ss.category_id IS NULL OR ss.category_id = $6)
            AND (ss.branch_id IS NULL OR $7 IS NULL OR ss.branch_id = $7)
            AND to_tsvector('simple', concat_ws(' ', $3::text, $5::text))
                @@ plainto_tsquery('simple', ss.keyword)
         ON CONFLICT (search_id, item_id)
           WHERE search_id IS NOT NULL AND item_id IS NOT NULL
         DO NOTHING
         RETURNING user_id, title, message`,
        [req.user.college_id, itemId, data.title, req.user.id, data.description ?? '',
         categoryId, data.branch_id ?? null],
      )
      return alerts
    })
    const alertsByUser = new Map()
    for (const alert of matchingAlerts) {
      if (!alertsByUser.has(alert.user_id)) alertsByUser.set(alert.user_id, alert)
    }
    await Promise.all([...alertsByUser].map(([userId, alert]) => (
      notifySearchAlertUser(userId, {
        title: alert.title,
        body: alert.message,
        url: `/items/${encodeURIComponent(itemId)}`,
      }).catch((pushError) => {
        console.error(`Could not send saved-search push notification to account ${userId}:`, pushError)
      })
    )))
  } catch (err) {
    await Promise.all(storedKeys.map((key) => storage.remove(key).catch(() => {}))) // no orphan files
    throw err
  }

  res.status(201).json({ item: await loadItem(itemId, req.user) })
})

// GET /items  -> available listings at the viewer's college, with optional filters:
//   q (words in title/description), category_id, item_type_id, condition (comma list),
//   min_price, max_price, branch_id, semester, sort (newest | price_asc | price_desc), limit, offset
// branch_id / semester also match listings tagged "any" (NULL), because those suit every branch/semester.
// Response: { items: [...], has_more: boolean }
const SORTS = {
  newest: 'i.created_at DESC, i.id DESC',
  price_asc: 'i.price ASC, i.created_at DESC, i.id DESC',
  price_desc: 'i.price DESC, i.created_at DESC, i.id DESC',
}

router.get('/', requireCollege, async (req, res) => {
  const f = listQuery.parse(req.query)
  const params = [req.user.college_id, req.user.id, req.user.role]
  const where = [
    'i.college_id = $1',
    "i.status = 'available'",
    `($3 IN ('admin', 'super_admin') OR ${notBlockedSql('$2', 'i.seller_id')})`,
    `(NOT EXISTS (
       SELECT 1 FROM item_reports ir
        WHERE ir.marketplace_item_id = i.id AND ir.status = 'pending'
     ) OR i.seller_id = $2 OR $3 = 'admin')`,
    `(NOT EXISTS (
       SELECT 1 FROM admin_badge_overrides abo
        WHERE abo.marketplace_item_id = i.id
          AND abo.badge_id = 'under_review' AND abo.enabled
     ) OR i.seller_id = $2 OR $3 = 'admin')`,
  ]
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)) }

  if (f.q) {
    params.push(f.q)
    where.push(
      `to_tsvector('simple', COALESCE(i.title, '') || ' ' || COALESCE(i.description, '')) ` +
      `@@ plainto_tsquery('simple', $${params.length})`
    )
  }
  if (f.category_id) add('i.category_id = ?', f.category_id)
  if (f.item_type_id) add('i.item_type_id = ?', f.item_type_id)
  if (f.condition && f.condition.length) add('i.condition = ANY(?)', f.condition)
  if (f.min_price !== undefined) add('i.price >= ?', f.min_price)
  if (f.max_price !== undefined) add('i.price <= ?', f.max_price)
  if (f.branch_id) add('(i.branch_id = ? OR i.branch_id IS NULL)', f.branch_id)
  if (f.semester) add('(i.semester = ? OR i.semester IS NULL)', f.semester)

  params.push(f.limit + 1, f.offset)
  const { rows } = await query(
    `${ITEM_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${SORTS[f.sort]} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  res.json({ items: rows.slice(0, f.limit).map((row) => shape(row, req.user)), has_more: rows.length > f.limit })
})

// GET /items/mine   (must be declared before /:id)
router.get('/mine', async (req, res) => {
  const { rows } = await query(`${ITEM_SELECT} WHERE i.seller_id = $1 AND i.status <> 'removed' ORDER BY i.created_at DESC`, [req.user.id])
  res.json({ items: rows.map((row) => shape(row, req.user)) })
})

router.get('/barter-loops', requireCollege, async (req, res) => {
  const { rows } = await query(
    `SELECT i.id, i.seller_id, u.display_name AS seller_name,
            i.title, i.category_id, c.name AS category_name,
            COALESCE(array_agg(DISTINCT w.category_id)
              FILTER (WHERE w.category_id IS NOT NULL), '{}') AS wanted_category_ids,
            COALESCE(array_agg(DISTINCT wanted_category.name)
              FILTER (WHERE wanted_category.name IS NOT NULL), '{}') AS wanted_categories
       FROM items i
       JOIN users u ON u.id = i.seller_id
       JOIN categories c ON c.id = i.category_id
       LEFT JOIN item_wants w ON w.item_id = i.id
       LEFT JOIN categories wanted_category ON wanted_category.id = w.category_id
      WHERE i.college_id = $1
        AND i.status = 'available'
        AND ($3 IN ('admin', 'super_admin') OR ${notBlockedSql('$2', 'i.seller_id')})
        AND NOT EXISTS (
          SELECT 1 FROM item_reports ir
           WHERE ir.marketplace_item_id = i.id AND ir.status = 'pending'
        )
        AND NOT EXISTS (
          SELECT 1 FROM admin_badge_overrides abo
           WHERE abo.marketplace_item_id = i.id
             AND abo.badge_id = 'under_review' AND abo.enabled
        )
      GROUP BY i.id, u.display_name, c.name`,
    [req.user.college_id, req.user.id, req.user.role],
  )
  const { cycles: candidateCycles, limited } = findBarterCycles(rows.map((item) => ({
    ...item,
    wanted_category_ids: item.wanted_category_ids.map(Number),
    category_id: Number(item.category_id),
  })), req.user.id)
  const cycleUserIds = [...new Set(candidateCycles.flatMap((cycle) => cycle.map((item) => item.seller_id)))]
  const { rows: blockedPairs } = cycleUserIds.length
    ? await query(
      `SELECT blocker_id, blocked_id
         FROM user_blocks
        WHERE blocker_id = ANY($1::uuid[]) AND blocked_id = ANY($1::uuid[])`,
      [cycleUserIds],
    )
    : { rows: [] }
  const blockedPairKeys = new Set(blockedPairs.map(({ blocker_id, blocked_id }) => `${blocker_id}:${blocked_id}`))
  const cycles = candidateCycles.filter((cycle) => {
    const participants = cycle.map((item) => item.seller_id)
    return !participants.some((participant, index) => participants.slice(index + 1).some((other) => (
      blockedPairKeys.has(`${participant}:${other}`) || blockedPairKeys.has(`${other}:${participant}`)
    )))
  })
  res.json({ limited,
    cycles: cycles.map((cycle) => cycle.map((item) => ({
      id: item.id,
      seller_id: item.seller_id,
      seller_name: item.seller_name,
      title: item.title,
      category_name: item.category_name,
      wanted_categories: item.wanted_categories,
    }))),
  })
})

router.get('/reservations/mine', requireCollege, async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.item_id, r.buyer_id, r.seller_id, r.status, r.agreed_price,
            r.expires_at, r.created_at, r.updated_at, i.title, i.price,
            CASE WHEN r.buyer_id = $1 THEN seller.display_name ELSE buyer.display_name END AS other_user_name
       FROM reservations r
       JOIN items i ON i.id = r.item_id
       JOIN users buyer ON buyer.id = r.buyer_id
       JOIN users seller ON seller.id = r.seller_id
      WHERE (r.buyer_id = $1 OR r.seller_id = $1)
        AND ${notBlockedSql('$1', `CASE WHEN r.buyer_id = $1 THEN r.seller_id ELSE r.buyer_id END`)}
      ORDER BY r.created_at DESC
      LIMIT 100`,
    [req.user.id],
  )
  res.json({ reservations: rows })
})

router.post('/:id/reservations', requireActive, requireCollege, async (req, res) => {
  const { id } = idParam.parse(req.params)
  const { rows: [reservation] } = await tx(async (db) => {
    const { rows: [listing] } = await db.query(
      'SELECT seller_id FROM items WHERE id = $1',
      [id],
    )
    if (!listing) throw new AppError(404, 'Listing not found')
    await lockAndAssertUsersNotBlocked(db, req.user.id, listing.seller_id)
    const { rows: [item] } = await db.query(
      `SELECT i.id, i.seller_id, i.college_id, i.status,
              EXISTS (
                SELECT 1 FROM item_reports ir
                 WHERE ir.marketplace_item_id = i.id AND ir.status = 'pending'
              ) OR EXISTS (
                SELECT 1 FROM admin_badge_overrides abo
                 WHERE abo.marketplace_item_id = i.id
                   AND abo.badge_id = 'under_review' AND abo.enabled
              ) AS has_pending_reports
         FROM items i
        WHERE i.id = $1
        FOR UPDATE`,
      [id],
    )
    if (!item || item.college_id !== req.user.college_id) throw new AppError(404, 'Listing not found')
    if (item.seller_id === req.user.id) throw new AppError(400, 'You cannot reserve your own listing')
    if (item.seller_id !== listing.seller_id) throw new AppError(409, 'Listing owner changed. Please try again.')
    if (item.has_pending_reports) throw new AppError(409, 'This listing is temporarily unavailable while it is under moderation review')
    if (item.status !== 'available') throw new AppError(409, 'This listing is no longer available')

    const { rows: [created] } = await db.query(
      `INSERT INTO reservations (item_id, buyer_id, expires_at)
       VALUES ($1, $2, now() + interval '48 hours')
       RETURNING id, item_id, buyer_id, seller_id, status, agreed_price, expires_at, created_at`,
      [id, req.user.id],
    )
    const userA = req.user.id < item.seller_id ? req.user.id : item.seller_id
    const userB = req.user.id < item.seller_id ? item.seller_id : req.user.id
    const { rows: [conversation] } = await db.query(
      `INSERT INTO conversations (item_id, user_a, user_b)
       VALUES ($1, $2, $3)
       ON CONFLICT (item_id, user_a, user_b) WHERE item_id IS NOT NULL
       DO UPDATE SET last_message_at = conversations.last_message_at
       RETURNING id`,
      [id, userA, userB],
    )
    return { rows: [{ ...created, conversation_id: conversation.id }] }
  })
  res.status(201).json({ reservation })
})

router.patch('/reservations/:id', requireActive, requireCollege, async (req, res) => {
  const reservationId = idParam.parse({ id: req.params.id }).id
  const { action } = reservationActionSchema.parse(req.body)
  const { rows: [reservation] } = await tx(async (db) => {
    const { rows: [participants] } = await db.query(
      'SELECT buyer_id, seller_id FROM reservations WHERE id = $1',
      [reservationId],
    )
    if (!participants) throw new AppError(404, 'Reservation not found')
    await lockAndAssertUsersNotBlocked(db, participants.buyer_id, participants.seller_id)
    const { rows: [current] } = await db.query(
      `SELECT r.id, r.item_id, r.buyer_id, r.seller_id, r.status, i.price, i.college_id,
              EXISTS (
                SELECT 1 FROM item_reports ir
                 WHERE ir.marketplace_item_id = i.id AND ir.status = 'pending'
              ) OR EXISTS (
                SELECT 1 FROM admin_badge_overrides abo
                 WHERE abo.marketplace_item_id = i.id
                   AND abo.badge_id = 'under_review' AND abo.enabled
              ) AS has_pending_reports
         FROM reservations r
         JOIN items i ON i.id = r.item_id
        WHERE r.id = $1
        FOR UPDATE OF r, i`,
      [reservationId],
    )
    if (!current || current.college_id !== req.user.college_id) throw new AppError(404, 'Reservation not found')
    if (current.buyer_id !== participants.buyer_id || current.seller_id !== participants.seller_id) {
      throw new AppError(409, 'Reservation participants changed. Please try again.')
    }

    if (action === 'accept') {
      if (current.seller_id !== req.user.id) throw new AppError(403, 'Only the seller can accept this reservation')
      if (current.status !== 'requested') throw new AppError(409, 'This reservation is no longer awaiting a response')
      if (current.has_pending_reports) {
        throw new AppError(409, 'This listing is temporarily unavailable while it is under moderation review')
      }
      const { rows: [updated] } = await db.query(
        `UPDATE reservations
            SET status = 'accepted', agreed_price = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, item_id, buyer_id, seller_id, status, agreed_price, expires_at`,
        [reservationId, current.price],
      )
      return { rows: [updated] }
    }

    if (action === 'decline') {
      if (current.seller_id !== req.user.id) throw new AppError(403, 'Only the seller can decline this reservation')
      if (current.status !== 'requested') throw new AppError(409, 'Only pending reservations can be declined')
      const { rows: [updated] } = await db.query(
        `UPDATE reservations SET status = 'declined', updated_at = now()
          WHERE id = $1
          RETURNING id, item_id, buyer_id, seller_id, status`,
        [reservationId],
      )
      return { rows: [updated] }
    }

    if (current.buyer_id !== req.user.id) throw new AppError(403, 'Only the buyer can cancel this reservation')
    if (!['requested', 'accepted'].includes(current.status)) {
      throw new AppError(409, 'This reservation can no longer be cancelled')
    }
    const { rows: [updated] } = await db.query(
      `UPDATE reservations SET status = 'cancelled', updated_at = now()
        WHERE id = $1
        RETURNING id, item_id, buyer_id, seller_id, status`,
      [reservationId],
    )
    return { rows: [updated] }
  })
  res.json({ reservation })
})

router.post('/reservations/:id/confirm', requireActive, requireCollege, async (req, res) => {
  const reservationId = idParam.parse({ id: req.params.id }).id
  const { rows: [result] } = await tx(async (db) => {
    const { rows: [participants] } = await db.query(
      'SELECT buyer_id, seller_id FROM reservations WHERE id = $1',
      [reservationId],
    )
    if (!participants) throw new AppError(404, 'Reservation not found')
    await lockAndAssertUsersNotBlocked(db, participants.buyer_id, participants.seller_id)
    const { rows: [reservation] } = await db.query(
      `SELECT r.id, r.buyer_id, r.seller_id, r.status, i.college_id,
              EXISTS (
                SELECT 1 FROM item_reports ir
                 WHERE ir.marketplace_item_id = i.id AND ir.status = 'pending'
              ) OR EXISTS (
                SELECT 1 FROM admin_badge_overrides abo
                 WHERE abo.marketplace_item_id = i.id
                   AND abo.badge_id = 'under_review' AND abo.enabled
              ) AS has_pending_reports
         FROM reservations r
         JOIN items i ON i.id = r.item_id
        WHERE r.id = $1
        FOR UPDATE OF r, i`,
      [reservationId],
    )
    if (!reservation || reservation.college_id !== req.user.college_id) throw new AppError(404, 'Reservation not found')
    if (reservation.buyer_id !== participants.buyer_id || reservation.seller_id !== participants.seller_id) {
      throw new AppError(409, 'Reservation participants changed. Please try again.')
    }
    if (![reservation.buyer_id, reservation.seller_id].includes(req.user.id)) {
      throw new AppError(403, 'You are not part of this reservation')
    }
    if (reservation.status !== 'accepted') throw new AppError(409, 'Only accepted reservations can be confirmed')
    if (reservation.has_pending_reports) {
      throw new AppError(409, 'This listing is temporarily unavailable while it is under moderation review')
    }

    const { rows: [existing] } = await db.query(
      'SELECT 1 FROM handover_confirmations WHERE reservation_id = $1 AND confirmer_id = $2',
      [reservationId, req.user.id],
    )
    if (existing) throw new AppError(409, 'You have already confirmed this handover')

    await db.query(
      `INSERT INTO handover_confirmations (reservation_id, confirmer_id, counterpart_id, outcome)
       VALUES ($1, $2, $3, 'met')`,
      [
        reservationId,
        req.user.id,
        req.user.id === reservation.buyer_id ? reservation.seller_id : reservation.buyer_id,
      ],
    )
    const { rows: [updated] } = await db.query(
      'SELECT id, status FROM reservations WHERE id = $1',
      [reservationId],
    )
    return { rows: [updated] }
  })
  res.json({ reservation: result })
})

router.get('/:id/reservation', requireCollege, async (req, res) => {
  const { id } = idParam.parse(req.params)
  const { rows: [reservation] } = await query(
    `SELECT r.id, r.item_id, r.buyer_id, r.seller_id, r.status, r.agreed_price,
            r.expires_at, r.created_at, r.updated_at,
            CASE WHEN r.buyer_id = $2 THEN seller.display_name ELSE buyer.display_name END AS other_user_name,
            c.id AS conversation_id,
            EXISTS (
              SELECT 1 FROM handover_confirmations hc
               WHERE hc.reservation_id = r.id AND hc.confirmer_id = $2
            ) AS viewer_confirmed,
            EXISTS (
              SELECT 1 FROM handover_confirmations hc
               WHERE hc.reservation_id = r.id
                 AND hc.confirmer_id <> $2
                 AND hc.outcome = 'met'
            ) AS counterpart_confirmed
       FROM reservations r
       JOIN items i ON i.id = r.item_id
       JOIN users buyer ON buyer.id = r.buyer_id
       JOIN users seller ON seller.id = r.seller_id
       LEFT JOIN conversations c
         ON c.item_id = r.item_id
        AND c.user_a = CASE WHEN r.buyer_id < r.seller_id THEN r.buyer_id ELSE r.seller_id END
        AND c.user_b = CASE WHEN r.buyer_id < r.seller_id THEN r.seller_id ELSE r.buyer_id END
      WHERE r.item_id = $1 AND i.college_id = $3
        AND (r.buyer_id = $2 OR r.seller_id = $2)
        AND ${notBlockedSql('$2', `CASE WHEN r.buyer_id = $2 THEN r.seller_id ELSE r.buyer_id END`)}
      ORDER BY r.created_at DESC
      LIMIT 1`,
    [id, req.user.id, req.user.college_id],
  )
  res.json({ reservation: reservation || null })
})

// GET /items/:id
router.get('/:id', async (req, res) => {
  const { id } = idParam.parse(req.params)
  const item = await loadItem(id, req.user)
  if (!item) throw new AppError(404, 'Listing not found')
  res.json({ item })
})

// PATCH /items/:id/status (owners may toggle unreserved listings)
router.patch('/:id/status', async (req, res) => {
  const { id } = idParam.parse(req.params)
  const { status } = statusSchema.parse(req.body)

  await tx(async (db) => {
    const { rows: [item] } = await db.query(
      `SELECT seller_id, status,
              EXISTS (
                SELECT 1 FROM item_reports ir
                 WHERE ir.marketplace_item_id = items.id AND ir.status = 'pending'
              ) OR EXISTS (
                SELECT 1 FROM admin_badge_overrides abo
                 WHERE abo.marketplace_item_id = items.id
                   AND abo.badge_id = 'under_review' AND abo.enabled
              ) AS under_review
         FROM items WHERE id = $1 FOR UPDATE`,
      [id]
    )
    if (!item) throw new AppError(404, 'Listing not found')
    if (item.seller_id !== req.user.id) throw new AppError(403, 'Only the seller can update this listing')
    if (item.under_review) throw new AppError(409, 'This listing is temporarily unavailable while it is under moderation review')
    if (!['available', 'sold'].includes(item.status)) {
      throw new AppError(409, 'Reserved or withdrawn listings cannot be changed here')
    }

    if (status === 'available') {
      const { rows: [reservation] } = await db.query(
        "SELECT EXISTS (SELECT 1 FROM reservations WHERE item_id = $1 AND status = 'completed') AS completed",
        [id]
      )
      if (reservation.completed) throw new AppError(409, 'A completed sale cannot be marked available')
    }

    await db.query(
      `UPDATE items
          SET status = $1,
              sold_at = CASE WHEN $1 = 'sold' THEN now() ELSE NULL END,
              updated_at = now()
        WHERE id = $2`,
      [status, id]
    )
  })

  res.json({ success: true, item: await loadItem(id, req.user) })
})

// DELETE /items/:id
// A real delete, for the seller's own listing while it is 'available' or 'withdrawn':
//   - no chats, reservations or reports point at it  -> the listing row is deleted for good
//   - something does point at it (history other people rely on) -> the row is kept as a
//     hidden record (status 'removed'), but its photos are erased and it disappears from every list
// Either way the photo files are deleted from storage. Reserved and sold listings are refused.
router.delete('/:id', async (req, res) => {
  const { id } = idParam.parse(req.params)
  let photoKeys = []
  let outcome = 'deleted'

  await tx(async (db) => {
    const { rows: [item] } = await db.query(
      'SELECT seller_id, status FROM items WHERE id = $1 FOR UPDATE',
      [id]
    )
    if (!item) throw new AppError(404, 'Listing not found')
    if (item.seller_id !== req.user.id) throw new AppError(403, 'Only the seller can delete this listing')
    if (item.status === 'reserved') {
      throw new AppError(409, 'This listing is reserved. Cancel or finish the reservation first')
    }
    if (!['available', 'withdrawn'].includes(item.status)) {
      throw new AppError(409, 'Sold listings are kept as a record and cannot be deleted')
    }

    const { rows } = await db.query('SELECT storage_key FROM item_photos WHERE item_id = $1', [id])
    photoKeys = rows.map((r) => r.storage_key)

    // Try the real delete. If other tables still reference this item, the database refuses
    // (foreign key violation); undo just that attempt and archive the listing instead.
    await db.query('SAVEPOINT hard_delete')
    try {
      await db.query('DELETE FROM items WHERE id = $1', [id])
    } catch (err) {
      if (err.code !== '23503') throw err
      await db.query('ROLLBACK TO SAVEPOINT hard_delete')
      await db.query('DELETE FROM item_photos WHERE item_id = $1', [id])
      await db.query(
        "UPDATE items SET status = 'removed', removed_reason = 'deleted by seller', updated_at = now() WHERE id = $1",
        [id]
      )
      outcome = 'archived'
    }
  })

  // Files go only after the database change has committed, so a failure here never loses a listing.
  await Promise.all(photoKeys.map((key) => storage.remove(key).catch(() => {})))
  res.json({ success: true, outcome, message: 'Listing deleted' })
})

module.exports = router