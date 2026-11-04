const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('../config');
const { query, tx } = require('../db');
const { AppError } = require('../utils/errors');
const { requireAuth, requireActive, requireAdmin, requireCollege } = require('../middleware/auth');
const { requireAdminPassword } = require('../utils/admin-auth');
const storage = require('../storage');
const { assertUserTextIsAllowed } = require('../utils/text-moderation');
const { enqueueCleanup, processQueuedMediaCleanup } = require('../utils/lost-found-media-cleanup');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 30 : 1000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
const reportSchema = z.object({
  item_type: z.enum(['marketplace', 'lost_found']),
  item_id: z.uuid(),
  reason: z.string().trim().min(5).max(1000),
});
const actionSchema = z.object({ action: z.enum(['dismiss', 'remove', 'ban']) });

router.use(requireAuth);

async function writeAudit(db, req, action, targetType, targetId, details = {}) {
  await db.query(
    `INSERT INTO admin_audit_logs
       (admin_id, action, target_type, target_id, details, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [
      req.user.id,
      action,
      targetType,
      String(targetId),
      JSON.stringify(details),
      req.ip || null,
      req.get('user-agent') || null,
    ],
  );
}

router.post('/reports', limiter, requireActive, requireCollege, async (req, res) => {
  const { item_type: type, item_id: itemId, reason } = reportSchema.parse(req.body);
  assertUserTextIsAllowed([reason]);
  const target = type === 'marketplace'
    ? {
      table: 'items',
      ownerColumn: 'seller_id',
      statusCondition: "status <> 'removed'",
    }
    : {
      table: 'lost_found_items',
      ownerColumn: 'user_id',
      statusCondition: "lifecycle_status <> 'removed'",
    };
  const { rows: [item] } = await query(
    `SELECT id, ${target.ownerColumn} AS owner_id
       FROM ${target.table}
      WHERE id = $1 AND college_id = $2 AND ${target.statusCondition}`,
    [itemId, req.user.college_id],
  );
  if (!item) throw new AppError(404, 'The post was not found or is no longer available.');
  if (item.owner_id === req.user.id) throw new AppError(400, 'You cannot report your own post.');

  const column = type === 'marketplace' ? 'marketplace_item_id' : 'lost_found_item_id';
  await query(
    `INSERT INTO item_reports (${column}, reporter_id, reason)
     VALUES ($1, $2, $3)`,
    [itemId, req.user.id, reason],
  );
  res.status(201).json({ success: true, message: 'Your report was sent to the moderation team.' });
});

router.get('/admin/reports', limiter, requireAdmin, requireAdminPassword, async (_req, res) => {
  const [{ rows }, { rows: duplicateOverrides }] = await Promise.all([
    query(
    `SELECT r.id, r.marketplace_item_id, r.lost_found_item_id, r.reason, r.created_at,
            reporter.display_name AS reporter_name,
            COALESCE(mi.title, lif.title) AS item_title,
            COALESCE(mi.seller_id, lif.user_id) AS target_user_id,
            target.display_name AS target_user_name,
            CASE WHEN r.marketplace_item_id IS NOT NULL THEN 'marketplace' ELSE 'lost_found' END AS item_type,
            COALESCE(mi.status::text, lif.lifecycle_status) AS item_status,
            COALESCE(
              (SELECT p.storage_key FROM item_photos p
                WHERE p.item_id = mi.id ORDER BY p.position LIMIT 1),
              (SELECT p.storage_key FROM lost_found_photos p
                WHERE p.item_id = lif.id ORDER BY p.position LIMIT 1)
            ) AS photo_key
       FROM item_reports r
       JOIN users reporter ON reporter.id = r.reporter_id
       LEFT JOIN items mi ON mi.id = r.marketplace_item_id
       LEFT JOIN lost_found_items lif ON lif.id = r.lost_found_item_id
       LEFT JOIN users target ON target.id = COALESCE(mi.seller_id, lif.user_id)
      WHERE r.status = 'pending'
      ORDER BY r.created_at ASC
      LIMIT 100`,
    ),
    query(
      `SELECT lif.id, lif.title, lif.description, lif.category, lif.status,
              lif.skip_reason, lif.created_at, u.display_name AS target_user_name,
              (SELECT p.storage_key FROM lost_found_photos p
                WHERE p.item_id = lif.id ORDER BY p.position LIMIT 1) AS photo_key
         FROM lost_found_items lif
         JOIN users u ON u.id = lif.user_id
        WHERE lif.flagged_for_review = true
          AND lif.lifecycle_status = 'active'
        ORDER BY lif.created_at ASC
        LIMIT 100`,
    ),
  ]);
  res.json({
    reports: rows.map(({ photo_key, ...report }) => ({
      ...report,
      photo_url: photo_key ? storage.urlFor(photo_key) : null,
    })),
    duplicate_overrides: duplicateOverrides.map(({ photo_key, ...item }) => ({
      ...item,
      photo_url: photo_key ? storage.urlFor(photo_key) : null,
    })),
  });
});

router.patch('/admin/duplicate-overrides/:id', requireAdmin, requireAdminPassword, async (req, res) => {
  const itemId = z.uuid().parse(req.params.id);
  const { action } = z.object({ action: z.enum(['dismiss', 'remove']) }).parse(req.body);

  if (action === 'dismiss') {
    const { rows: [item] } = await tx(async (db) => {
      const { rows: [updated] } = await db.query(
        `UPDATE lost_found_items
            SET flagged_for_review = false
          WHERE id = $1 AND flagged_for_review = true
          RETURNING id`,
        [itemId],
      );
      if (updated) await writeAudit(db, req, 'clear_duplicate_override_flag', 'lost_found', itemId);
      return { rows: [updated] };
    });
    if (!item) throw new AppError(404, 'Flagged duplicate override not found.');
    return res.json({ success: true, message: 'Review flag cleared; the original reason remains in the audit record.' });
  }

  await tx(async (db) => {
    const { rows: [item] } = await db.query(
      `SELECT id, user_id
         FROM lost_found_items
        WHERE id = $1 AND flagged_for_review = true AND lifecycle_status = 'active'
        FOR UPDATE`,
      [itemId],
    );
    if (!item) throw new AppError(404, 'Flagged duplicate override not found.');

    const { rows: photos } = await db.query(
      'SELECT storage_key FROM lost_found_photos WHERE item_id = $1',
      [itemId],
    );
    await enqueueCleanup(db, photos.map((photo) => photo.storage_key));
    await db.query(
      `UPDATE lost_found_items
          SET lifecycle_status = 'removed',
              moderation_reason = 'Removed after review of a high-similarity duplicate override.',
              flagged_for_review = false,
              updated_at = now()
        WHERE id = $1`,
      [itemId],
    );
    await db.query('DELETE FROM lost_found_photos WHERE item_id = $1', [itemId]);
    await writeAudit(db, req, 'remove_duplicate_override_post', 'lost_found', itemId, { user_id: item.user_id });
  });

  const mediaCleanupPending = (await processQueuedMediaCleanup()) > 0;
  res.json({ success: true, message: 'The post was removed after moderation review.', media_cleanup_pending: mediaCleanupPending });
});

router.patch('/admin/reports/:id', requireAdmin, requireAdminPassword, async (req, res) => {
  const reportId = z.uuid().parse(req.params.id);
  const { action } = actionSchema.parse(req.body);

  if (action === 'dismiss') {
    const { rows: [report] } = await tx(async (db) => {
      const { rows: [updated] } = await db.query(
      `UPDATE item_reports
          SET status = 'dismissed', reviewed_at = now(), reviewed_by = $2
        WHERE id = $1 AND status = 'pending'
        RETURNING id`,
      [reportId, req.user.id],
      );
      if (updated) await writeAudit(db, req, 'dismiss_report', 'item_report', reportId);
      return { rows: [updated] };
    });
    if (!report) throw new AppError(404, 'Pending report not found.');
    return res.json({ success: true, message: 'Report dismissed.' });
  }

  const moderation = await tx(async (db) => {
    const { rows: [report] } = await db.query(
      `SELECT id, marketplace_item_id, lost_found_item_id
         FROM item_reports
        WHERE id = $1 AND status = 'pending'
        FOR UPDATE`,
      [reportId],
    );
    if (!report) throw new AppError(404, 'Pending report not found.');

    const marketplace = Boolean(report.marketplace_item_id);
    const itemTable = marketplace ? 'items' : 'lost_found_items';
    const photoTable = marketplace ? 'item_photos' : 'lost_found_photos';
    const itemId = report.marketplace_item_id || report.lost_found_item_id;
    const ownerColumn = marketplace ? 'seller_id' : 'user_id';
    const { rows: [item] } = await db.query(
      `SELECT id, ${ownerColumn} AS owner_id
         FROM ${itemTable}
        WHERE id = $1
        FOR UPDATE`,
      [itemId],
    );
    if (!item) throw new AppError(404, 'Reported post no longer exists.');

    let bannedUser = false;
    if (action === 'ban') {
      const { rows: [offender] } = await db.query(
        'SELECT id, role FROM users WHERE id = $1 FOR UPDATE',
        [item.owner_id],
      );
      if (!offender || offender.role === 'admin') {
        throw new AppError(400, 'This account cannot be banned from the moderation queue.');
      }
      await db.query(
        `UPDATE users
            SET status = 'banned',
                frozen_reason = 'Account banned after content moderation review',
                auth_version = auth_version + 1
          WHERE id = $1`,
        [offender.id],
      );
      const { rows: marketplacePhotos } = await db.query(
        `SELECT p.storage_key FROM item_photos p
          JOIN items i ON i.id = p.item_id
         WHERE i.seller_id = $1 AND i.status IN ('available', 'reserved')`,
        [offender.id],
      );
      const { rows: lostFoundPhotos } = await db.query(
        `SELECT p.storage_key FROM lost_found_photos p
          JOIN lost_found_items lif ON lif.id = p.item_id
         WHERE lif.user_id = $1 AND lif.lifecycle_status = 'active'`,
        [offender.id],
      );
      await enqueueCleanup(db, [...marketplacePhotos, ...lostFoundPhotos].map((photo) => photo.storage_key));
      await db.query(
        `UPDATE items SET status = 'removed', removed_reason = 'Owner account banned', updated_at = now()
          WHERE seller_id = $1 AND status IN ('available', 'reserved')`,
        [offender.id],
      );
      await db.query(
        `UPDATE lost_found_items
            SET lifecycle_status = 'removed', moderation_reason = 'Owner account banned', updated_at = now()
          WHERE user_id = $1 AND lifecycle_status = 'active'`,
        [offender.id],
      );
      await db.query(
        `UPDATE item_claims SET status = 'rejected', reviewed_at = now()
          WHERE status = 'pending'
            AND item_id IN (SELECT id FROM lost_found_items WHERE user_id = $1)`,
        [offender.id],
      );
      await db.query(
        `DELETE FROM item_photos
          WHERE item_id IN (SELECT id FROM items WHERE seller_id = $1 AND status = 'removed')`,
        [offender.id],
      );
      await db.query(
        `DELETE FROM lost_found_photos
          WHERE item_id IN (SELECT id FROM lost_found_items WHERE user_id = $1 AND lifecycle_status = 'removed')`,
        [offender.id],
      );
      await writeAudit(db, req, 'ban_user', 'user', offender.id, { report_id: reportId });
      bannedUser = true;
    }

    const { rows: photos } = await db.query(
      `SELECT storage_key FROM ${photoTable} WHERE item_id = $1`,
      [itemId],
    );

    if (marketplace) {
      await db.query(
        `UPDATE items
            SET status = 'removed', removed_reason = 'Removed after content moderation review', updated_at = now()
          WHERE id = $1`,
        [itemId],
      );
    } else {
      await db.query(
        `UPDATE lost_found_items
            SET lifecycle_status = 'removed', moderation_reason = 'Removed after content moderation review', updated_at = now()
          WHERE id = $1`,
        [itemId],
      );
    }

    await writeAudit(
      db,
      req,
      action === 'ban' ? 'ban_user_from_report' : 'remove_reported_post',
      marketplace ? 'marketplace' : 'lost_found',
      itemId,
      { report_id: reportId, user_id: item.owner_id, banned_user: bannedUser },
    );
    return { itemId, photoTable, photos: photos.map((photo) => photo.storage_key), marketplace, bannedUser };
  });

  const cleanupResults = await Promise.allSettled(moderation.photos.map((key) => storage.remove(key)));
  const cleanupFailures = cleanupResults.filter((result) => result.status === 'rejected');
  if (cleanupFailures.length) {
    cleanupFailures.forEach((result) => console.error('Could not remove media during content moderation:', result.reason));
    throw new AppError(503, 'The post was hidden, but its media could not be fully removed. Retry this action to finish cleanup.', 'MEDIA_CLEANUP_PENDING');
  }

  await tx(async (db) => {
    await db.query(`DELETE FROM ${moderation.photoTable} WHERE item_id = $1`, [moderation.itemId]);
    const itemColumn = moderation.marketplace ? 'marketplace_item_id' : 'lost_found_item_id';
    await db.query(
      `UPDATE item_reports
          SET status = 'actioned', reviewed_at = now(), reviewed_by = $2
        WHERE ${itemColumn} = $1 AND status = 'pending'`,
      [moderation.itemId, req.user.id],
    );
  });
  const mediaCleanupPending = moderation.bannedUser
    ? (await processQueuedMediaCleanup()) > 0
    : false;

  res.json({
    success: true,
    message: moderation.bannedUser
      ? 'The account was banned and all active posts were removed.'
      : 'The reported post and its media were removed.',
    banned_user: moderation.bannedUser,
    media_cleanup_pending: mediaCleanupPending,
  });
});

module.exports = router;
