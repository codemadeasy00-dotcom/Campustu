const config = require('../config');
const { AppError } = require('./errors');

const NSFW_THRESHOLD = 0.75;

async function assertImageIsAllowed(imageBuffer) {
  if (!config.hfAccessToken) {
    throw new AppError(503, 'Image moderation is not configured. Please try again later.', 'IMAGE_MODERATION_UNAVAILABLE');
  }

  let response;
  try {
    response = await fetch(
      `https://router.huggingface.co/hf-inference/models/${config.imageModerationModel}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.hfAccessToken}`,
          'Content-Type': 'image/webp',
        },
        body: imageBuffer,
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch (error) {
    console.error('Image moderation request failed:', error.message);
    throw new AppError(503, 'Image moderation is temporarily unavailable. Your photo was not uploaded.', 'IMAGE_MODERATION_UNAVAILABLE');
  }

  if (!response.ok) {
    console.error(`Image moderation provider returned HTTP ${response.status}.`);
    throw new AppError(503, 'Image moderation is temporarily unavailable. Your photo was not uploaded.', 'IMAGE_MODERATION_UNAVAILABLE');
  }

  let classifications;
  try {
    classifications = await response.json();
  } catch (error) {
    console.error('Image moderation provider returned invalid JSON:', error.message);
    throw new AppError(503, 'Image moderation could not verify this photo. Please try again later.', 'IMAGE_MODERATION_UNAVAILABLE');
  }

  if (!Array.isArray(classifications) || classifications.length === 0) {
    console.error('Image moderation provider returned no classifications.');
    throw new AppError(503, 'Image moderation could not verify this photo. Please try again later.', 'IMAGE_MODERATION_UNAVAILABLE');
  }

  const knownLabels = new Set(['nsfw', 'unsafe', 'normal', 'safe']);
  if (classifications.some((result) => (
    !result
    || typeof result.label !== 'string'
    || !knownLabels.has(String(result.label).toLowerCase())
    || typeof result.score !== 'number'
    || !Number.isFinite(result.score)
    || result.score < 0
    || result.score > 1
  ))) {
    console.error('Image moderation provider returned an unsupported classification.');
    throw new AppError(503, 'Image moderation could not verify this photo. Please try again later.', 'IMAGE_MODERATION_UNAVAILABLE');
  }

  const nsfwScore = classifications
    .filter((result) => ['nsfw', 'unsafe'].includes(String(result.label).toLowerCase()))
    .reduce((highest, result) => Math.max(highest, result.score), 0);

  if (nsfwScore > NSFW_THRESHOLD) {
    throw new AppError(400, 'This photo appears to violate the image content guidelines and was not uploaded.', 'IMAGE_CONTENT_REJECTED');
  }
}

async function assertPhotosAreAllowed(photos) {
  const results = await Promise.allSettled(photos.map((photo) => assertImageIsAllowed(photo)));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
}

module.exports = { assertImageIsAllowed, assertPhotosAreAllowed };
