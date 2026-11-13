import { Link, Navigate } from 'react-router-dom'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { useClientDashboard, useTickClientStep, type ClientDashboard as Dashboard, type DashboardOwner } from '@/hooks/useClientDashboard'
import { cn } from '@/lib/utils'
import { ClientBrief } from '@/components/onboarding/ClientBrief'
import { ClientStats } from '@/components/workspace/ClientStats'
import { MarkPosted } from '@/components/project/MarkPosted'
import { useCanCreateVideo } from '@/hooks/useCanCreateVideo'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { useProjects } from '@/hooks/useProjects'
import { projectTimeLabel } from '@/lib/utils'
import type { Project } from '@/types'

// Client home: contract timeline → one video list (to-dos first) →
// plan; Miro board and SOPs on the side. Home is also the video list: a
// tap on a video opens it.
// Compact; labels and numbers only. Everything comes from /api/client/dashboard.

const OWNER: Record<DashboardOwner, string> = { client: 'You', pingu: 'Pingu', both: 'Both' }
const day = (d: string) => format(new Date(`${d}T12:00:00Z`), 'd MMM')

function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('clay-card p-4 md:p-5 min-w-0', className)}>
      {title && <h3 className="font-heading font-semibold mb-3">{title}</h3>}
      {children}
    </section>
  )
}

function Timeline({ c }: { c: NonNullable<Dashboard['contract']> }) {
  return (
    <Card>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Contract {c.number}</p>
          <p className="text-lg font-heading font-semibold tabular-nums">Day {c.day} of {c.total_days}</p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">{c.days_left} days left</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={c.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Contract">
        <div className="h-full rounded-full bg-primary" style={{ width: `${c.progress}%` }} />
      </div>
    </Card>
  )
}

// One list: what needs the client first (with its button), then the rest
// with their status. Each video appears once.
function Videos({ items, scripts, toPost, inWorks }: { items: Dashboard['needs']; scripts: NonNullable<Dashboard['scripts']>; toPost: Project[]; inWorks: Project[] }) {
  const btn = 'min-h-[44px] px-3 inline-flex items-center rounded-lg text-sm font-semibold'
  const videos = scripts.length + items.filter((n) => n.type !== 'plan_step').length + toPost.length + inWorks.length
  return (
    <Card title={`Videos · ${videos}`}>
      <ul className="divide-y divide-border/60 -my-1">
        {items.map((n) => (
          <li key={n.type === 'plan_step' ? n.id : `${n.type}-${n.project_id}`} className="flex items-center gap-3 py-1.5 min-h-[44px]">
            <span className={cn('w-2 h-2 rounded-full flex-shrink-0', n.type === 'plan_step' ? 'bg-red-500' : 'bg-amber-500')} aria-hidden />
            {n.type === 'plan_step' ? (
              <>
                <span className="flex-1 min-w-0 text-sm break-words">{n.title}</span>
                <span className="text-xs font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">{n.days_late}d late</span>
              </>
            ) : (
              <>
                <Link to={`/workspace/projects/${n.project_id}`} className="flex-1 min-w-0 text-sm font-medium break-words hover:underline">{n.title}</Link>
                {n.type === 'review'
                  ? <Link to={`/workspace/projects/${n.project_id}`} className={cn(btn, 'bg-primary text-white hover:brightness-110')}>Review</Link>
                  : <Link to={`/workspace/projects/${n.project_id}`} className={cn(btn, 'border border-border font-normal hover:bg-muted')}>Upload</Link>}
              </>
            )}
          </li>
        ))}
        {scripts.map((e) => {
          // Same hand-off as the calendar's "Create project": the upload page
          // opens with this script on top and links the new video to it.
          const prefill = {
            title: e.title,
            video_script: e.script ?? '',
            inspiration_url: e.inspiration_url ?? '',
            instructions: [e.comments?.trim(), e.caption?.trim() ? `Caption:\n${e.caption.trim()}` : ''].filter(Boolean).join('\n\n'),
            fromEventTitle: e.title,
            fromEventId: e.id,
            entry: { script: e.script, caption: e.caption, comments: e.comments, inspiration_url: e.inspiration_url },
          }
          return (
            <li key={`script-${e.id}`} className="flex items-center gap-3 py-1.5 min-h-[44px]">
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-amber-500" aria-hidden />
              <Link to="/workspace/new" state={{ prefill }} className="flex-1 min-w-0 text-sm font-medium break-words hover:underline">{e.title}</Link>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{day(e.date)}</span>
              <Link to="/workspace/new" state={{ prefill }} className={cn(btn, 'border border-border font-normal hover:bg-muted')}>Upload</Link>
            </li>
          )
        })}
        {toPost.map((p) => (
          <li key={`post-${p.id}`} className="flex items-center gap-3 py-1.5 min-h-[44px]">
            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500" aria-hidden />
            <Link to={`/workspace/projects/${p.id}`} className="flex-1 min-w-0 text-sm font-medium break-words hover:underline">{p.title}</Link>
            <MarkPosted project={p} />
          </li>
        ))}
        {inWorks.map((p) => (
          <li key={p.id}>
            <Link to={`/workspace/projects/${p.id}`} className="flex items-center gap-3 min-h-[44px] py-1.5 hover:bg-muted/60 rounded-lg">
              <span className="w-2 flex-shrink-0" aria-hidden />
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{p.title}</span>
              <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap">{projectTimeLabel(p)}</span>
              <ProjectStatusBadge status={p.status} />
            </Link>
          </li>
        ))}
        {scripts.length + items.length + toPost.length + inWorks.length === 0 && <li className="py-1.5 text-sm text-muted-foreground">—</li>}
      </ul>
    </Card>
  )
}

function Plan({ steps }: { steps: Dashboard['plan'] }) {
  const tick = useTickClientStep()
  return (
    <Card title="Plan">
      <ol className="space-y-0.5">
        {steps.map((s) => (
          <li key={s.id} className={cn('flex items-center gap-2 rounded-lg pr-2',
            s.state === 'next' && 'bg-primary/5 ring-1 ring-primary/30', s.state === 'overdue' && 'bg-red-500/5 ring-1 ring-red-500/30')}>
            {s.can_tick ? (
              <button role="checkbox" aria-checked={s.done} aria-label={s.title} disabled={tick.isPending}
                onClick={() => tick.mutate({ id: s.id, done: !s.done }, { onError: (e) => toast.error((e as Error).message) })}
                className="w-11 h-11 flex items-center justify-center flex-shrink-0">
                <span className={cn('w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs font-bold',
                  s.done ? 'bg-primary border-primary text-white' : 'border-muted-foreground/40')}>{s.done ? '✓' : ''}</span>
              </button>
            ) : (
              <span className="w-11 h-11 flex items-center justify-center flex-shrink-0" aria-label={s.done ? 'Done' : 'To do'}>
                <span className={cn('w-2.5 h-2.5 rounded-full', s.done ? 'bg-primary' : 'bg-muted-foreground/30')} />
              </span>
            )}
            <span className={cn('w-12 flex-shrink-0 text-xs tabular-nums', s.state === 'overdue' ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-muted-foreground', s.done && 'opacity-50')}>{day(s.date)}</span>
            <span className={cn('flex-1 min-w-0 text-sm leading-snug break-words py-1', s.state === 'next' && 'font-semibold', s.done && 'opacity-50')}>{s.title}</span>
            <span className={cn('text-xs px-2 py-0.5 rounded-full ds-tag whitespace-nowrap', s.done && 'opacity-50',
              s.owner === 'client' ? 'bg-primary/10 text-primary' : s.owner === 'both' ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'bg-muted text-muted-foreground')}>
              {OWNER[s.owner]}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export default function ClientDashboard() {
  const { data, isLoading, error } = useClientDashboard()
  const canCreate = useCanCreateVideo()
  const { data: projects } = useProjects()
  // Approved in the last 30 days and not marked posted yet.
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const toPost = ((projects ?? []) as Project[])
    .filter((p) => p.status === 'client_approved' && !p.posted_at && p.updated_at >= since)
  const active = ((projects ?? []) as Project[])
    .filter((p) => p.status !== 'client_approved')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const needIds = new Set((data?.needs ?? []).flatMap((n) => (n.type === 'plan_step' ? [] : [n.project_id])))
  const inWorks = active.filter((p) => !needIds.has(p.id))
  // Onboarding opens before the dashboard until it's done.
  if (data?.needs_onboarding) return <Navigate to="/workspace/onboarding" replace />
  return (
    <ClientLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-heading font-semibold tracking-tight truncate">{data?.name ?? ''}</h1>
          {canCreate && <Link to="/workspace/new" className="min-h-[44px] px-4 inline-flex items-center rounded-lg bg-primary text-white text-sm font-semibold hover:brightness-110 flex-shrink-0">
            + New video
          </Link>}
        </div>
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : error ? (
          <div className="clay-card p-5 text-sm">{(error as Error).message}</div>
        ) : data ? (
          <>
            <ClientStats projects={(projects ?? []) as Project[]} />
            {data.contract && <Timeline c={data.contract} />}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
              <div className="space-y-4 min-w-0">
                <Videos items={data.needs} scripts={data.scripts ?? []} toPost={toPost} inWorks={inWorks} />
                {data.plan.length > 0 && <Plan steps={data.plan} />}
              </div>
              <ClientBrief brief={data} noStyle />
            </div>
          </>
        ) : null}
      </main>
    </ClientLayout>
  )
}
