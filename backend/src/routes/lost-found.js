const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const { z } = require('zod');
const config = require('../config');
const { query, tx } = require('../db');
const storage = require('../storage');
const { AppError } = require('../utils/errors');
const { processPhoto } = require('../utils/images');
const { requireAuth, requireActive, requireCollege } = require('../middleware/auth');

router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxPhotoBytes, files: config.maxPhotosPerItem },
});

const createItemSchema = z.object({
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().min(5),
  category: z.string().trim().min(1).max(100),
  status: z.enum(['lost', 'found']),
  embedding: z.preprocess((value) => {
    if (value === '' || value === undefined) return undefined;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }, z.array(z.number().finite().min(-1).max(1)).length(512).optional()),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  location_name: z.string().min(2),
  security_question: z.string().optional(),
  security_answer: z.string().optional(),
  dropoff_location: z.string().optional(),
});

const claimSchema = z.object({
  answer_attempt: z.string().min(1),
});

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
  radius: z.coerce.number().int().min(1).max(50000).default(1000),
  status: z.enum(['lost', 'found']).optional(),
  search: z.string().trim().max(120).optional(),
});

// GET /lost-found/nearby - Search located posts for this college by spherical distance.
router.get('/nearby', requireCollege, async (req, res, next) => {
  try {
    const filters = nearbyQuerySchema.parse(req.query);
    const params = [filters.lat, filters.lng, req.user.college_id, filters.radius];
    const conditions = [
      'lif.college_id = $3',
      'lif.latitude IS NOT NULL',
      'lif.longitude IS NOT NULL',
    ];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`lif.status = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`(lif.title ILIKE $${params.length} OR lif.description ILIKE $${params.length})`);
    }

    const { rows } = await query(
      `WITH located AS (
         SELECT lif.id, lif.user_id, lif.title, lif.description, lif.category, lif.status,
                lif.latitude, lif.longitude, lif.location_name, lif.created_at,
                u.display_name AS poster_name,
                (SELECT storage_key FROM lost_found_photos
                  WHERE item_id = lif.id ORDER BY position LIMIT 1) AS photo_key,
                2 * 6371000 * ASIN(SQRT(LEAST(1.0,
                  POWER(SIN(RADIANS((lif.latitude::double precision - $1::double precision) / 2)), 2)
                  + COS(RADIANS($1::double precision))
                  * COS(RADIANS(lif.latitude::double precision))
                  * POWER(SIN(RADIANS((lif.longitude::double precision - $2::double precision) / 2)), 2)
                ))) AS distance_meters
           FROM lost_found_items lif
           JOIN users u ON u.id = lif.user_id
          WHERE ${conditions.join(' AND ')}
       )
       SELECT id, title, description, category, status, latitude, longitude,
              location_name, created_at, poster_name, photo_key, distance_meters
         FROM located
        WHERE distance_meters <= $4
        ORDER BY distance_meters ASC
        LIMIT 201`,
      params,
    );
    const hasMore = rows.length > 200;
    const items = rows.slice(0, 200).map(({ photo_key, distance_meters, ...row }) => ({
      ...row,
      photo: photo_key ? storage.urlFor(photo_key) : null,
      distance_meters: Math.round(Number(distance_meters)),
    }));

    res.json({
      success: true,
      count: items.length,
      has_more: hasMore,
      radius_meters: filters.radius,
      items,
    });
  } catch (err) {
    next(err);
  }
});

// GET /lost-found - Fetch all active lost & found items for the college
router.get('/', requireCollege, async (req, res, next) => {
  try {
    const { status, search, category } = req.query;
    let sql = `
      SELECT lif.id, lif.college_id, lif.user_id, lif.title, lif.description, lif.category,
             lif.status, lif.latitude, lif.longitude, lif.location_name, lif.security_question,
             lif.dropoff_location, lif.created_at, lif.updated_at, u.display_name as poster_name,
             (SELECT storage_key FROM lost_found_photos WHERE item_id = lif.id ORDER BY position LIMIT 1) as photo_key
      FROM lost_found_items lif
      JOIN users u ON u.id = lif.user_id
      WHERE lif.college_id = $1
    `;
    const params = [req.user.college_id];
    let pIdx = 2;

    if (status && status !== 'all') {
      sql += ` AND lif.status = $${pIdx}`;
      params.push(status);
      pIdx++;
    }
    if (search) {
      sql += ` AND (lif.title ILIKE $${pIdx} OR lif.description ILIKE $${pIdx})`;
      params.push(`%${search}%`);
      pIdx++;
    }
    if (category && category !== 'All') {
      sql += ` AND lif.category = $${pIdx}`;
      params.push(category);
      pIdx++;
    }

    sql += ` ORDER BY lif.created_at DESC`;
    const { rows } = await query(sql, params);

    res.json({
      success: true,
      items: rows.map(r => ({
        ...r,
        photo: r.photo_key ? storage.urlFor(r.photo_key) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /lost-found - Create a new lost or found listing
router.post('/', requireActive, requireCollege, upload.array('photos', config.maxPhotosPerItem), async (req, res) => {
  const data = createItemSchema.parse(req.body);
  const itemId = crypto.randomUUID();
  const files = req.files || [];
  const embedding = data.embedding ?? null;
  if (embedding && files.length === 0) {
    throw new AppError(400, 'An image is required when submitting a visual embedding.');
  }
  if (embedding && Math.hypot(...embedding) === 0) {
    throw new AppError(400, 'The image embedding must not be empty.');
  }
  const vectorString = embedding ? `[${embedding.join(',')}]` : null;
  const cleanedPhotos = await Promise.all(files.map((file) => processPhoto(file.buffer)));
  const keys = cleanedPhotos.map(() => `lost-found/${itemId}/${crypto.randomUUID()}.webp`);
  const storedKeys = [];
  let matches = [];

  try {
    for (let index = 0; index < keys.length; index++) {
      storedKeys.push(await storage.save(keys[index], cleanedPhotos[index]));
    }

    matches = await tx(async (db) => {
      await db.query(
        `INSERT INTO lost_found_items
         (id, college_id, user_id, title, description, category, status, latitude, longitude, location_name, security_question, security_answer_hash, dropoff_location, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::vector)`,
        [
          itemId,
          req.user.college_id,
          req.user.id,
          data.title,
          data.description,
          data.category,
          data.status,
          data.latitude ?? null,
          data.longitude ?? null,
          data.location_name,
          data.security_question || null,
          data.security_answer ? data.security_answer.toLowerCase().trim() : null,
          data.dropoff_location || null,
          vectorString,
        ]
      );

      for (let index = 0; index < storedKeys.length; index++) {
        await db.query(
          'INSERT INTO lost_found_photos (item_id, storage_key, position) VALUES ($1, $2, $3)',
          [itemId, storedKeys[index], index]
        );
      }

      if (!vectorString) return [];

      const targetStatus = data.status === 'lost' ? 'found' : 'lost';
      const { rows } = await db.query(
        `SELECT lif.id, lif.title, lif.description, lif.category, lif.status,
                lif.location_name, lif.security_question, lif.created_at,
                (SELECT storage_key FROM lost_found_photos WHERE item_id = lif.id ORDER BY position LIMIT 1) AS photo_key,
                1 - (lif.embedding <=> $1::vector) AS similarity_score
           FROM lost_found_items lif
          WHERE lif.college_id = $2
            AND lif.status = $3
            AND lif.user_id <> $4
            AND lif.embedding IS NOT NULL
          ORDER BY lif.embedding <=> $1::vector
          LIMIT 5`,
        [vectorString, req.user.college_id, targetStatus, req.user.id]
      );
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        category: row.category,
        status: row.status,
        location_name: row.location_name,
        security_question: row.security_question,
        created_at: row.created_at,
        photo: row.photo_key ? storage.urlFor(row.photo_key) : null,
        similarity_score: Number(row.similarity_score),
      }));
    });
  } catch (err) {
    await Promise.all(storedKeys.map((key) => storage.remove(key).catch(() => {})));
    throw err;
  }

  res.status(201).json({ success: true, itemId, potential_matches: matches });
});

// POST /lost-found/:id/claim - Submit proof-of-ownership claim (Option 3A / 3B)
router.post('/:id/claim', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { answer_attempt } = claimSchema.parse(req.body);

    // Fetch item security answer
    const itemRes = await query(`SELECT * FROM lost_found_items WHERE id = $1`, [id]);
    if (!itemRes.rows.length) throw new AppError(404, 'Item not found');
    const item = itemRes.rows[0];

    if (item.user_id === req.user.id) {
      throw new AppError(400, 'You cannot claim your own listed item.');
    }

    // Verify answer if security question exists
    let isCorrect = true;
    if (item.security_answer_hash) {
      isCorrect = item.security_answer_hash === answer_attempt.toLowerCase().trim();
    }

    const handoverCode = isCorrect ? `PASS-${Math.floor(100000 + Math.random() * 900000)}` : null;
    const claimStatus = isCorrect ? 'approved' : 'rejected';

    const { rows } = await query(
      `INSERT INTO item_claims (item_id, claimant_id, answer_attempt, status, handover_pass_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, status, handover_pass_code`,
      [id, req.user.id, answer_attempt, claimStatus, handoverCode]
    );

    res.json({
      success: true,
      claim: rows[0],
      message: isCorrect 
        ? 'Claim verified successfully! Handover pass generated for campus security drop-off.' 
        : 'Incorrect security answer. Claim rejected.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;