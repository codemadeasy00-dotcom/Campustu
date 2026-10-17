const crypto = require('crypto');
const config = require('../config');

// 6-digit code from a cryptographically secure source.
const generateCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

// Only this hash is stored in the database, never the code itself.
const hashCode = (email, code) =>
  crypto.createHmac('sha256', config.otpSecret).update(`${email}|${code}`).digest('hex');

const safeEqual = (a, b) => {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

module.exports = { generateCode, hashCode, safeEqual };
