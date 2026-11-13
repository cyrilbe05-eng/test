import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  eachMonthOfInterval,
  isWithinInterval,
  parseISO,
} from 'date-fns'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { BarChart, ChartCard, HBars, StatTile } from '@/components/charts/Charts'
import { Segmented, StatusDot } from '@/components/ds'
import type { Project, ProjectStatus, TimelineComment, Plan } from '@/types'

// Client analytics: the period's numbers, all-time numbers, videos started
// per month, videos by status, plan usage and recent activity.

type Timeframe = 'week' | 'month' | 'custom'

const STATUS_LABELS: Record<ProjectStatus, string> = {
  pending_assignment: 'Pending',
  in_progress: 'In Progress',
  in_review: 'In Review',
  admin_approved: 'Admin Approved',
  client_reviewing: 'Reviewing',
  client_approved: 'Completed',
  revision_requested: 'Revision',
}
const FLOW: ProjectStatus[] = ['pending_assignment', 'in_progress', 'revision_requested', 'in_review', 'admin_approved', 'client_reviewing', 'client_approved']

/** A thin usage meter: neutral until it's nearly full, then red. */
function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = Math.min(used / max, 1)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5" style={{ fontSize: 13 }}>
        <span className="truncate">{label}</span>
        <span className="tabular-nums flex-none" style={{ fontWeight: 600, color: 'var(--strong)' }}>{used} / {max}</span>
      </div>
      <span className="ds-track block"><i style={{ width: `${pct * 100}%`, background: pct >= 1 ? 'var(--bad-bar)' : 'var(--ink-bar)' }} /></span>
    </div>
  )
}

export default function ClientAnalytics() {
  const { profile } = useAuth()
  const apiFetch = useApiFetch()

  const [timeframe, setTimeframe] = useState<Timeframe>('month')
  const [customFrom, setCustomFrom] = useState(format(subMonths(new Date(), 1), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'))

  // ─── Data fetching ──────────────────────────────────────────────────────────
  const { data: projects = [], isLoading } = useProjects()
  const allProjects = projects as Project[]

  const myProjectIds = allProjects.map((p) => p.id)

  const { data: allComments = [] } = useQuery<(TimelineComment & { profiles: { full_name: string; avatar_url: string | null } })[]>({
    queryKey: ['analytics_comments', myProjectIds.join(',')],
    queryFn: async () => {
      if (myProjectIds.length === 0) return []
      const results = await Promise.all(
        myProjectIds.map((id) =>
          apiFetch<(TimelineComment & { profiles: { full_name: string; avatar_url: string | null } })[]>(`/api/timeline-comments/${id}`)
        )
      )
      return results.flat()
    },
    enabled: myProjectIds.length > 0,
  })

  const { data: plan } = useQuery<Plan | null>({
    queryKey: ['my_plan', profile?.plan_id],
    queryFn: () => profile?.plan_id ? apiFetch<Plan>(`/api/plans/${profile.plan_id}`) : Promise.resolve(null),
    enabled: !!profile?.plan_id,
  })

  // ─── Date range ─────────────────────────────────────────────────────────────
  const dateRange = useMemo(() => {
    const now = new Date()
    if (timeframe === 'week') return { start: startOfWeek(now), end: endOfWeek(now) }
    if (timeframe === 'month') return { start: startOfMonth(now), end: endOfMonth(now) }
    return { start: parseISO(customFrom), end: parseISO(customTo) }
  }, [timeframe, customFrom, customTo])

  const inRange = (dateStr: string) => {
    try { return isWithinInterval(parseISO(dateStr), dateRange) } catch { return false }
  }

  // ─── Computed stats ─────────────────────────────────────────────────────────
  const active = allProjects.filter((p) => p.status !== 'client_approved')
  const completed = allProjects.filter((p) => p.status === 'client_approved')
  const totalRevisions = allProjects.reduce((acc, p) => acc + p.client_revision_count, 0)

  const rangeProjects = allProjects.filter((p) => inRange(p.created_at))
  const rangeComments = allComments.filter((c) => inRange(c.created_at))

  // Monthly bars — last 6 months
  const months = eachMonthOfInterval({ start: subMonths(new Date(), 5), end: new Date() })
  const projectsPerMonth = months.map((m) => ({
    label: format(m, 'MMM'),
    title: format(m, 'MMMM yyyy'),
    values: [allProjects.filter((p) => {
      const d = parseISO(p.created_at)
      return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth()
    }).length],
  }))

  const byStatus = FLOW.map((s) => ({ key: s, label: STATUS_LABELS[s], value: allProjects.filter((p) => p.status === s).length, dot: <StatusDot status={s} size={7} /> }))
    .filter((r) => r.value > 0)
  const revisionVideos = allProjects.filter((p) => p.max_client_revisions !== -1 && p.max_client_revisions > 0)
  const periodLabel = timeframe === 'week' ? 'This week' : timeframe === 'month' ? 'This month' : `${customFrom} – ${customTo}`
  const activity = rangeComments.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 10)

  return (
    <ClientLayout>
      <main className="px-4 md:px-7 pb-10" style={{ maxWidth: 1240 }}>
        <header className="flex flex-wrap items-center gap-3 pt-5 pb-5">
          <h1>Analytics</h1>
          <span className="flex-1" />
          <div className="overflow-x-auto max-w-full">
            <Segmented label="Period" width={96} value={timeframe} onChange={setTimeframe}
              options={[{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'custom', label: 'Custom' }]} />
          </div>
          {timeframe === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="ds-field" style={{ width: 150 }} aria-label="From" />
              <span style={{ color: 'var(--faint)' }}>–</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="ds-field" style={{ width: 150 }} aria-label="To" />
            </div>
          )}
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--ds-accent)', borderTopColor: 'transparent' }} /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              <StatTile i={0} label="Videos started" value={rangeProjects.length} sub={periodLabel} />
              <StatTile i={1} label="Team Comments" value={rangeComments.filter((c) => c.author_role === 'team').length} sub={periodLabel} />
              <StatTile i={2} label="All videos" value={allProjects.length} sub="All time" />
              <StatTile i={3} label="Active" value={active.length} sub="All time" />
              <StatTile i={4} label="Completed" value={completed.length} sub="All time" />
              <StatTile i={5} label="Revisions Used" value={totalRevisions} sub="All time" />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start">
              <ChartCard title="Videos started" right={<span style={{ fontSize: 12.5, color: 'var(--faint)' }}>Last 6 months</span>} delay={80}>
                <BarChart data={projectsPerMonth} ariaLabel="Videos started per month, last 6 months" series={[{ name: 'Videos started', color: 'var(--ink-bar)' }]} />
              </ChartCard>
              <ChartCard title="Videos by status" delay={120}>
                {byStatus.length ? <HBars rows={byStatus} /> : <p className="ds-empty">—</p>}
              </ChartCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 items-start">
              {plan && (
                <ChartCard title="Plan usage" right={<span style={{ fontSize: 12.5, color: 'var(--faint)' }}>{plan.name}</span>} delay={160}>
                  <div className="space-y-4">
                    {plan.max_active_projects !== -1 && <Meter label="Active videos" used={active.length} max={plan.max_active_projects} />}
                    {revisionVideos.length > 0 && (
                      <div>
                        <p className="mb-2.5" style={{ fontSize: 12.5, color: 'var(--faint)' }}>Revision usage per video</p>
                        <div className="space-y-3">
                          {revisionVideos.map((p) => <Meter key={p.id} label={p.title} used={p.client_revision_count} max={p.max_client_revisions} />)}
                        </div>
                      </div>
                    )}
                  </div>
                </ChartCard>
              )}

              {allComments.length > 0 && (
                <ChartCard title="Recent activity" right={<span style={{ fontSize: 12.5, color: 'var(--faint)' }}>{periodLabel}</span>} delay={200}>
                  {activity.length ? (
                    <ul className="space-y-3">
                      {activity.map((c) => {
                        const proj = allProjects.find((p) => p.id === c.project_id)
                        return (
                          <li key={c.id} className="flex items-start gap-3">
                            <span className="w-1.5 h-1.5 rounded-full mt-2 flex-none" style={{ background: c.author_role === 'team' ? 'var(--strong)' : 'var(--bad-bar)' }} />
                            <div className="min-w-0">
                              <p className="line-clamp-1" style={{ fontSize: 13 }}>{c.comment_text}</p>
                              <p style={{ fontSize: 11.5, color: 'var(--faint)' }}>
                                {c.profiles.full_name}
                                {proj && <> · <Link to={`/workspace/projects/${proj.id}`} className="hover:underline">{proj.title}</Link></>}
                                {' '}· {new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </p>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  ) : <p className="ds-empty">No activity in this period.</p>}
                </ChartCard>
              )}
            </div>
          </div>
        )}
      </main>
    </ClientLayout>
  )
}
