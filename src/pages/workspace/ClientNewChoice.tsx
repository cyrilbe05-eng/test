import { Link, Navigate } from 'react-router-dom'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { Ms } from '@/components/ds'
import { useAppSettings } from '@/hooks/useAppSettings'

// "New video" when Batch upload is switched on: pick what to send.
// Switched off (or unknown): straight to today's upload page.
const CHOICES = [
  { to: '/workspace/new', state: undefined, label: 'Single video', icon: 'movie' },
  { to: '/workspace/new', state: { kind: 'carousel' }, label: 'Carousel', icon: 'view_carousel' },
  { to: '/workspace/batch', state: undefined, label: 'Batch upload', icon: 'video_library' },
] as const

export default function ClientNewChoice() {
  const { data, isLoading } = useAppSettings()
  if (!isLoading && !data?.batchUpload) return <Navigate to="/workspace/new" replace />
  return (
    <ClientLayout>
      <main className="max-w-2xl px-4 md:px-6 pt-5 pb-24 md:py-8 space-y-4">
        <h1 className="text-xl md:text-2xl font-heading font-semibold tracking-tight">New</h1>
        <div className="grid gap-2 sm:grid-cols-3">
          {CHOICES.map((c) => (
            <Link key={c.label} to={c.to} state={c.state}
              className="clay-card flex sm:flex-col items-center gap-3 px-4 min-h-[64px] sm:py-7 hover:brightness-[0.98]">
              <Ms name={c.icon} style={{ fontSize: 26, width: 26 }} />
              <span className="text-sm font-semibold">{c.label}</span>
            </Link>
          ))}
        </div>
      </main>
    </ClientLayout>
  )
}
