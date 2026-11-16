import { Link, useSearchParams } from 'react-router-dom'
import { useProjects } from '@/hooks/useProjects'
import { useAuth } from '@/hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { Ms } from '@/components/ds'
import { projectTimeLabel } from '@/lib/utils'
import type { Project, Plan, ProjectStatus } from '@/types'
import { useCanCreateVideo } from '@/hooks/useCanCreateVideo'

// Client "Videos": the tiles filter the list (active / completed / all).

type Tab = 'active' | 'completed' | 'all'

// What the client sees: same words and colours as before the redesign.
const CLIENT_STATUS: Record<ProjectStatus, { label: string; text: string; dot: string }> = {
  pending_assignment: { label: 'Pending', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-400' },
  in_progress: { label: 'In progress', text: 'text-zinc-700 dark:text-zinc-300', dot: 'bg-zinc-500' },
  in_review: { label: 'In review', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  admin_approved: { label: 'Admin OK', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-400' },
  client_reviewing: { label: 'Reviewing', text: 'text-cyan-700 dark:text-cyan-300', dot: 'bg-cyan-500' },
  revision_requested: { label: 'Revision', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-400' },
  client_approved: { label: 'Approved', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500' },
}

function Tile({ label, value, icon, on, onClick }: { label: string; value: string | number; icon: string; on?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className="grid place-items-center rounded-[11px] flex-none" style={{ width: 38, height: 38, background: on ? 'var(--ds-accent)' : 'var(--panel)', color: on ? 'var(--accent-fg)' : 'var(--soft-text)', boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--panel-ring)', transition: 'background .25s, color .25s' }}>
        <Ms name={icon} style={{ fontSize: 19, width: 19, color: 'inherit' }} />
      </span>
      <span className="min-w-0 text-left">
        <span className="block tabular-nums" style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.03em', color: 'var(--strong)', lineHeight: 1.15 }}>{value}</span>
        <span className="block truncate" style={{ fontSize: 12.5, color: on ? 'var(--strong)' : 'var(--faint)', fontWeight: on ? 600 : 400 }}>{label}</span>
      </span>
    </>
  )
  const cls = 'clay-card p-3.5 flex items-center gap-3 min-w-0 w-full'
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={on} className={cls}
        style={{ cursor: 'pointer', boxShadow: on ? 'var(--card-sh), 0 0 0 1.5px var(--focus)' : undefined, transition: 'box-shadow .25s, transform .3s' }}>{body}</button>
    : <div className={cls}>{body}</div>
}

export default function ClientWorkspace() {
  const { data: projects, isLoading } = useProjects()
  const canCreate = useCanCreateVideo()
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('tab')
  const tab: Tab = q === 'completed' || q === 'active' ? q : 'all'
  const setTab = (t: Tab) => setSearchParams(t === 'all' ? {} : { tab: t }, { replace: true })

  const { data: plan } = useQuery<Plan>({
    queryKey: ['plan', profile?.plan_id],
    queryFn: () => apiFetch<Plan>('/api/plans/' + profile!.plan_id),
    enabled: !!profile?.plan_id,
  })

  const allProjects = (projects ?? []) as Project[]
  const active = allProjects.filter((x) => x.status !== 'client_approved')
  const completed = allProjects.filter((x) => x.status === 'client_approved')
  const shown = tab === 'active' ? active : tab === 'completed' ? completed : allProjects

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
      <main className="px-4 sm:px-6 py-6 max-w-4xl">
        <div className="flex items-center justify-between gap-3 mb-5">
          <h1 style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>Videos</h1>
          {canCreate && (projectLimitReached
            ? <span className="ds-primary opacity-40 pointer-events-none" title={`${plan!.max_active_projects}/${plan!.max_active_projects} active videos on the ${plan!.name} plan`}><Ms name="add" style={{ color: 'inherit' }} />New video</span>
            : <Link to="/workspace/new" className="ds-primary"><Ms name="add" style={{ color: 'inherit' }} />New video</Link>)}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Tile label="Active" value={active.length} icon="movie" on={tab === 'active'} onClick={() => setTab('active')} />
          <Tile label="Completed" value={completed.length} icon="task_alt" on={tab === 'completed'} onClick={() => setTab('completed')} />
          <Tile label="All videos" value={allProjects.length} icon="video_library" on={tab === 'all'} onClick={() => setTab('all')} />
          <Tile label="Time saved" value={timeSaved === null ? '—' : `${timeSaved}h`} icon="schedule" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : shown.length === 0 ? (
          <div className="ds-panel text-center py-14">
            <p style={{ fontSize: 13.5, color: 'var(--faint)' }}>
              {tab === 'completed' ? 'No completed videos yet' : tab === 'active' ? 'No active videos' : 'No videos yet'}
            </p>
            {tab !== 'completed' && !projectLimitReached && canCreate && (
              <Link to="/workspace/new" className="ds-ghost-btn mt-4 inline-flex">Create your first video</Link>
            )}
          </div>
        ) : (
          <section key={tab} className="ds-panel animate-slide-up" style={{ padding: '8px 18px' }}>
            {shown.map((x) => (
              // One tap opens the video.
              <Link key={x.id} to={`/workspace/projects/${x.id}`} className="ds-hrow" style={{ margin: '0 -10px' }}>
                <span className={`w-2 h-2 rounded-full flex-none ${CLIENT_STATUS[x.status]?.dot ?? 'bg-zinc-400'}`} />
                <span className="flex-1 min-w-0 truncate" style={{ fontSize: 14, fontWeight: 550, color: 'var(--strong)' }}>{x.title}</span>
                <span className="hidden sm:inline whitespace-nowrap" style={{ fontSize: 12.5, color: 'var(--faint)' }}>{projectTimeLabel(x)}</span>
                <span className={`whitespace-nowrap text-right font-medium ${CLIENT_STATUS[x.status]?.text ?? ''}`} style={{ fontSize: 12.5, minWidth: 64 }}>{CLIENT_STATUS[x.status]?.label ?? x.status}</span>
                <Ms name="chevron_right" style={{ fontSize: 18, width: 18 }} />
              </Link>
            ))}
          </section>
        )}
      </main>
    </ClientLayout>
  )
}
