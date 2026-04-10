import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getToken, isImpersonating, stopImpersonation } from '@/lib/auth'
import { useApiFetch } from '@/lib/api'
import type { Profile } from '@/types'

interface AuthState {
  user: { id: string; email: string } | null
  profile: Profile | null
  loading: boolean
  impersonating: boolean
  stopImpersonating: () => void
}

export function useAuth(): AuthState {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const token = getToken()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', token],
    enabled: !!token,
    queryFn: () => apiFetch<Profile>('/api/profiles/me'),
    staleTime: 60_000,
    retry: false,
  })

  const handleStopImpersonating = () => {
    stopImpersonation()
    qc.clear()
    window.location.href = '/admin/users'
  }

  if (!token) {
    return { user: null, profile: null, loading: false, impersonating: false, stopImpersonating: handleStopImpersonating }
  }

  if (isLoading) {
    return { user: null, profile: null, loading: true, impersonating: false, stopImpersonating: handleStopImpersonating }
  }

  if (!profile) {
    return { user: null, profile: null, loading: false, impersonating: false, stopImpersonating: handleStopImpersonating }
  }

  return {
    user: { id: profile.id, email: profile.email },
    profile,
    loading: false,
    impersonating: isImpersonating(),
    stopImpersonating: handleStopImpersonating,
  }
}
