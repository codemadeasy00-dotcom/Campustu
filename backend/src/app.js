const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const storage = require('./storage');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);

if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'PATCH', 'DELETE'] }));
app.use(express.json({ limit: '100kb' }));

// Uploaded photos served from local disk
if (!storage.useS3) {
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(storage.root, { maxAge: '7d', immutable: true, index: false, dotfiles: 'deny' })
  );
}

// Rate limiter for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 30 : 500,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes' },
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// API Routes (Mounted under /api/ to match frontend requests)
app.use('/auth', authLimiter, require('./routes/auth'));
app.use('/meta', require('./routes/meta'));
app.use('/api/colleges', require('./routes/colleges'));
app.use('/api/me/college', require('./routes/me-college'));
app.use('/items', require('./routes/items'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;