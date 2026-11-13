import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays, format, formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

// Editor home: my videos (what's expected, deadline, open notes) against the
// active limit, what's with the client, and what's available to take.

type Item = { id: string; title: string; status: string; updated_at: string; client: string | null }
type Mine = Item & { due_at: string | null; deadline_status: string | null; open_notes: number }
type Home = { active: number; max: number; working: Mine[]; with_client: Mine[]; available: (Item & { request: string | null })[] }

// What the editor has to do next, per status — most urgent first.
const NEXT: Record<string, { label: string; tone: string; order: number }> = {
  revision_requested: { label: 'Revisions', tone: 'bg-red-500/10 text-red-700 dark:text-red-300', order: 0 },
  in_progress: { label: 'Edit', tone: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300', order: 1 },
  pending_assignment: { label: 'Start', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', order: 2 },
  in_review: { label: 'With admin', tone: 'bg-muted text-muted-foreground', order: 3 },
  admin_approved: { label: 'With admin', tone: 'bg-muted text-muted-foreground', order: 3 },
}
const waiting = (s: string) => s === 'in_review' || s === 'admin_approved'

function Due({ p }: { p: Mine }) {
  if (waiting(p.status) || !p.due_at) return <span className="text-xs text-muted-foreground">—</span>
  const due = new Date(p.due_at)
  const late = p.deadline_status === 'missed' || (p.deadline_status === 'pending' && due < new Date())
  if (late) return <span className="text-xs font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">Late</span>
  if (p.deadline_status === 'met') return <span className="text-xs text-muted-foreground">—</span>
  const days = differenceInCalendarDays(due, new Date())
  return (
    <span className={cn('text-xs tabular-nums whitespace-nowrap', days <= 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
      {days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : format(due, 'd MMM')}
    </span>
  )
}

function Card({ title, children, right }: { title: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="clay-card p-4 md:p-5 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="font-heading font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}
const empty = <p className="text-sm text-muted-foreground py-1">—</p>

export default function EditorHome() {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const { data, isLoading, error } = useQuery({ queryKey: ['editor-home'], queryFn: () => apiFetch<Home>('/api/editor-home'), refetchInterval: 30_000 })
  const [busy, setBusy] = useState<string | null>(null)

  const act = async (id: string, kind: 'claim' | 'urgent') => {
    setBusy(id)
    try {
      await apiFetch(`/api/projects/${id}/${kind}`, { method: 'POST' })
      toast.success(kind === 'claim' ? 'Assigned' : 'Requested')
    } catch (e) {
      const m = (e as Error).message
      toast.error(m === 'editor_limit_reached' ? 'Limit reached' : m)
    } finally {
      setBusy(null)
      qc.invalidateQueries({ queryKey: ['editor-home'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    }
  }

  const full = !!data && data.active >= data.max
  const working = [...(data?.working ?? [])].sort((a, b) =>
    (NEXT[a.status]?.order ?? 9) - (NEXT[b.status]?.order ?? 9) || (a.due_at ?? '9').localeCompare(b.due_at ?? '9'))

  return (
    <TeamLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-heading font-semibold tracking-tight truncate">{profile?.full_name?.split(' ')[0] ?? ''}</h1>
          <Link to="/team/all" className="min-h-[44px] px-4 inline-flex items-center rounded-lg border border-border text-sm font-medium hover:bg-muted flex-shrink-0">All projects</Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : error || !data ? (
          <div className="clay-card p-5 text-sm">{(error as Error)?.message}</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
            <div className="space-y-4 min-w-0">
              <Card
                title="My videos"
                right={
                  <span className={cn('text-sm font-semibold tabular-nums px-2.5 py-0.5 rounded-full ds-num',
                    full ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>
                    {data.active}/{data.max}
                  </span>
                }
              >
                <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-2" role="progressbar" aria-label="Active" aria-valuenow={data.active} aria-valuemax={data.max}>
                  <div className={cn('h-full rounded-full', full ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${Math.min(100, (data.active / data.max) * 100)}%` }} />
                </div>
                {working.length ? (
                  <ul className="divide-y divide-border/60 -mx-2">
                    {working.map((p) => (
                      <li key={p.id}>
                        <Link to={`/team/projects/${p.id}`} className="flex items-center gap-3 min-h-[52px] px-2 py-2 rounded-lg hover:bg-muted/60">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{p.client ?? '—'}</p>
                          </div>
                          {p.status === 'revision_requested' && p.open_notes > 0 && (
                            <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">{p.open_notes} notes</span>
                          )}
                          <Due p={p} />
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full ds-tag whitespace-nowrap', NEXT[p.status]?.tone)}>{NEXT[p.status]?.label ?? p.status}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : empty}
              </Card>

              <Card title={`With client · ${data.with_client.length}`}>
                {data.with_client.length ? (
                  <ul className="divide-y divide-border/60 -mx-2">
                    {data.with_client.map((p) => (
                      <li key={p.id}>
                        <Link to={`/team/projects/${p.id}`} className="flex items-center gap-3 min-h-[44px] px-2 py-1.5 rounded-lg hover:bg-muted/60">
                          <span className="flex-1 min-w-0 text-sm truncate">{p.title}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : empty}
              </Card>
            </div>

            <Card title={`Available · ${data.available.length}`}>
              {data.available.length ? (
                <ul className="divide-y divide-border/60 -mx-2">
                  {data.available.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 px-2 py-1.5 min-h-[52px]">
                      <Link to={`/team/projects/${p.id}`} className="flex-1 min-w-0 min-h-[44px] flex flex-col justify-center hover:underline">
                        <p className="text-sm font-medium truncate">{p.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.client ?? '—'} · {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}</p>
                      </Link>
                      {!full || p.request === 'approved' ? (
                        <button disabled={busy === p.id} onClick={() => act(p.id, 'claim')}
                          className="min-h-[44px] px-3 rounded-lg bg-primary text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50 flex-shrink-0">Assign</button>
                      ) : p.request === 'pending' ? (
                        <span className="min-h-[44px] px-3 inline-flex items-center rounded-lg border border-border text-sm text-muted-foreground flex-shrink-0">Requested</span>
                      ) : (
                        <>
                          {p.request === 'declined' && <span className="text-xs font-semibold text-red-600 dark:text-red-400">Declined</span>}
                          <button disabled={busy === p.id} onClick={() => act(p.id, 'urgent')}
                            className="min-h-[44px] px-3 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50 flex-shrink-0">
                            Request urgent
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : empty}
            </Card>
          </div>
        )}
      </main>
    </TeamLayout>
  )
}
