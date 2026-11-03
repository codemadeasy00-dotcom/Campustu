const EXPLICIT_LABELS = new Set(['porn', 'hentai'])
const REJECTION_THRESHOLD = 0.6

let modelPromise

async function loadModel() {
  if (!modelPromise) {
    modelPromise = import('nsfwjs')
      .then((nsfwjs) => nsfwjs.load())
      .catch((error) => {
        modelPromise = null
        throw error
      })
  }
  return modelPromise
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The selected photo could not be opened for moderation.'))
    image.src = source
  })
}

async function imageElementFor(source) {
  if (source instanceof HTMLImageElement) return { image: source, objectUrl: null }
  if (!(source instanceof Blob)) {
    throw new Error('Choose a local image file to check.')
  }
  const objectUrl = URL.createObjectURL(source)
  try {
    return { image: await loadImage(objectUrl), objectUrl }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

export async function checkImageSafety(imageSource) {
  let objectUrl
  try {
    const model = await loadModel()
    const loaded = await imageElementFor(imageSource)
    objectUrl = loaded.objectUrl
    const predictions = await model.classify(loaded.image)
    if (!Array.isArray(predictions) || predictions.length === 0) {
      throw new Error('The moderation model returned no results.')
    }

    if (predictions.some((prediction) => (
      typeof prediction?.className !== 'string'
      || !Number.isFinite(prediction.probability)
      || prediction.probability < 0
      || prediction.probability > 1
    ))) {
      throw new Error('The moderation model returned invalid results.')
    }

    if (predictions.some((prediction) => (
      EXPLICIT_LABELS.has(prediction.className.toLowerCase())
      && prediction.probability > REJECTION_THRESHOLD
    ))) {
      return { safe: false, reason: 'Explicit content detected. Please upload a photo of the item only.' }
    }

    return { safe: true }
  } catch (error) {
    console.error('Local image moderation failed:', error)
    return {
      safe: false,
      unavailable: true,
      reason: 'Could not screen this photo on your device. Check your connection and try again.',
    }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

export async function checkImagesSafety(images, onProgress) {
  for (let index = 0; index < images.length; index += 1) {
    onProgress?.(index + 1, images.length)
    const result = await checkImageSafety(images[index])
    if (!result.safe) return { ...result, imageIndex: index }
  }
  return { safe: true }
}
