import { AdminLayout } from '@/components/admin/AdminLayout'
import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend,
} from 'recharts'
import { useApiFetch } from '@/lib/api'
import { format, startOfMonth, eachMonthOfInterval, subMonths } from 'date-fns'
import type { Project, ProjectAssignment, Profile, ProjectStatus } from '@/types'

const STATUS_COLORS: Record<ProjectStatus, string> = {
  pending_assignment: '#f59e0b',
  in_progress: '#3b82f6',
  in_review: '#7c3aed',
  admin_approved: '#4f46e5',
  client_reviewing: '#0891b2',
  client_approved: '#16a34a',
  revision_requested: '#dc2626',
}


export default function AdminAnalytics() {
  const apiFetch = useApiFetch()
  const { data: projects } = useQuery<Project[]>({
    queryKey: ['analytics_projects'],
    queryFn: () => apiFetch<Project[]>('/api/projects'),
  })

  const { data: assignments } = useQuery<(ProjectAssignment & { profiles: Pick<Profile, 'full_name'> })[]>({
    queryKey: ['analytics_assignments'],
    queryFn: () => apiFetch<(ProjectAssignment & { profiles: Pick<Profile, 'full_name'> })[]>('/api/project-assignments/all'),
  })

  const { data: teamMembers } = useQuery<Profile[]>({
    queryKey: ['analytics_team'],
    queryFn: () => apiFetch<Profile[]>('/api/users/team'),
  })

  // We fetch all deadlines via the calendar events endpoint (reuse) — or directly per project.
  // The API has /api/deadlines/project/:id — to get all deadlines we use the calendar events.
  // Instead we aggregate from assignments by querying each project's deadlines if available.
  // For a simpler approach: query the analytics data from a dedicated endpoint if it exists,
  // otherwise we derive what we can from projects + assignments.
  // The calendar events endpoint returns deadlines as typed events — let's use that.
  const { data: calendarEvents } = useQuery<{ id: string; type: string; title: string; date: string; color: string; deadline_id?: string; team_member_id?: string }[]>({
    queryKey: ['analytics_calendar_events'],
    queryFn: () => apiFetch('/api/calendar/events'),
  })

  const deadlines = (calendarEvents ?? []).filter((e) => e.type === 'deadline') as unknown as {
    id: string; deadline_id: string; team_member_id: string; title: string; color: string
  }[]

  // Donut: projects by status
  const statusData = Object.entries(
    (projects ?? []).reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).map(([status, count]) => ({ name: status.replace(/_/g, ' '), value: count, status }))

  // Line: monthly volume
  const months = eachMonthOfInterval({ start: subMonths(new Date(), 5), end: new Date() })
  const monthlyData = months.map((m) => ({
    month: format(m, 'MMM'),
    count: (projects ?? []).filter((p) => startOfMonth(new Date(p.created_at)).getTime() === startOfMonth(m).getTime()).length,
  }))

  // KPIs
  const avgRevisions = projects?.length
    ? ((projects ?? []).reduce((a, p) => a + p.client_revision_count, 0) / projects.length).toFixed(1)
    : '0'

  const revisionRate = projects?.length
    ? Math.round(((projects ?? []).filter((p) => p.client_revision_count > 0).length / projects.length) * 100)
    : 0

  // Bar: team workload
  const workloadMap = (assignments ?? []).reduce((acc, a) => {
    const name = a.profiles.full_name
    acc[name] = (acc[name] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const workloadData = Object.entries(workloadMap).map(([name, count]) => ({ name: name.split(' ')[0], count }))

  // Deadline stats
  const totalMet = deadlines.filter((d) => d.color === 'bg-green-500').length
  const totalMissed = deadlines.filter((d) => d.color === 'bg-red-500').length
  const totalPending = deadlines.filter((d) => d.color === 'bg-orange-500').length
  const totalDeadlines = deadlines.length
  const globalRate = totalDeadlines > 0 ? Math.round((totalMet / totalDeadlines) * 100) : 0

  // Deadline by team member
  const deadlineByMember = (teamMembers ?? []).map((member) => {
    const memberDeadlines = deadlines.filter((d) => d.team_member_id === member.id)
    const met = memberDeadlines.filter((d) => d.color === 'bg-green-500').length
    const missed = memberDeadlines.filter((d) => d.color === 'bg-red-500').length
    const pending = memberDeadlines.filter((d) => d.color === 'bg-orange-500').length
    const total = memberDeadlines.length
    const rate = total > 0 ? Math.round((met / total) * 100) : 0
    return { name: member.full_name.split(' ')[0], fullName: member.full_name, met, missed, pending, total, rate }
  }).filter((m) => m.total > 0)

  const tooltipStyle = { background: '#fff', border: '1px solid hsl(220 13% 91%)', borderRadius: 8, fontSize: 12 }

  return (
    <AdminLayout>
      <main className="px-6 py-8 space-y-8">
        <h2 className="text-2xl font-heading font-semibold tracking-tight">Analytics</h2>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Projects', value: projects?.length ?? 0 },
            { label: 'Avg Client Revisions', value: avgRevisions },
            { label: 'Client Revision Rate', value: `${revisionRate}%` },
            { label: 'Deadline Met Rate', value: `${globalRate}%` },
          ].map((kpi) => (
            <div key={kpi.label} className="clay-card p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{kpi.label}</p>
              <p className="text-3xl font-heading font-bold mt-2 text-primary">{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Deadline summary KPIs */}
        {totalDeadlines > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="clay-card p-5 border-l-4 border-l-green-500">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Deadlines Met</p>
              <p className="text-3xl font-heading font-bold mt-2 text-green-600">{totalMet}</p>
              <p className="text-xs text-muted-foreground mt-1">of {totalDeadlines} total</p>
            </div>
            <div className="clay-card p-5 border-l-4 border-l-red-500">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Deadlines Missed</p>
              <p className="text-3xl font-heading font-bold mt-2 text-red-600">{totalMissed}</p>
              <p className="text-xs text-muted-foreground mt-1">of {totalDeadlines} total</p>
            </div>
            <div className="clay-card p-5 border-l-4 border-l-orange-500">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Deadlines Pending</p>
              <p className="text-3xl font-heading font-bold mt-2 text-orange-600">{totalPending}</p>
              <p className="text-xs text-muted-foreground mt-1">currently open</p>
            </div>
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Projects by status */}
          <div className="clay-card p-6">
            <h3 className="font-heading font-semibold mb-4">Projects by Status</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                  {statusData.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status as ProjectStatus] ?? '#888'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly volume */}
          <div className="clay-card p-6">
            <h3 className="font-heading font-semibold mb-4">Monthly Volume</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 92%)" />
                <XAxis dataKey="month" stroke="hsl(0 0% 55%)" tick={{ fontSize: 12 }} />
                <YAxis stroke="hsl(0 0% 55%)" tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="count" stroke="hsl(234 76% 58%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Deadline performance per member */}
        {deadlineByMember.length > 0 && (
          <div className="clay-card p-6">
            <h3 className="font-heading font-semibold mb-1">Deadline Performance by Team Member</h3>
            <p className="text-xs text-muted-foreground mb-4">Met vs Missed per editor</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={deadlineByMember}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 92%)" />
                  <XAxis dataKey="name" stroke="hsl(0 0% 55%)" tick={{ fontSize: 12 }} />
                  <YAxis stroke="hsl(0 0% 55%)" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="met" name="Met" fill="#22c55e" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="missed" name="Missed" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="pending" name="Pending" fill="#f97316" radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>

              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left px-3 py-2 text-xs text-muted-foreground font-semibold uppercase tracking-wide">Member</th>
                      <th className="text-center px-3 py-2 text-xs text-green-600 font-semibold uppercase tracking-wide">Met</th>
                      <th className="text-center px-3 py-2 text-xs text-red-600 font-semibold uppercase tracking-wide">Missed</th>
                      <th className="text-center px-3 py-2 text-xs text-orange-600 font-semibold uppercase tracking-wide">Pending</th>
                      <th className="text-center px-3 py-2 text-xs text-muted-foreground font-semibold uppercase tracking-wide">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {deadlineByMember.map((m) => (
                      <tr key={m.fullName} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2.5 font-medium text-sm">{m.fullName}</td>
                        <td className="px-3 py-2.5 text-center"><span className="text-green-600 font-semibold">{m.met}</span></td>
                        <td className="px-3 py-2.5 text-center"><span className="text-red-600 font-semibold">{m.missed}</span></td>
                        <td className="px-3 py-2.5 text-center"><span className="text-orange-600 font-semibold">{m.pending}</span></td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={m.rate >= 80 ? 'text-green-600 font-bold' : m.rate >= 50 ? 'text-orange-600 font-bold' : 'text-red-600 font-bold'}>
                            {m.rate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Team workload */}
        <div className="clay-card p-6">
          <h3 className="font-heading font-semibold mb-4">Team Workload (Active Projects)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={workloadData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 92%)" />
              <XAxis dataKey="name" stroke="hsl(0 0% 55%)" tick={{ fontSize: 12 }} />
              <YAxis stroke="hsl(0 0% 55%)" tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="hsl(234 76% 58%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </main>
    </AdminLayout>
  )
}
