const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db');
const { AppError } = require('../utils/errors');

const USER_COLUMNS = 'id, email, full_name, display_name, role, status, branch_id, admission_year';

// Reads "Authorization: Bearer <token>", then loads the user FRESH from the database,
// so a frozen/banned account is blocked immediately, not when the token expires.
async function requireAuth(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new AppError(401, 'Please log in');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new AppError(401, 'Your session is invalid or has expired. Please log in again');
  }

  const { rows } = await query(
    `SELECT ${USER_COLUMNS} FROM users
      WHERE id = $1 AND deleted_at IS NULL AND email_verified_at IS NOT NULL`,
    [payload.sub]
  );
  const user = rows[0];
  if (!user || user.status === 'banned') throw new AppError(401, 'Please log in');
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

module.exports = { requireAuth, requireActive, requireAdmin, signToken };
