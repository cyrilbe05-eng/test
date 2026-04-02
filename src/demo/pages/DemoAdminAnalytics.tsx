import DemoAdminLayout from './DemoAdminLayout'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend,
} from 'recharts'
import { MOCK_PROJECTS, MOCK_PROFILES, _deadlinesStore } from '../mockData'
import type { ProjectStatus } from '@/types'

const STATUS_COLORS: Record<ProjectStatus, string> = {
  pending_assignment: '#f59e0b',
  in_progress: '#3b82f6',
  in_review: '#a855f7',
  admin_approved: '#6366f1',
  client_reviewing: '#06b6d4',
  client_approved: '#22c55e',
  revision_requested: '#ef4444',
}

export default function DemoAdminAnalytics() {
  const statusData = Object.entries(
    MOCK_PROJECTS.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([status, value]) => ({ name: status.replace(/_/g, ' '), value, status }))

  const monthlyData = [
    { month: 'Oct', count: 1 },
    { month: 'Nov', count: 2 },
    { month: 'Dec', count: 1 },
    { month: 'Jan', count: 3 },
    { month: 'Feb', count: 4 },
    { month: 'Mar', count: 2 },
  ]

  const avgRevisions = (MOCK_PROJECTS.reduce((a, p) => a + p.client_revision_count, 0) / MOCK_PROJECTS.length).toFixed(1)
  const revisionRate = Math.round((MOCK_PROJECTS.filter((p) => p.client_revision_count > 0).length / MOCK_PROJECTS.length) * 100)

  // Deadline analytics per team member
  const teamMembers = MOCK_PROFILES.filter((p) => p.role === 'team')

  const deadlineByMember = teamMembers.map((member) => {
    const memberDeadlines = _deadlinesStore.filter((d) => d.team_member_id === member.id)
    const met = memberDeadlines.filter((d) => d.status === 'met').length
    const missed = memberDeadlines.filter((d) => d.status === 'missed').length
    const pending = memberDeadlines.filter((d) => d.status === 'pending').length
    const total = memberDeadlines.length
    const rate = total > 0 ? Math.round((met / total) * 100) : 0
    return {
      name: member.full_name.split(' ')[0], // first name for chart
      fullName: member.full_name,
      met,
      missed,
      pending,
      total,
      rate,
    }
  })

  const totalDeadlines = _deadlinesStore.length
  const totalMet = _deadlinesStore.filter((d) => d.status === 'met').length
  const totalMissed = _deadlinesStore.filter((d) => d.status === 'missed').length
  const totalPending = _deadlinesStore.filter((d) => d.status === 'pending').length
  const globalRate = totalDeadlines > 0 ? Math.round((totalMet / totalDeadlines) * 100) : 0

  const workloadData = teamMembers.map((m) => ({
    name: m.full_name.split(' ')[0],
    count: MOCK_PROJECTS.filter((p) =>
      _deadlinesStore.some((d) => d.project_id === p.id && d.team_member_id === m.id)
    ).length,
  }))

  return (
    <DemoAdminLayout>
      <main className="px-6 py-8 space-y-8">
        <h2 className="text-2xl font-heading font-semibold tracking-tight">Analytics</h2>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Projects', value: MOCK_PROJECTS.length },
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

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="clay-card p-6">
            <h3 className="font-heading font-semibold mb-4">Projects by Status</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                  {statusData.map((entry) => <Cell key={entry.status} fill={STATUS_COLORS[entry.status as ProjectStatus] ?? '#888'} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid hsl(0 0% 90%)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="clay-card p-6">
            <h3 className="font-heading font-semibold mb-4">Monthly Volume</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 92%)" />
                <XAxis dataKey="month" stroke="hsl(0 0% 55%)" tick={{ fontSize: 12 }} />
                <YAxis stroke="hsl(0 0% 55%)" tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid hsl(0 0% 90%)', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="count" stroke="hsl(234 76% 58%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Deadline performance per member */}
        <div className="clay-card p-6">
          <h3 className="font-heading font-semibold mb-1">Deadline Performance by Team Member</h3>
          <p className="text-xs text-muted-foreground mb-4">Met vs Missed per editor</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Chart */}
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={deadlineByMember}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 92%)" />
                <XAxis dataKey="name" stroke="hsl(0 0% 55%)" tick={{ fontSize: 12 }} />
                <YAxis stroke="hsl(0 0% 55%)" tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid hsl(0 0% 90%)', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="met" name="Met" fill="#22c55e" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="missed" name="Missed" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="pending" name="Pending" fill="#f97316" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>

            {/* Table */}
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
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-green-600 font-semibold">{m.met}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-red-600 font-semibold">{m.missed}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-orange-600 font-semibold">{m.pending}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={
                          m.rate >= 80 ? 'text-green-600 font-bold' :
                          m.rate >= 50 ? 'text-orange-600 font-bold' :
                          'text-red-600 font-bold'
                        }>{m.rate}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Team workload */}
        <div className="clay-card p-6">
          <h3 className="font-heading font-semibold mb-4">Team Workload (Active Projects)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={workloadData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 92%)" />
              <XAxis dataKey="name" stroke="hsl(0 0% 55%)" tick={{ fontSize: 12 }} />
              <YAxis stroke="hsl(0 0% 55%)" tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid hsl(0 0% 90%)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill="hsl(234 76% 58%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </main>
    </DemoAdminLayout>
  )
}
