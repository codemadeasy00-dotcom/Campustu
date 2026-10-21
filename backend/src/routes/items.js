const router = require('express').Router()
const multer = require('multer')
const crypto = require('crypto')
const { z } = require('zod')
const config = require('../config')
const { query, tx } = require('../db')
const storage = require('../storage')
const { processPhoto } = require('../utils/images')
const { AppError } = require('../utils/errors')
const { requireAuth, requireActive, requireCollege } = require('../middleware/auth')

router.use(requireAuth)

// Photos are held in memory only long enough to be checked, cleaned and saved.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxPhotoBytes, files: config.maxPhotosPerItem },
})

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

// Columns every listing query needs. Photos come back as an ordered array of storage keys.
const ITEM_SELECT = `
  SELECT i.id, i.seller_id, i.college_id, i.category_id, i.item_type_id, i.title, i.description, i.condition,
         i.price, i.status, i.branch_id, i.semester, i.preferred_place, i.created_at,
         u.display_name AS seller_name, t.trust_score::int AS trust_score, t.is_trusted,
         CASE WHEN i.share_email AND u.email_verified_at IS NOT NULL THEN u.email END AS seller_email,
         COALESCE((SELECT array_agg(p.storage_key ORDER BY p.position) FROM item_photos p WHERE p.item_id = i.id), '{}') AS photo_keys
    FROM items i
    JOIN users u ON u.id = i.seller_id
    JOIN user_trust t ON t.user_id = i.seller_id`

function shape(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    condition: row.condition,
    price: Number(row.price),
    status: row.status,
    category_id: row.category_id,
    item_type_id: row.item_type_id,
    branch_id: row.branch_id,
    semester: row.semester,
    preferred_place: row.preferred_place,
    created_at: row.created_at,
    photos: row.photo_keys.map((k) => storage.urlFor(k)),
    seller: {
      id: row.seller_id,
      display_name: row.seller_name,
      trust_score: row.trust_score,
      is_trusted: row.is_trusted,
      contact_email: row.seller_email,
    },
  }
}

// A student only ever sees listings from their own college (admins see all).
function visibleTo(viewer, row) {
  if (!row) return false
  if (viewer.role === 'admin') return true
  if (row.status === 'removed' && viewer.id !== row.seller_id) return false
  return row.college_id === viewer.college_id
}

async function loadItem(id, viewer) {
  const { rows } = await query(`${ITEM_SELECT} WHERE i.id = $1`, [id])
  return visibleTo(viewer, rows[0]) ? shape(rows[0]) : null
}

// POST /items  (multipart/form-data: fields + up to 5 files in "photos")
router.post('/', requireActive, requireCollege, upload.array('photos', config.maxPhotosPerItem), async (req, res) => {
  const data = createSchema.parse(req.body)
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
  const cleaned = await Promise.all(files.map((f) => processPhoto(f.buffer)))
  const keys = cleaned.map(() => `items/${itemId}/${crypto.randomUUID()}.webp`)
  const storedKeys = []

  try {
    for (let i = 0; i < keys.length; i++) {
      storedKeys.push(await storage.save(keys[i], cleaned[i]))
    }

    await tx(async (db) => {
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
    })
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
  const params = [req.user.college_id]
  const where = ["i.college_id = $1", "i.status = 'available'"]
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)) }

  if (f.q) {
    // every word must appear in the title or description (case-insensitive); \, % and _ are escaped
    f.q.split(/\s+/).filter(Boolean).slice(0, 5).forEach((word) => {
      params.push(`%${word.replace(/[\\%_]/g, (c) => '\\' + c)}%`)
      const n = params.length
      where.push(`(i.title ILIKE $${n} OR COALESCE(i.description, '') ILIKE $${n})`)
    })
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
  res.json({ items: rows.slice(0, f.limit).map(shape), has_more: rows.length > f.limit })
})

// GET /items/mine   (must be declared before /:id)
router.get('/mine', async (req, res) => {
  const { rows } = await query(`${ITEM_SELECT} WHERE i.seller_id = $1 AND i.status <> 'removed' ORDER BY i.created_at DESC`, [req.user.id])
  res.json({ items: rows.map(shape) })
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
      'SELECT seller_id, status FROM items WHERE id = $1 FOR UPDATE',
      [id]
    )
    if (!item) throw new AppError(404, 'Listing not found')
    if (item.seller_id !== req.user.id) throw new AppError(403, 'Only the seller can update this listing')
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