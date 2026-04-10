import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Gallery } from '@/components/gallery/Gallery'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { cn } from '@/lib/utils'
import type { Plan } from '@/types'

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function IconFolder() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
}

export default function ClientGallery() {
  const { profile, loading } = useAuth()
  const apiFetch = useApiFetch()

  const { data: plan } = useQuery<Plan>({
    queryKey: ['plan', profile?.plan_id],
    queryFn: () => apiFetch<Plan>('/api/plans/' + profile!.plan_id),
    enabled: !!profile?.plan_id,
  })

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  const limitMb = plan?.storage_limit_mb ?? -1
  const limitBytes = limitMb !== -1 ? limitMb * 1024 * 1024 : null
  const usedBytes = (profile as any).used_storage_bytes ?? 0
  const usagePct = limitBytes ? Math.min(100, (usedBytes / limitBytes) * 100) : null

  return (
    <ClientLayout>
      <div className="flex h-full min-h-0 overflow-hidden" style={{ minHeight: 'calc(100vh - 52px)' }}>
        {/* Storage sidebar */}
        {plan && (
          <aside className="w-56 border-r border-border bg-background flex flex-col flex-shrink-0 p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Storage</p>
              <div className="bg-muted/50 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Used</span>
                  <span className="font-medium">{formatBytes(usedBytes)}</span>
                </div>
                {limitBytes && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Limit</span>
                    <span className="font-medium">{formatBytes(limitBytes)}</span>
                  </div>
                )}
                {usagePct !== null && (
                  <>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', usagePct >= 90 ? 'bg-red-500' : usagePct >= 70 ? 'bg-amber-400' : 'bg-primary')}
                        style={{ width: `${usagePct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{usagePct.toFixed(0)}% of {plan.name} plan used</p>
                  </>
                )}
              </div>
            </div>
          </aside>
        )}

        {/* Gallery main */}
        <div className="flex-1 min-w-0 overflow-y-auto flex flex-col">
          <div className="px-6 pt-5 pb-3 flex-shrink-0">
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <IconFolder /> My Gallery
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">Your personal file storage — organize into folders, upload assets.</p>
          </div>
          <div className="flex-1 px-6 pb-6">
            <Gallery
              ownerId={profile.id}
              currentUserId={profile.id}
              storageLimitMb={limitMb}
              readOnly={false}
            />
          </div>
        </div>
      </div>
    </ClientLayout>
  )
}
