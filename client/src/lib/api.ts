const API_URL = import.meta.env.VITE_API_URL ?? ''

export async function apiFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('cgc_token')
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  get:    <T = any>(path: string)                    => apiFetch<T>(path),
  post:   <T = any>(path: string, body: unknown)     => apiFetch<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  put:    <T = any>(path: string, body: unknown)     => apiFetch<T>(path, { method: 'PUT',   body: JSON.stringify(body) }),
  patch:  <T = any>(path: string, body: unknown)     => apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = any>(path: string)                    => apiFetch<T>(path, { method: 'DELETE' }),
}
