import { pipeline } from '@huggingface/transformers'

const MODEL_ID = 'Xenova/clip-vit-base-patch32'
const EMBEDDING_SIZE = 512

let extractor
let extractorPromise

async function getExtractor() {
  if (extractor) return extractor
  if (!extractorPromise) {
    extractorPromise = pipeline('image-feature-extraction', MODEL_ID)
      .then((loadedExtractor) => {
        extractor = loadedExtractor
        return loadedExtractor
      })
      .catch((error) => {
        extractorPromise = null
        throw error
      })
  }
  return extractorPromise
}

export async function getImageEmbedding(imageElementOrUrl) {
  const imageExtractor = await getExtractor()
  const output = await imageExtractor(imageElementOrUrl)
  const values = Array.from(output.data)

  if (values.length !== EMBEDDING_SIZE || values.some((value) => !Number.isFinite(value))) {
    throw new Error('The image model returned an invalid embedding.')
  }

  const magnitude = Math.hypot(...values)
  if (magnitude === 0) throw new Error('The image model returned an empty embedding.')

  return values.map((value) => value / magnitude)
}
