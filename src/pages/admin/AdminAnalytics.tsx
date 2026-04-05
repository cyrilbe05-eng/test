import { AdminNav } from '@/components/admin/AdminNav'
import { useQuery } from '@tanstack/react-query'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar,
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
  const approved = (projects ?? []).filter((p) => p.status === 'client_approved')
  const avgTurnaround = approved.length
    ? Math.round(approved.reduce((acc, p) => {
        const diff = (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime()) / 1000 / 60 / 60 / 24
        return acc + diff
      }, 0) / approved.length)
    : 0

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
  const workloadData = Object.entries(workloadMap).map(([name, count]) => ({ name, count }))

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <h2 className="text-xl font-heading font-semibold tracking-tight">Analytics</h2>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Projects', value: projects?.length ?? 0 },
            { label: 'Avg Turnaround (days)', value: avgTurnaround },
            { label: 'Avg Client Revisions', value: avgRevisions },
            { label: 'Client Revision Rate', value: `${revisionRate}%` },
          ].map((kpi) => (
            <div key={kpi.label} className="clay-card p-5">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{kpi.label}</p>
              <p className="text-3xl font-heading font-semibold mt-2 text-primary">{kpi.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Projects by status */}
          <div className="clay-card p-6">
            <h3 className="font-semibold mb-4 text-sm">Projects by Status</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                  {statusData.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status as ProjectStatus] ?? '#888'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid hsl(220 13% 91%)', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  labelStyle={{ color: '#111' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly volume */}
          <div className="clay-card p-6">
            <h3 className="font-semibold mb-4 text-sm">Monthly Volume</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                <XAxis dataKey="month" stroke="hsl(220 9% 46%)" tick={{ fontSize: 11 }} />
                <YAxis stroke="hsl(220 9% 46%)" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid hsl(220 13% 91%)', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Line type="monotone" dataKey="count" stroke="hsl(234 76% 58%)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Team workload */}
          <div className="clay-card p-6 md:col-span-2">
            <h3 className="font-semibold mb-4 text-sm">Team Workload</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={workloadData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                <XAxis dataKey="name" stroke="hsl(220 9% 46%)" tick={{ fontSize: 11 }} />
                <YAxis stroke="hsl(220 9% 46%)" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid hsl(220 13% 91%)', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                <Bar dataKey="count" fill="hsl(234 76% 58%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>
    </div>
  )
}
