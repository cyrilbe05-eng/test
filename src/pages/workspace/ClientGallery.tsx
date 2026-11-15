import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Gallery } from '@/components/gallery/Gallery'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import type { Plan } from '@/types'

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
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

  const storage = plan && (
    <div className="space-y-2">
      <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
        <span style={{ color: 'var(--faint)' }}>Used</span>
        <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--strong)' }}>{formatBytes(usedBytes)}</span>
      </div>
      {limitBytes && (
        <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--faint)' }}>Limit</span>
          <span className="tabular-nums" style={{ fontWeight: 600, color: 'var(--strong)' }}>{formatBytes(limitBytes)}</span>
        </div>
      )}
      {usagePct !== null && (
        <>
          <span className="ds-track block"><i style={{ width: `${usagePct}%`, background: usagePct >= 90 ? 'var(--bad-bar)' : 'var(--ink-bar)' }} /></span>
          <p style={{ fontSize: 12, color: 'var(--faint)' }}>{usagePct.toFixed(0)}% of {plan.name} plan used</p>
        </>
      )}
    </div>
  )

  return (
    <ClientLayout>
      <div className="flex flex-col h-full" style={{ minHeight: 'calc(100dvh - 52px)' }}>
        {/* Phone: storage on one line */}
        {plan && usagePct !== null && (
          <div className="md:hidden px-4 py-2.5 flex items-center gap-3" style={{ borderBottom: '1px solid var(--line)', fontSize: 12.5 }}>
            <span style={{ color: 'var(--faint)' }}>Storage</span>
            <span className="ds-track flex-1"><i style={{ width: `${usagePct}%`, background: usagePct >= 90 ? 'var(--bad-bar)' : 'var(--ink-bar)' }} /></span>
            <span className="tabular-nums" style={{ color: 'var(--faint)' }}>{formatBytes(usedBytes)}{limitBytes ? ` / ${formatBytes(limitBytes)}` : ''}</span>
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          {/* Desktop: left column (same as the admin gallery) with storage */}
          {plan && (
            <aside className="hidden md:flex w-60 flex-col flex-shrink-0 overflow-y-auto" style={{ borderRight: '1px solid var(--line)' }}>
              <div className="px-5 pt-4 pb-4">
                <p className="mb-3" style={{ fontSize: 12.5, color: 'var(--faint)' }}>Storage</p>
                {storage}
              </div>
            </aside>
          )}

          {/* Gallery main */}
          <div className="flex-1 min-w-0 overflow-y-auto flex flex-col">
            <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-2 sm:pb-3 flex-shrink-0">
              <h1>My Gallery</h1>
            </div>
            <div className="flex-1">
              <Gallery
                ownerId={profile.id}
                currentUserId={profile.id}
                storageLimitMb={limitMb}
                readOnly={false}
              />
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  )
}
