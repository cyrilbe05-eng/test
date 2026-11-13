import { Link, useSearchParams } from 'react-router-dom'
import { useProjects } from '@/hooks/useProjects'
import { useAuth } from '@/hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { cn, projectTimeLabel } from '@/lib/utils'
import type { Project, Plan } from '@/types'
import { useCanCreateVideo } from '@/hooks/useCanCreateVideo'

function IconVideo() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
}
function IconCheck() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
}
function IconClock() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}
function IconPlus() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}
function IconChevronRight() {
  return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
}

function StatCard({ label, value, sub, icon, color, delay = '' }: {
  label: string; value: string | number; sub?: string
  icon: React.ReactNode; color: string; delay?: string
}) {
  return (
    <div className={cn('clay-card p-4 flex items-center gap-4 animate-slide-up hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200', delay)}>
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>{icon}</div>
      <div>
        <p className="text-2xl font-heading font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
      </div>
    </div>
  )
}

export default function ClientWorkspace() {
  const { data: projects, isLoading } = useProjects()
  const canCreate = useCanCreateVideo()
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'completed' ? 'completed' : 'active'

  const { data: plan } = useQuery<Plan>({
    queryKey: ['plan', profile?.plan_id],
    queryFn: () => apiFetch<Plan>('/api/plans/' + profile!.plan_id),
    enabled: !!profile?.plan_id,
  })

  const allProjects = (projects ?? []) as Project[]
  const active = allProjects.filter((p) => p.status !== 'client_approved')
  const completed = allProjects.filter((p) => p.status === 'client_approved')
  const displayProjects = tab === 'active' ? active : completed

  const projectLimitReached = plan && plan.max_active_projects !== -1 && active.length >= plan.max_active_projects
  // Automatic: hours per delivered video by package + any extra hours (see
  // api/_helpers/care/time-saved.ts).
  const { data: timeSavedData } = useQuery<{ total: number }>({
    queryKey: ['time-saved'],
    queryFn: () => apiFetch<{ total: number }>('/api/time-saved'),
  })
  const timeSaved = timeSavedData?.total ?? null

  return (
    <ClientLayout>
      <main className="px-6 py-6 max-w-4xl">
        {/* Welcome */}
        <div className="mb-6 animate-slide-up">
          <h1 className="text-2xl font-heading font-bold">
            Welcome back, <span className="text-shimmer">{profile?.full_name.split(' ')[0]}</span>!
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Here's an overview of your workspace.</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <StatCard label="Active videos" value={active.length} icon={<IconVideo />} color="bg-primary/10 text-primary" delay="stagger-1" />
          <StatCard label="Completed" value={completed.length} icon={<IconCheck />} color="bg-green-50 text-green-700" delay="stagger-2" />
          <StatCard label="All videos" value={allProjects.length} icon={<IconVideo />} color="bg-zinc-50 text-zinc-700" delay="stagger-3" />
          <StatCard label="Time Saved" value={timeSaved === null ? '—' : `${timeSaved}h`} icon={<IconClock />} color="bg-amber-50 text-amber-700" delay="stagger-4" />
        </div>

        {/* New project CTA (not for full-package clients: they record their scripts) */}
        {canCreate && <div className="mb-6 animate-slide-up stagger-5">
          <div className="clay-card p-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold">Start a new video</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {projectLimitReached
                  ? `Monthly limit reached — ${plan!.max_active_projects}/${plan!.max_active_projects} active projects on the ${plan!.name} plan.`
                  : "Submit your footage and we'll take care of the rest."}
              </p>
            </div>
            {projectLimitReached ? (
              <div className="btn-gradient flex items-center gap-2 text-sm opacity-40 cursor-not-allowed pointer-events-none flex-shrink-0">
                <IconPlus /><span>New video</span>
              </div>
            ) : (
              <Link to="/workspace/new" className="btn-gradient flex items-center gap-2 text-sm flex-shrink-0">
                <IconPlus /><span>New video</span>
              </Link>
            )}
          </div>
        </div>}

        {/* Project list + preview */}
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : displayProjects.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-xl">
            <p className="text-muted-foreground text-sm mb-4">
              {tab === 'active' ? 'No active videos yet' : 'No completed videos yet'}
            </p>
            {tab === 'active' && !projectLimitReached && canCreate && (
              <Link to="/workspace/new" className="text-primary hover:underline text-sm font-medium">
                Create your first video →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              {displayProjects.map((p, i) => (
                // One tap opens the video (no preview card in between).
                <Link
                  key={p.id}
                  to={`/workspace/projects/${p.id}`}
                  className={cn(
                    'w-full text-left px-3 py-2 min-h-[44px] rounded-xl border transition-all duration-150 flex items-center gap-3 animate-slide-up',
                    `stagger-${Math.min(i + 1, 7)}`,
                    'bg-card border-border hover:bg-muted/50',
                  )}
                >
                  <span className="flex-1 text-sm font-medium truncate">{p.title}</span>
                  <span className="hidden sm:inline text-xs text-muted-foreground flex-shrink-0">{projectTimeLabel(p)}</span>
                  <ProjectStatusBadge status={p.status} />
                  <IconChevronRight />
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </ClientLayout>
  )
}
