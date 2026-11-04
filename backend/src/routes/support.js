const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { query, tx } = require('../db');
const config = require('../config');
const { AppError } = require('../utils/errors');
const { requireAuth, requireActive, requireAdmin } = require('../middleware/auth');
const { requireAdminPassword } = require('../utils/admin-auth');

const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isProd ? 5 : 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

const createRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()).max(254),
  full_name: z.string().trim().min(2).max(100),
  category: z.enum(['account_access', 'suspension', 'ban_appeal', 'other']),
  subject: z.string().trim().min(5).max(160),
  message: z.string().trim().min(20).max(5000),
});

async function writeAudit(db, req, action, requestId, details = {}) {
  await db.query(
    `INSERT INTO admin_audit_logs
       (admin_id, action, action_type, target_type, target_id, details, ip_address, user_agent)
     VALUES ($1, $2, $3, 'support_request', $4, $5::jsonb, $6, $7)`,
    [
      req.user.id,
      action,
      action,
      String(requestId),
      JSON.stringify(details),
      req.ip || null,
      req.get('user-agent') || null,
    ],
  );
}

router.post('/requests', requestLimiter, async (req, res) => {
  const supportRequest = createRequestSchema.parse(req.body);
  const { rows: [created] } = await query(
    `INSERT INTO support_requests (email, full_name, category, subject, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [
      supportRequest.email,
      supportRequest.full_name,
      supportRequest.category,
      supportRequest.subject,
      supportRequest.message,
    ],
  );
  res.status(201).json({
    success: true,
    request_id: created.id,
    message: 'Your request was sent to Campustu support. Keep the request ID for reference; we will reply to the email address you provided.',
  });
});

router.get('/admin/requests', requireAuth, requireActive, requireAdmin, requireAdminPassword, async (_req, res) => {
  const { rows } = await query(
    `SELECT id, email, full_name, category, subject, message, status, admin_note, created_at, updated_at
       FROM support_requests
      ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
               created_at DESC
      LIMIT 200`,
  );
  res.json({ success: true, requests: rows });
});

router.patch('/admin/requests/:id', requireAuth, requireActive, requireAdmin, requireAdminPassword, async (req, res) => {
  const requestId = z.uuid().parse(req.params.id);
  const update = z.object({
    status: z.enum(['open', 'in_progress', 'resolved']),
    admin_note: z.string().trim().max(2000).optional(),
  }).parse(req.body);

  const { rows: [updated] } = await tx(async (db) => {
    const { rows: [ticket] } = await db.query(
      `UPDATE support_requests
          SET status = $2,
              admin_note = CASE WHEN $3 THEN $4 ELSE admin_note END,
              updated_at = now(),
              resolved_at = CASE WHEN $2 = 'resolved' THEN COALESCE(resolved_at, now()) ELSE NULL END,
              resolved_by = CASE WHEN $2 = 'resolved' THEN COALESCE(resolved_by, $5) ELSE NULL END
        WHERE id = $1
        RETURNING id, status, admin_note, updated_at, resolved_at`,
      [
        requestId,
        update.status,
        Object.hasOwn(update, 'admin_note'),
        update.admin_note || null,
        req.user.id,
      ],
    );
    if (!ticket) throw new AppError(404, 'Support request not found.');
    await writeAudit(db, req, 'update_support_request', requestId, {
      status: update.status,
      has_admin_note: Boolean(update.admin_note),
    });
    return { rows: [ticket] };
  });

  res.json({ success: true, request: updated });
});

module.exports = router;
