import { Navigate } from 'react-router-dom'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { useAppSettings } from '@/hooks/useAppSettings'

// Batch upload: many videos at once, one project each. Only reachable while
// the admin switch is on. (The page itself comes in stage 3.)
export default function ClientBatchUpload() {
  const { data, isLoading } = useAppSettings()
  if (!isLoading && !data?.batchUpload) return <Navigate to="/workspace/new" replace />
  return (
    <ClientLayout>
      <main className="max-w-2xl px-4 md:px-6 pt-5 pb-24 md:py-8">
        <h1 className="text-xl md:text-2xl font-heading font-semibold tracking-tight">Batch upload</h1>
      </main>
    </ClientLayout>
  )
}
