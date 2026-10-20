/** Resize an image and re-encode it to WebP, removing embedded metadata. */
export async function processAndCompressImage(file, maxDimension = 1600, quality = 0.8) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
    const longestSide = Math.max(bitmap.width, bitmap.height)
    const scale = Math.min(1, maxDimension / longestSide)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare the image for upload')
    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result)
        else reject(new Error('Image compression failed'))
      }, 'image/webp', quality)
    })

    if (blob.type !== 'image/webp') throw new Error('WebP image encoding is not supported by this browser')
    const name = file.name.replace(/\.[^/.]+$/, '') || 'photo'
    return new File([blob], `${name}.webp`, { type: 'image/webp', lastModified: Date.now() })
  } finally {
    bitmap?.close()
  }
}