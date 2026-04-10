const TOKEN_KEY = 'pingu_token'
const IMPERSONATE_TOKEN_KEY = 'pingu_impersonate_token'
const ADMIN_TOKEN_KEY = 'pingu_admin_token'

export function getToken(): string | null {
  // If impersonating, use the impersonation token for all API calls
  return localStorage.getItem(IMPERSONATE_TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(IMPERSONATE_TOKEN_KEY)
  localStorage.removeItem(ADMIN_TOKEN_KEY)
}

// Impersonation helpers
export function startImpersonation(impersonateToken: string): void {
  // Save the real admin token before switching
  const realToken = localStorage.getItem(TOKEN_KEY)
  if (realToken) localStorage.setItem(ADMIN_TOKEN_KEY, realToken)
  localStorage.setItem(IMPERSONATE_TOKEN_KEY, impersonateToken)
}

export function stopImpersonation(): void {
  const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY)
  if (adminToken) localStorage.setItem(TOKEN_KEY, adminToken)
  localStorage.removeItem(IMPERSONATE_TOKEN_KEY)
  localStorage.removeItem(ADMIN_TOKEN_KEY)
}

export function isImpersonating(): boolean {
  return !!localStorage.getItem(IMPERSONATE_TOKEN_KEY)
}
