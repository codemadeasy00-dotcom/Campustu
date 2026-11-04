const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { query, tx } = require('../db');
const { AppError } = require('../utils/errors');
const config = require('../config');
const { requireAuth, requireActive, requireAdmin } = require('../middleware/auth');
const {
  hashAdminPassword,
  verifyAdminPassword,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  hasValidAdminSession,
  requireAdminPassword,
} = require('../utils/admin-auth');
const { enqueueCleanup, processQueuedMediaCleanup } = require('../utils/lost-found-media-cleanup');
const storage = require('../storage');
const { assertUserTextIsAllowed } = require('../utils/text-moderation');

router.use(requireAuth, requireActive, requireAdmin);

const passwordSchema = z.string()
  .min(14, 'Use at least 14 characters.')
  .max(128, 'Password must be 128 characters or fewer.')
  .regex(/[a-z]/, 'Include a lowercase letter.')
  .regex(/[A-Z]/, 'Include an uppercase letter.')
  .regex(/[0-9]/, 'Include a number.')
  .regex(/[^A-Za-z0-9]/, 'Include a symbol.');
const passwordAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 5 : 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
const adminPasswordLoginSchema = z.object({ password: z.string().min(1).max(128) });
const changeAdminPasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: passwordSchema,
});

router.get('/auth/status', async (req, res) => {
  const { rows: [user] } = await query(
    'SELECT admin_password_hash IS NOT NULL AS password_configured FROM users WHERE id = $1',
    [req.user.id],
  );
  res.json({
    success: true,
    password_configured: Boolean(user?.password_configured),
    unlocked: user?.password_configured ? await hasValidAdminSession(req, req.user.id) : false,
  });
});

router.post('/auth/setup-password', passwordAttemptLimiter, async (req, res) => {
  const { password } = adminPasswordLoginSchema.extend({ password: passwordSchema }).parse(req.body);
  const encodedHash = await hashAdminPassword(password);
  const { rows: [user] } = await tx(async (db) => {
    const { rows: [lockedUser] } = await db.query(
      'SELECT admin_password_hash FROM users WHERE id = $1 FOR UPDATE',
      [req.user.id],
    );
    if (!lockedUser) throw new AppError(404, 'Admin account not found.');
    if (lockedUser.admin_password_hash) {
      throw new AppError(409, 'An admin password is already configured. Unlock the console first.');
    }
    const { rows: [updated] } = await db.query(
      `UPDATE users
          SET admin_password_hash = $2,
              admin_password_version = admin_password_version + 1
        WHERE id = $1
        RETURNING admin_password_version`,
      [req.user.id, encodedHash],
    );
    await writeAudit(db, req, 'set_admin_password', 'user', req.user.id);
    return { rows: [updated] };
  });
  setAdminSessionCookie(res, req.user.id, Number(user.admin_password_version));
  res.json({ success: true, unlocked: true });
});

router.post('/auth/unlock', passwordAttemptLimiter, async (req, res) => {
  const { password } = adminPasswordLoginSchema.parse(req.body);
  const { rows: [user] } = await query(
    `SELECT admin_password_hash, admin_password_version
       FROM users WHERE id = $1`,
    [req.user.id],
  );
  if (!user?.admin_password_hash) {
    throw new AppError(409, 'Set an admin password before unlocking the console.', 'ADMIN_PASSWORD_SETUP_REQUIRED');
  }
  if (!(await verifyAdminPassword(password, user.admin_password_hash))) {
    throw new AppError(403, 'The admin password is incorrect.', 'ADMIN_PASSWORD_INCORRECT');
  }
  setAdminSessionCookie(res, req.user.id, Number(user.admin_password_version));
  await query(
    `INSERT INTO admin_audit_logs
       (admin_id, action, action_type, target_type, target_id, details, ip_address, user_agent)
     VALUES ($1, 'unlock_admin_console', 'unlock_admin_console', 'user', $2, '{}'::jsonb, $3, $4)`,
    [req.user.id, String(req.user.id), req.ip || null, req.get('user-agent') || null],
  );
  res.json({ success: true, unlocked: true });
});

router.post('/auth/lock', async (req, res) => {
  clearAdminSessionCookie(res);
  res.json({ success: true, unlocked: false });
});

router.use(requireAdminPassword);

router.post('/auth/change-password', passwordAttemptLimiter, async (req, res) => {
  const { current_password: currentPassword, new_password: newPassword } =
    changeAdminPasswordSchema.parse(req.body);
  if (currentPassword === newPassword) {
    throw new AppError(400, 'Choose a new password different from the current one.');
  }

  const { rows: [user] } = await tx(async (db) => {
    const { rows: [lockedUser] } = await db.query(
      'SELECT admin_password_hash FROM users WHERE id = $1 FOR UPDATE',
      [req.user.id],
    );
    if (!lockedUser?.admin_password_hash || !(await verifyAdminPassword(currentPassword, lockedUser.admin_password_hash))) {
      throw new AppError(403, 'The current admin password is incorrect.');
    }
    const encodedHash = await hashAdminPassword(newPassword);
    const { rows: [updated] } = await db.query(
      `UPDATE users
          SET admin_password_hash = $2,
              admin_password_version = admin_password_version + 1
        WHERE id = $1
        RETURNING admin_password_version`,
      [req.user.id, encodedHash],
    );
    await writeAudit(db, req, 'change_admin_password', 'user', req.user.id);
    return { rows: [updated] };
  });
  setAdminSessionCookie(res, req.user.id, Number(user.admin_password_version));
  res.json({ success: true, message: 'Admin password changed. Other admin sessions were locked.' });
});

const userSearchSchema = z.object({
  q: z.string().trim().min(2).max(120),
});

const banSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});

const accountStatusSchema = z.object({
  status: z.enum(['active', 'frozen']),
  reason: z.string().trim().min(5).max(1000),
});

const collegeSchema = z.object({
  name: z.string().trim().min(3).max(150),
  short_code: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,14}$/),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().max(80).optional(),
  email_domain: z.string().trim().toLowerCase().regex(/^(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/),
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
  search_radius_meters: z.coerce.number().int().min(100).max(50000).default(1000),
});

const controlSchema = z.object({
  enabled: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

function requestDetails(req) {
  return {
    ip_address: req.ip || null,
    user_agent: req.get('user-agent') || null,
  };
}

async function writeAudit(db, req, action, targetType, targetId, details = {}) {
  const { ip_address: ipAddress, user_agent: userAgent } = requestDetails(req);
  await db.query(
    `INSERT INTO admin_audit_logs
       (admin_id, action, action_type, target_type, target_id, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
    [req.user.id, action, action, targetType, String(targetId), JSON.stringify(details), ipAddress, userAgent],
  );
}

router.get('/dashboard', async (_req, res) => {
  const { rows: [summary] } = await query(
    `SELECT
       (SELECT count(*)::int FROM users WHERE deleted_at IS NULL) AS users,
       (SELECT count(*)::int FROM users WHERE status = 'active' AND deleted_at IS NULL) AS active_users,
       (SELECT count(*)::int FROM item_reports WHERE status = 'pending') AS pending_reports,
       (SELECT count(*)::int FROM lost_found_items WHERE flagged_for_review AND lifecycle_status = 'active') AS duplicate_overrides,
       (SELECT count(*)::int FROM colleges WHERE status = 'pending') AS pending_colleges`,
  );
  res.json({ success: true, summary });
});

router.get('/reports', async (_req, res) => {
  const [{ rows: reports }, { rows: duplicateOverrides }] = await Promise.all([
    query(
      `SELECT r.id, r.marketplace_item_id, r.lost_found_item_id, r.reason, r.created_at,
              reporter.display_name AS reporter_name, reporter.email AS reporter_email,
              COALESCE(mi.title, lif.title) AS item_title,
              COALESCE(mi.seller_id, lif.user_id) AS target_user_id,
              target.display_name AS target_user_name,
              CASE WHEN r.marketplace_item_id IS NOT NULL THEN 'marketplace' ELSE 'lost_found' END AS item_type,
              COALESCE(mi.status::text, lif.lifecycle_status) AS item_status,
              COALESCE(
                (SELECT p.storage_key FROM item_photos p WHERE p.item_id = mi.id ORDER BY p.position LIMIT 1),
                (SELECT p.storage_key FROM lost_found_photos p WHERE p.item_id = lif.id ORDER BY p.position LIMIT 1)
              ) AS photo_key
         FROM item_reports r
         JOIN users reporter ON reporter.id = r.reporter_id
         LEFT JOIN items mi ON mi.id = r.marketplace_item_id
         LEFT JOIN lost_found_items lif ON lif.id = r.lost_found_item_id
         LEFT JOIN users target ON target.id = COALESCE(mi.seller_id, lif.user_id)
        WHERE r.status = 'pending'
        ORDER BY r.created_at ASC
        LIMIT 200`,
    ),
    query(
      `SELECT lif.id, lif.title, lif.description, lif.category, lif.status, lif.skip_reason,
              lif.created_at, u.display_name AS target_user_name, u.email AS target_user_email,
              (SELECT p.storage_key FROM lost_found_photos p
                WHERE p.item_id = lif.id ORDER BY p.position LIMIT 1) AS photo_key
         FROM lost_found_items lif
         JOIN users u ON u.id = lif.user_id
        WHERE lif.flagged_for_review = true AND lif.lifecycle_status = 'active'
        ORDER BY lif.created_at ASC
        LIMIT 200`,
    ),
  ]);
  res.json({
    success: true,
    reports: reports.map(({ photo_key: photoKey, ...report }) => ({
      ...report,
      photo_url: photoKey ? storage.urlFor(photoKey) : null,
    })),
    duplicate_overrides: duplicateOverrides.map(({ photo_key: photoKey, ...item }) => ({
      ...item,
      photo_url: photoKey ? storage.urlFor(photoKey) : null,
    })),
    image_review_queue: [],
    image_review_note: 'NSFWJS currently runs only in the submitter’s browser; its unverified client-side scores are not treated as an authoritative moderation signal.',
  });
});

router.patch('/reports/:id', async (req, res) => {
  const reportId = z.uuid().parse(req.params.id);
  const { action } = z.object({ action: z.enum(['dismiss', 'remove', 'ban']) }).parse(req.body);
  const { rows: [report] } = await query(
    `SELECT marketplace_item_id, lost_found_item_id
       FROM item_reports
      WHERE id = $1 AND status = 'pending'`,
    [reportId],
  );
  if (!report) throw new AppError(404, 'Pending report not found.');

  if (action === 'dismiss') {
    await tx(async (db) => {
      const { rows: [pendingReport] } = await db.query(
        `SELECT id FROM item_reports WHERE id = $1 AND status = 'pending' FOR UPDATE`,
        [reportId],
      );
      if (!pendingReport) throw new AppError(404, 'Pending report not found.');
      await db.query(
        `UPDATE item_reports SET status = 'dismissed', reviewed_at = now(), reviewed_by = $2
          WHERE id = $1 AND status = 'pending'`,
        [reportId, req.user.id],
      );
      await writeAudit(db, req, 'dismiss_report', 'item_report', reportId, {});
    });
    return res.json({ success: true, message: 'Report dismissed.' });
  }

  const targetItemId = report.marketplace_item_id || report.lost_found_item_id;
  const targetType = report.marketplace_item_id ? 'marketplace' : 'lost_found';
  const banReason = action === 'ban' ? 'Banned after moderation review' : null;
  let ownerId;
  await tx(async (db) => {
    const { rows: [pendingReport] } = await db.query(
      `SELECT id FROM item_reports WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [reportId],
    );
    if (!pendingReport) throw new AppError(404, 'Pending report not found.');
    if (targetType === 'marketplace') {
      const { rows: [item] } = await db.query(
        'SELECT seller_id FROM items WHERE id = $1 FOR UPDATE',
        [targetItemId],
      );
      if (!item) throw new AppError(404, 'Reported post no longer exists.');
      ownerId = item.seller_id;
      const { rows: photos } = await db.query('SELECT storage_key FROM item_photos WHERE item_id = $1', [targetItemId]);
      await enqueueCleanup(db, photos.map((photo) => photo.storage_key));
      await db.query(
        `UPDATE items SET status = 'removed', removed_reason = 'Removed after moderation review', updated_at = now()
          WHERE id = $1`,
        [targetItemId],
      );
      await db.query('DELETE FROM item_photos WHERE item_id = $1', [targetItemId]);
    } else {
      const { rows: [item] } = await db.query(
        'SELECT user_id FROM lost_found_items WHERE id = $1 FOR UPDATE',
        [targetItemId],
      );
      if (!item) throw new AppError(404, 'Reported post no longer exists.');
      ownerId = item.user_id;
      const { rows: photos } = await db.query('SELECT storage_key FROM lost_found_photos WHERE item_id = $1', [targetItemId]);
      await enqueueCleanup(db, photos.map((photo) => photo.storage_key));
      await db.query(
        `UPDATE lost_found_items
            SET lifecycle_status = 'removed', moderation_reason = 'Removed after moderation review', updated_at = now()
          WHERE id = $1`,
        [targetItemId],
      );
      await db.query('DELETE FROM lost_found_photos WHERE item_id = $1', [targetItemId]);
      await db.query(
        `UPDATE item_claims SET status = 'rejected', reviewed_at = now()
          WHERE item_id = $1 AND status = 'pending'`,
        [targetItemId],
      );
    }

    if (action === 'ban') {
      if (ownerId === req.user.id) throw new AppError(400, 'You cannot ban your own account.');
      const { rows: [owner] } = await db.query('SELECT role FROM users WHERE id = $1 FOR UPDATE', [ownerId]);
      if (!owner || owner.role === 'admin') throw new AppError(400, 'Admin accounts cannot be banned here.');
      await banUserInTransaction(db, req, ownerId, banReason, { report_id: reportId });
    }

    const updateResult = await db.query(
      `UPDATE item_reports SET status = 'actioned', reviewed_at = now(), reviewed_by = $2
        WHERE id = $1 AND status = 'pending'`,
      [reportId, req.user.id],
    );
    if (updateResult.rowCount !== 1) throw new AppError(404, 'Pending report not found.');
    await writeAudit(db, req, action === 'ban' ? 'ban_user_from_report' : 'remove_reported_post', targetType, targetItemId, {
      report_id: reportId,
      target_user_id: ownerId,
    });
  });
  await processQueuedMediaCleanup();
  res.json({ success: true, message: action === 'ban' ? 'Account banned and reported post removed.' : 'Reported post removed.' });
});

async function banUserInTransaction(db, req, userId, reason, auditDetails = {}) {
  assertUserTextIsAllowed([reason]);
  const { rows: [user] } = await db.query(
    'SELECT role FROM users WHERE id = $1 FOR UPDATE',
    [userId],
  );
  if (!user || user.role === 'admin') throw new AppError(400, 'This account cannot be banned.');

  const { rows: marketplacePhotos } = await db.query(
    `SELECT p.storage_key
       FROM item_photos p JOIN items i ON i.id = p.item_id
      WHERE i.seller_id = $1 AND i.status IN ('available', 'reserved')`,
    [userId],
  );
  const { rows: lostFoundPhotos } = await db.query(
    `SELECT p.storage_key
       FROM lost_found_photos p JOIN lost_found_items lif ON lif.id = p.item_id
      WHERE lif.user_id = $1 AND lif.lifecycle_status = 'active'`,
    [userId],
  );
  await enqueueCleanup(db, [...marketplacePhotos, ...lostFoundPhotos].map((photo) => photo.storage_key));
  await db.query(
    `UPDATE items SET status = 'removed', removed_reason = 'Owner account banned', updated_at = now()
      WHERE seller_id = $1 AND status IN ('available', 'reserved')`,
    [userId],
  );
  await db.query(
    `DELETE FROM item_photos
      WHERE item_id IN (SELECT id FROM items WHERE seller_id = $1 AND status = 'removed')`,
    [userId],
  );
  await db.query(
    `UPDATE lost_found_items
        SET lifecycle_status = 'removed', moderation_reason = 'Owner account banned', updated_at = now()
      WHERE user_id = $1 AND lifecycle_status = 'active'`,
    [userId],
  );
  await db.query(
    `DELETE FROM lost_found_photos
      WHERE item_id IN (SELECT id FROM lost_found_items WHERE user_id = $1 AND lifecycle_status = 'removed')`,
    [userId],
  );
  await db.query(
    `UPDATE item_claims SET status = 'rejected', reviewed_at = now()
      WHERE status = 'pending'
        AND item_id IN (SELECT id FROM lost_found_items WHERE user_id = $1)`,
    [userId],
  );
  await db.query(
    `UPDATE users
        SET status = 'banned', frozen_reason = $2, auth_version = auth_version + 1
      WHERE id = $1`,
    [userId, reason],
  );
  await writeAudit(db, req, 'ban_user', 'user', userId, { ...auditDetails, reason });
}

router.get('/users', async (req, res) => {
  const { q } = userSearchSchema.parse(req.query);
  const term = q.toLowerCase();
  const { rows } = await query(
    `SELECT u.id, u.email, u.roll_number, u.full_name, u.display_name, u.status, u.role,
            u.college_id, c.name AS college_name, u.created_at,
            (SELECT count(*)::int FROM items i WHERE i.seller_id = u.id AND i.status IN ('available', 'reserved')) AS active_marketplace_listings,
            (SELECT count(*)::int FROM lost_found_items lif WHERE lif.user_id = u.id AND lif.lifecycle_status = 'active') AS active_lost_found_listings,
            (SELECT count(*)::int FROM item_reports r
              LEFT JOIN items mi ON mi.id = r.marketplace_item_id
              LEFT JOIN lost_found_items lif ON lif.id = r.lost_found_item_id
              WHERE mi.seller_id = u.id OR lif.user_id = u.id) AS reports_received,
            COALESCE((SELECT completed_handovers FROM user_trust WHERE user_id = u.id), 0)::int AS completed_handovers
       FROM users u
       LEFT JOIN colleges c ON c.id = u.college_id
      WHERE u.deleted_at IS NULL
        AND (position($1 in lower(u.email)) > 0 OR position($1 in lower(COALESCE(u.roll_number, ''))) > 0)
      ORDER BY u.created_at DESC
      LIMIT 50`,
    [term],
  );
  res.json({ success: true, users: rows });
});

router.get('/users/:id', async (req, res) => {
  const userId = z.uuid().parse(req.params.id);
  const { rows: [user] } = await query(
    `SELECT u.id, u.email, u.roll_number, u.full_name, u.display_name, u.status, u.role,
            u.college_id, c.name AS college_name, u.created_at, u.frozen_reason,
            COALESCE(t.completed_handovers, 0)::int AS completed_handovers,
            COALESCE(t.trust_score, 0)::int AS trust_score
       FROM users u
       LEFT JOIN colleges c ON c.id = u.college_id
       LEFT JOIN user_trust t ON t.user_id = u.id
      WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId],
  );
  if (!user) throw new AppError(404, 'User not found.');
  const [{ rows: marketplace }, { rows: lostFound }, { rows: reports }] = await Promise.all([
    query(
      `SELECT id, title, status, created_at FROM items
        WHERE seller_id = $1 AND status IN ('available', 'reserved')
        ORDER BY created_at DESC LIMIT 100`,
      [userId],
    ),
    query(
      `SELECT id, title, status, lifecycle_status, created_at FROM lost_found_items
        WHERE user_id = $1 AND lifecycle_status = 'active'
        ORDER BY created_at DESC LIMIT 100`,
      [userId],
    ),
    query(
      `SELECT r.id, r.reason, r.status, r.created_at,
              COALESCE(mi.title, lif.title) AS item_title,
              reporter.display_name AS reporter_name
         FROM item_reports r
         JOIN users reporter ON reporter.id = r.reporter_id
         LEFT JOIN items mi ON mi.id = r.marketplace_item_id
         LEFT JOIN lost_found_items lif ON lif.id = r.lost_found_item_id
        WHERE mi.seller_id = $1 OR lif.user_id = $1
        ORDER BY r.created_at DESC LIMIT 100`,
      [userId],
    ),
  ]);
  res.json({ success: true, user, active_listings: { marketplace, lost_found: lostFound }, reports_received: reports });
});

router.post('/users/:id/ban', async (req, res) => {
  const userId = z.uuid().parse(req.params.id);
  const { reason } = banSchema.parse(req.body);
  assertUserTextIsAllowed([reason]);
  if (userId === req.user.id) throw new AppError(400, 'You cannot ban your own account.');
  await tx(async (db) => {
    await banUserInTransaction(db, req, userId, reason);
  });
  const mediaCleanupPending = (await processQueuedMediaCleanup()) > 0;
  res.json({
    success: true,
    message: 'Account banned, active listings removed, and sessions revoked.',
    media_cleanup_pending: mediaCleanupPending,
  });
});

router.patch('/users/:id/status', async (req, res) => {
  const userId = z.uuid().parse(req.params.id);
  const { status, reason } = accountStatusSchema.parse(req.body);
  assertUserTextIsAllowed([reason]);
  if (userId === req.user.id) throw new AppError(400, 'You cannot change your own account status.');
  await tx(async (db) => {
    const { rows: [target] } = await db.query(
      'SELECT role, status FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [userId],
    );
    if (!target || target.role === 'admin') throw new AppError(404, 'Account not found or cannot be managed.');
    if (target.status === 'banned') throw new AppError(409, 'Banned accounts cannot be reactivated from this control.');
    await db.query(
      `UPDATE users
          SET status = $2,
              frozen_reason = CASE WHEN $2 = 'frozen' THEN $3 ELSE NULL END,
              auth_version = auth_version + 1
        WHERE id = $1`,
      [userId, status, reason],
    );
    await writeAudit(db, req, status === 'frozen' ? 'freeze_user' : 'reactivate_user', 'user', userId, { reason });
  });
  res.json({ success: true, message: status === 'frozen' ? 'Account suspended and sessions revoked.' : 'Account reactivated; previous sessions revoked.' });
});

router.get('/colleges', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, short_code, city, state, email_domain, center_lat, center_lng,
            search_radius_meters, status, created_at
       FROM colleges ORDER BY name`,
  );
  res.json({ success: true, colleges: rows });
});

router.patch('/colleges/:id/status', async (req, res) => {
  const collegeId = z.coerce.number().int().positive().parse(req.params.id);
  const { status, reason } = z.object({
    status: z.enum(['approved', 'rejected']),
    reason: z.string().trim().min(5).max(1000),
  }).parse(req.body);
  assertUserTextIsAllowed([reason]);
  const { rows: [college] } = await tx(async (db) => {
    const { rows: [updated] } = await db.query(
      `UPDATE colleges SET status = $2
        WHERE id = $1
        RETURNING id, name, short_code, city, state, email_domain, center_lat, center_lng,
                  search_radius_meters, status, created_at`,
      [collegeId, status],
    );
    if (!updated) throw new AppError(404, 'College not found.');
    await writeAudit(db, req, `${status}_college`, 'college', collegeId, { reason });
    return { rows: [updated] };
  });
  res.json({ success: true, college });
});

router.post('/colleges', async (req, res) => {
  const college = collegeSchema.parse(req.body);
  assertUserTextIsAllowed([college.name, college.city, college.state, college.short_code]);
  const { rows: [created] } = await tx(async (db) => {
    const { rows: [result] } = await db.query(
      `INSERT INTO colleges
         (name, short_code, city, state, email_domain, center_lat, center_lng, search_radius_meters, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved')
       RETURNING id, name, short_code, city, state, email_domain, center_lat, center_lng, search_radius_meters, status, created_at`,
      [
        college.name,
        college.short_code,
        college.city,
        college.state || null,
        college.email_domain,
        college.latitude,
        college.longitude,
        college.search_radius_meters,
      ],
    );
    await writeAudit(db, req, 'create_college', 'college', result.id, { short_code: result.short_code });
    return { rows: [result] };
  });
  res.status(201).json({ success: true, college: created });
});

router.get('/controls', async (_req, res) => {
  const { rows } = await query(
    `SELECT key, enabled, updated_at, note FROM system_controls ORDER BY key`,
  );
  res.json({ success: true, controls: rows });
});

router.patch('/controls/:key', async (req, res) => {
  const key = z.enum(['image_uploads_enabled', 'marketplace_read_only']).parse(req.params.key);
  const { enabled, note } = controlSchema.parse(req.body);
  if (note) assertUserTextIsAllowed([note]);
  const { rows: [control] } = await tx(async (db) => {
    const { rows: [updated] } = await db.query(
      `UPDATE system_controls
          SET enabled = $2, updated_by = $3, updated_at = now(), note = COALESCE($4, note)
        WHERE key = $1
        RETURNING key, enabled, updated_at, note`,
      [key, enabled, req.user.id, note || null],
    );
    if (!updated) throw new AppError(404, 'System control not found.');
    await writeAudit(db, req, 'update_system_control', 'system_control', key, { enabled, note: note || null });
    return { rows: [updated] };
  });
  res.json({ success: true, control });
});

router.get('/audit-logs', async (req, res) => {
  const pagination = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  }).parse(req.query);
  const { rows } = await query(
    `SELECT l.id, l.admin_id, admin.display_name AS admin_name, l.action,
            l.target_type, l.target_id, l.details, l.ip_address, l.user_agent, l.created_at
       FROM admin_audit_logs l
       JOIN users admin ON admin.id = l.admin_id
      ORDER BY l.created_at DESC
      LIMIT $1 OFFSET $2`,
    [pagination.limit, pagination.offset],
  );
  res.json({ success: true, logs: rows, limit: pagination.limit, offset: pagination.offset });
});

module.exports = router;
