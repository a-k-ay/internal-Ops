// In dev we proxy /api via vite.config.js, so leaving BASE_URL as '/api'
// keeps requests same-origin and avoids CORS. In production the frontend
// is served from a different host (e.g. Vercel) than the API, so set
// VITE_API_URL at build time to the full API origin (e.g.
// 'https://meeting-action-board-api.onrender.com'). We strip a trailing
// slash so callers can keep writing `${BASE_URL}/clients` either way.
const RAW = import.meta.env.VITE_API_URL || ''
const BASE_URL = (RAW ? RAW.replace(/\/$/, '') : '') + '/api'

const getToken = () => {
  try { return JSON.parse(sessionStorage.getItem('mab_auth') || '{}').token || null }
  catch { return null }
}

const apiFetch = async (path, options = {}) => {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers }
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

// Auth
export const authAPI = {
  login: (data) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  registerWorkspace: (data) => apiFetch('/auth/register-workspace', { method: 'POST', body: JSON.stringify(data) }),
  me: () => apiFetch('/auth/me'),
  logout: () => apiFetch('/auth/logout', { method: 'POST' }),
}

// Users
export const usersAPI = {
  list: () => apiFetch('/users'),
  create: (data) => apiFetch('/users', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleActive: (id) => apiFetch(`/users/${id}/toggle-active`, { method: 'PUT' }),
  delete: (id) => apiFetch(`/users/${id}`, { method: 'DELETE' }),
  updateProfile: (data) => apiFetch('/users/profile/me', { method: 'PUT', body: JSON.stringify(data) }),
}

// Clients
export const clientsAPI = {
  list: (includeArchived = false, memberId = null) => {
    const params = memberId ? `memberId=${memberId}` : `includeArchived=${includeArchived}`
    return apiFetch(`/clients?${params}`)
  },
  get: (id) => apiFetch(`/clients/${id}`),
  create: (data) => apiFetch('/clients', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  archive: (id) => apiFetch(`/clients/${id}/archive`, { method: 'PUT' }),
  restore: (id) => apiFetch(`/clients/${id}/restore`, { method: 'PUT' }),
  delete: (id) => apiFetch(`/clients/${id}`, { method: 'DELETE' }),
}

// Projects
export const projectsAPI = {
  list: (clientId, memberId = null) => {
    const params = new URLSearchParams()
    if (clientId) params.set('clientId', clientId)
    if (memberId) params.set('memberId', memberId)
    return apiFetch(`/projects${params.toString() ? `?${params}` : ''}`)
  },
  get: (id) => apiFetch(`/projects/${id}`),
  create: (data) => apiFetch('/projects', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiFetch(`/projects/${id}`, { method: 'DELETE' }),
}

// Meetings
export const meetingsAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return apiFetch(`/meetings${q ? `?${q}` : ''}`)
  },
  get: (id) => apiFetch(`/meetings/${id}`),
  create: (data) => apiFetch('/meetings', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/meetings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiFetch(`/meetings/${id}`, { method: 'DELETE' }),
}

// Action Items
export const actionItemsAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return apiFetch(`/action-items${q ? `?${q}` : ''}`)
  },
  create: (data) => apiFetch('/action-items', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/action-items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  addToTracker: (id, trackerItemId) => apiFetch(`/action-items/${id}/add-to-tracker`, { method: 'PUT', body: JSON.stringify({ trackerItemId }) }),
  delete: (id) => apiFetch(`/action-items/${id}`, { method: 'DELETE' }),
  bulkDelete: (ids) => apiFetch('/action-items/bulk/delete', { method: 'DELETE', body: JSON.stringify({ ids }) }),
}

// Tracker
export const trackerAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return apiFetch(`/tracker${q ? `?${q}` : ''}`)
  },
  get: (id) => apiFetch(`/tracker/${id}`),
  create: (data) => apiFetch('/tracker', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/tracker/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiFetch(`/tracker/${id}`, { method: 'DELETE' }),
  bulkDelete: (ids) => apiFetch('/tracker/bulk/delete', { method: 'DELETE', body: JSON.stringify({ ids }) }),
}

// Notifications
export const notificationsAPI = {
  list: () => apiFetch('/notifications'),
  unreadCount: () => apiFetch('/notifications/unread-count'),
  markRead: (id) => apiFetch(`/notifications/${id}/read`, { method: 'PUT' }),
  markAllRead: () => apiFetch('/notifications/read-all/mark', { method: 'PUT' }),
}

// Dashboard
export const dashboardAPI = {
  global: () => apiFetch('/dashboard'),
  client: (clientId) => apiFetch(`/dashboard/client/${clientId}`),
}

// Search
export const searchAPI = {
  global: (q) => apiFetch(`/search?q=${encodeURIComponent(q)}`),
}

// AI
export const aiAPI = {
  extractActionItems: (data) => apiFetch('/ai/extract-action-items', { method: 'POST', body: JSON.stringify(data) }),
  meetingSummary: (data) => apiFetch('/ai/meeting-summary', { method: 'POST', body: JSON.stringify(data) }),
  extractFromSummary: (data) => apiFetch('/ai/extract-from-summary', { method: 'POST', body: JSON.stringify(data) }),
}

// Audit
export const auditAPI = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return apiFetch(`/audit${q ? `?${q}` : ''}`)
  },
}
