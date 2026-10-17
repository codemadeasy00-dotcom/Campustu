// Usage: npm run make-admin -- someone@college.ac.in
// The person must have signed up and verified their email first.
const { Client } = require('pg');
require('dotenv').config();

(async () => {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run make-admin -- email@example.com');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const r = await client.query(
    `UPDATE users SET role = 'admin' WHERE lower(email) = $1 AND email_verified_at IS NOT NULL RETURNING email`,
    [email]
  );
  console.log(r.rowCount ? `${r.rows[0].email} is now an admin.` : 'No verified user with that email. Sign up and verify first.');
  await client.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
