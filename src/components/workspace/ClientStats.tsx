import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

// Same four cards as the Videos page (ClientWorkspace), for the client Home.

const Svg = ({ d }: { d: string }) => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} /></svg>
)
const VIDEO = 'M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z'
const CHECK = 'M5 13l4 4L19 7'
const CLOCK = 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'

function Stat({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <div className="clay-card p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
      <div className={cn('w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}><Svg d={icon} /></div>
      <div className="min-w-0">
        <p className="text-2xl font-heading font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{label}</p>
      </div>
    </div>
  )
}

export function ClientStats({ projects }: { projects: Project[] }) {
  const apiFetch = useApiFetch()
  const { data } = useQuery<{ total: number }>({
    queryKey: ['time-saved'],
    queryFn: () => apiFetch<{ total: number }>('/api/time-saved'),
  })
  const done = projects.filter((p) => p.status === 'client_approved').length
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat label="Active videos" value={projects.length - done} icon={VIDEO} color="bg-primary/10 text-primary" />
      <Stat label="Completed" value={done} icon={CHECK} color="bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400" />
      <Stat label="All videos" value={projects.length} icon={VIDEO} color="bg-zinc-50 text-zinc-700 dark:bg-zinc-500/10 dark:text-zinc-400" />
      <Stat label="Time Saved" value={data ? `${data.total}h` : '—'} icon={CLOCK} color="bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" />
    </div>
  )
}
