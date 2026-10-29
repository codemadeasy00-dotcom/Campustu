// backend/routes/me-college.js   (CommonJS)
// Mount:  app.use('/api/me/college', require('./routes/me-college'));
// Assumes:
//   ../db                   exports a pg Pool
//   ../middleware/requireAuth  verifies the login and sets req.user.id  (adapt to your passwordless auth)
//   tables users, items, reservations, and lost_found_items as in schema.sql.
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const COOLDOWN_DAYS = Number(process.env.COLLEGE_CHANGE_COOLDOWN_DAYS) || 7;

class HttpError extends Error {
  constructor(status, body) { super(body.error); this.status = status; this.body = body; }
}

// Anything that ties the user to their current campus. A change is refused while any of these exist.
async function activityCounts(client, userId) {
  const { rows } = await client.query(
    `SELECT
       (SELECT count(*) FROM items WHERE seller_id = $1 AND status IN ('available','reserved'))::int AS listings,
       (SELECT count(*) FROM reservations
         WHERE (buyer_id = $1 OR seller_id = $1)
           AND status = 'requested' AND expires_at > now())::int AS reservations,
       (SELECT count(*) FROM reservations
         WHERE (buyer_id = $1 OR seller_id = $1)
           AND status IN ('accepted', 'disputed'))::int AS handovers,
       (SELECT count(*) FROM lost_found_items
         WHERE user_id = $1 AND lifecycle_status IN ('active', 'claim_pending'))::int AS lost_found_posts`,
    [userId]
  );
  return rows[0];
}

const STATE_SQL = `
  SELECT u.college_id, u.college_verified, u.college_changed_at,
         c.name, c.city, c.state,
         (u.college_changed_at IS NULL
            OR u.college_changed_at <= now() - make_interval(days => $2)) AS cooldown_over,
         u.college_changed_at + make_interval(days => $2)                 AS next_change_at
    FROM users u
    LEFT JOIN colleges c ON c.id = u.college_id
   WHERE u.id = $1`;

function shape(r) {
  return {
    college: r.college_id ? { id: r.college_id, name: r.name, city: r.city, state: r.state } : null,
    verified_by_email: r.college_verified,
    can_change_now: r.cooldown_over,
    next_change_at: r.cooldown_over ? null : r.next_change_at,
    cooldown_days: COOLDOWN_DAYS,
  };
}

// GET /api/me/college
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(STATE_SQL, [req.user.id, COOLDOWN_DAYS]);
    if (!rows.length) return res.status(404).json({ error: 'user_not_found' });
    res.json(shape(rows[0]));
  } catch (err) {
    console.error('get college failed', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// PUT /api/me/college   body: { "college_id": 4 }
router.put('/', async (req, res) => {
  const collegeId = Number(req.body && req.body.college_id);
  if (!Number.isInteger(collegeId) || collegeId <= 0) {
    return res.status(400).json({ error: 'invalid_college_id' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock this user's row so two quick taps (or two tabs) cannot both pass the cooldown check.
    const cur = await client.query(`${STATE_SQL} FOR UPDATE OF u`, [req.user.id, COOLDOWN_DAYS]);
    if (!cur.rows.length) throw new HttpError(404, { error: 'user_not_found' });
    const state = cur.rows[0];

    if (state.college_id === collegeId) throw new HttpError(400, { error: 'already_in_this_college' });

    if (!state.cooldown_over) {
      throw new HttpError(409, { error: 'cooldown_active', next_change_at: state.next_change_at });
    }

    const target = await client.query(
      `SELECT id FROM colleges WHERE id = $1 AND status = 'approved'`, [collegeId]);
    if (!target.rows.length) throw new HttpError(404, { error: 'college_not_found' });

    const blockers = await activityCounts(client, req.user.id);
    if (Object.values(blockers).some((n) => n > 0)) {
      throw new HttpError(409, { error: 'active_activity', blockers });
    }

    await client.query(
      `UPDATE users
          SET college_id = $2, college_verified = FALSE, college_changed_at = now()
        WHERE id = $1`,
      [req.user.id, collegeId]
    );
    await client.query(
      `INSERT INTO college_changes (user_id, from_college_id, to_college_id) VALUES ($1, $2, $3)`,
      [req.user.id, state.college_id, collegeId]
    );

    const after = await client.query(STATE_SQL, [req.user.id, COOLDOWN_DAYS]);
    await client.query('COMMIT');
    res.json(shape(after.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    console.error('change college failed', err.message);
    res.status(500).json({ error: 'server_error' });
  } finally {
    client.release();
  }
});

module.exports = router;
