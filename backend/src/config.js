require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name} (see .env.example)`);
  return v;
}
const int = (name, fallback) => {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : Number(v);
};
const list = (name) =>
  (process.env[name] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

const config = {
  env,
  isProd,
  port: int('PORT', 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  otpSecret: required('OTP_SECRET'),
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  allowedEmailDomains: list('ALLOWED_EMAIL_DOMAINS'),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int('SMTP_PORT', 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'CampusKit <no-reply@example.com>',
  },
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:4000').replace(/\/$/, ''),
  otp: { ttlMinutes: 10, maxAttempts: 5, resendSeconds: 60 },
  jwtExpiresIn: '7d',
  newUserMaxPrice: int('NEW_USER_MAX_PRICE', 500),
  newUserMaxActiveListings: int('NEW_USER_MAX_ACTIVE_LISTINGS', 5),
  oddSemesterStartMonth: int('ODD_SEMESTER_START_MONTH', 7),
  maxPhotosPerItem: 5,
  maxPhotoBytes: 8 * 1024 * 1024,
};

if (isProd) {
  if (config.jwtSecret.length < 32 || config.otpSecret.length < 32) {
    throw new Error('JWT_SECRET and OTP_SECRET must be at least 32 characters in production');
  }
  if (!config.smtp.host) throw new Error('SMTP_HOST is required in production');
}

module.exports = config;
