import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format, startOfDay, subDays, isSameDay } from 'date-fns'
import { toast } from 'sonner'
import { AdminLayout, HeaderTools } from '@/components/admin/AdminLayout'
import { ClientMark, EditorAvatar } from '@/components/ds'
import { useApiFetch } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useUrgentRequests } from '@/hooks/useUrgentRequests'
import { useCareOverview } from '@/hooks/useCare'
import { QuickContacted } from '@/components/care/QuickContacted'
import { shortReason, isAllClear } from '@/lib/careReasons'
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
const empty = <p className="ds-empty">—</p>

function Panel({ title, count, tone, delay = 0, children }: { title: string; count?: number; tone?: 'warn' | 'accent' | 'bad'; delay?: number; children: React.ReactNode }) {
  return (
    <section className="ds-panel" style={{ animationDelay: `${delay}ms`, paddingBottom: count === 0 ? 16 : undefined }}>
      <div className="ds-panel-head" style={count === 0 ? { marginBottom: 0 } : undefined}>
        <h2>{title}</h2>
        {count !== undefined && <span className={cn('ds-count', count > 0 && tone)}>{count}</span>}
      </div>
      {count !== 0 && children}
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
        <div className="flex items-center gap-1 pb-1" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
          <span className="flex-1" />
          {days.map((d, i) => <span key={i} className={cell} style={i === 6 ? { color: 'var(--strong)', fontWeight: 600 } : undefined}>{i === 6 ? 'Today' : format(d, 'EEEEE')}</span>)}
          <span className={cn(cell, 'w-8')}>7d</span>
        </div>
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-1" style={{ minHeight: 40, fontSize: 13.5 }}>
              <span className="flex-1 min-w-0 flex items-center gap-2.5">
                <EditorAvatar name={r.name} size={22} />
                <span className="truncate">
                  <span className="sm:hidden">{r.name.split(' ')[0]}</span>
                  <span className="hidden sm:inline">{r.name}</span>
                </span>
              </span>
              {r.perDay.map((n, i) => (
                <span key={i} className={cell} style={n === 0 ? { color: 'var(--dash)' } : i === 6 ? { color: 'var(--ds-accent)', fontWeight: 600 } : undefined}>{n === 0 ? '·' : n}</span>
              ))}
              <span className={cn(cell, 'w-8')} style={{ fontWeight: 600, color: 'var(--strong)' }}>{r.total}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Row({ to, title, sub, client, lead, right }: { to: string; title: string; sub: string; client?: string | null; lead?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <li>
      <Link to={to} className="ds-hrow">
        {lead ?? <ClientMark name={client ?? '?'} size={26} />}
        <div className="flex-1 min-w-0">
          <p className="ds-t">{title}</p>
          <p className="ds-s">{sub}</p>
        </div>
        {right}
      </Link>
    </li>
  )
}

const when = (text: string, bad?: boolean) => (
  <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', color: bad ? 'var(--bad)' : 'var(--faint)', fontWeight: bad ? 600 : 400 }}>{text}</span>
)

export default function AdminHome() {
  const apiFetch = useApiFetch()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const { data, isLoading, error } = useQuery({ queryKey: ['admin-home'], queryFn: () => apiFetch<Home>('/api/admin/home'), refetchInterval: 30_000 })
  const urgent = useUrgentRequests(true)
  const pending = (urgent.data ?? []).filter((r) => r.status === 'pending')
  // Clients to text today (Client Care) — full admins only, like Client Care.
  const fullAdmin = profile?.admin_role !== 'manager'
  const care = useCareOverview(fullAdmin)
  const textToday = care.data?.text_today ?? []

  const decide = (id: string, decision: 'approve' | 'decline') => urgent.decide.mutate({ id, decision }, {
    onSuccess: () => {
      toast.success(decision === 'approve' ? 'Assigned' : 'Declined')
      qc.invalidateQueries({ queryKey: ['admin-home'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e) => toast.error((e as Error).message),
  })

  return (
    <AdminLayout bare>
      <main className="px-4 md:px-7 pb-10" style={{ maxWidth: 1180 }}>
        <header className="flex items-center gap-3" style={{ padding: '22px 0 18px' }}>
          <h1 className="truncate" style={{ margin: 0, fontSize: 24, fontWeight: 650, letterSpacing: '-.025em', color: 'var(--strong)' }}>{profile?.full_name?.split(' ')[0] ?? ''}</h1>
          <span className="flex-1" />
          <div className="hidden md:block"><HeaderTools /></div>
          <Link to="/admin" className="ds-ghost-btn ds-tap inline-flex items-center flex-shrink-0" style={{ textDecoration: 'none' }}>Projects</Link>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--ds-accent)', borderTopColor: 'transparent' }} /></div>
        ) : error || !data ? (
          <div className="ds-panel" style={{ fontSize: 13.5 }}>{(error as Error)?.message}</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
            <div className="space-y-4 min-w-0">
              {fullAdmin && care.data && (
                <Panel title="Text today" count={textToday.filter((t) => !(t.last_contact_at && new Date(t.last_contact_at).toDateString() === new Date().toDateString())).length} tone="warn">
                  {textToday.length ? (
                    <ul>
                      {textToday.map((t) => {
                        const reasons = t.reasons.filter((r) => !isAllClear(r)).map(shortReason).map((r) => r.label)
                        return (
                          <li key={t.client_id} className="flex items-center gap-2">
                            <Link to={`/admin/care?client=${t.client_id}`} className="ds-hrow" style={{ margin: '0 0 0 -10px', flex: '1 1 0%', minWidth: 0 }}>
                              <ClientMark name={t.name} size={26} />
                              <div className="flex-1 min-w-0">
                                <p className="ds-t">{t.name}</p>
                                {reasons.length > 0 && <p className="ds-s">{reasons.join(' · ')}</p>}
                              </div>
                            </Link>
                            <QuickContacted item={t} />
                          </li>
                        )
                      })}
                    </ul>
                  ) : empty}
                </Panel>
              )}
              <Panel title="Requests" count={pending.length} tone="warn">
                {pending.length ? (
                  <ul>
                    {pending.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 py-1.5">
                        <Link to={`/admin/projects/${r.project_id}`} className="ds-hrow flex-1" style={{ minWidth: '10rem', margin: '0 0 0 -10px' }}>
                          <EditorAvatar name={r.editor_name} size={26} />
                          <div className="flex-1 min-w-0">
                            <p className="ds-t">{r.editor_name}</p>
                            <p className="ds-s">{r.project_title} · {ago(r.created_at)}</p>
                          </div>
                        </Link>
                        <div className="flex gap-2 ml-auto">
                          <button disabled={urgent.decide.isPending} onClick={() => decide(r.id, 'approve')} className="ds-primary ds-tap disabled:opacity-50" style={{ padding: '0 16px' }}>Approve</button>
                          <button disabled={urgent.decide.isPending} onClick={() => decide(r.id, 'decline')} className="ds-ghost-btn ds-tap disabled:opacity-50">Decline</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : empty}
              </Panel>

              <Panel title="To review" count={data.to_review.length} tone="accent" delay={60}>
                {data.to_review.length ? (
                  <ul>
                    {data.to_review.map((p) => <Row key={p.id} to={`/admin/projects/${p.id}`} client={p.client} title={p.title} sub={`${p.client ?? '—'} · ${p.editors ?? '—'}`} right={when(ago(p.updated_at))} />)}
                  </ul>
                ) : empty}
              </Panel>

              <Panel title="Late" count={data.late.length} tone="bad" delay={120}>
                {data.late.length ? (
                  <ul>
                    {data.late.map((p) => <Row key={p.id + p.editor} to={`/admin/projects/${p.id}`} lead={<EditorAvatar name={p.editor} size={26} />} title={p.title} sub={p.editor} right={when(ago(p.due_at), true)} />)}
                  </ul>
                ) : empty}
              </Panel>

              <Panel title="Unassigned" count={data.unassigned.length} tone="warn" delay={180}>
                {data.unassigned.length ? (
                  <ul>
                    {data.unassigned.map((p) => <Row key={p.id} to={`/admin/projects/${p.id}`} client={p.client} title={p.title} sub={p.client ?? '—'} right={when(ago(p.created_at))} />)}
                  </ul>
                ) : empty}
              </Panel>
            </div>

            <div className="space-y-4 min-w-0">
              <Panel title="Editors" delay={90}>
                {data.editors.length ? (
                  <ul className="space-y-3.5 pt-1 pb-1.5">
                    {data.editors.map((e) => {
                      const full = e.active >= data.max
                      return (
                        <li key={e.id}>
                          <div className="flex items-center gap-2.5" style={{ fontSize: 13.5 }}>
                            <EditorAvatar name={e.name} size={22} />
                            <span className="truncate flex-1">{e.name}</span>
                            <span className="tabular-nums" style={{ fontWeight: 600, color: full ? 'var(--car-t)' : 'var(--ds-muted)' }}>{e.active}/{data.max}</span>
                          </div>
                          <div className="ds-track" style={{ marginTop: 8 }}>
                            <i className={full ? 'full' : undefined} style={{ width: `${Math.min(100, (e.active / data.max) * 100)}%` }} />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : empty}
              </Panel>

              <Panel title="Submitted" delay={150}>
                {data.editors.length ? <Submitted editors={data.editors} submitted={data.submitted ?? []} /> : empty}
              </Panel>
            </div>
          </div>
        )}
      </main>
    </AdminLayout>
  )
}
