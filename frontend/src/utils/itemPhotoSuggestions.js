const CATEGORY_KEYWORDS = [
  ['Electronics & Gadgets', /\b(phone|telephone|laptop|computer|keyboard|mouse|remote control|calculator|camera|headphone|earphone|charger|adapter|monitor|tablet|clock|watch)\b/i],
  ['Books & Study Materials', /\b(book|notebook|textbook|binder|paper|ruler|pencil|pen|marker|calculator)\b/i],
  ['Clothing & Accessories', /\b(shirt|jersey|coat|jacket|shoe|sandal|sock|sunglasses|necklace|bracelet|belt|hat|cap)\b/i],
  ['Keys & ID Cards', /\b(key|keychain|identity card|id card|license|badge|pass)\b/i],
  ['Bags & Personal Items', /\b(backpack|handbag|purse|wallet|suitcase|briefcase|bag|bottle|umbrella|glasses)\b/i],
]

function titleCase(value) {
  return value
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function suggestCategory(label) {
  return CATEGORY_KEYWORDS.find(([, pattern]) => pattern.test(label))?.[0] || 'Other'
}

export async function suggestItemDetails(image, imageForClassification, onProgress) {
  const { createWorker } = await import('tesseract.js')
  let recognizedText = ''
  let worker
  try {
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
    worker = await createWorker('eng', 1, {
      workerPath: new URL('ocr/worker.min.js', baseUrl).href,
      corePath: new URL('ocr/core/', baseUrl).href,
      langPath: new URL('ocr/lang/', baseUrl).href,
      logger: ({ status, progress }) => {
        onProgress?.(`OCR: ${status}`, progress)
      },
    })
    const result = await worker.recognize(image)
    recognizedText = result.data.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 20)
      .join('\n')
      .slice(0, 1000)
  } catch (error) {
    throw new Error('Text recognition could not start. Reload the page and retry.', { cause: error })
  } finally {
    if (worker) await worker.terminate()
  }

  let predictions = []
  let classificationUnavailable = false
  try {
    onProgress?.('OCR complete. Recognizing the item…')
    const { classifyImage } = await import('./embedder.js')
    predictions = await classifyImage(imageForClassification)
  } catch (error) {
    console.error('Could not classify lost-and-found photo:', error)
    classificationUnavailable = true
  }

  const bestPrediction = predictions.find((prediction) => prediction.probability >= 0.15)
  const label = bestPrediction?.className || ''

  return {
    title: label ? titleCase(label) : '',
    category: label ? suggestCategory(label) : null,
    description: label
      ? `A ${label.replaceAll('_', ' ')} was recognized in the photo. Add its color, distinguishing marks, and location details.`
      : '',
    detectedText: recognizedText,
    labels: predictions.map(({ className, probability }) => ({
      name: titleCase(className),
      confidence: probability,
    })),
    classificationUnavailable,
  }
}
