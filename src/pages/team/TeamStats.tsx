import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval, format, parseISO, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { useProjects } from '@/hooks/useProjects'
import { useApiFetch } from '@/lib/api'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { BarChart, ChartCard, HBars, Ring, StatTile } from '@/components/charts/Charts'
import { PeriodBar } from '@/components/charts/PeriodBar'
import { StatusDot } from '@/components/ds'
import { inRange, isPeriodKey, periodRange, type PeriodKey } from '@/lib/period'
import { cn } from '@/lib/utils'
import type { Project, ProjectStatus, TimelineComment } from '@/types'

// Editor's own stats for a chosen period (same period bar as admin
// Analytics): tiles incl. first-time rate, deadlines (met / missed) over the
// period, on-time ring, where their videos are, revision history and their
// projects.

const STATUS_LABELS: Record<ProjectStatus, string> = {
  pending_assignment: 'Pending',
  in_progress: 'In Progress',
  in_review: 'In Review',
  admin_approved: 'Admin Approved',
  client_reviewing: 'Client Reviewing',
  client_approved: 'Completed',
  revision_requested: 'Revision Requested',
}
const FLOW: ProjectStatus[] = ['pending_assignment', 'in_progress', 'revision_requested', 'in_review', 'admin_approved', 'client_reviewing', 'client_approved']

interface Deadline {
  id: string
  project_id: string
  team_member_id: string
  assignment_id: string
  due_at: string
  status: 'met' | 'missed' | 'pending'
  project_title: string
}

type Comment = TimelineComment & { profiles: { full_name: string; avatar_url: string | null } }

export default function TeamStats() {
  const { data: projects, isLoading } = useProjects()
  const apiFetch = useApiFetch()

  // Period (in the address, like admin Analytics).
  const [params, setParams] = useSearchParams()
  const period: PeriodKey = isPeriodKey(params.get('period')) ? (params.get('period') as PeriodKey) : 'this_month'
  const from = params.get('from') ?? format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const to = params.get('to') ?? format(new Date(), 'yyyy-MM-dd')
  const [now] = useState(() => new Date())
  const range = useMemo(() => periodRange(period, now, { from, to }), [period, now, from, to])
  const setPeriod = (n: { period: PeriodKey; from?: string; to?: string }) => {
    const next = new URLSearchParams(params)
    next.set('period', n.period)
    if (n.period === 'custom') { next.set('from', n.from ?? from); next.set('to', n.to ?? to) } else { next.delete('from'); next.delete('to') }
    setParams(next, { replace: true })
  }

  // My projects; "in the period" = created or worked on (last update) in it.
  const mine = ((projects ?? []) as (Project & { is_assigned?: boolean })[]).filter((p) => p.is_assigned)
  const allProjects = mine.filter((p) => inRange(p.created_at, range) || inRange(p.updated_at, range))
  const active = allProjects.filter((p) => p.status !== 'client_approved')
  const completed = allProjects.filter((p) => p.status === 'client_approved')

  const totalRevisions = allProjects.reduce((acc, p) => acc + p.client_revision_count, 0)
  const currentlyInRevision = allProjects.filter((p) => p.status === 'revision_requested').length
  const projectsWithRevisions = allProjects.filter((p) => p.client_revision_count > 0)

  // Deadlines due in the period.
  const { data: allDeadlines = [] } = useQuery<Deadline[]>({
    queryKey: ['my_deadlines'],
    queryFn: () => apiFetch<Deadline[]>('/api/deadlines/my'),
  })
  const deadlines = allDeadlines.filter((d) => inRange(d.due_at, range))
  const deadlineMet = deadlines.filter((d) => d.status === 'met').length
  const deadlineMissed = deadlines.filter((d) => d.status === 'missed').length
  const deadlinePending = deadlines.filter((d) => d.status === 'pending').length
  const totalResolved = deadlineMet + deadlineMissed
  const metRate = totalResolved > 0 ? Math.round((deadlineMet / totalResolved) * 100) : null

  // Deadlines over the period: days for a week, weeks up to ~2 months,
  // months beyond — this chart spaces bars evenly, so it stays readable
  // with a handful of bars, not dozens.
  const earliest = allDeadlines.reduce<Date>((m, d) => { const t = parseISO(d.due_at); return t < m ? t : m }, now)
  const start = range.from ?? earliest
  const span = differenceInCalendarDays(range.to, start)
  const bucket: 'day' | 'week' | 'month' = span <= 8 ? 'day' : span <= 62 ? 'week' : 'month'
  const slots = bucket === 'day' ? eachDayOfInterval({ start, end: range.to })
    : bucket === 'week' ? eachWeekOfInterval({ start, end: range.to }, { weekStartsOn: 1 })
    : eachMonthOfInterval({ start, end: range.to })
  const slotOf = (iso: string) => {
    const d = parseISO(iso)
    return (bucket === 'day' ? startOfDay(d) : bucket === 'week' ? startOfWeek(d, { weekStartsOn: 1 }) : startOfMonth(d)).getTime()
  }
  const perSlot = slots.map((s) => ({
    // Short labels so many bars still fit; the hover shows the full date.
    label: format(s, bucket === 'month' ? 'MMM' : bucket === 'week' ? 'd MMM' : 'EEE d'),
    title: format(s, bucket === 'month' ? 'MMMM yyyy' : bucket === 'week' ? "'Week of' d MMM" : 'EEE d MMM'),
    values: [
      deadlines.filter((d) => d.status === 'met' && slotOf(d.due_at) === s.getTime()).length,
      deadlines.filter((d) => d.status === 'missed' && slotOf(d.due_at) === s.getTime()).length,
    ],
  }))

  // Notes from clients/admin on my projects.
  const myProjectIds = mine.map((p) => p.id)
  const { data: allComments = [] } = useQuery<Comment[]>({
    queryKey: ['revision_comments', myProjectIds.join(',')],
    queryFn: async () => {
      if (myProjectIds.length === 0) return []
      const results = await Promise.all(myProjectIds.map((id) => apiFetch<Comment[]>(`/api/timeline-comments/${id}`)))
      return results.flat()
    },
    enabled: myProjectIds.length > 0,
  })
  const revisionComments = allComments.filter((c) => c.author_role !== 'team')

  // First-time rate: finished videos in the period with no revision notes at
  // all (client or admin) — the same rule as the leaderboard's first-try rate.
  const finishedInPeriod = mine.filter((p) => p.status === 'client_approved' && inRange(p.updated_at, range))
  const firstTime = finishedInPeriod.filter((p) => !revisionComments.some((c) => c.project_id === p.id))
  const firstTimeRate = finishedInPeriod.length ? Math.round((firstTime.length / finishedInPeriod.length) * 100) : null

  const byStatus = FLOW.map((s) => ({ key: s, label: STATUS_LABELS[s], value: allProjects.filter((p) => p.status === s).length, dot: <StatusDot status={s} size={7} /> }))
    .filter((r) => r.value > 0)

  return (
    <TeamLayout>
      <main className="px-4 md:px-7 pb-10" style={{ maxWidth: 1240 }}>
        <header className="pt-5 pb-3"><h1>My Stats</h1></header>
        <div className="pb-4"><PeriodBar value={period} from={from} to={to} onChange={setPeriod} /></div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--ds-accent)', borderTopColor: 'transparent' }} /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <StatTile i={0} label="Assigned" value={allProjects.length} sub={`${active.length} active · ${completed.length} done`} />
              <StatTile i={1} label="Deadlines met" value={deadlineMet} sub={`${deadlineMissed} missed · ${deadlinePending} pending`} />
              <StatTile i={2} label="On-time rate" value={metRate !== null ? `${metRate}%` : '—'} sub={totalResolved > 0 ? `from ${totalResolved} resolved` : 'no resolved deadlines'} />
              <StatTile i={3} label="Revisions received" value={totalRevisions}
                sub={currentlyInRevision > 0 ? `${currentlyInRevision} project${currentlyInRevision > 1 ? 's' : ''} pending revision` : 'no active revisions'} />
              <div className="col-span-2 lg:col-span-1 min-w-0">
                <StatTile i={4} label="First-time rate" value={firstTimeRate !== null ? `${firstTimeRate}%` : '—'}
                  sub={finishedInPeriod.length ? `${firstTime.length} of ${finishedInPeriod.length} with no revisions` : 'no finished videos'} />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
              <ChartCard title="Deadlines" delay={80}>
                <BarChart data={perSlot} ariaLabel="Deadlines met and missed over the period"
                  series={[{ name: 'Met', color: 'var(--ink-bar)' }, { name: 'Missed', color: 'var(--bad-bar)' }]} />
              </ChartCard>
              <ChartCard title="On time" delay={120}>
                <div className="flex flex-col justify-center h-full gap-5 pb-2">
                  <Ring value={metRate} label="of deadlines met" sub={totalResolved > 0 ? `from ${totalResolved} resolved` : undefined} />
                  <dl className="grid grid-cols-3 gap-2" style={{ fontSize: 12.5 }}>
                    {[['Met', deadlineMet], ['Missed', deadlineMissed], ['Pending', deadlinePending]].map(([k, v]) => (
                      <div key={k as string} className="rounded-xl px-3 py-2" style={{ background: 'var(--panel)', boxShadow: 'inset 0 0 0 1px var(--panel-ring)' }}>
                        <dt style={{ color: 'var(--faint)' }}>{k}</dt>
                        <dd className="tabular-nums" style={{ fontSize: 17, fontWeight: 600, color: 'var(--strong)' }}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </ChartCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 items-start">
              <ChartCard title="Where my videos are" delay={160}>
                {byStatus.length ? <HBars rows={byStatus} /> : <p className="ds-empty">—</p>}
              </ChartCard>

              <ChartCard title="Revision history" delay={200}
                right={currentlyInRevision > 0 ? <span className="ds-tag text-red-600" style={{ fontSize: 12.5 }}>{currentlyInRevision} awaiting revision</span> : undefined}>
                {projectsWithRevisions.length ? (
                  <ul className="space-y-4">
                    {projectsWithRevisions.map((p) => {
                      const projectComments = revisionComments.filter((c) => c.project_id === p.id)
                      return (
                        <li key={p.id}>
                          <div className="flex items-center gap-3">
                            <Link to={`/team/projects/${p.id}`} className="flex-1 truncate hover:underline" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--strong)' }}>{p.title}</Link>
                            <span className="ds-tag text-red-600 flex-none" style={{ fontSize: 12 }}>{p.client_revision_count}× revision</span>
                          </div>
                          {projectComments.slice(0, 3).map((c) => (
                            <div key={c.id} className="mt-2 ml-1 pl-3" style={{ borderLeft: '2px solid var(--line)' }}>
                              <p className="line-clamp-2" style={{ fontSize: 12.5, color: 'var(--text)' }}>{c.comment_text}</p>
                              <p style={{ fontSize: 11.5, color: 'var(--faint)' }}>{c.profiles.full_name} · {new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                            </div>
                          ))}
                          {projectComments.length > 3 && <p className="mt-1.5 ml-4" style={{ fontSize: 11.5, color: 'var(--faint)' }}>+{projectComments.length - 3} more comments</p>}
                        </li>
                      )
                    })}
                  </ul>
                ) : <p className="ds-empty">—</p>}
              </ChartCard>
            </div>

            {allProjects.length === 0 ? (
              <p className="ds-empty" style={{ padding: '40px 0' }}>{mine.length ? 'No projects in this period.' : 'No projects assigned yet. Check back soon!'}</p>
            ) : (
              <ChartCard title="My Projects" right={<span className="ds-count">{allProjects.length}</span>} delay={240}>
                <ul className="-mx-2">
                  {allProjects.map((p) => {
                    const deadline = allDeadlines.find((d) => d.project_id === p.id)
                    return (
                      <li key={p.id}>
                        <Link to={`/team/projects/${p.id}`} className="ds-hrow" style={{ margin: 0 }}>
                          <div className="flex-1 min-w-0">
                            <p className="ds-t">{p.title}{p.client_revision_count > 0 && <span className="ds-tag text-red-600 ml-2 align-middle" style={{ fontSize: 11.5 }}>{p.client_revision_count}×</span>}</p>
                            <p className="ds-s">Updated {new Date(p.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                          </div>
                          {deadline && (
                            <span className={cn('ds-tag flex-none hidden sm:inline-flex', deadline.status === 'met' ? 'text-green-700' : deadline.status === 'missed' ? 'text-red-700' : 'text-orange-700')} style={{ fontSize: 12 }}>
                              {deadline.status === 'met' ? 'Deadline met' : deadline.status === 'missed' ? 'Deadline missed' : 'Deadline pending'}
                            </span>
                          )}
                          <span className="flex items-center gap-2 flex-none w-[9.5rem] justify-end" style={{ fontSize: 12.5, color: 'var(--soft-text)' }}>
                            <StatusDot status={p.status} size={7} />{STATUS_LABELS[p.status]}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </ChartCard>
            )}
          </div>
        )}
      </main>
    </TeamLayout>
  )
}
