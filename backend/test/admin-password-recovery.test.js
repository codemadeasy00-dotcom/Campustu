const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config');
const { pool } = require('../src/db');
const { verifyAdminPassword } = require('../src/utils/admin-auth');

const adminId = 'c363a326-9ec8-49e3-8dfb-0f2078a48daf';
const newPassword = 'C@mpustu-Admin-Recovery-2026';

async function withServer(run) {
  const server = app.listen(0);
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function sessionCookie(issuedAt) {
  const token = jwt.sign(
    { sub: adminId, ver: 0, iat: issuedAt },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: '7d' },
  );
  return `campustu_session=${token}`;
}

test('admin password recovery requires a recent email-code sign-in and revokes older admin sessions', async (t) => {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const transactionCalls = [];
  let savedPasswordHash;
  t.after(() => {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  });

  pool.query = async (text) => {
    if (text.startsWith('SELECT id, email, full_name')) {
      return {
        rows: [{
          id: adminId,
          email: 'admin@example.edu',
          full_name: 'Admin',
          display_name: 'Admin',
          role: 'admin',
          status: 'active',
          branch_id: null,
          admission_year: null,
          college_id: 1,
          auth_version: 0,
        }],
      };
    }
    assert.fail(`Unexpected query: ${text}`);
  };
  pool.connect = async () => ({
    async query(text, params) {
      transactionCalls.push({ text, params });
      if (text.startsWith('SELECT admin_password_version')) {
        return { rows: [{ admin_password_version: 1 }] };
      }
      if (text.startsWith('UPDATE users')) {
        savedPasswordHash = params[1];
        return { rows: [{ admin_password_version: 2 }] };
      }
      return { rows: [] };
    },
    release() {},
  });

  await withServer(async (baseUrl) => {
    const resetUrl = `${baseUrl}/api/admin/auth/reset-password`;
    const body = JSON.stringify({ password: newPassword });
    const oldResponse = await fetch(resetUrl, {
      method: 'POST',
      headers: { Cookie: sessionCookie(Math.floor(Date.now() / 1000) - 601), 'Content-Type': 'application/json' },
      body,
    });
    assert.equal(oldResponse.status, 403);
    assert.equal((await oldResponse.json()).code, 'ADMIN_PASSWORD_RESET_REAUTH_REQUIRED');
    assert.equal(transactionCalls.length, 0);

    const freshResponse = await fetch(resetUrl, {
      method: 'POST',
      headers: { Cookie: sessionCookie(Math.floor(Date.now() / 1000)), 'Content-Type': 'application/json' },
      body,
    });
    assert.equal(freshResponse.status, 200);
    assert.deepEqual(await freshResponse.json(), { success: true, unlocked: true });
    assert.match(freshResponse.headers.get('set-cookie'), /campustu_admin_session=/);
  });

  assert.equal(await verifyAdminPassword(newPassword, savedPasswordHash), true);
  assert.ok(transactionCalls.some(({ text }) => text.startsWith('UPDATE users')));
  assert.ok(transactionCalls.some(({ text, params }) => (
    text.startsWith('INSERT INTO admin_audit_logs') && params[1] === 'reset_admin_password'
  )));
});
