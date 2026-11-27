const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const {
  screenPhoto,
  assertValidPredictions,
  flaggedPrediction,
} = require('../src/utils/image-safety');
const { createImageSafetyMiddleware } = require('../src/middleware/image-safety');
const { AppError } = require('../src/utils/errors');

const prediction = (className, probability) => ({ className, probability });

test('validates model predictions and blocks explicit categories at the threshold', () => {
  const predictions = [
    prediction('Neutral', 0.4),
    prediction('Porn', 0.6),
  ];

  assert.equal(assertValidPredictions(predictions), predictions);
  assert.equal(flaggedPrediction(predictions), predictions[1]);
  assert.equal(flaggedPrediction([prediction('Sexy', 0.59)]), undefined);
  assert.throws(() => assertValidPredictions([]), /no predictions/i);
  assert.throws(() => assertValidPredictions([prediction('Neutral', NaN)]), /invalid predictions/i);
});

test('decodes an image before classifying and rejects malformed image bytes', async () => {
  const image = await sharp({
    create: { width: 4, height: 3, channels: 3, background: '#808080' },
  }).png().toBuffer();
  let classifiedDimensions;

  const result = await screenPhoto(image, async (data, width, height) => {
    classifiedDimensions = { dataLength: data.length, width, height };
    return [prediction('Neutral', 0.99)];
  });

  assert.deepEqual(result, { safe: true });
  assert.deepEqual(classifiedDimensions, { dataLength: 224 * 224 * 3, width: 224, height: 224 });
  await assert.rejects(
    screenPhoto(Buffer.from('not an image')),
    (error) => error instanceof AppError && error.status === 400,
  );
});

test('image middleware continues for safe photos and rejects flagged or unscannable uploads', async () => {
  const req = { files: [{ buffer: Buffer.from('photo') }] };
  let nextCalled = false;
  const safeMiddleware = createImageSafetyMiddleware(async () => ({ safe: true }));
  await safeMiddleware(req, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  const flaggedMiddleware = createImageSafetyMiddleware(async () => ({
    safe: false,
    reason: 'Blocked photo.',
  }));
  await assert.rejects(
    flaggedMiddleware(req, {}, () => assert.fail('unsafe photo must not continue')),
    (error) => error instanceof AppError && error.status === 400 && error.code === 'IMAGE_UNSAFE',
  );

  const unavailableMiddleware = createImageSafetyMiddleware(async () => {
    throw new Error('model unavailable');
  });
  await assert.rejects(
    unavailableMiddleware(req, {}, () => assert.fail('unscannable photo must not continue')),
    (error) => error instanceof AppError && error.status === 503 && error.code === 'IMAGE_SCREENING_UNAVAILABLE',
  );
});
