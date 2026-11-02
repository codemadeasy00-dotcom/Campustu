const config = require('../config');
const { AppError } = require('./errors');

const NSFW_THRESHOLD = 0.75;

function getProviderErrorMessage(status, responseBody) {
  const detail = typeof responseBody === 'object' && responseBody !== null
    ? responseBody.error || responseBody.message
    : responseBody;
  const safeDetail = typeof detail === 'string'
    ? detail.replace(/hf_[A-Za-z0-9_-]+/g, '[redacted token]').slice(0, 500)
    : '';
  console.error(
    `Image moderation provider returned HTTP ${status}${safeDetail ? `: ${safeDetail}` : ''}.`,
  );

  if (status === 401 || status === 403) {
    return 'Hugging Face rejected the moderation credentials. Check that HF_ACCESS_TOKEN is valid and has Inference Providers permission, then redeploy the backend.';
  }
  if (status === 404) {
    return 'The configured moderation model is unavailable to Hugging Face Inference Providers. Check IMAGE_MODERATION_MODEL in Render.';
  }
  if (status === 429) {
    return 'Image moderation is rate-limited right now. Please wait a moment and try again.';
  }
  if (status === 503) {
    return 'Hugging Face image moderation is unavailable or still loading the model. Please wait briefly and try again.';
  }
  return 'Image moderation is temporarily unavailable. Please try again later.';
}

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
    let responseBody = '';
    try {
      const bodyText = await response.text();
      try {
        responseBody = JSON.parse(bodyText);
      } catch {
        responseBody = bodyText;
      }
    } catch (error) {
      console.error('Could not read the image moderation error response:', error.message);
    }
    throw new AppError(
      503,
      getProviderErrorMessage(response.status, responseBody),
      'IMAGE_MODERATION_UNAVAILABLE',
    );
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

module.exports = { assertImageIsAllowed, assertPhotosAreAllowed, getProviderErrorMessage };
