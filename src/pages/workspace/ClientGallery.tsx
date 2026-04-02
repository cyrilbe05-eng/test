import { useQuery } from '@tanstack/react-query'
import { useClerk } from '@clerk/react'
import { Link } from 'react-router-dom'
import pinguWave from '@/assets/pingu-wave.png'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { ThemeToggle } from '@/lib/theme'
import { Gallery } from '@/components/gallery/Gallery'
import { toast } from 'sonner'
import type { Plan } from '@/types'

export default function ClientGallery() {
  const { signOut } = useClerk()
  const { profile, loading } = useAuth()
  const apiFetch = useApiFetch()

  const { data: plan } = useQuery<Plan>({
    queryKey: ['plan', profile?.plan_id],
    queryFn: () => apiFetch<Plan>('/api/plans/' + profile!.plan_id),
    enabled: !!profile?.plan_id,
  })

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
  }

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between" style={{ height: '52px' }}>
          <div className="flex items-center gap-3">
            <Link
              to="/workspace"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Workspace</span>
            </Link>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-2.5">
              <img src={pinguWave} alt="Pingu Studio" className="w-8 h-8 object-contain rounded-lg" />
              <span className="font-heading font-semibold text-sm">Pingu Studio</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell userId={profile.id} />
            <ThemeToggle />
            <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted">Sign out</button>
          </div>
        </div>
      </header>

      {/* Gallery fills remaining height */}
      <div className="flex-1 flex flex-col max-w-5xl w-full mx-auto px-0 sm:px-0">
        <Gallery
          ownerId={profile.id}
          currentUserId={profile.id}
          storageLimitMb={plan?.storage_limit_mb ?? -1}
          readOnly={false}
        />
      </div>
    </div>
  )
}
