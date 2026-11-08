import { getToken } from '@/lib/auth'

export function useApiFetch() {
  return async function apiFetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = getToken()

    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }))
      throw Object.assign(new Error(body.error ?? 'Request failed'), { status: res.status })
    }

    return res.json() as Promise<T>
  }
}
