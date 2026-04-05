import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useGalleryFiles } from '@/hooks/useGallery'
import { AdminNav } from '@/components/admin/AdminNav'
import { Gallery } from '@/components/gallery/Gallery'
import type { Profile } from '@/types'

// ─── Client sidebar row ───────────────────────────────────────────────────────

function ClientRow({
  client,
  fileCount,
  selected,
  onClick,
}: {
  client: Profile
  fileCount: number
  selected: boolean
  onClick: () => void
}) {
  const initial = client.full_name.charAt(0).toUpperCase()
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
        selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
      }`}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
        selected ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
      }`}>
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{client.full_name}</p>
        <p className={`text-xs ${selected ? 'text-primary/70' : 'text-muted-foreground'}`}>
          {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </p>
      </div>
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminGallery() {
  const { profile } = useAuth()
  const apiFetch = useApiFetch()

  const { data: users = [] } = useQuery<Profile[]>({
    queryKey: ['users'],
    queryFn: () => apiFetch<Profile[]>('/api/users'),
  })

  const clients = users.filter((u) => u.role === 'client')

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  // The active owner: selected or fall back to first client
  const activeOwnerId = selectedClientId ?? clients[0]?.id ?? null

  // Load all files to compute per-client counts
  const { data: allFiles = [] } = useGalleryFiles(activeOwnerId ?? undefined)

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

      <div className="flex" style={{ minHeight: 'calc(100vh - 52px)' }}>
        {/* Client sidebar */}
        <aside className="w-64 flex-shrink-0 border-r border-border bg-card/50 flex flex-col">
          <div className="px-4 py-4 border-b border-border">
            <h2 className="font-heading font-semibold text-sm tracking-tight">Gallery</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{clients.length} {clients.length === 1 ? 'client' : 'clients'}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {clients.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-4 text-center">No clients yet</p>
            ) : (
              <div className="space-y-0.5">
                {clients.map((client) => (
                  <ClientRow
                    key={client.id}
                    client={client}
                    fileCount={
                      // Show live file count only for the active owner; use 0 for others to avoid n+1 queries
                      (selectedClientId ?? clients[0]?.id) === client.id ? allFiles.length : 0
                    }
                    selected={(selectedClientId ?? clients[0]?.id) === client.id}
                    onClick={() => setSelectedClientId(client.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Gallery main */}
        <main className="flex-1 flex flex-col min-w-0">
          {activeOwnerId ? (
            <Gallery
              ownerId={activeOwnerId}
              currentUserId={profile.id}
              showOwner={false}
              storageLimitMb={-1}
              readOnly={false}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-10 h-10 text-muted-foreground mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-muted-foreground text-sm">No clients yet. Create a client account to get started.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
