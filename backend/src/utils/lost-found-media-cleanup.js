const { query, tx } = require('../db');
const storage = require('../storage');

async function enqueueCleanup(db, storageKeys) {
  for (const storageKey of storageKeys) {
    await db.query(
      `INSERT INTO lost_found_media_cleanup (storage_key)
       VALUES ($1)
       ON CONFLICT (storage_key) DO NOTHING`,
      [storageKey],
    );
  }
}

async function processQueuedMediaCleanup(limit = 20) {
  const { rows } = await tx((db) => db.query(
    `WITH ready AS (
       SELECT storage_key
         FROM lost_found_media_cleanup
        WHERE available_at <= now()
          AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes')
        ORDER BY created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE lost_found_media_cleanup AS cleanup
        SET locked_at = now()
       FROM ready
      WHERE cleanup.storage_key = ready.storage_key
      RETURNING cleanup.storage_key, cleanup.attempt_count`,
    [limit],
  ));

  for (const { storage_key: storageKey, attempt_count: attemptCount } of rows) {
    try {
      await storage.remove(storageKey);
      await query('DELETE FROM lost_found_media_cleanup WHERE storage_key = $1', [storageKey]);
    } catch (error) {
      console.error(`Could not remove lost-and-found photo ${storageKey}:`, error);
      await query(
        `UPDATE lost_found_media_cleanup
            SET locked_at = NULL,
                attempt_count = attempt_count + 1,
                available_at = now() + LEAST(3600, 30 * power(2, LEAST($2, 7))) * interval '1 second',
                last_error = $3
          WHERE storage_key = $1`,
        [storageKey, attemptCount, String(error.message || error).slice(0, 1000)],
      );
    }
  }

  const { rows: pendingRows } = await query('SELECT count(*)::int AS count FROM lost_found_media_cleanup');
  return pendingRows[0].count;
}

module.exports = { enqueueCleanup, processQueuedMediaCleanup };
