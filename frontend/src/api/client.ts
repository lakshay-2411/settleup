// Minimal typed API client: JSON in/out, JWT attached, one refresh retry on 401.

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const store = {
  get access() {
    return localStorage.getItem('access')
  },
  get refresh() {
    return localStorage.getItem('refresh')
  },
  set(tokens: { access: string; refresh?: string }) {
    localStorage.setItem('access', tokens.access)
    if (tokens.refresh) localStorage.setItem('refresh', tokens.refresh)
  },
  clear() {
    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
  },
}

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(typeof body === 'object' && body && 'detail' in body
      ? String((body as { detail: unknown }).detail)
      : `API error ${status}`)
    this.status = status
    this.body = body
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = store.refresh
  if (!refresh) return false
  const res = await fetch(`${BASE}/api/auth/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })
  if (!res.ok) {
    store.clear()
    return false
  }
  store.set(await res.json())
  return true
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; form?: FormData } = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {}
  if (store.access) headers.Authorization = `Bearer ${store.access}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  })

  if (res.status === 401 && retry && (await refreshAccessToken())) {
    return api<T>(path, options, false)
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data as T
}

export const tokens = store
export const apiBase = BASE
