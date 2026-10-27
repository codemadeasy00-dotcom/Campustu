import { API_BASE_URL } from '../services/api.js'

export const collegesApi = {
  list: (q = '') => request(`/api/colleges${q ? `?q=\${encodeURIComponent(q)}` : ''}`),
  nearby: (lat, lng, limit = 10) => request(`/api/colleges/nearby?lat=${lat}&lng=${lng}&limit=${limit}`),
  search: (q) => request(`/api/colleges/search?q=${encodeURIComponent(q)}`),
  geocode: (q) => request(`/api/colleges/geocode?q=${encodeURIComponent(q)}`),
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'request_failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
