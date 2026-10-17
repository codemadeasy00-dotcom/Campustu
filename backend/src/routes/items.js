const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const { z } = require('zod');
const config = require('../config');
const { query, tx } = require('../db');
const storage = require('../storage');
const { processPhoto } = require('../utils/images');
const { AppError } = require('../utils/errors');
const { requireAuth, requireActive } = require('../middleware/auth');

router.use(requireAuth);

// Photos are held in memory only long enough to be checked, cleaned and saved.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxPhotoBytes, files: config.maxPhotosPerItem },
});

// multipart forms send everything as text, and empty optional fields as ''.
const blankToUndefined = (v) => (v === '' || v === null ? undefined : v);
const optInt = (min, max) => z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).optional());

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
    preferred_spot_id: optInt(1, 32767),
  })
  .refine((d) => d.category_id || d.item_type_id, { message: 'Send category_id or item_type_id', path: ['category_id'] });

const idParam = z.object({ id: z.uuid() });

async function loadItem(id, viewer) {
  const { rows } = await query(
    `SELECT i.id, i.seller_id, i.category_id, i.item_type_id, i.title, i.description, i.condition,
            i.price, i.status, i.branch_id, i.semester, i.preferred_spot_id, i.created_at,
            u.display_name AS seller_name, t.trust_score::int AS trust_score, t.is_trusted
       FROM items i
       JOIN users u ON u.id = i.seller_id
       JOIN user_trust t ON t.user_id = i.seller_id
      WHERE i.id = $1`,
    [id]
  );
  const row = rows[0];
  // Removed listings are invisible to everyone except the owner and admins.
  if (!row || (row.status === 'removed' && viewer.id !== row.seller_id && viewer.role !== 'admin')) return null;

  const photos = await query('SELECT storage_key FROM item_photos WHERE item_id = $1 ORDER BY position', [id]);
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
    preferred_spot_id: row.preferred_spot_id,
    created_at: row.created_at,
    photos: photos.rows.map((p) => storage.urlFor(p.storage_key)),
    seller: { id: row.seller_id, display_name: row.seller_name, trust_score: row.trust_score, is_trusted: row.is_trusted },
  };
}

// POST /items  (multipart/form-data: fields + up to 5 files in "photos")
router.post('/', requireActive, upload.array('photos', config.maxPhotosPerItem), async (req, res) => {
  const data = createSchema.parse(req.body);
  const files = req.files || [];
  if (files.length < 1) throw new AppError(400, 'Add at least one photo');

  // --- trust limits: new users can list, but only cheaper items and a few at a time
  const { rows: [trust] } = await query('SELECT is_trusted FROM user_trust WHERE user_id = $1', [req.user.id]);
  if (!trust.is_trusted) {
    if (data.price > config.newUserMaxPrice) {
      throw new AppError(403, `New accounts can list items up to Rs ${config.newUserMaxPrice}. Complete handovers to become trusted`, 'TRUST_PRICE_LIMIT');
    }
    const { rows: [c] } = await query(
      `SELECT count(*)::int AS n FROM items WHERE seller_id = $1 AND status IN ('available', 'reserved')`,
      [req.user.id]
    );
    if (c.n >= config.newUserMaxActiveListings) {
      throw new AppError(403, `New accounts can have ${config.newUserMaxActiveListings} active listings at a time`, 'TRUST_LISTING_LIMIT');
    }
  }

  // --- resolve category: an item type decides the category
  let categoryId = data.category_id;
  if (data.item_type_id) {
    const { rows } = await query('SELECT category_id FROM item_types WHERE id = $1', [data.item_type_id]);
    if (!rows[0]) throw new AppError(400, 'Unknown item_type_id');
    categoryId = rows[0].category_id;
  } else {
    const { rows } = await query('SELECT scope FROM categories WHERE id = $1', [categoryId]);
    if (!rows[0] || rows[0].scope === 'lost_found') throw new AppError(400, 'Unknown or unsuitable category_id');
  }
  if (data.preferred_spot_id) {
    const { rows } = await query('SELECT 1 FROM campus_spots WHERE id = $1 AND safe_for_handover', [data.preferred_spot_id]);
    if (!rows[0]) throw new AppError(400, 'preferred_spot_id is not a valid handover spot');
  }

  // --- clean photos, save them, then write the DB rows in one transaction
  const itemId = crypto.randomUUID();
  const cleaned = await Promise.all(files.map((f) => processPhoto(f.buffer)));
  const keys = cleaned.map(() => `items/${itemId}/${crypto.randomUUID()}.webp`);
  await Promise.all(cleaned.map((buf, i) => storage.save(keys[i], buf)));

  try {
    await tx(async (db) => {
      await db.query(
        `INSERT INTO items (id, seller_id, category_id, item_type_id, title, description, condition,
                            price, branch_id, semester, preferred_spot_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [itemId, req.user.id, categoryId, data.item_type_id ?? null, data.title, data.description ?? null,
         data.condition, data.price.toFixed(2), data.branch_id ?? null, data.semester ?? null,
         data.preferred_spot_id ?? null]
      );
      for (let i = 0; i < keys.length; i++) {
        await db.query('INSERT INTO item_photos (item_id, storage_key, position) VALUES ($1, $2, $3)', [itemId, keys[i], i]);
      }
    });
  } catch (err) {
    await Promise.all(keys.map((k) => storage.remove(k).catch(() => {}))); // no orphan files
    throw err;
  }

  res.status(201).json({ item: await loadItem(itemId, req.user) });
});

// GET /items/mine   (must be declared before /:id)
router.get('/mine', async (req, res) => {
  const { rows } = await query(
    `SELECT id FROM items WHERE seller_id = $1 AND status <> 'removed' ORDER BY created_at DESC`,
    [req.user.id]
  );
  const items = await Promise.all(rows.map((r) => loadItem(r.id, req.user)));
  res.json({ items });
});

// GET /items/:id
router.get('/:id', async (req, res) => {
  const { id } = idParam.parse(req.params);
  const item = await loadItem(id, req.user);
  if (!item) throw new AppError(404, 'Listing not found');
  res.json({ item });
});

module.exports = router;
