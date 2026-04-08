import { useQuery } from '@tanstack/react-query'
import { getToken } from '@/lib/auth'
import { useApiFetch } from '@/lib/api'
import type { Profile } from '@/types'

interface AuthState {
  user: { id: string; email: string } | null
  profile: Profile | null
  loading: boolean
}

export function useAuth(): AuthState {
  const apiFetch = useApiFetch()
  const token = getToken()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', token],
    enabled: !!token,
    queryFn: () => apiFetch<Profile>('/api/profiles/me'),
    staleTime: 60_000,
    retry: false,
  })

  if (!token) {
    return { user: null, profile: null, loading: false }
  }

  if (isLoading) {
    return { user: null, profile: null, loading: true }
  }

  if (!profile) {
    return { user: null, profile: null, loading: false }
  }

  return {
    user: { id: profile.id, email: profile.email },
    profile,
    loading: false,
  }
}
