const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('../config');
const { query, tx } = require('../db');
const { AppError } = require('../utils/errors');
const { requireAuth, requireActive, requireCollege } = require('../middleware/auth');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 120 : 1000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many messaging requests. Please try again later.' },
});

const idSchema = z.uuid();
const createSchema = z.object({
  item_id: z.uuid().optional(),
  lost_found_item_id: z.uuid().optional(),
  claim_id: z.uuid().optional(),
}).strict().refine(
  (value) => Number(Boolean(value.item_id)) + Number(Boolean(value.lost_found_item_id)) + Number(Boolean(value.claim_id)) === 1,
  'Choose one listing, report, or claim to message about.',
);
const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const cursorSchema = z.string().regex(/^\d+$/).optional();

router.use(limiter, requireAuth, requireCollege);

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.item_id, c.lost_found_item_id, c.created_at, c.last_message_at,
            other.id AS other_user_id, other.display_name AS other_user_name,
            COALESCE(i.title, lif.title) AS subject,
            latest.body AS last_message,
            latest.created_at AS last_message_created_at,
            (SELECT count(*)::int
               FROM messages unread
              WHERE unread.conversation_id = c.id
                AND unread.sender_id <> $1
                AND unread.read_at IS NULL) AS unread_count
       FROM conversations c
       JOIN users other ON other.id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
       LEFT JOIN items i ON i.id = c.item_id
       LEFT JOIN lost_found_items lif ON lif.id = c.lost_found_item_id
       LEFT JOIN LATERAL (
         SELECT m.body, m.created_at
           FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.id DESC
          LIMIT 1
       ) latest ON true
      WHERE c.user_a = $1 OR c.user_b = $1
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
    [req.user.id],
  );
  res.json({ conversations: rows });
});

router.post('/', requireActive, async (req, res) => {
  const data = createSchema.parse(req.body);
  const { rows: [conversation] } = await tx(async (db) => {
    let subject;
    let counterpartId;
    let lostFoundItemId = data.lost_found_item_id;
    if (data.item_id) {
      const { rows } = await db.query(
        `SELECT id, seller_id AS owner_id, college_id, title, status
           FROM items
          WHERE id = $1
          FOR SHARE`,
        [data.item_id],
      );
      const item = rows[0];
      if (!item || item.college_id !== req.user.college_id || !['available', 'reserved'].includes(item.status)) {
        throw new AppError(404, 'This listing is not available for messaging.');
      }
      subject = item.title;
      counterpartId = item.owner_id;
    } else if (data.claim_id) {
      const { rows } = await db.query(
        `SELECT c.item_id, c.claimant_id, c.status,
                lif.user_id AS owner_id, lif.college_id, lif.title, lif.lifecycle_status
           FROM item_claims c
           JOIN lost_found_items lif ON lif.id = c.item_id
          WHERE c.id = $1
          FOR SHARE OF c, lif`,
        [data.claim_id],
      );
      const claim = rows[0];
      if (!claim || claim.college_id !== req.user.college_id
          || !['pending', 'approved'].includes(claim.status)
          || !['active', 'claim_pending'].includes(claim.lifecycle_status)) {
        throw new AppError(404, 'This claim is not available for messaging.');
      }
      if (claim.owner_id !== req.user.id && claim.claimant_id !== req.user.id) {
        throw new AppError(404, 'This claim is not available for messaging.');
      }
      subject = claim.title;
      lostFoundItemId = claim.item_id;
      counterpartId = claim.owner_id === req.user.id ? claim.claimant_id : claim.owner_id;
    } else {
      const { rows } = await db.query(
        `SELECT id, user_id AS owner_id, college_id, title, lifecycle_status
           FROM lost_found_items
          WHERE id = $1
          FOR SHARE`,
        [data.lost_found_item_id],
      );
      const item = rows[0];
      if (!item || item.college_id !== req.user.college_id || !['active', 'claim_pending'].includes(item.lifecycle_status)) {
        throw new AppError(404, 'This report is not available for messaging.');
      }
      subject = item.title;
      counterpartId = item.owner_id;
    }

    if (counterpartId === req.user.id) throw new AppError(400, 'You cannot message yourself about your own post.');
    const userA = counterpartId < req.user.id ? counterpartId : req.user.id;
    const userB = counterpartId < req.user.id ? req.user.id : counterpartId;

    const columns = data.item_id ? 'item_id, user_a, user_b' : 'lost_found_item_id, user_a, user_b';
    const contextId = data.item_id || lostFoundItemId;
    const conflictTarget = data.item_id
      ? '(item_id, user_a, user_b) WHERE item_id IS NOT NULL'
      : '(lost_found_item_id, user_a, user_b) WHERE lost_found_item_id IS NOT NULL';
    const { rows: [created] } = await db.query(
      `INSERT INTO conversations (${columns})
       VALUES ($1, $2, $3)
       ON CONFLICT ${conflictTarget}
       DO UPDATE SET last_message_at = conversations.last_message_at
       RETURNING id, item_id, lost_found_item_id, created_at, last_message_at`,
      [contextId, userA, userB],
    );
    return { rows: [{ ...created, subject }] };
  });
  res.status(201).json({ conversation });
});

router.get('/:id/messages', async (req, res) => {
  const conversationId = idSchema.parse(req.params.id);
  const after = cursorSchema.parse(req.query.after);
  const { rows: [conversation] } = await query(
    'SELECT id FROM conversations WHERE id = $1 AND (user_a = $2 OR user_b = $2)',
    [conversationId, req.user.id],
  );
  if (!conversation) throw new AppError(404, 'Conversation not found.');

  const params = [conversationId];
  const cursorClause = after ? `AND m.id > $${params.push(after)}` : '';
  if (!after) {
    const { rows } = await query(
      `SELECT m.id, m.sender_id, m.body, m.created_at
         FROM messages m
        WHERE m.conversation_id = $1
        ORDER BY m.id DESC
        LIMIT 50`,
      params,
    );
    rows.reverse();
    await query(
      `UPDATE messages SET read_at = now()
        WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL`,
      [conversationId, req.user.id],
    );
    return res.json({ messages: rows });
  }

  const { rows } = await query(
    `SELECT m.id, m.sender_id, m.body, m.created_at
       FROM messages m
      WHERE m.conversation_id = $1 ${cursorClause}
      ORDER BY m.id ASC
      LIMIT 100`,
    params,
  );
  if (rows.length) {
    await query(
      `UPDATE messages SET read_at = now()
        WHERE id = ANY($1::bigint[]) AND sender_id <> $2 AND read_at IS NULL`,
      [rows.map((message) => message.id), req.user.id],
    );
  }
  res.json({ messages: rows });
});

router.post('/:id/messages', requireActive, async (req, res) => {
  const conversationId = idSchema.parse(req.params.id);
  const { body } = messageSchema.parse(req.body);
  const { rows: [message] } = await tx(async (db) => {
    const { rows: [conversation] } = await db.query(
      'SELECT id FROM conversations WHERE id = $1 AND (user_a = $2 OR user_b = $2) FOR UPDATE',
      [conversationId, req.user.id],
    );
    if (!conversation) throw new AppError(404, 'Conversation not found.');

    const { rows: [created] } = await db.query(
      `INSERT INTO messages (conversation_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, sender_id, body, created_at`,
      [conversationId, req.user.id, body],
    );
    await db.query('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conversationId]);
    return { rows: [created] };
  });
  res.status(201).json({ message });
});

module.exports = router;
