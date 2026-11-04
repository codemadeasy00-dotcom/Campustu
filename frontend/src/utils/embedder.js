const EMBEDDING_SIZE = 1024

let modelPromise

async function getModel() {
  if (!modelPromise) {
    modelPromise = import('@tensorflow-models/mobilenet')
      .then(({ load }) => load({ version: 1, alpha: 1.0 }))
      .catch((error) => {
        modelPromise = null
        throw error
      })
  }
  return modelPromise
}

export async function getImageEmbedding(imageElementOrUrl) {
  const model = await getModel()
  let image = imageElementOrUrl

  if (typeof imageElementOrUrl === 'string') {
    image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = imageElementOrUrl
    await new Promise((resolve, reject) => {
      if (image.complete && image.naturalWidth > 0) {
        resolve()
      } else {
        image.onload = resolve
        image.onerror = () => reject(new Error('The image could not be loaded for visual matching.'))
      }
    })
  }

  let tensor
  try {
    tensor = model.infer(image, true)
    const values = Array.from(await tensor.data())
    if (values.length !== EMBEDDING_SIZE || values.some((value) => !Number.isFinite(value))) {
      throw new Error('The visual-matching model returned an invalid embedding.')
    }

    const magnitude = Math.hypot(...values)
    if (magnitude === 0) throw new Error('The visual-matching model returned an empty embedding.')
    return values.map((value) => value / magnitude)
  } finally {
    tensor?.dispose()
  }
}
