const multer = require('multer');
const { ZodError } = require('zod');
const { AppError } = require('../utils/errors');

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'Each photo must be 8 MB or smaller',
  LIMIT_FILE_COUNT: 'Too many photos (maximum 5)',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field. Send photos in the "photos" field',
};

function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Express 5 forwards errors from async handlers here automatically.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Invalid input',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: MULTER_MESSAGES[err.code] || 'Upload failed' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body exceeds the 10 MB limit' });
  }
  // Postgres errors we can explain safely
  if (err.code === '23503') return res.status(400).json({ error: 'A referenced record does not exist' });
  if (err.code === '23505') return res.status(409).json({ error: 'That already exists' });
  if (err.code === '23514') return res.status(400).json({ error: 'A value is out of the allowed range' });

  console.error(err); // details stay in the server log, never sent to the client
  res.status(500).json({ error: 'Something went wrong' });
}

module.exports = { notFound, errorHandler };
