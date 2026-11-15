const test = require('node:test')
const assert = require('node:assert/strict')
const app = require('../src/app')
const { pool } = require('../src/db')
const { signToken } = require('../src/middleware/auth')

const userId = '8d69ca2e-fc32-4e27-b647-28ad6510f8ac'
const recipientId = '9c746c68-d834-4f4a-9bfe-c2086449e46f'
const automaticSearchId = 'd842d04e-3631-4f10-a57a-a18d67468664'
const manualSearchId = 'ef4ff9de-2f33-4dfa-a664-23fd15818bf5'
const collegeId = 41

test('creates a request with no branch and respects disabled automatic search alerts', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const database = new PGlite()
  const originalQuery = pool.query
  const originalConnect = pool.connect
  let server

  pool.query = (text, params) => database.query(text, params)
  pool.connect = async () => ({
    query: (text, params) => database.query(text, params),
    release() {},
  })

  try {
    await database.exec(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        email text NOT NULL,
        full_name text NOT NULL,
        display_name text NOT NULL,
        role text NOT NULL,
        status text NOT NULL,
        branch_id smallint,
        admission_year smallint,
        college_id integer NOT NULL,
        auth_version integer NOT NULL DEFAULT 0,
        deleted_at timestamptz,
        email_verified_at timestamptz
      );
      CREATE TABLE need_board_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        college_id integer NOT NULL,
        branch_id smallint,
        category_id smallint,
        title text NOT NULL,
        description text NOT NULL DEFAULT '',
        expires_at timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'open',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE categories (id smallint PRIMARY KEY, name text NOT NULL);
      CREATE TABLE branches (id smallint PRIMARY KEY, name text NOT NULL);
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
        auto_track_searches boolean NOT NULL DEFAULT true,
        quiet_start time,
        quiet_end time,
        timezone text NOT NULL DEFAULT 'UTC'
      );
      CREATE TABLE in_app_notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        search_id uuid,
        need_request_id uuid,
        title text NOT NULL,
        message text NOT NULL,
        match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb
      );
      CREATE UNIQUE INDEX in_app_notifications_search_request_uq
        ON in_app_notifications (search_id, need_request_id)
        WHERE search_id IS NOT NULL AND need_request_id IS NOT NULL;
      INSERT INTO users
        (id, email, full_name, display_name, role, status, college_id, email_verified_at)
      VALUES
        ('${userId}', 'student@example.edu', 'Student', 'Student', 'student', 'active', ${collegeId}, now());
    `)
    await database.query(
      `INSERT INTO users
         (id, email, full_name, display_name, role, status, college_id, email_verified_at)
       VALUES ($1, 'recipient@example.edu', 'Recipient', 'Recipient', 'student', 'active', $2, now())`,
      [recipientId, collegeId],
    )
    await database.query(
      `INSERT INTO saved_searches (id, user_id, college_id, keyword, auto_tracked)
       VALUES ($1, $2, $3, 'physics calculator', true), ($4, $2, $3, 'physics', false)`,
      [automaticSearchId, recipientId, collegeId, manualSearchId],
    )
    await database.query(
      'INSERT INTO search_alert_preferences (user_id, auto_track_searches) VALUES ($1, false)',
      [recipientId],
    )

    server = app.listen(0)
    await new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })

    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/needs`, {
      method: 'POST',
      headers: {
        Cookie: `campustu_session=${signToken(userId, 0)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Looking for a physics calculator' }),
    })

    const responseBody = await response.text()
    assert.equal(response.status, 201, responseBody)
    const result = JSON.parse(responseBody)
    assert.equal(result.request.title, 'Looking for a physics calculator')
    assert.equal(result.request.branch_id, null)
    const { rows: notifications } = await database.query(
      'SELECT search_id FROM in_app_notifications WHERE need_request_id = $1',
      [result.request.id],
    )
    assert.deepEqual(notifications, [{ search_id: manualSearchId }])
  } finally {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
    pool.query = originalQuery
    pool.connect = originalConnect
    await database.close()
  }
})
