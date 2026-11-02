const multer = require('multer');
const path = require('path');
const config = require('../config');
const { AppError } = require('./errors');

const allowedTypes = new Map([
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])],
  ['image/webp', new Set(['.webp'])],
]);

function createImageUpload(maxFiles = 1) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxPhotoBytes, files: maxFiles },
    fileFilter(_req, file, callback) {
      const extensions = allowedTypes.get(file.mimetype);
      if (!extensions || !extensions.has(path.extname(file.originalname).toLowerCase())) {
        callback(new AppError(400, 'Only JPEG, PNG and WebP image files are allowed.'));
        return;
      }
      callback(null, true);
    },
  });
}

module.exports = { createImageUpload };
