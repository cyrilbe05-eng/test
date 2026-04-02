import { useAuth as useClerkAuth } from '@clerk/react'

/**
 * Returns a typed fetch wrapper that automatically attaches the Clerk
 * Bearer token to every request.
 *
 * Usage:
 *   const apiFetch = useApiFetch()
 *   const data = await apiFetch<Project[]>('/api/projects')
 */
export function useApiFetch() {
  const { getToken } = useClerkAuth()

  return async function apiFetch<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await getToken()

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
