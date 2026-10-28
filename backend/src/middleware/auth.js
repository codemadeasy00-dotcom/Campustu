const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db');
const { AppError } = require('../utils/errors');

const USER_COLUMNS = 'id, email, full_name, display_name, role, status, branch_id, admission_year, college_id';
const SESSION_COOKIE_NAME = 'campustu_session';
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'strict',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
}

function clearSessionCookie(res) {
  const { maxAge: _maxAge, ...options } = SESSION_COOKIE_OPTIONS;
  res.clearCookie(SESSION_COOKIE_NAME, options);
}

// Reads the HttpOnly session cookie and loads the user fresh from the database,
// so a frozen/banned account is blocked immediately, not when the token expires.
async function requireAuth(req, res, next) {
  const origin = req.get('origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && !config.corsOrigins.includes(origin)) {
    throw new AppError(403, 'Request origin is not allowed');
  }

  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) throw new AppError(401, 'Please log in');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    clearSessionCookie(res);
    throw new AppError(401, 'Your session is invalid or has expired. Please log in again');
  }

  const { rows } = await query(
    `SELECT ${USER_COLUMNS} FROM users
      WHERE id = $1 AND deleted_at IS NULL AND email_verified_at IS NOT NULL`,
    [payload.sub]
  );
  const user = rows[0];
  if (!user || user.status === 'banned') {
    clearSessionCookie(res);
    throw new AppError(401, 'Please log in');
  }
  req.user = user;
  next();
}

// Frozen accounts may log in and look around, but cannot create or change things.
function requireActive(req, _res, next) {
  if (req.user.status !== 'active') {
    throw new AppError(403, 'Your account is frozen pending admin review', 'ACCOUNT_FROZEN');
  }
  next();
}

// Marketplace and lost & found only exist inside a college.
function requireCollege(req, _res, next) {
  if (!req.user.college_id) {
    throw new AppError(403, 'Choose your college before using this feature', 'COLLEGE_REQUIRED')
  }
  next()
}

function requireAdmin(req, _res, next) {
  if (req.user.role !== 'admin') throw new AppError(403, 'Admins only');
  next();
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });
}

module.exports = {
  requireAuth,
  requireActive,
  requireCollege,
  requireAdmin,
  signToken,
  setSessionCookie,
  clearSessionCookie,
};
