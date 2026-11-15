const test = require('node:test')
const assert = require('node:assert/strict')
const { itemSearchAlertQuery } = require('../src/utils/item-search-alert-query')

const sellerId = '8d69ca2e-fc32-4e27-b647-28ad6510f8ac'
const recipientId = '9c746c68-d834-4f4a-9bfe-c2086449e46f'
const automaticSearchId = 'd842d04e-3631-4f10-a57a-a18d67468664'
const manualSearchId = 'ef4ff9de-2f33-4dfa-a664-23fd15818bf5'
const collegeId = 41

test('matches an item with no branch and honors the automatic-search opt-out', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const database = new PGlite()

  try {
    await database.exec(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        status text NOT NULL,
        deleted_at timestamptz,
        college_id integer NOT NULL
      );
      CREATE TABLE user_blocks (blocker_id uuid NOT NULL, blocked_id uuid NOT NULL);
      CREATE TABLE saved_searches (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        college_id integer NOT NULL,
        keyword text NOT NULL,
        category_id smallint,
        branch_id smallint,
        auto_tracked boolean NOT NULL DEFAULT false
      );
      CREATE TABLE search_alert_preferences (
        user_id uuid PRIMARY KEY,
        auto_track_searches boolean NOT NULL DEFAULT true
      );
      CREATE TABLE categories (id smallint PRIMARY KEY, name text NOT NULL);
      CREATE TABLE branches (id smallint PRIMARY KEY, name text NOT NULL);
      CREATE TABLE in_app_notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        search_id uuid,
        item_id uuid,
        title text NOT NULL,
        message text NOT NULL,
        match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb
      );
      CREATE UNIQUE INDEX in_app_notifications_search_item_uq
        ON in_app_notifications (search_id, item_id)
        WHERE search_id IS NOT NULL AND item_id IS NOT NULL;
      INSERT INTO users (id, status, college_id) VALUES
        ('${sellerId}', 'active', ${collegeId}),
        ('${recipientId}', 'active', ${collegeId});
      INSERT INTO saved_searches (id, user_id, college_id, keyword, auto_tracked) VALUES
        ('${automaticSearchId}', '${recipientId}', ${collegeId}, 'physics calculator', true),
        ('${manualSearchId}', '${recipientId}', ${collegeId}, 'physics', false);
      INSERT INTO search_alert_preferences (user_id, auto_track_searches)
      VALUES ('${recipientId}', false);
    `)

    const { rows } = await database.query(itemSearchAlertQuery(), [
      collegeId,
      '22d5e897-ad5b-4ad0-9b43-212ac9488a69',
      'Physics Calculator',
      sellerId,
      '',
      null,
      null,
    ])
    assert.deepEqual(rows.map((row) => row.user_id), [recipientId])

    const { rows: notifications } = await database.query(
      'SELECT search_id FROM in_app_notifications',
    )
    assert.deepEqual(notifications, [{ search_id: manualSearchId }])
  } finally {
    await database.close()
  }
})
