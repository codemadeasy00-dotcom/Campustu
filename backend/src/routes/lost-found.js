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

// GET /lost-found - Fetch all active lost & found items for the college
router.get('/', requireCollege, async (req, res, next) => {
  try {
    const { status, search, category } = req.query;
    let sql = `
      SELECT lif.*, u.display_name as poster_name,
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
  const cleanedPhotos = await Promise.all(files.map((file) => processPhoto(file.buffer)));
  const keys = cleanedPhotos.map(() => `lost-found/${itemId}/${crypto.randomUUID()}.webp`);
  const storedKeys = [];

  try {
    for (let index = 0; index < keys.length; index++) {
      storedKeys.push(await storage.save(keys[index], cleanedPhotos[index]));
    }

    await tx(async (db) => {
      await db.query(
        `INSERT INTO lost_found_items
         (id, college_id, user_id, title, description, category, status, latitude, longitude, location_name, security_question, security_answer_hash, dropoff_location)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
        ]
      );

      for (let index = 0; index < storedKeys.length; index++) {
        await db.query(
          'INSERT INTO lost_found_photos (item_id, storage_key, position) VALUES ($1, $2, $3)',
          [itemId, storedKeys[index], index]
        );
      }
    });
  } catch (err) {
    await Promise.all(storedKeys.map((key) => storage.remove(key).catch(() => {})));
    throw err;
  }

  res.status(201).json({ success: true, itemId });
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