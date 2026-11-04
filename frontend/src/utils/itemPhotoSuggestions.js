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
  const worker = await createWorker('eng', 1, {
    logger: ({ status, progress }) => {
      onProgress?.(status, progress)
    },
  })

  let recognizedText = ''
  try {
    const result = await worker.recognize(image)
    recognizedText = result.data.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 20)
      .join('\n')
      .slice(0, 1000)
  } finally {
    await worker.terminate()
  }

  const { classifyImage } = await import('./embedder.js')
  const predictions = await classifyImage(imageForClassification)
  const bestPrediction = predictions.find((prediction) => prediction.probability >= 0.15)
  const label = bestPrediction?.className || ''

  return {
    title: label ? titleCase(label) : '',
    category: label ? suggestCategory(label) : 'Other',
    description: label
      ? `A ${label.replaceAll('_', ' ')} was recognized in the photo. Add its color, distinguishing marks, and location details.`
      : '',
    detectedText: recognizedText,
    labels: predictions.map(({ className, probability }) => ({
      name: titleCase(className),
      confidence: probability,
    })),
  }
}
