const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.OTP_SECRET = 'test-otp-secret';
process.env.HF_ACCESS_TOKEN = 'hf_test_token';

const config = require('../src/config');
const { AppError } = require('../src/utils/errors');
const { assertImageIsAllowed } = require('../src/utils/image-moderation');
const { createImageUpload } = require('../src/utils/image-upload');

const image = Buffer.from('processed-webp-image');

async function withMockedFetch(handler, callback) {
  const previousFetch = global.fetch;
  global.fetch = handler;
  try {
    await callback();
  } finally {
    global.fetch = previousFetch;
  }
}

test('allows an image classified as normal and sends it to the configured endpoint', async () => {
  await withMockedFetch(async (url, options) => {
    assert.equal(url, 'https://router.huggingface.co/hf-inference/models/Falconsai/nsfw_image_detection');
    assert.equal(options.headers.Authorization, 'Bearer hf_test_token');
    assert.equal(options.headers['Content-Type'], 'image/webp');
    assert.deepEqual(options.body, image);
    return new Response(JSON.stringify([{ label: 'normal', score: 0.99 }, { label: 'nsfw', score: 0.01 }]));
  }, async () => {
    await assertImageIsAllowed(image);
  });
});

test('rejects images above the configured NSFW confidence threshold', async () => {
  await withMockedFetch(
    async () => new Response(JSON.stringify([{ label: 'nsfw', score: 0.76 }, { label: 'normal', score: 0.24 }])),
    async () => {
      await assert.rejects(assertImageIsAllowed(image), (error) => (
        error instanceof AppError
        && error.status === 400
        && error.code === 'IMAGE_CONTENT_REJECTED'
      ));
    },
  );
});

test('allows an exact-threshold score and fails closed on malformed results or provider outages', async () => {
  await withMockedFetch(
    async () => new Response(JSON.stringify([{ label: 'nsfw', score: 0.75 }, { label: 'normal', score: 0.25 }])),
    async () => assertImageIsAllowed(image),
  );
  await withMockedFetch(
    async () => new Response(JSON.stringify({ error: 'model unavailable' })),
    async () => {
      await assert.rejects(assertImageIsAllowed(image), (error) => error.code === 'IMAGE_MODERATION_UNAVAILABLE');
    },
  );
  await withMockedFetch(
    async () => { throw new Error('network unavailable'); },
    async () => {
      await assert.rejects(assertImageIsAllowed(image), (error) => error.code === 'IMAGE_MODERATION_UNAVAILABLE');
    },
  );
});

test('refuses to upload images when moderation credentials are missing', async () => {
  const originalToken = config.hfAccessToken;
  config.hfAccessToken = '';
  try {
    await assert.rejects(assertImageIsAllowed(image), (error) => error.code === 'IMAGE_MODERATION_UNAVAILABLE');
  } finally {
    config.hfAccessToken = originalToken;
  }
});

test('returns actionable errors for invalid provider credentials and unavailable models', async () => {
  await withMockedFetch(
    async () => new Response(JSON.stringify({ error: 'Invalid token hf_should_not_be_logged' }), { status: 401 }),
    async () => {
      await assert.rejects(assertImageIsAllowed(image), (error) => (
        error.code === 'IMAGE_MODERATION_UNAVAILABLE'
        && error.message.includes('Inference Providers permission')
      ));
    },
  );
  await withMockedFetch(
    async () => new Response(JSON.stringify({ error: 'Model is loading' }), { status: 503 }),
    async () => {
      await assert.rejects(assertImageIsAllowed(image), (error) => (
        error.code === 'IMAGE_MODERATION_UNAVAILABLE'
        && error.message.includes('still loading')
      ));
    },
  );
});

test('limits file size and rejects MIME or extension mismatches', async () => {
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
