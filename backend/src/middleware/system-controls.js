const { query } = require('../db');
const { AppError } = require('../utils/errors');

async function requireImageUploadsEnabled(_req, _res, next) {
  const { rows: [control] } = await query(
    "SELECT enabled FROM system_controls WHERE key = 'image_uploads_enabled'",
  );
  if (!control?.enabled) {
    throw new AppError(503, 'Image uploads are temporarily disabled by the administrators.', 'IMAGE_UPLOADS_DISABLED');
  }
  next();
}

async function requireMarketplaceWritable(_req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(_req.method)) return next();
  const { rows: [control] } = await query(
    "SELECT enabled FROM system_controls WHERE key = 'marketplace_read_only'",
  );
  if (!control) {
    throw new AppError(503, 'Marketplace write controls are unavailable. Please try again later.', 'SYSTEM_CONTROL_UNAVAILABLE');
  }
  if (control?.enabled) {
    throw new AppError(503, 'The marketplace is temporarily read-only. Please try again later.', 'MARKETPLACE_READ_ONLY');
  }
  next();
}

module.exports = { requireImageUploadsEnabled, requireMarketplaceWritable };
