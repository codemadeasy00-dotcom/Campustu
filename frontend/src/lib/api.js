// frontend/src/lib/api.js
// If you already have an authenticated fetch helper, use that and delete this file.
// The token line is a PLACEHOLDER: read your login token/session the way your passwordless login stores it.

const API = import.meta.env.VITE_API_URL;

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('campustu_token'); // TODO: replace with your real auth storage
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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