const API_BASE_URL = 'https://campustu-backend.onrender.com';

async function request(endpoint, options = {}) {
  const token = localStorage.getItem('campustu_token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Something went wrong');
  }
  return data;
}

export const authApi = {
  signup: (userData) => request('/auth/signup', { method: 'POST', body: JSON.stringify(userData) }),
  verify: (verificationData) => request('/auth/verify', { method: 'POST', body: JSON.stringify(verificationData) }),
  getMe: () => request('/auth/me'),
};