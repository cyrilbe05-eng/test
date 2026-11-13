import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { useClientDashboard, useTickClientStep, type ClientDashboard as Dashboard, type DashboardOwner } from '@/hooks/useClientDashboard'
import { cn } from '@/lib/utils'
import { ClientBrief } from '@/components/onboarding/ClientBrief'
import { StatTile } from '@/components/charts/Charts'
import { Ms } from '@/components/ds'
import { useApiFetch } from '@/lib/api'
import { MarkPosted } from '@/components/project/MarkPosted'
import { useCanCreateVideo } from '@/hooks/useCanCreateVideo'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { useProjects } from '@/hooks/useProjects'
import { projectTimeLabel } from '@/lib/utils'
import type { Project } from '@/types'

// Client home: the plan's steps on top (when the client has a plan) → one
// video list (to-dos first); Miro board and SOPs on the side. Their numbers
// and contract progress open from "My report" (top right) in a side panel. Home is also the video list: a
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

function Contract({ c }: { c: NonNullable<Dashboard['contract']> }) {
  return (
    <div className="clay-card p-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p style={{ fontSize: 12.5, color: 'var(--faint)' }}>Contract {c.number}</p>
          <p className="tabular-nums" style={{ fontSize: 17, fontWeight: 650, color: 'var(--strong)' }}>Day {c.day} of {c.total_days}</p>
        </div>
        <p className="tabular-nums whitespace-nowrap" style={{ fontSize: 12.5, color: 'var(--faint)' }}>{c.days_left} days left</p>
      </div>
      <span className="ds-track block mt-3" role="progressbar" aria-valuenow={c.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Contract">
        <i style={{ width: `${c.progress}%`, background: 'var(--ink-bar)' }} />
      </span>
    </div>
  )
}

/** "My report": the client's numbers + contract, in a panel from the right. */
function Report({ projects, contract, onClose }: { projects: Project[]; contract: Dashboard['contract']; onClose: () => void }) {
  const apiFetch = useApiFetch()
  const { data } = useQuery<{ total: number }>({ queryKey: ['time-saved'], queryFn: () => apiFetch<{ total: number }>('/api/time-saved') })
  const done = projects.filter((p) => p.status === 'client_approved').length
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <>
      <div className="ds-side-veil" onClick={onClose} />
      <aside className="ds-side-panel" role="dialog" aria-modal="true" aria-label="My report">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-.02em', color: 'var(--strong)' }}>My report</h2>
          <button type="button" className="ds-ibtn" aria-label="Close" onClick={onClose}><Ms name="close" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatTile i={0} label="Active videos" value={projects.length - done} />
          <StatTile i={1} label="Completed" value={done} />
          <StatTile i={2} label="All videos" value={projects.length} />
          <StatTile i={3} label="Time Saved" value={data ? `${data.total}h` : '—'} />
        </div>
        {contract && <div className="mt-3"><Contract c={contract} /></div>}
        <Link to="/workspace/analytics" className="ds-ghost-btn ds-tap mt-4 w-full inline-flex items-center justify-center gap-2" style={{ textDecoration: 'none' }}>
          <Ms name="monitoring" style={{ fontSize: 18, width: 18, color: 'inherit' }} />Analytics
        </Link>
      </aside>
    </>
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

/** The plan's steps as a horizontal track; scrolls to the next step. */
function Plan({ steps }: { steps: Dashboard['plan'] }) {
  const tick = useTickClientStep()
  const track = useRef<HTMLOListElement>(null)
  const doneCount = steps.filter((s) => s.done).length
  useEffect(() => {
    // Show the next step with the one before it, both whole.
    const next = track.current?.querySelector<HTMLElement>('[data-next="true"]')
    const el = (next?.previousElementSibling as HTMLElement | null) ?? next
    if (el && track.current) track.current.scrollTo({ left: Math.max(0, el.offsetLeft - track.current.offsetLeft - 20), behavior: 'smooth' })
  }, [steps.length])
  return (
    <section className="ds-panel" style={{ padding: '18px 0 16px' }}>
      <div className="ds-panel-head px-5" style={{ marginBottom: 12 }}>
        <h2>Plan</h2>
        <span className="tabular-nums" style={{ fontSize: 12.5, color: 'var(--faint)' }}>{doneCount} / {steps.length}</span>
      </div>
      <ol ref={track} className="ds-steps">
        {steps.map((s, i) => (
          <li key={s.id} data-next={s.state === 'next'} className={cn('ds-step', s.done && 'done', s.state === 'next' && 'next', s.state === 'overdue' && 'late')} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
            <div className="ds-step-rail" aria-hidden>
              <span className="ds-step-node">{s.done && <Ms name="check" style={{ fontSize: 13, width: 13, color: 'inherit' }} />}</span>
            </div>
            <p className="tabular-nums" style={{ fontSize: 12, color: s.state === 'overdue' ? 'var(--bad)' : 'var(--faint)', fontWeight: s.state === 'overdue' ? 600 : 400 }}>{day(s.date)}</p>
            <p className="ds-step-t">{s.title}</p>
            <div className="flex items-center justify-between gap-2 mt-auto pt-2">
              <span style={{ fontSize: 12, color: 'var(--faint)' }}>{OWNER[s.owner]}</span>
              {s.can_tick && (
                <button role="checkbox" aria-checked={s.done} aria-label={s.title} disabled={tick.isPending}
                  onClick={() => tick.mutate({ id: s.id, done: !s.done }, { onError: (e) => toast.error((e as Error).message) })}
                  className="ds-step-tick">
                  {s.done ? 'Done' : 'Mark done'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
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
  const [report, setReport] = useState(false)
  // Onboarding opens before the dashboard until it's done.
  if (data?.needs_onboarding) return <Navigate to="/workspace/onboarding" replace />
  return (
    <ClientLayout>
      {report && data && <Report projects={(projects ?? []) as Project[]} contract={data.contract} onClose={() => setReport(false)} />}
      <main className="px-4 md:px-7 pb-10 space-y-4" style={{ maxWidth: 1240 }}>
        <header className="flex items-center gap-3 pt-5 pb-1">
          <h1 className="truncate flex-1">{data?.name ?? ''}</h1>
          <button type="button" className="ds-ghost-btn ds-tap inline-flex items-center gap-2 flex-none" onClick={() => setReport(true)} disabled={!data}>
            <Ms name="insights" style={{ fontSize: 18, width: 18, color: 'inherit' }} /><span className="hidden sm:inline">My report</span>
          </button>
          {canCreate && <Link to="/workspace/new" className="ds-primary ds-tap flex-none" style={{ textDecoration: 'none' }}>
            <Ms name="add" style={{ fontSize: 18, width: 18, color: 'inherit' }} /><span className="hidden sm:inline">New video</span>
          </Link>}
        </header>
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--ds-accent)', borderTopColor: 'transparent' }} /></div>
        ) : error ? (
          <div className="ds-panel" style={{ fontSize: 13.5 }}>{(error as Error).message}</div>
        ) : data ? (
          <>
            {data.plan.length > 0 && <Plan steps={data.plan} />}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
              <div className="space-y-4 min-w-0">
                <Videos items={data.needs} scripts={data.scripts ?? []} toPost={toPost} inWorks={inWorks} />
              </div>
              <ClientBrief brief={data} noStyle />
            </div>
          </>
        ) : null}
      </main>
    </ClientLayout>
  )
}
