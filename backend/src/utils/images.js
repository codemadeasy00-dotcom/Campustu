const sharp = require('sharp');
const { AppError } = require('./errors');

const ALLOWED_FORMATS = ['jpeg', 'png', 'webp'];

// Takes an uploaded file buffer and returns a clean WebP buffer.
//  - checks the REAL file content (the browser-sent mime type can be faked)
//  - applies the camera's rotation, then re-encodes: this REMOVES EXIF data
//    such as GPS location of the photo
//  - shrinks big photos to max 1600px
async function processPhoto(buffer) {
  try {
    const meta = await sharp(buffer, { limitInputPixels: 50_000_000 }).metadata();
    if (!ALLOWED_FORMATS.includes(meta.format)) throw new Error('format');
    return await sharp(buffer, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new AppError(400, 'Photos must be real JPEG, PNG or WebP images');
  }
}

module.exports = { processPhoto };
