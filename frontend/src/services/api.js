// All talking to the backend happens here. Pages never call fetch() directly.

export const API_BASE_URL = ''
export const LOGOUT_EVENT = 'campustu:logout'

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
    const init = { method, headers, signal: controller.signal, credentials: 'include' }
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
    if (res.status === 401) {
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
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request('/auth/me'),
  setCollege: (collegeId) => request('/auth/profile/college', { method: 'PATCH', json: { college_id: collegeId } }),
  updateAvatar: (formData) => request('/auth/profile/avatar', { method: 'PATCH', formData }),
  removeAvatar: () => request('/auth/profile/avatar', { method: 'DELETE' }),
}

export const metaApi = {
  get: () => request('/meta'),
}

export const kitsApi = {
  get: (params) => {
    const query = new URLSearchParams(params)
    return request(`/kits?${query.toString()}`)
  },
}

export const wishlistApi = {
  list: () => request('/wishlist'),
  add: (itemIds) => request('/wishlist', { method: 'POST', json: { item_ids: itemIds } }),
  remove: (itemId) => request(`/wishlist/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),
}

export const collegesApi = {
  list: (q = '') => request(`/api/colleges${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  nearby: (lat, lng, limit = 10) => request(`/api/colleges/nearby?lat=${lat}&lng=${lng}&limit=${limit}`),
  search: (q) => request(`/api/colleges/search?q=${encodeURIComponent(q)}`),
  geocode: (q) => request(`/api/colleges/geocode?q=${encodeURIComponent(q)}`),
}

export const placesApi = {
  search: (q) => request(`/api/colleges/map-search?q=${encodeURIComponent(q)}`),
}

export const deleteItem = (itemId) =>
  request(`/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' })

export const itemsApi = {
  list: (options = 12) => {
    const params = new URLSearchParams()
    if (typeof options === 'number') {
      params.set('limit', String(options))
    } else {
      Object.entries(options).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
      })
    }
    return request(`/items?${params.toString()}`)
  },
  create: (formData) => request('/items', { method: 'POST', formData }),
  get: (id) => request(`/items/${encodeURIComponent(id)}`),
  mine: () => request('/items/mine'),
  updateStatus: (id, status) => request(`/items/${encodeURIComponent(id)}/status`, { method: 'PATCH', json: { status } }),
  remove: deleteItem,
  reservations: () => request('/items/reservations/mine'),
  reservation: (id) => request(`/items/${encodeURIComponent(id)}/reservation`),
  reserve: (id) => request(`/items/${encodeURIComponent(id)}/reservations`, { method: 'POST', json: {} }),
  updateReservation: (id, action) =>
    request(`/items/reservations/${encodeURIComponent(id)}`, { method: 'PATCH', json: { action } }),
  confirmReservation: (id) =>
    request(`/items/reservations/${encodeURIComponent(id)}/confirm`, { method: 'POST', json: {} }),
}

export const conversationsApi = {
  list: () => request('/conversations'),
  create: (context) => request('/conversations', { method: 'POST', json: context }),
  messages: (id, after) => {
    const query = after ? `?after=${encodeURIComponent(after)}` : ''
    return request(`/conversations/${encodeURIComponent(id)}/messages${query}`)
  },
  send: (id, body) =>
    request(`/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', json: { body } }),
}

export const lostFoundApi = {
  list: ({ status, search } = {}) => {
    const params = new URLSearchParams()
    if (status && status !== 'all') params.set('status', status)
    if (search) params.set('search', search)
    return request(`/lost-found?${params.toString()}`)
  },
  mine: () => request('/lost-found/mine'),
  myClaims: () => request('/lost-found/my-claims'),
  nearby: ({ lat, lng, radius = 1000, status, search }) => {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng), radius: String(radius) })
    if (status && status !== 'all') params.set('status', status)
    if (search) params.set('search', search)
    return request(`/lost-found/nearby?${params.toString()}`)
  },
  create: (formData) => request('/lost-found', { method: 'POST', formData }),
  update: (id, fields) => request(`/lost-found/${encodeURIComponent(id)}`, { method: 'PATCH', json: fields }),
  setLifecycle: (id, action) =>
    request(`/lost-found/${encodeURIComponent(id)}/lifecycle`, { method: 'PATCH', json: { action } }),
  remove: (id) => request(`/lost-found/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  claims: (id) => request(`/lost-found/${encodeURIComponent(id)}/claims`),
  reviewClaim: (itemId, claimId, action) =>
    request(`/lost-found/${encodeURIComponent(itemId)}/claims/${encodeURIComponent(claimId)}`, {
      method: 'PATCH',
      json: { action },
    }),
  redeemClaim: (claimId, handoverCode) =>
    request('/lost-found/claims/redeem', {
      method: 'POST',
      json: { claim_id: claimId, handover_code: handoverCode },
    }),
  claim: (id, answerAttempt) =>
    request(`/lost-found/${encodeURIComponent(id)}/claim`, {
      method: 'POST',
      json: { claim_text: answerAttempt },
    }),
}
