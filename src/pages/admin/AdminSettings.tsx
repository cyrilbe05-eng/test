import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Segmented } from '@/components/ds'
import { useAppSettings, useSetAppSettings } from '@/hooks/useAppSettings'

// Full admins: app-wide on/off switches.
export default function AdminSettings() {
  const { data } = useAppSettings()
  const set = useSetAppSettings()
  return (
    <AdminLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 max-w-2xl space-y-4">
        <h1 style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>Settings</h1>
        <section className="ds-panel flex items-center justify-between gap-3" style={{ padding: '14px 16px' }}>
          <span style={{ fontSize: 14, fontWeight: 550, color: 'var(--strong)' }}>Batch upload</span>
          {data && (
            <Segmented label="Batch upload" width={64} value={data.batchUpload ? 'on' : 'off'}
              onChange={(v) => set.mutate({ ...data, batchUpload: v === 'on' }, { onError: (e) => toast.error((e as Error).message) })}
              options={[{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }]} />
          )}
        </section>
      </main>
    </AdminLayout>
  )
}
