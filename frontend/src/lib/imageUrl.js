const BACKEND_URL = (import.meta.env.VITE_API_URL || 'https://campustu-backend.onrender.com').replace(/\/$/, '')

export function getImageUrl(imagePath) {
  if (!imagePath) return ''
  if (/^(https?:|blob:|data:)/i.test(imagePath)) return imagePath
  return `${BACKEND_URL}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`
}