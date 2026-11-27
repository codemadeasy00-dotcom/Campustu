const sharp = require('sharp');
const tf = require('@tensorflow/tfjs');
const nsfwjs = require('nsfwjs');
const { AppError } = require('./errors');

const IMAGE_SIZE = 224;
const BLOCKED_LABELS = new Set(['porn', 'hentai', 'sexy']);
const BLOCK_THRESHOLD = 0.6;

let modelPromise;
let modelWarmPromise;
let modelClassified = false;

async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.setBackend('cpu');
      await tf.ready();
      return nsfwjs.load();
    })().catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

function assertValidPredictions(predictions) {
  if (!Array.isArray(predictions) || predictions.length === 0) {
    throw new Error('Image safety model returned no predictions.');
  }

  for (const prediction of predictions) {
    if (
      typeof prediction?.className !== 'string'
      || !Number.isFinite(prediction.probability)
      || prediction.probability < 0
      || prediction.probability > 1
    ) {
      throw new Error('Image safety model returned invalid predictions.');
    }
  }

  return predictions;
}

function flaggedPrediction(predictions) {
  return predictions.find((prediction) => (
    BLOCKED_LABELS.has(prediction.className.toLowerCase())
    && prediction.probability >= BLOCK_THRESHOLD
  ));
}

async function classifyImage(data, width, height) {
  const model = await loadModel();
  const tensor = tf.tensor3d(data, [height, width, 3], 'int32');
  try {
    const predictions = await model.classify(tensor);
    modelClassified = true;
    return predictions;
  } finally {
    tensor.dispose();
  }
}

async function warmImageSafetyModel() {
  if (modelClassified) return;
  if (!modelWarmPromise) {
    modelWarmPromise = (async () => {
      const model = await loadModel();
      const tensor = tf.zeros([IMAGE_SIZE, IMAGE_SIZE, 3], 'int32');
      try {
        await model.classify(tensor);
        modelClassified = true;
      } finally {
        tensor.dispose();
      }
    })().catch((error) => {
      modelWarmPromise = null;
      throw error;
    });
  }
  await modelWarmPromise;
}

async function screenPhoto(buffer, classify = classifyImage) {
  let decoded;
  try {
    decoded = await sharp(buffer, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'fill' })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new AppError(400, 'This photo could not be decoded. Please choose a valid image.');
  }

  if (decoded.info.channels !== 3) {
    throw new AppError(400, 'This photo could not be decoded. Please choose a valid image.');
  }

  const predictions = assertValidPredictions(await classify(
    decoded.data,
    decoded.info.width,
    decoded.info.height,
  ));
  const flagged = flaggedPrediction(predictions);
  if (flagged) {
    return {
      safe: false,
      reason: `The photo was blocked by image safety screening (${flagged.className}).`,
    };
  }
  return { safe: true };
}

module.exports = {
  screenPhoto,
  warmImageSafetyModel,
  assertValidPredictions,
  flaggedPrediction,
};
