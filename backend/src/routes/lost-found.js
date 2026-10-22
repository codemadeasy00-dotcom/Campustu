const router = require('express').Router();
const { z } = require('zod');
const { query, tx } = require('../db');
const storage = require('../storage');
const { AppError } = require('../utils/errors');
const { requireAuth, requireCollege } = require('../middleware/auth');

router.use(requireAuth);

const createItemSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().min(5),
  category: z.string(),
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
      SELECT lif.*, u.name as poster_name,
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
router.post('/', requireCollege, async (req, res, next) => {
  try {
    const data = createItemSchema.parse(req.body);

    const { rows } = await query(
      `INSERT INTO lost_found_items 
       (college_id, user_id, title, description, category, status, latitude, longitude, location_name, security_question, security_answer_hash, dropoff_location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        req.user.college_id,
        req.user.id,
        data.title,
        data.description,
        data.category,
        data.status,
        data.latitude || null,
        data.longitude || null,
        data.location_name,
        data.security_question || null,
        data.security_answer ? data.security_answer.toLowerCase().trim() : null, // Simple storage or hash
        data.dropoff_location || null,
      ]
    );

    res.status(201).json({ success: true, itemId: rows[0].id });
  } catch (err) {
    next(err);
  }
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