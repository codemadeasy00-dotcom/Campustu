const webPush = require('web-push');
const { query } = require('../db');
const config = require('../config');

const isConfigured = Boolean(
  config.webPush.publicKey && config.webPush.privateKey && config.webPush.subject,
);

if (isConfigured) {
  webPush.setVapidDetails(
    config.webPush.subject,
    config.webPush.publicKey,
    config.webPush.privateKey,
  );
}

async function notifyUser(userId, notification) {
  if (!isConfigured) return;

  const { rows: subscriptions } = await query(
    'SELECT id, endpoint, p256dh, auth FROM web_push_subscriptions WHERE user_id = $1',
    [userId],
  );
  const payload = JSON.stringify(notification);

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 3600 });
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await query('DELETE FROM web_push_subscriptions WHERE id = $1', [subscription.id]);
        return;
      }
      console.error(`Could not send web push notification to subscription ${subscription.id}:`, error);
    }
  }));
}

module.exports = { isConfigured, notifyUser };
