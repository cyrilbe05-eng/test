import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format, startOfDay, subDays, isSameDay } from 'date-fns'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useUrgentRequests } from '@/hooks/useUrgentRequests'
import { cn } from '@/lib/utils'

// Admin home: what needs an admin now — editors' urgent requests, videos to
// review, projects nobody has taken, late work, and every editor's load.

type P = { id: string; title: string; client?: string | null }
type Home = {
  max: number
  to_review: (P & { updated_at: string; editors: string | null })[]
  unassigned: (P & { created_at: string })[]
  late: (P & { editor: string; due_at: string })[]
  editors: { id: string; name: string; active: number }[]
  /** Editors' "Submit for Review" times, last 8 days. */
  submitted?: { editor_id: string; at: string }[]
}

const ago = (d: string) => formatDistanceToNow(new Date(d), { addSuffix: true })
const empty = <p className="text-sm text-muted-foreground py-1">—</p>

function Card({ title, count, tone, children }: { title: string; count?: number; tone?: string; children: React.ReactNode }) {
  return (
    <section className="clay-card p-4 md:p-5 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="font-heading font-semibold">{title}</h2>
        {count !== undefined && (
          <span className={cn('text-sm font-semibold tabular-nums px-2.5 py-0.5 rounded-full', count > 0 && tone ? tone : 'bg-muted text-muted-foreground')}>{count}</span>
        )}
      </div>
      {children}
    </section>
  )
}

/** Videos each editor sent for review, per day: last 7 days, today on the
 *  right, then the 7-day total. Days are the viewer's local days. */
function Submitted({ editors, submitted }: { editors: Home['editors']; submitted: NonNullable<Home['submitted']> }) {
  const today = startOfDay(new Date())
  const days = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i))
  const count = (id: string, d: Date) => submitted.filter((s) => s.editor_id === id && isSameDay(new Date(s.at), d)).length
  const rows = editors.map((e) => ({ ...e, perDay: days.map((d) => count(e.id, d)) }))
    .map((r) => ({ ...r, total: r.perDay.reduce((a, b) => a + b, 0) }))
  const cell = 'w-7 text-center tabular-nums flex-shrink-0'
  return (
    <div className="-mx-1 overflow-x-auto">
      <div className="min-w-[19rem] px-1">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground pb-1.5">
          <span className="flex-1" />
          {days.map((d, i) => <span key={i} className={cn(cell, i === 6 && 'text-foreground font-semibold')}>{i === 6 ? 'Today' : format(d, 'EEEEE')}</span>)}
          <span className={cn(cell, 'w-8')}>7d</span>
        </div>
        <ul className="divide-y divide-border/60">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-1 min-h-[40px] text-sm">
              <span className="flex-1 min-w-0 truncate">
                <span className="sm:hidden">{r.name.split(' ')[0]}</span>
                <span className="hidden sm:inline">{r.name}</span>
              </span>
              {r.perDay.map((n, i) => (
                <span key={i} className={cn(cell, n === 0 ? 'text-muted-foreground/40' : i === 6 ? 'font-semibold text-primary' : '')}>{n === 0 ? '·' : n}</span>
              ))}
              <span className={cn(cell, 'w-8 font-semibold')}>{r.total}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Row({ to, title, sub, right }: { to: string; title: string; sub: string; right?: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 min-h-[52px] px-2 py-1.5 rounded-lg hover:bg-muted/60">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          <p className="text-xs text-muted-foreground truncate">{sub}</p>
        </div>
        {right}
      </Link>
    </li>
  )
}

export default function AdminHome() {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-home'], queryFn: () => apiFetch<Home>('/api/admin/home'), refetchInterval: 30_000 })
  const urgent = useUrgentRequests(true)
  const pending = (urgent.data ?? []).filter((r) => r.status === 'pending')

  const decide = (id: string, decision: 'approve' | 'decline') => urgent.decide.mutate({ id, decision }, {
    onSuccess: () => {
      toast.success(decision === 'approve' ? 'Assigned' : 'Declined')
      qc.invalidateQueries({ queryKey: ['admin-home'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e) => toast.error((e as Error).message),
  })

  return (
    <AdminLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-heading font-semibold tracking-tight truncate">{profile?.full_name?.split(' ')[0] ?? ''}</h1>
          <Link to="/admin" className="min-h-[44px] px-4 inline-flex items-center rounded-lg border border-border text-sm font-medium hover:bg-muted flex-shrink-0">Projects</Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : error || !data ? (
          <div className="clay-card p-5 text-sm">{(error as Error)?.message}</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
            <div className="space-y-4 min-w-0">
              <Card title="Requests" count={pending.length} tone="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                {pending.length ? (
                  <ul className="divide-y divide-border/60 -mx-2">
                    {pending.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 px-2 py-2">
                        <Link to={`/admin/projects/${r.project_id}`} className="flex-1 min-w-[10rem] min-h-[44px] flex flex-col justify-center hover:underline">
                          <span className="text-sm font-medium truncate">{r.editor_name}</span>
                          <span className="text-xs text-muted-foreground truncate">{r.project_title} · {ago(r.created_at)}</span>
                        </Link>
                        <div className="flex gap-2 ml-auto">
                          <button disabled={urgent.decide.isPending} onClick={() => decide(r.id, 'approve')}
                            className="min-h-[44px] px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50">Approve</button>
                          <button disabled={urgent.decide.isPending} onClick={() => decide(r.id, 'decline')}
                            className="min-h-[44px] px-4 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50">Decline</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : empty}
              </Card>

              <Card title="To review" count={data.to_review.length} tone="bg-primary/10 text-primary">
                {data.to_review.length ? (
                  <ul className="divide-y divide-border/60 -mx-2">
                    {data.to_review.map((p) => <Row key={p.id} to={`/admin/projects/${p.id}`} title={p.title} sub={`${p.client ?? '—'} · ${p.editors ?? '—'}`} right={<span className="text-xs text-muted-foreground whitespace-nowrap">{ago(p.updated_at)}</span>} />)}
                  </ul>
                ) : empty}
              </Card>

              <Card title="Late" count={data.late.length} tone="bg-red-500/10 text-red-700 dark:text-red-300">
                {data.late.length ? (
                  <ul className="divide-y divide-border/60 -mx-2">
                    {data.late.map((p) => <Row key={p.id + p.editor} to={`/admin/projects/${p.id}`} title={p.title} sub={p.editor} right={<span className="text-xs font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">{ago(p.due_at)}</span>} />)}
                  </ul>
                ) : empty}
              </Card>

              <Card title="Unassigned" count={data.unassigned.length} tone="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                {data.unassigned.length ? (
                  <ul className="divide-y divide-border/60 -mx-2">
                    {data.unassigned.map((p) => <Row key={p.id} to={`/admin/projects/${p.id}`} title={p.title} sub={p.client ?? '—'} right={<span className="text-xs text-muted-foreground whitespace-nowrap">{ago(p.created_at)}</span>} />)}
                  </ul>
                ) : empty}
              </Card>
            </div>

            <div className="space-y-4 min-w-0">
            <Card title="Editors">
              {data.editors.length ? (
                <ul className="space-y-3 pt-1">
                  {data.editors.map((e) => {
                    const full = e.active >= data.max
                    return (
                      <li key={e.id}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate">{e.name}</span>
                          <span className={cn('tabular-nums font-semibold', full ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>{e.active}/{data.max}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn('h-full rounded-full', full ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${Math.min(100, (e.active / data.max) * 100)}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : empty}
            </Card>

            <Card title="Submitted">
              {data.editors.length ? <Submitted editors={data.editors} submitted={data.submitted ?? []} /> : empty}
            </Card>
            </div>
          </div>
        )}
      </main>
    </AdminLayout>
  )
}
