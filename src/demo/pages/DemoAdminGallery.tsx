import { useState } from 'react'
import DemoAdminLayout from './DemoAdminLayout'
import DemoGallery from './DemoGallery'
import { useDemoAuth } from '../DemoAuthContext'
import { _profilesStore, _galleryStore, MOCK_PLANS } from '../mockData'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

export default function DemoAdminGallery() {
  const { profile } = useDemoAuth()
  // null = all files; string = filter to that client's owner_id
  const [selectedClient, setSelectedClient] = useState<string | null>(null)

  if (!profile) return null

  const clients = _profilesStore.filter((p) => p.role === 'client')

  function clientStorageInfo(clientId: string) {
    const files = _galleryStore.filter((f) => f.owner_id === clientId)
    const used = files.reduce((s, f) => s + f.file_size, 0)
    const clientProfile = _profilesStore.find((p) => p.id === clientId)
    const plan = MOCK_PLANS.find((p) => p.id === clientProfile?.plan_id)
    const limitBytes = plan && plan.storage_limit_mb !== -1 ? plan.storage_limit_mb * 1024 * 1024 : null
    const pct = limitBytes ? Math.min(100, (used / limitBytes) * 100) : null
    return { files: files.length, used, pct, plan }
  }

  const selectedName = selectedClient
    ? _profilesStore.find((p) => p.id === selectedClient)?.full_name
    : 'All Clients'

  return (
    <DemoAdminLayout>
      <div className="flex h-full min-h-0 overflow-hidden">
        {/* ── Client sidebar ── */}
        <aside className="w-56 border-r border-border bg-background flex flex-col flex-shrink-0 overflow-y-auto">
          <div className="px-3 pt-4 pb-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">Filter by client</p>
            {/* All */}
            <button
              onClick={() => setSelectedClient(null)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors text-left',
                selectedClient === null ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-muted',
              )}
            >
              <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">All</span>
              <span className="truncate flex-1">All Clients</span>
              <span className="text-xs text-muted-foreground flex-shrink-0">{_galleryStore.length}</span>
            </button>
          </div>

          <div className="px-3 space-y-0.5 pb-4">
            {clients.map((client) => {
              const info = clientStorageInfo(client.id)
              const isSelected = selectedClient === client.id
              return (
                <button
                  key={client.id}
                  onClick={() => setSelectedClient(client.id)}
                  className={cn(
                    'w-full flex items-start gap-2 px-2 py-2.5 rounded-lg text-sm transition-colors text-left group',
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
                    {client.client_id_label && (
                      <p className="text-[10px] text-muted-foreground">{client.client_id_label}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">{info.files} files · {formatBytes(info.used)}</p>
                    {info.pct !== null && (
                      <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden w-full">
                        <div
                          className={cn('h-full rounded-full', info.pct >= 90 ? 'bg-red-500' : info.pct >= 70 ? 'bg-amber-400' : 'bg-primary')}
                          style={{ width: `${info.pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* ── Main gallery ── */}
        <div className="flex-1 min-w-0 overflow-y-auto flex flex-col">
          <div className="px-6 pt-5 pb-3 flex-shrink-0">
            <h1 className="text-xl font-heading font-bold">{selectedName}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {selectedClient ? 'Files belonging to this client.' : 'All files across all clients and team members.'}
            </p>
          </div>
          <div className="flex-1 px-6 pb-6">
            <DemoGallery
              filterOwnerId={selectedClient}
              currentUserId={profile.id}
              showOwner={selectedClient === null}
              storageLimitOwnerId={null}
            />
          </div>
        </div>
      </div>
    </DemoAdminLayout>
  )
}
