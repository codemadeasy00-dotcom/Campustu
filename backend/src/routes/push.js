const router = require('express').Router();
const { z } = require('zod');
const { query } = require('../db');
const { AppError } = require('../utils/errors');
const { requireAuth, requireActive, requireCollege } = require('../middleware/auth');
const { isConfigured } = require('../utils/web-push');

router.use(requireAuth, requireActive);

const subscriptionSchema = z.object({
  endpoint: z.url().max(2048).refine((value) => {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (
      host === 'fcm.googleapis.com'
      || host.endsWith('.push.services.mozilla.com')
      || host === 'web.push.apple.com'
      || host.endsWith('.notify.windows.com')
      || host === 'push.opera.com'
      || host === 'push.yandex.ru'
    );
  }, 'Unsupported web push provider endpoint.'),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

router.get('/vapid-public-key', (_req, res) => {
  res.json({
    success: true,
    enabled: isConfigured,
    public_key: isConfigured ? process.env.WEB_PUSH_VAPID_PUBLIC_KEY : null,
  });
});

router.post('/subscriptions', requireCollege, async (req, res) => {
  if (!isConfigured) {
    throw new AppError(503, 'Web push is not configured on the server yet.', 'PUSH_NOT_CONFIGURED');
  }
  const subscription = subscriptionSchema.parse(req.body);
  const { rowCount } = await query(
    `INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           updated_at = now()
       WHERE web_push_subscriptions.user_id = EXCLUDED.user_id`,
    [req.user.id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth],
  );
  if (rowCount !== 1) {
    throw new AppError(409, 'This browser subscription is linked to another account. Disable push there before changing accounts.');
  }
  res.status(201).json({ success: true });
});

router.delete('/subscriptions', async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.url().max(2048) }).parse(req.body);
  await query(
    'DELETE FROM web_push_subscriptions WHERE user_id = $1 AND endpoint = $2',
    [req.user.id, endpoint],
  );
  res.json({ success: true });
});

module.exports = router;
