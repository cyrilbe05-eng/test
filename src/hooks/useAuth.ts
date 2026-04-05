import { useUser } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { Profile } from '@/types'

interface AuthState {
  user: { id: string; email: string } | null
  profile: Profile | null
  loading: boolean
}

export function useAuth(): AuthState {
  const { isLoaded, isSignedIn, user } = useUser()
  const apiFetch = useApiFetch()

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', user?.id],
    enabled: isLoaded && isSignedIn && !!user,
    queryFn: () => apiFetch<Profile>('/api/profiles/me'),
    staleTime: 60_000,
  })

  if (!isLoaded || (isSignedIn && profileLoading)) {
    return { user: null, profile: null, loading: true }
  }

  if (!isSignedIn || !user) {
    return { user: null, profile: null, loading: false }
  }

  return {
    user: {
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? '',
    },
    profile: profile ?? null,
    loading: !profile,
  }
}
