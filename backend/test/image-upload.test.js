const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://localhost:5432/test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.OTP_SECRET = 'test-otp-secret';

const { createImageUpload } = require('../src/utils/image-upload');

test('limits image uploads and rejects MIME or extension mismatches', async () => {
  const upload = createImageUpload(5);
  assert.equal(upload.limits.fileSize, 5 * 1024 * 1024);
  assert.equal(upload.limits.files, 5);

  const filter = (file) => new Promise((resolve) => {
    upload.fileFilter({}, file, (error, accepted) => resolve({ error, accepted }));
  });
  assert.deepEqual(await filter({ mimetype: 'image/webp', originalname: 'photo.webp' }), { error: null, accepted: true });

  const mismatch = await filter({ mimetype: 'image/png', originalname: 'payload.exe' });
  assert.equal(mismatch.error.status, 400);
});
