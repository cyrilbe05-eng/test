import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useClerk } from '@clerk/react'
import pinguPhone from '@/assets/pingu-phone.png'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { ThemeToggle } from '@/lib/theme'
import { Gallery } from '@/components/gallery/Gallery'
import { toast } from 'sonner'
import type { Profile } from '@/types'

// ─── Sidebar button ───────────────────────────────────────────────────────────

function SidebarButton({
  label,
  sub,
  selected,
  onClick,
  initial,
}: {
  label: string
  sub: string
  selected: boolean
  onClick: () => void
  initial?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
        selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
      }`}
    >
      {initial !== undefined ? (
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          selected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
        }`}>
          {initial}
        </div>
      ) : (
        <svg className={`w-4 h-4 flex-shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className={`text-xs truncate ${selected ? 'text-primary/70' : 'text-muted-foreground'}`}>{sub}</p>
      </div>
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TeamGallery() {
  const { signOut } = useClerk()
  const { profile } = useAuth()
  const apiFetch = useApiFetch()

  const { data: users = [] } = useQuery<Profile[]>({
    queryKey: ['users'],
    queryFn: () => apiFetch<Profile[]>('/api/users'),
  })

  const clients = users.filter((u) => u.role === 'client')

  // null = "all files" view (show first client by default), string = specific client id
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  const activeOwnerId = selectedClientId ?? clients[0]?.id ?? null

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-6 flex items-center justify-between" style={{ height: '52px' }}>
          <div className="flex items-center gap-2.5">
            <img src={pinguPhone} alt="Pingu Studio" className="w-8 h-8 object-contain rounded-lg" />
            <span className="font-heading font-semibold text-sm">Pingu Studio</span>
          </div>
          <div className="flex items-center gap-1">
            {profile && <NotificationBell userId={profile.id} />}
            <ThemeToggle />
            <span className="text-sm text-muted-foreground hidden sm:block">{profile?.full_name}</span>
            <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted">Sign out</button>
          </div>
        </div>
      </header>

      <div className="flex" style={{ minHeight: 'calc(100vh - 52px)' }}>
        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0 border-r border-border bg-card/50 flex flex-col">
          <div className="px-4 py-4 border-b border-border">
            <h2 className="font-heading font-semibold text-sm tracking-tight">Client Galleries</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Read-only view</p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {clients.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-4 text-center">No clients yet</p>
            ) : (
              clients.map((client) => (
                <SidebarButton
                  key={client.id}
                  label={client.full_name}
                  sub={activeOwnerId === client.id ? '— loading…' : ''}
                  selected={(selectedClientId ?? clients[0]?.id) === client.id}
                  onClick={() => setSelectedClientId(client.id)}
                  initial={client.full_name.charAt(0).toUpperCase()}
                />
              ))
            )}
          </div>
        </aside>

        {/* Gallery main */}
        <main className="flex-1 flex flex-col min-w-0">
          {activeOwnerId ? (
            <Gallery
              ownerId={activeOwnerId}
              currentUserId={profile?.id ?? ''}
              showOwner={false}
              storageLimitMb={-1}
              readOnly={true}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-muted-foreground text-sm">No clients yet.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
