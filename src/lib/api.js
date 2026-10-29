import { deriveProof } from './auth.js'

async function request(path, { method = 'GET', body, token, formData, signal } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`

  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new Error('网络连接失败，请检查网络后重试')
  }

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || `请求失败（${response.status}）`)
    error.status = response.status
    error.code = payload.code
    error.payload = payload
    throw error
  }
  return payload
}

export const api = {
  list: () => request('/posts'),
  health: () => request('/health'),

  /** 先取盐，在浏览器里做 PBKDF2，再把 proof 交给服务端校验 */
  auth: async (scope, secret) => {
    const { salt } = await request(`/auth/salt?scope=${encodeURIComponent(scope)}`)
    const proof = await deriveProof(secret, salt)
    return request('/auth', { method: 'POST', body: { scope, proof } })
  },

  upload: (file, token) => {
    const formData = new FormData()
    formData.append('file', file)
    return request('/upload', { method: 'POST', formData, token })
  },

  createEntry: (entry, token) => request('/posts', { method: 'POST', body: entry, token }),
  updateEntry: (date, entry, token) =>
    request(`/posts/${date}`, { method: 'PUT', body: entry, token }),
  deleteEntry: (date, token) => request(`/posts/${date}`, { method: 'DELETE', token }),
  saveTags: (tags, token) => request('/tags', { method: 'POST', body: { tags }, token }),
  geoSearch: (query, signal) => request(`/geo/search?q=${encodeURIComponent(query)}`, { signal }),
}
