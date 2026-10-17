const router = require('express').Router();
const { z } = require('zod');
const config = require('../config');
const { query } = require('../db');
const { AppError } = require('../utils/errors');
const { generateCode, hashCode, safeEqual } = require('../utils/otp');
const { sendOtpEmail } = require('../email');
const { requireAuth, signToken } = require('../middleware/auth');
const { currentSemester } = require('../utils/semester');

const email = z.string().trim().toLowerCase().pipe(z.email()).refine((v) => v.length <= 254, 'Email too long');
const optionalInt = (min, max) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().int().min(min).max(max).optional());

const signupSchema = z.object({
  email,
  full_name: z.string().trim().min(2).max(100),
  display_name: z.string().trim().min(2).max(40),
  branch_id: optionalInt(1, 32767),
  admission_year: optionalInt(2000, 2100),
});
const loginSchema = z.object({ email });
const verifySchema = z.object({ email, code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits') });

// Same reply whether or not the email exists, so nobody can probe who has an account.
const GENERIC = { message: 'If that email can be used, a 6-digit code has been sent. It expires in 10 minutes.' };

function domainAllowed(addr) {
  if (config.allowedEmailDomains.length === 0) return true;
  return config.allowedEmailDomains.includes(addr.split('@')[1]);
}

// Creates and emails a code. Silently does nothing if one was sent very recently
// (resend cooldown). Email failures are logged, not shown, for the same
// "don't reveal accounts" reason.
async function issueOtp(addr, purpose) {
  const { rows } = await query(
    `SELECT EXTRACT(EPOCH FROM (now() - created_at)) AS age
       FROM email_otps WHERE lower(email) = $1 ORDER BY created_at DESC LIMIT 1`,
    [addr]
  );
  if (rows[0] && Number(rows[0].age) < config.otp.resendSeconds) return;

  const code = generateCode();
  await query('UPDATE email_otps SET consumed_at = now() WHERE lower(email) = $1 AND consumed_at IS NULL', [addr]);
  await query(
    `INSERT INTO email_otps (email, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
    [addr, purpose, hashCode(addr, code), config.otp.ttlMinutes]
  );
  try {
    await sendOtpEmail(addr, code);
  } catch (err) {
    console.error('Failed to send OTP email:', err.message);
  }
}

// POST /auth/signup  -> creates (or refreshes) an unverified account and emails a code
router.post('/signup', async (req, res) => {
  const b = signupSchema.parse(req.body);
  if (!domainAllowed(b.email)) {
    throw new AppError(400, `Please sign up with your college email (@${config.allowedEmailDomains.join(', @')})`);
  }

  const { rows } = await query('SELECT id, email_verified_at, status FROM users WHERE lower(email) = $1', [b.email]);
  const existing = rows[0];

  if (!existing) {
    await query(
      `INSERT INTO users (email, full_name, display_name, branch_id, admission_year)
       VALUES ($1, $2, $3, $4, $5)`,
      [b.email, b.full_name, b.display_name, b.branch_id ?? null, b.admission_year ?? null]
    );
    await issueOtp(b.email, 'signup');
  } else if (!existing.email_verified_at) {
    // Never completed verification: allow correcting the details.
    await query(
      `UPDATE users SET full_name = $2, display_name = $3, branch_id = $4, admission_year = $5 WHERE id = $1`,
      [existing.id, b.full_name, b.display_name, b.branch_id ?? null, b.admission_year ?? null]
    );
    await issueOtp(b.email, 'signup');
  } else if (existing.status !== 'banned') {
    await issueOtp(b.email, 'login'); // already registered: treat as a login
  }
  res.json(GENERIC);
});

// POST /auth/login -> emails a code if the account exists
router.post('/login', async (req, res) => {
  const { email: addr } = loginSchema.parse(req.body);
  const { rows } = await query(
    `SELECT status FROM users
      WHERE lower(email) = $1 AND email_verified_at IS NOT NULL AND deleted_at IS NULL`,
    [addr]
  );
  if (rows[0] && rows[0].status !== 'banned') await issueOtp(addr, 'login');
  res.json(GENERIC);
});

// POST /auth/verify -> checks the code, marks email verified, returns a session token
router.post('/verify', async (req, res) => {
  const { email: addr, code } = verifySchema.parse(req.body);
  const bad = () => new AppError(400, 'Invalid or expired code', 'INVALID_CODE');

  // Count the attempt FIRST (atomically), then compare. Even parallel guessing
  // cannot exceed maxAttempts per code.
  const { rows } = await query(
    `UPDATE email_otps SET attempts = attempts + 1
      WHERE id = (SELECT id FROM email_otps
                   WHERE lower(email) = $1 AND consumed_at IS NULL
                     AND expires_at > now() AND attempts < $2
                   ORDER BY created_at DESC LIMIT 1)
      RETURNING id, code_hash`,
    [addr, config.otp.maxAttempts]
  );
  const otp = rows[0];
  if (!otp || !safeEqual(otp.code_hash, hashCode(addr, code))) throw bad();

  const used = await query('UPDATE email_otps SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL', [otp.id]);
  if (used.rowCount === 0) throw bad();

  const u = await query(
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now())
      WHERE lower(email) = $1 AND deleted_at IS NULL AND status <> 'banned'
      RETURNING id`,
    [addr]
  );
  if (u.rowCount === 0) throw bad();

  res.json({ token: signToken(u.rows[0].id), user: await publicProfile(u.rows[0].id) });
});

async function publicProfile(userId) {
  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.display_name, u.role, u.status, u.branch_id, u.admission_year,
            t.trust_score::int AS trust_score, t.is_trusted, t.completed_handovers::int AS completed_handovers
       FROM users u JOIN user_trust t ON t.user_id = u.id WHERE u.id = $1`,
    [userId]
  );
  const u = rows[0];
  return { ...u, current_semester: currentSemester(u.admission_year) };
}

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: await publicProfile(req.user.id) });
});

module.exports = router;
