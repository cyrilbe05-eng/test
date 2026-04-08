import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearToken } from '@/lib/auth'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import pinguWave from '@/assets/pingu-wave.png'
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
import { toast } from 'sonner'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { ThemeToggle } from '@/lib/theme'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { Project, TimelineComment, Plan } from '@/types'

const clientLinks = [
  { to: '/workspace', label: 'Projects', exact: true },
  { to: '/workspace/gallery', label: 'Gallery' },
  { to: '/workspace/calendar', label: 'Calendar' },
  { to: '/workspace/messages', label: 'Messages' },
  { to: '/workspace/analytics', label: 'Analytics' },
]

type Timeframe = 'week' | 'month' | 'custom'

function MiniBarChart({ data, color = 'bg-primary' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex items-end gap-1.5 h-20">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-[9px] text-muted-foreground font-medium">{d.value > 0 ? d.value : ''}</span>
          <div
            className={cn('w-full rounded-t transition-all duration-500', color, d.value === 0 && 'opacity-20')}
            style={{ height: `${Math.max((d.value / max) * 56, d.value > 0 ? 6 : 2)}px` }}
          />
          <span className="text-[9px] text-muted-foreground truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export default function ClientAnalytics() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { pathname } = useLocation()
  const apiFetch = useApiFetch()

  const [timeframe, setTimeframe] = useState<Timeframe>('month')
  const [customFrom, setCustomFrom] = useState(format(subMonths(new Date(), 1), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'))

  const handleSignOut = () => { clearToken(); qc.clear(); toast.success('Signed out'); navigate('/login', { replace: true }) }

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
    value: allProjects.filter((p) => {
      const d = parseISO(p.created_at)
      return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth()
    }).length,
  }))

  const revisionsPerMonth = months.map((m) => ({
    label: format(m, 'MMM'),
    value: allComments.filter((c) => {
      if (c.author_role === 'team') return false
      const d = parseISO(c.created_at)
      return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth()
    }).length,
  }))

  // Status breakdown
  const statusCounts = allProjects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1
    return acc
  }, {})
  const statusMax = Math.max(...Object.values(statusCounts), 1)

  const STATUS_LABELS: Record<string, string> = {
    pending_assignment: 'Pending',
    in_progress: 'In Progress',
    in_review: 'In Review',
    admin_approved: 'Admin Approved',
    client_reviewing: 'Reviewing',
    client_approved: 'Completed',
    revision_requested: 'Revision',
  }
  const STATUS_COLORS: Record<string, string> = {
    pending_assignment: 'bg-yellow-400',
    in_progress: 'bg-blue-500',
    in_review: 'bg-purple-500',
    admin_approved: 'bg-indigo-500',
    client_reviewing: 'bg-orange-500',
    client_approved: 'bg-green-500',
    revision_requested: 'bg-red-500',
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between" style={{ height: '52px' }}>
          <div className="flex items-center gap-2.5">
            <img src={pinguWave} alt="Pingu Studio" className="w-8 h-8 object-contain rounded-lg" />
            <span className="font-heading font-semibold text-sm">Pingu Studio</span>
          </div>
          <div className="flex items-center gap-1">
            {profile && <NotificationBell userId={profile.id} />}
            <ThemeToggle />
            <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted">Sign out</button>
          </div>
        </div>
      </header>

      <nav className="border-b border-border bg-background">
        <div className="max-w-5xl mx-auto px-6 flex gap-1 h-10 items-center">
          {clientLinks.map(({ to, label, exact }) => {
            const isActive = exact ? pathname === to : pathname.startsWith(to)
            return <Link key={to} to={to} className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{label}</Link>
          })}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-heading font-semibold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Your project and content performance</p>
          </div>

          {/* Timeframe picker */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-muted rounded-xl p-0.5 gap-0.5">
              {(['week', 'month', 'custom'] as Timeframe[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize', timeframe === t ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground')}
                >
                  {t === 'week' ? 'This week' : t === 'month' ? 'This month' : 'Custom'}
                </button>
              ))}
            </div>
            {timeframe === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-muted rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
                <span className="text-xs text-muted-foreground">–</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-muted rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : (
          <>
            {/* Period KPIs */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-3">
                {timeframe === 'week' ? 'This week' : timeframe === 'month' ? 'This month' : `${customFrom} – ${customTo}`}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Projects Started', value: rangeProjects.length, color: 'text-primary' },
                  { label: 'Revision Comments', value: rangeComments.filter((c) => c.author_role !== 'team').length, color: rangeComments.filter((c) => c.author_role !== 'team').length > 0 ? 'text-red-500' : 'text-green-600' },
                  { label: 'Team Comments', value: rangeComments.filter((c) => c.author_role === 'team').length, color: 'text-foreground' },
                ].map((kpi, i) => (
                  <div key={kpi.label} className={`clay-card p-4 text-center animate-slide-up stagger-${i + 1}`}>
                    <p className={`text-3xl font-heading font-semibold ${kpi.color}`}>{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* All-time KPIs */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-3">All time</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Projects', value: allProjects.length, color: 'text-foreground' },
                  { label: 'Active', value: active.length, color: 'text-primary' },
                  { label: 'Completed', value: completed.length, color: 'text-green-600' },
                  { label: 'Revisions Used', value: totalRevisions, color: totalRevisions > 0 ? 'text-red-500' : 'text-green-600' },
                ].map((kpi, i) => (
                  <div key={kpi.label} className={`clay-card p-4 text-center animate-slide-up stagger-${i + 1}`}>
                    <p className={`text-3xl font-heading font-semibold ${kpi.color}`}>{kpi.value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="clay-card p-5">
                <h3 className="font-heading font-semibold text-sm mb-4">Projects started (last 6 months)</h3>
                <MiniBarChart data={projectsPerMonth} color="bg-primary" />
              </div>
              <div className="clay-card p-5">
                <h3 className="font-heading font-semibold text-sm mb-4">Revision comments (last 6 months)</h3>
                <MiniBarChart data={revisionsPerMonth} color="bg-red-400" />
              </div>
            </div>

            {/* Status breakdown */}
            {allProjects.length > 0 && (
              <div className="clay-card p-5">
                <h3 className="font-heading font-semibold text-sm mb-4">Projects by status</h3>
                <div className="space-y-2.5">
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <div key={status} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-32 flex-shrink-0">{STATUS_LABELS[status] ?? status}</span>
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className={cn('h-2 rounded-full transition-all duration-500', STATUS_COLORS[status] ?? 'bg-primary')}
                          style={{ width: `${(count / statusMax) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-foreground w-5 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Plan usage */}
            {plan && (
              <div className="clay-card p-5">
                <h3 className="font-heading font-semibold text-sm mb-4">Plan usage</h3>
                <div className="space-y-4">
                  {/* Active project limit */}
                  {plan.max_active_projects !== -1 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Active Projects</span>
                        <span className="text-xs font-semibold">{active.length} / {plan.max_active_projects}</span>
                      </div>
                      <div className="bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className={cn('h-2 rounded-full transition-all', active.length / plan.max_active_projects > 0.8 ? 'bg-red-500' : active.length / plan.max_active_projects > 0.5 ? 'bg-amber-500' : 'bg-green-500')}
                          style={{ width: `${Math.min((active.length / plan.max_active_projects) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Revision usage per project */}
                  {allProjects.filter((p) => p.max_client_revisions !== -1).length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Revision usage per project</p>
                      <div className="space-y-2">
                        {allProjects.filter((p) => p.max_client_revisions !== -1 && p.max_client_revisions > 0).map((p) => {
                          const pct = p.client_revision_count / p.max_client_revisions
                          return (
                            <div key={p.id}>
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]">{p.title}</span>
                                <span className="text-xs font-semibold ml-2 flex-shrink-0">{p.client_revision_count} / {p.max_client_revisions}</span>
                              </div>
                              <div className="bg-muted rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={cn('h-1.5 rounded-full transition-all', pct >= 1 ? 'bg-red-500' : pct > 0.6 ? 'bg-amber-500' : 'bg-green-500')}
                                  style={{ width: `${Math.min(pct * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recent activity */}
            {allComments.length > 0 && (
              <div className="clay-card p-5">
                <h3 className="font-heading font-semibold text-sm mb-4">Recent activity{timeframe !== 'custom' ? ` (${timeframe === 'week' ? 'this week' : 'this month'})` : ''}</h3>
                <div className="space-y-2">
                  {allComments
                    .filter((c) => inRange(c.created_at))
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice(0, 10)
                    .map((c) => {
                      const proj = allProjects.find((p) => p.id === c.project_id)
                      return (
                        <div key={c.id} className="flex items-start gap-3 py-1.5">
                          <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0', c.author_role === 'team' ? 'bg-primary' : 'bg-red-400')} />
                          <div className="min-w-0">
                            <p className="text-xs text-foreground line-clamp-1">{c.comment_text}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {c.profiles.full_name}
                              {proj && <> · <Link to={`/workspace/projects/${proj.id}`} className="hover:text-primary transition-colors">{proj.title}</Link></>}
                              · {new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  {allComments.filter((c) => inRange(c.created_at)).length === 0 && (
                    <p className="text-xs text-muted-foreground">No activity in this period.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
