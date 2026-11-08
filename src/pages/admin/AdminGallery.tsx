import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useGalleryFiles } from '@/hooks/useGallery'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Gallery } from '@/components/gallery/Gallery'
import { cn } from '@/lib/utils'
import type { Profile, Plan } from '@/types'


export default function AdminGallery() {
  const { profile } = useAuth()
  const apiFetch = useApiFetch()

  const { data: users = [] } = useQuery<Profile[]>({
    queryKey: ['users'],
    queryFn: () => apiFetch<Profile[]>('/api/users'),
  })
  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: () => apiFetch<Plan[]>('/api/plans'),
  })

  const clients = users.filter((u) => u.role === 'client')

  // null = all clients, string = specific client id
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  // For the active specific client, load their files to show count + storage
  const activeOwnerId = selectedClientId ?? clients[0]?.id ?? null
  const { data: activeClientFiles = [] } = useGalleryFiles(activeOwnerId ?? undefined)

  // Per-client storage info (storage stats come from the library endpoint)
  function clientPlan(client: Profile) {
    return plans.find((p) => p.id === client.plan_id) ?? null
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <AdminLayout>
      <div className="flex flex-col h-full" style={{ minHeight: 'calc(100dvh - 52px)' }}>
        {/* Mobile: client picker dropdown */}
        <div className="md:hidden px-4 py-2 border-b border-border bg-card/50 flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex-shrink-0">Client:</span>
          <select
            value={selectedClientId ?? ''}
            onChange={(e) => setSelectedClientId(e.target.value || null)}
            className="flex-1 bg-muted rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Desktop sidebar */}
          <aside className="hidden md:flex w-56 border-r border-border bg-background flex-col flex-shrink-0 overflow-y-auto">
            <div className="px-3 pt-4 pb-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Filter by client</p>
              <button
                onClick={() => setSelectedClientId(null)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors text-left',
                  selectedClientId === null ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-muted',
                )}
              >
                <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">All</span>
                <span className="truncate flex-1">All Clients</span>
              </button>
            </div>
            <div className="px-3 space-y-0.5 pb-4">
              {clients.map((client) => {
                const isSelected = selectedClientId === client.id
                const plan = clientPlan(client)
                return (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClientId(client.id)}
                    className={cn(
                      'w-full flex items-start gap-2 px-2 py-2.5 rounded-lg text-sm transition-colors text-left',
                      isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                    )}
                  >
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5',
                      isSelected ? 'bg-primary text-white' : 'bg-muted text-foreground',
                    )}>
                      {client.full_name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate leading-tight">{client.full_name}</p>
                      {client.client_id_label && <p className="text-[10px] text-muted-foreground">{client.client_id_label}</p>}
                      {isSelected && <p className="text-[10px] text-muted-foreground mt-0.5">{activeClientFiles.length} files</p>}
                      {plan && <p className="text-[10px] text-muted-foreground">{plan.name}</p>}
                    </div>
                  </button>
                )
              })}
              {clients.length === 0 && <p className="text-xs text-muted-foreground px-3 py-4 text-center">No clients yet</p>}
            </div>
          </aside>

          {/* Gallery main */}
          <div className="flex-1 min-w-0 overflow-y-auto flex flex-col">
            <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-2 sm:pb-3 flex-shrink-0">
              <h1 className="text-xl font-heading font-bold">
                {selectedClientId ? users.find((u) => u.id === selectedClientId)?.full_name ?? 'Client' : 'All Clients'}
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5 hidden sm:block">
                {selectedClientId ? 'Files belonging to this client.' : 'All files across all clients and team members.'}
              </p>
            </div>
            <div className="flex-1">
              {selectedClientId ? (
                <Gallery
                  ownerId={selectedClientId}
                  currentUserId={profile.id}
                  showOwner={false}
                  storageLimitMb={plans.find((p) => p.id === users.find((u) => u.id === selectedClientId)?.plan_id)?.storage_limit_mb ?? -1}
                  readOnly={false}
                />
              ) : activeOwnerId ? (
                <Gallery
                  ownerId={activeOwnerId}
                  currentUserId={profile.id}
                  showOwner={true}
                  storageLimitMb={-1}
                  readOnly={false}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center py-20">
                  <div className="text-center">
                    <svg className="w-10 h-10 text-muted-foreground mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-muted-foreground text-sm">No clients yet. Create a client account to get started.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
