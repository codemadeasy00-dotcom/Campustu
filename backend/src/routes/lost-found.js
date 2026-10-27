const router = require('express').Router();
const multer = require('multer');
const crypto = require('crypto');
const { z } = require('zod');
const config = require('../config');
const { query, tx } = require('../db');
const storage = require('../storage');
const { AppError } = require('../utils/errors');
const { processPhoto } = require('../utils/images');
const { enqueueCleanup, processQueuedMediaCleanup } = require('../utils/lost-found-media-cleanup');
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
  brand: z.preprocess((value) => value === '' ? undefined : value, z.string().trim().max(100).optional()),
  colour: z.preprocess((value) => value === '' ? undefined : value, z.string().trim().max(100).optional()),
  occurred_at: z.preprocess((value) => value === '' ? undefined : value, z.coerce.date().optional()),
  radius_meters: z.coerce.number().int().min(0).max(5000).default(0),
  where_is_it: z.preprocess((value) => value === '' ? undefined : value, z.enum(['with_me', 'security_desk', 'left_at_spot']).optional()),
  location_note: z.preprocess((value) => value === '' ? undefined : value, z.string().trim().max(255).optional()),
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
  claim_text: z.string().trim().min(5).max(2000),
});

const reviewClaimSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

const lifecycleSchema = z.object({
  action: z.enum(['close', 'resolve']),
});

const updateItemSchema = z.object({
  title: z.string().trim().min(3).max(255).optional(),
  description: z.string().trim().min(5).max(2000).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  brand: z.preprocess((value) => value === '' ? null : value, z.string().trim().max(100).nullable()).optional(),
  colour: z.preprocess((value) => value === '' ? null : value, z.string().trim().max(100).nullable()).optional(),
  occurred_at: z.preprocess((value) => value === '' ? null : value, z.coerce.date().nullable()).optional(),
  radius_meters: z.coerce.number().int().min(0).max(5000).optional(),
  latitude: z.coerce.number().finite().min(-90).max(90).optional(),
  longitude: z.coerce.number().finite().min(-180).max(180).optional(),
  location_name: z.string().trim().min(2).max(255).optional(),
  location_note: z.preprocess((value) => value === '' ? null : value, z.string().trim().max(255).nullable()).optional(),
}).strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be updated.')
  .refine((value) => ('latitude' in value) === ('longitude' in value), {
    message: 'Latitude and longitude must be updated together.',
  });

const itemIdSchema = z.string().uuid();

const updateColumns = {
  title: 'title',
  description: 'description',
  category: 'category',
  brand: 'brand',
  colour: 'colour',
  occurred_at: 'occurred_at',
  radius_meters: 'radius_meters',
  latitude: 'latitude',
  longitude: 'longitude',
  location_name: 'location_name',
  location_note: 'location_note',
};

const DELETE_WINDOW_MS = 8 * 60 * 60 * 1000;

function assertItemOwnerOrAdmin(item, user) {
  if (item.user_id !== user.id && user.role !== 'admin') {
    throw new AppError(403, 'Only the post owner can manage this report.');
  }
}

function assertItemOwner(item, user) {
  if (item.user_id !== user.id) {
    throw new AppError(403, 'Only the post owner can manage claims for this report.');
  }
}

async function cleanupAfterChange() {
  try {
    return (await processQueuedMediaCleanup()) > 0;
  } catch (error) {
    console.error('Lost-and-found media cleanup remains queued:', error);
    return true;
  }
}

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
  radius: z.coerce.number().int().min(1).max(50000).default(1000),
  status: z.enum(['lost', 'found']).optional(),
  search: z.string().trim().max(120).optional(),
});

// GET /lost-found/mine - The signed-in poster's full report history and claim counts.
router.get('/mine', requireCollege, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT lif.id, lif.user_id, lif.title, lif.description, lif.category, lif.status,
              lif.lifecycle_status, lif.brand, lif.colour, lif.occurred_at, lif.radius_meters,
              lif.where_is_it, lif.location_note, lif.latitude, lif.longitude, lif.location_name,
              lif.security_question, lif.dropoff_location, lif.created_at, lif.updated_at,
              (SELECT storage_key FROM lost_found_photos
                WHERE item_id = lif.id ORDER BY position LIMIT 1) AS photo_key,
              (SELECT count(*)::int FROM item_claims WHERE item_id = lif.id) AS claim_count,
              (SELECT count(*)::int FROM item_claims
                WHERE item_id = lif.id AND status = 'pending') AS pending_claim_count
         FROM lost_found_items lif
        WHERE lif.user_id = $1 AND lif.college_id = $2
        ORDER BY lif.created_at DESC`,
      [req.user.id, req.user.college_id],
    );
    res.json({
      success: true,
      items: rows.map(({ photo_key, ...item }) => ({
        ...item,
        photo: photo_key ? storage.urlFor(photo_key) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /lost-found/my-claims - Only the claimant can retrieve their handover code.
router.get('/my-claims', requireCollege, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.id, c.item_id, c.status, c.created_at, c.reviewed_at,
              CASE WHEN c.status = 'approved' THEN c.handover_code ELSE NULL END AS handover_code,
              lif.title, lif.status AS item_status, lif.lifecycle_status, lif.location_name
         FROM item_claims c
         JOIN lost_found_items lif ON lif.id = c.item_id
        WHERE c.claimant_id = $1 AND lif.college_id = $2
        ORDER BY c.created_at DESC`,
      [req.user.id, req.user.college_id],
    );
    res.json({ success: true, claims: rows });
  } catch (err) {
    next(err);
  }
});

// GET /lost-found/nearby - Search located posts for this college by spherical distance.
router.get('/nearby', requireCollege, async (req, res, next) => {
  try {
    const filters = nearbyQuerySchema.parse(req.query);
    const params = [filters.lat, filters.lng, req.user.college_id, filters.radius];
    const conditions = [
      'lif.college_id = $3',
      "lif.lifecycle_status = 'active'",
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
         SELECT lif.id, lif.user_id, lif.title, lif.description, lif.category, lif.status, lif.lifecycle_status,
                lif.brand, lif.colour, lif.occurred_at, lif.radius_meters, lif.where_is_it, lif.location_note,
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
       SELECT id, title, description, category, status, lifecycle_status, latitude, longitude,
              brand, colour, occurred_at, radius_meters, where_is_it, location_note,
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
             lif.brand, lif.colour, lif.occurred_at, lif.radius_meters, lif.where_is_it, lif.location_note,
             lif.status, lif.lifecycle_status, lif.latitude, lif.longitude, lif.location_name, lif.security_question,
             lif.dropoff_location, lif.created_at, lif.updated_at, u.display_name as poster_name,
             (SELECT storage_key FROM lost_found_photos WHERE item_id = lif.id ORDER BY position LIMIT 1) as photo_key
      FROM lost_found_items lif
      JOIN users u ON u.id = lif.user_id
      WHERE lif.college_id = $1 AND lif.lifecycle_status = 'active'
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

// PATCH /lost-found/:id - Owners may correct report details regardless of lifecycle state.
router.patch('/:id', requireActive, async (req, res, next) => {
  try {
    const itemId = itemIdSchema.parse(req.params.id);
    const updates = updateItemSchema.parse(req.body);
    const columns = Object.keys(updates);

    await tx(async (db) => {
      const { rows } = await db.query(
        'SELECT id, user_id FROM lost_found_items WHERE id = $1 FOR UPDATE',
        [itemId],
      );
      const item = rows[0];
      if (!item) throw new AppError(404, 'Lost-and-found post not found.');
      assertItemOwner(item, req.user);

      const assignments = columns.map((field, index) => `${updateColumns[field]} = $${index + 2}`);
      await db.query(
        `UPDATE lost_found_items
            SET ${assignments.join(', ')}, updated_at = now()
          WHERE id = $1`,
        [itemId, ...columns.map((field) => updates[field])],
      );
    });

    res.json({ success: true, message: 'Report updated.' });
  } catch (err) {
    next(err);
  }
});

// PATCH /lost-found/:id/lifecycle - Close or resolve a report and queue its photos for cleanup.
router.patch('/:id/lifecycle', requireActive, async (req, res, next) => {
  try {
    const itemId = itemIdSchema.parse(req.params.id);
    const { action } = lifecycleSchema.parse(req.body);
    let lifecycleStatus;
    await tx(async (db) => {
      const { rows } = await db.query(
        'SELECT id, user_id, lifecycle_status FROM lost_found_items WHERE id = $1 FOR UPDATE',
        [itemId],
      );
      const item = rows[0];
      if (!item) throw new AppError(404, 'Lost-and-found post not found.');
      assertItemOwnerOrAdmin(item, req.user);
      lifecycleStatus = item.lifecycle_status === 'resolved' || action === 'resolve'
        ? 'resolved'
        : 'closed';

      const { rows: photos } = await db.query(
        'SELECT storage_key FROM lost_found_photos WHERE item_id = $1',
        [itemId],
      );
      await enqueueCleanup(db, photos.map((photo) => photo.storage_key));
      await db.query('DELETE FROM lost_found_photos WHERE item_id = $1', [itemId]);
      await db.query(
        `UPDATE item_claims
            SET status = 'rejected', reviewed_at = now()
          WHERE item_id = $1 AND status = 'pending'`,
        [itemId],
      );
      await db.query(
        `UPDATE lost_found_items
            SET lifecycle_status = $2,
                status = CASE WHEN $2 = 'resolved' THEN 'returned'::item_status ELSE status END,
                updated_at = now()
          WHERE id = $1`,
        [itemId, lifecycleStatus],
      );
    });
    const mediaCleanupPending = await cleanupAfterChange();
    res.json({
      success: true,
      lifecycle_status: lifecycleStatus,
      media_cleanup_pending: mediaCleanupPending,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /lost-found/:id - Owners may delete within eight hours only if nobody has claimed it.
// Admins can purge any report immediately.
router.delete('/:id', requireActive, async (req, res, next) => {
  try {
    const itemId = itemIdSchema.parse(req.params.id);
    await tx(async (db) => {
      const { rows } = await db.query(
        'SELECT id, user_id, created_at FROM lost_found_items WHERE id = $1 FOR UPDATE',
        [itemId],
      );
      const item = rows[0];
      if (!item) throw new AppError(404, 'Lost-and-found post not found.');
      assertItemOwnerOrAdmin(item, req.user);

      if (req.user.role !== 'admin') {
        const { rows: [claimCheck] } = await db.query(
          'SELECT EXISTS (SELECT 1 FROM item_claims WHERE item_id = $1) AS has_claims',
          [itemId],
        );
        const ageMs = Date.now() - new Date(item.created_at).getTime();
        if (ageMs >= DELETE_WINDOW_MS || claimCheck.has_claims) {
          throw new AppError(409, 'This report can no longer be deleted. Close it or mark it returned instead.');
        }
      }

      const { rows: photos } = await db.query(
        'SELECT storage_key FROM lost_found_photos WHERE item_id = $1',
        [itemId],
      );
      await enqueueCleanup(db, photos.map((photo) => photo.storage_key));
      await db.query('DELETE FROM lost_found_items WHERE id = $1', [itemId]);
    });
    const mediaCleanupPending = await cleanupAfterChange();
    res.json({ success: true, media_cleanup_pending: mediaCleanupPending });
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
         (id, college_id, user_id, title, description, category, status, latitude, longitude, location_name,
          security_question, security_answer_hash, dropoff_location, embedding, brand, colour, occurred_at,
          radius_meters, where_is_it, location_note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::vector, $15, $16, $17, $18, $19, $20)`,
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
          data.brand || null,
          data.colour || null,
          data.occurred_at ?? null,
          data.radius_meters,
          data.status === 'found' ? data.where_is_it ?? null : null,
          data.location_note || null,
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
            AND lif.lifecycle_status = 'active'
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

// GET /lost-found/:id/claims - Only the report owner can inspect submitted proof.
router.get('/:id/claims', requireCollege, async (req, res, next) => {
  try {
    const itemId = itemIdSchema.parse(req.params.id);
    const { rows: [item] } = await query(
      'SELECT id, user_id FROM lost_found_items WHERE id = $1 AND college_id = $2',
      [itemId, req.user.college_id],
    );
    if (!item) throw new AppError(404, 'Lost-and-found post not found.');
    assertItemOwner(item, req.user);

    const { rows: claims } = await query(
      `SELECT c.id, c.claimant_id, c.claim_text, c.status, c.created_at, c.reviewed_at,
              u.display_name AS claimant_name
         FROM item_claims c
         JOIN users u ON u.id = c.claimant_id
        WHERE c.item_id = $1
        ORDER BY CASE WHEN c.status = 'pending' THEN 0 ELSE 1 END, c.created_at DESC`,
      [itemId],
    );
    res.json({ success: true, claims });
  } catch (err) {
    next(err);
  }
});

// PATCH /lost-found/:id/claims/:claimId - Owner approval generates a private handover code.
router.patch('/:id/claims/:claimId', requireActive, requireCollege, async (req, res, next) => {
  try {
    const itemId = itemIdSchema.parse(req.params.id);
    const claimId = itemIdSchema.parse(req.params.claimId);
    const { action } = reviewClaimSchema.parse(req.body);

    await tx(async (db) => {
      const { rows: [item] } = await db.query(
        'SELECT id, user_id, lifecycle_status FROM lost_found_items WHERE id = $1 AND college_id = $2 FOR UPDATE',
        [itemId, req.user.college_id],
      );
      if (!item) throw new AppError(404, 'Lost-and-found post not found.');
      assertItemOwner(item, req.user);

      const { rows: [claim] } = await db.query(
        'SELECT id, status FROM item_claims WHERE id = $1 AND item_id = $2 FOR UPDATE',
        [claimId, itemId],
      );
      if (!claim) throw new AppError(404, 'Claim not found.');
      if (claim.status !== 'pending') throw new AppError(409, 'This claim has already been reviewed.');

      if (action === 'approve') {
        if (item.lifecycle_status !== 'active') {
          throw new AppError(409, 'This report is no longer active and cannot accept an approval.');
        }
        const handoverCode = String(crypto.randomInt(100000, 1000000));
        await db.query(
          `UPDATE item_claims
              SET status = 'approved', handover_code = $2, reviewed_at = now()
            WHERE id = $1`,
          [claimId, handoverCode],
        );
        await db.query(
          `UPDATE item_claims
              SET status = 'rejected', reviewed_at = now()
            WHERE item_id = $1 AND id <> $2 AND status = 'pending'`,
          [itemId, claimId],
        );
        await db.query(
          `UPDATE lost_found_items
              SET status = 'claimed', lifecycle_status = 'claim_pending', updated_at = now()
            WHERE id = $1`,
          [itemId],
        );
      } else {
        await db.query(
          `UPDATE item_claims SET status = 'rejected', reviewed_at = now() WHERE id = $1`,
          [claimId],
        );
      }
    });

    res.json({
      success: true,
      claim_status: action === 'approve' ? 'approved' : 'rejected',
      message: action === 'approve'
        ? 'Claim approved. The claimant can now view their handover code.'
        : 'Claim rejected.',
    });
  } catch (err) {
    next(err);
  }
});

// POST /lost-found/:id/claim - Submit a verification answer or proof for owner review.
router.post('/:id/claim', requireActive, requireCollege, async (req, res, next) => {
  try {
    const itemId = itemIdSchema.parse(req.params.id);
    const { claim_text: claimText } = claimSchema.parse(req.body);
    const { rows: [claim] } = await tx(async (db) => {
      const { rows: [item] } = await db.query(
        `SELECT id, user_id, lifecycle_status
           FROM lost_found_items
          WHERE id = $1 AND college_id = $2
          FOR UPDATE`,
        [itemId, req.user.college_id],
      );
      if (!item) throw new AppError(404, 'Lost-and-found post not found.');
      if (item.user_id === req.user.id) throw new AppError(400, 'You cannot claim your own report.');
      if (item.lifecycle_status !== 'active') throw new AppError(409, 'This report is no longer accepting claims.');

      const { rows: pendingClaims } = await db.query(
        `SELECT id FROM item_claims
          WHERE item_id = $1 AND claimant_id = $2 AND status = 'pending'`,
        [itemId, req.user.id],
      );
      if (pendingClaims.length) throw new AppError(409, 'You already have a pending claim for this report.');

      return db.query(
        `INSERT INTO item_claims (item_id, claimant_id, claim_text, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id, status, created_at`,
        [itemId, req.user.id, claimText],
      );
    });

    res.status(201).json({
      success: true,
      claim,
      message: 'Your verification request was sent to the report owner for review.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;