// All talking to the backend happens here. Pages never call fetch() directly.

const API_BASE_URL =
  (import.meta.env && import.meta.env.VITE_API_URL) || 'https://campustu-backend.onrender.com'

const TOKEN_KEY = 'campustu_token'
export const LOGOUT_EVENT = 'campustu:logout'

// The login token lives in localStorage. Trade-off: any script injected into the page (XSS)
// could read it. Fine for now; revisit (httpOnly cookies) before launch.
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  constructor(message, status = 0, details = null, code = null) {
    super(message)
    this.status = status
    this.details = details
    this.code = code
  }
}

// Turns an error into one readable sentence for the screen.
export function errorMessage(err) {
  if (err instanceof ApiError && Array.isArray(err.details) && err.details.length) {
    return err.details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join(' | ')
  }
  return err?.message || 'Something went wrong'
}

const TIMEOUT_MS = 70_000 // the free server can take about a minute to wake up

async function request(endpoint, { method = 'GET', json, formData } = {}) {
  const headers = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  let body
  if (formData) {
    body = formData // do NOT set Content-Type: the browser adds it, with the multipart boundary
  } else if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res
  try {
    const init = { method, headers, signal: controller.signal }
    if (body !== undefined) init.body = body
    res = await fetch(`${API_BASE_URL}${endpoint}`, init)
  } catch (e) {
    throw new ApiError(
      e.name === 'AbortError'
        ? 'The server took too long to answer. Please try again.'
        : 'Cannot reach the server. Check your internet connection and try again.',
    )
  } finally {
    clearTimeout(timer)
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    /* the server sent something that is not JSON */
  }

  if (!res.ok) {
    if (res.status === 401 && token) {
      tokenStore.clear() // expired or invalid session
      window.dispatchEvent(new Event(LOGOUT_EVENT))
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.details, data?.code)
  }
  return data
}

export const authApi = {
  signup: (payload) => request('/auth/signup', { method: 'POST', json: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', json: payload }),
  verify: (payload) => request('/auth/verify', { method: 'POST', json: payload }),
  getMe: () => request('/auth/me'),
}

export const metaApi = {
  get: () => request('/meta'),
}

export const collegesApi = {
  list: (q = '') => request(`/api/colleges${q ? `?q=\${encodeURIComponent(q)}` : ''}`),
  nearby: (lat, lng, limit = 10) => request(`/api/colleges/nearby?lat=${lat}&lng=${lng}&limit=${limit}`),
  search: (q) => request(`/api/colleges/search?q=${encodeURIComponent(q)}`),
  geocode: (q) => request(`/api/colleges/geocode?q=${encodeURIComponent(q)}`),
}

export const deleteItem = (itemId) =>
  request(`/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' })

export const itemsApi = {
  list: (limit = 12) => request(`/items?limit=${limit}`),
  create: (formData) => request('/items', { method: 'POST', formData }),
  get: (id) => request(`/items/${encodeURIComponent(id)}`),
  mine: () => request('/items/mine'),
  updateStatus: (id, status) => request(`/items/${encodeURIComponent(id)}/status`, { method: 'PATCH', json: { status } }),
  remove: deleteItem,
}
