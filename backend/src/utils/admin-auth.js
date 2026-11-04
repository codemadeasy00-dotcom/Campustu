const crypto = require('node:crypto');
const { promisify } = require('node:util');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db');
const { AppError } = require('./errors');

const scrypt = promisify(crypto.scrypt);
const ADMIN_COOKIE_NAME = 'campustu_admin_session';
const ADMIN_SESSION_SECONDS = 30 * 60;
const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'strict',
  path: '/',
  maxAge: ADMIN_SESSION_SECONDS * 1000,
};

async function hashAdminPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

async function verifyAdminPassword(password, encodedHash) {
  const [algorithm, saltHex, hashHex, ...extra] = String(encodedHash || '').split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex || extra.length) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await scrypt(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function setAdminSessionCookie(res, userId, passwordVersion) {
  const token = jwt.sign(
    { sub: userId, pver: passwordVersion },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: ADMIN_SESSION_SECONDS },
  );
  res.cookie(ADMIN_COOKIE_NAME, token, ADMIN_COOKIE_OPTIONS);
}

function clearAdminSessionCookie(res) {
  const { maxAge: _maxAge, ...options } = ADMIN_COOKIE_OPTIONS;
  res.clearCookie(ADMIN_COOKIE_NAME, options);
}

async function hasValidAdminSession(req, userId) {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) return false;

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return false;
  }
  if (payload.sub !== userId || !Number.isInteger(payload.pver)) return false;

  const { rows: [user] } = await query(
    `SELECT admin_password_version
       FROM users
      WHERE id = $1 AND role = 'admin' AND status = 'active' AND deleted_at IS NULL`,
    [userId],
  );
  return Boolean(user && Number(user.admin_password_version) === payload.pver);
}

async function requireAdminPassword(req, res, next) {
  const { rows: [user] } = await query(
    `SELECT admin_password_hash, admin_password_version
       FROM users
      WHERE id = $1 AND role = 'admin' AND status = 'active' AND deleted_at IS NULL`,
    [req.user.id],
  );
  if (!user?.admin_password_hash) {
    throw new AppError(403, 'Set an admin password before using the admin console.', 'ADMIN_PASSWORD_SETUP_REQUIRED');
  }

  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) {
    throw new AppError(403, 'Enter your admin password to unlock the console.', 'ADMIN_PASSWORD_REQUIRED');
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (
      payload.sub !== req.user.id
      || Number(payload.pver) !== Number(user.admin_password_version)
    ) {
      throw new Error('Admin session no longer valid');
    }
  } catch {
    clearAdminSessionCookie(res);
    throw new AppError(403, 'Your admin session expired. Enter your admin password again.', 'ADMIN_PASSWORD_REQUIRED');
  }
  next();
}

module.exports = {
  hashAdminPassword,
  verifyAdminPassword,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  hasValidAdminSession,
  requireAdminPassword,
};
