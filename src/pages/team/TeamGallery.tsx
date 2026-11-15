import { ClientMark } from '@/components/ds'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Gallery } from '@/components/gallery/Gallery'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import type { Profile } from '@/types'

export default function TeamGallery() {
  const { profile } = useAuth()
  const apiFetch = useApiFetch()

  const { data: clients = [] } = useQuery<Profile[]>({
    queryKey: ['users', 'clients'],
    queryFn: () => apiFetch<Profile[]>('/api/users/clients'),
  })
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const activeOwnerId = selectedClientId ?? clients[0]?.id ?? null

  const activeClient = clients.find((c) => c.id === activeOwnerId)
  return (
    <TeamLayout>
      <div className="flex flex-col h-full" style={{ minHeight: 'calc(100dvh - 52px)' }}>
        {/* Phone: client picker */}
        {clients.length > 0 && (
          <div className="md:hidden px-4 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--line)' }}>
            <select value={activeOwnerId ?? ''} onChange={(e) => setSelectedClientId(e.target.value || null)} aria-label="Client" className="ds-field flex-1" style={{ height: 38 }}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          {/* Desktop: client list (same as the admin gallery) */}
          <aside className="hidden md:flex w-60 flex-col flex-shrink-0 overflow-y-auto" style={{ borderRight: '1px solid var(--line)' }}>
            <div className="px-3 pt-4 pb-4 space-y-0.5">
              <p className="px-2 mb-2" style={{ fontSize: 12.5, color: 'var(--faint)' }}>Filter by client</p>
              {clients.length === 0 ? (
                <p className="px-2 py-4" style={{ fontSize: 13, color: 'var(--faint)' }}>No clients yet</p>
              ) : (
                clients.map((client) => {
                  const isSelected = activeOwnerId === client.id
                  return (
                    <button key={client.id} onClick={() => setSelectedClientId(client.id)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] transition-colors text-left hover:bg-[var(--hover)]"
                      style={{ background: isSelected ? 'var(--active)' : undefined }}>
                      <ClientMark name={client.full_name} size={22} />
                      <span className="flex-1 truncate" style={{ fontSize: 13.5, fontWeight: isSelected ? 500 : 400, color: isSelected ? 'var(--strong)' : 'var(--text)' }}>{client.full_name}</span>
                    </button>
                  )
                })
              )}
            </div>
          </aside>

          {/* Gallery main */}
          <div className="flex-1 min-w-0 overflow-y-auto flex flex-col">
            <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-2 sm:pb-3 flex-shrink-0">
              <h1>{activeClient?.full_name ?? 'Gallery'}</h1>
            </div>
            <div className="flex-1">
              {activeOwnerId ? (
                <Gallery
                  ownerId={activeOwnerId}
                  currentUserId={profile?.id ?? ''}
                  showOwner={false}
                  storageLimitMb={-1}
                  readOnly={true}
                />
              ) : (
                <p className="px-6 py-10" style={{ fontSize: 13.5, color: 'var(--faint)' }}>No clients yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </TeamLayout>
  )
}
