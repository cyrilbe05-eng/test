import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts'
import { format, startOfDay, startOfMonth, startOfWeek, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval } from 'date-fns'
import { toast } from 'sonner'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { EditorsPanel } from '@/pages/admin/AdminEditorPerformance'
import { useEditorPerformanceRange } from '@/hooks/useCare'
import { useApiFetch } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { PERIOD_OPTIONS, bucketFor, inRange, isPeriodKey, periodRange, rangeQuery, type PeriodKey, type Range } from '@/lib/period'
import type { EditorPerformance } from '@/types/editors'
import type { Project, ProjectStatus } from '@/types'

// Analytics: one period bar on top; both tabs (Overview, Editors) follow it.
// Editor numbers come from the API (same definitions as Client Care);
// request counts come from the project list.

type Row = Project & { profiles?: { full_name: string } }
type Assignment = { team_member_id: string; assigned_at: string; profiles: { full_name: string } }

/** Download the status-history CSV with the auth header attached. */
async function exportStatusHistory() {
  try {
    const res = await fetch('/api/projects/status-history-export', { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error ?? 'Export failed')
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url; a.download = 'status-history.csv'; a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    toast.error((e as Error).message ?? 'Export failed')
  }
}

const STATUS: { key: ProjectStatus; label: string; hex: string }[] = [
  { key: 'pending_assignment', label: 'Pending', hex: '#f59e0b' },
  { key: 'in_progress', label: 'In progress', hex: '#3b82f6' },
  { key: 'revision_requested', label: 'Revision', hex: '#dc2626' },
  { key: 'in_review', label: 'In review', hex: '#7c3aed' },
  { key: 'admin_approved', label: 'Admin OK', hex: '#4f46e5' },
  { key: 'client_reviewing', label: 'With client', hex: '#0891b2' },
  { key: 'client_approved', label: 'Approved', hex: '#16a34a' },
]

/** Theme colours as real values for the SVG chart (re-read on theme switch). */
function useChartColors() {
  const { theme } = useTheme()
  const [c, setC] = useState({ bar: '#2F4E9E', grid: '#e5e5e3', axis: '#6B7079', card: '#fff', border: '#e5e5e3', text: '#16181C' })
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement)
    const v = (n: string) => `hsl(${cs.getPropertyValue(n).trim()})`
    setC({ bar: v('--primary'), grid: v('--border'), axis: v('--muted-foreground'), card: v('--card'), border: v('--border'), text: v('--foreground') })
  }, [theme])
  return c
}

// ── Period bar ───────────────────────────────────────────────────────────────

function PeriodBar({ value, from, to, onChange }: {
  value: PeriodKey; from: string; to: string
  onChange: (next: { period: PeriodKey; from?: string; to?: string }) => void
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Period" className="flex flex-wrap gap-1.5">
        {PERIOD_OPTIONS.map((o) => (
          <button key={o.key} role="radio" aria-checked={value === o.key} onClick={() => onChange({ period: o.key, from, to })}
            className={cn('min-h-[44px] px-3.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap',
              value === o.key ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted')}>
            {o.label}
          </button>
        ))}
      </div>
      {value === 'custom' && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" aria-label="From" value={from} max={to || today} onChange={(e) => onChange({ period: 'custom', from: e.target.value, to })}
            className="min-h-[44px] px-3 rounded-xl bg-card border border-border text-sm tabular-nums" />
          <span className="text-muted-foreground">–</span>
          <input type="date" aria-label="To" value={to} min={from} max={today} onChange={(e) => onChange({ period: 'custom', from, to: e.target.value })}
            className="min-h-[44px] px-3 rounded-xl bg-card border border-border text-sm tabular-nums" />
        </div>
      )}
    </div>
  )
}

// ── Overview ────────────────────────────────────────────────────────────────

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="clay-card px-4 py-3 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-heading font-semibold tabular-nums mt-0.5">{value}</p>
    </div>
  )
}

type SortKey = 'name' | 'delivered' | 'requests' | 'revisions'

function ClientTable({ rows }: { rows: { id: string; name: string; delivered: number; requests: number; revisions: number }[] }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'delivered', desc: true })
  const sorted = [...rows].sort((a, b) => {
    const d = sort.key === 'name' ? a.name.localeCompare(b.name) : a[sort.key] - b[sort.key]
    return (sort.desc ? -d : d) || a.name.localeCompare(b.name)
  })
  const head = (key: SortKey, label: string, right = true, cls = '') => (
    <th scope="col" aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : 'none'} className={cn('font-medium', right ? 'text-right' : 'text-left', cls)}>
      <button onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))}
        className={cn('min-h-[44px] px-2 inline-flex items-center gap-1 text-xs uppercase tracking-wide', sort.key === key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
        {label}<span aria-hidden className="w-2">{sort.key === key ? (sort.desc ? '↓' : '↑') : ''}</span>
      </button>
    </th>
  )
  if (!rows.length) return <p className="text-sm text-muted-foreground">—</p>
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border">{head('name', 'Client', false)}{head('delivered', 'Delivered')}{head('requests', 'Requests')}{head('revisions', 'Revisions', true, 'hidden sm:table-cell')}</tr></thead>
        <tbody className="divide-y divide-border/60">
          {sorted.map((r) => (
            <tr key={r.id}>
              <td className="px-2 py-2.5 font-medium break-words">{r.name}</td>
              <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{r.delivered}</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{r.requests}</td>
              <td className="hidden sm:table-cell px-2 py-2.5 text-right tabular-nums text-muted-foreground">{r.revisions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Overview({ range, projects, perf, assignments }: {
  range: Range; projects: Row[]; perf?: EditorPerformance; assignments: Assignment[]
}) {
  const colors = useChartColors()
  const tip = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: 10, fontSize: 12, color: colors.text }
  // The chart library colours tooltip text separately (black on the pie): use the theme's text colour.
  const tipText = { color: colors.text }
  const axis = { stroke: colors.axis, tick: { fontSize: 11 }, tickLine: false, axisLine: false } as const
  const requests = projects.filter((p) => inRange(p.created_at, range))
  const delivered = (perf?.client_split.clients ?? []).reduce((a, c) => a + c.videos, 0)
  const totals = (perf?.editors ?? []).map((e) => e.totals)
  const videos = totals.reduce((a, t) => a + t.videos, 0)
  const revPerVideo = videos ? totals.reduce((a, t) => a + (t.revisions_per_video ?? 0) * t.videos, 0) / videos : null
  const met = totals.reduce((a, t) => a + t.deadlines_met, 0)
  const missed = totals.reduce((a, t) => a + t.deadlines_missed, 0)

  // Requests over time, bucketed by the period's length.
  const earliest = projects.reduce((m, p) => Math.min(m, new Date(p.created_at).getTime()), Date.now())
  const bucket = bucketFor(range, new Date(earliest))
  const start = range.from ?? new Date(earliest)
  const keyOf = (d: Date) => (bucket === 'day' ? startOfDay(d) : bucket === 'week' ? startOfWeek(d, { weekStartsOn: 1 }) : startOfMonth(d)).getTime()
  const slots = (bucket === 'day' ? eachDayOfInterval : bucket === 'week' ? (i: { start: Date; end: Date }) => eachWeekOfInterval(i, { weekStartsOn: 1 }) : eachMonthOfInterval)({ start, end: range.to })
  const counts = new Map<number, number>()
  for (const p of requests) counts.set(keyOf(new Date(p.created_at)), (counts.get(keyOf(new Date(p.created_at))) ?? 0) + 1)
  const series = slots.map((d) => ({ label: format(d, bucket === 'month' ? 'MMM yy' : 'd MMM'), count: counts.get(keyOf(d)) ?? 0 }))

  const byStatus = STATUS.map((s) => ({ ...s, n: requests.filter((p) => p.status === s.key).length })).filter((s) => s.n > 0)

  // Deadlines due in the period, per editor (same numbers as the Editors tab).
  const first = (n: string) => n.split(' ')[0]
  const dlData = (perf?.editors ?? [])
    .map((e) => ({ name: first(e.name), met: e.totals.deadlines_met, missed: e.totals.deadlines_missed }))
    .filter((r) => r.met + r.missed > 0)
  // Projects picked up in the period, per editor.
  const load = new Map<string, number>()
  for (const a of assignments) {
    if (!inRange(a.assigned_at, range)) continue
    const n = first(a.profiles.full_name)
    load.set(n, (load.get(n) ?? 0) + 1)
  }
  const loadData = [...load.entries()].map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count)

  // Per client: delivered (API), requests + revisions on those requests (list).
  const rows = new Map<string, { id: string; name: string; delivered: number; requests: number; revisions: number }>()
  const row = (id: string, name: string) => rows.get(id) ?? rows.set(id, { id, name, delivered: 0, requests: 0, revisions: 0 }).get(id)!
  for (const c of perf?.client_split.clients ?? []) row(c.client_id, c.name).delivered = c.videos
  for (const p of requests) {
    const r = row(p.client_id, p.profiles?.full_name ?? '—')
    r.requests++
    r.revisions += p.client_revision_count ?? 0
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Requests" value={String(requests.length)} />
        <Kpi label="Delivered" value={perf ? String(delivered) : '…'} />
        <Kpi label="Revisions / video" value={revPerVideo == null ? '—' : revPerVideo.toFixed(1)} />
        <Kpi label="On time" value={met + missed ? `${Math.round((met / (met + missed)) * 100)}%` : '—'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start">
        <section className="clay-card p-4 md:p-5 min-w-0">
          <h3 className="font-heading font-semibold mb-3">Requests</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid vertical={false} stroke={colors.grid} />
              <XAxis dataKey="label" {...axis} minTickGap={16} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip contentStyle={tip} itemStyle={tipText} labelStyle={tipText} formatter={(v: number) => [v, 'Requests']} />
              <Line type="monotone" dataKey="count" stroke={colors.bar} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </section>

        <section className="clay-card p-4 md:p-5 min-w-0">
          <h3 className="font-heading font-semibold mb-3">Status of requests</h3>
          {byStatus.length ? (
            <div className="flex items-center gap-4">
              <div className="w-36 h-36 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byStatus} dataKey="n" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
                      {byStatus.map((x) => <Cell key={x.key} fill={x.hex} />)}
                    </Pie>
                    <Tooltip contentStyle={tip} itemStyle={tipText} labelStyle={tipText} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 min-w-0 space-y-1.5 text-sm">
                {byStatus.map((x) => (
                  <li key={x.key} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: x.hex }} aria-hidden />
                    <span className="flex-1 truncate">{x.label}</span>
                    <span className="tabular-nums font-medium">{x.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="text-sm text-muted-foreground">—</p>}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <section className="clay-card p-4 md:p-5 min-w-0">
          <h3 className="font-heading font-semibold mb-3">Deadlines by editor</h3>
          {dlData.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dlData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid vertical={false} stroke={colors.grid} />
                <XAxis dataKey="name" {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip contentStyle={tip} itemStyle={tipText} labelStyle={tipText} cursor={{ fill: colors.grid, opacity: 0.4 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                <Bar dataKey="met" name="Met" stackId="d" fill="#16a34a" maxBarSize={36} />
                <Bar dataKey="missed" name="Missed" stackId="d" fill="#dc2626" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground">—</p>}
        </section>
        <section className="clay-card p-4 md:p-5 min-w-0">
          <h3 className="font-heading font-semibold mb-3">Projects taken by editor</h3>
          {loadData.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={loadData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid vertical={false} stroke={colors.grid} />
                <XAxis dataKey="name" {...axis} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip contentStyle={tip} itemStyle={tipText} labelStyle={tipText} cursor={{ fill: colors.grid, opacity: 0.4 }} formatter={(v: number) => [v, 'Projects']} />
                <Bar dataKey="count" fill={colors.bar} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground">—</p>}
        </section>
      </div>

      <section className="clay-card p-4 md:p-5 min-w-0">
        <h3 className="font-heading font-semibold mb-1">Videos per client</h3>
        <ClientTable rows={[...rows.values()]} />
      </section>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const apiFetch = useApiFetch()
  const [params, setParams] = useSearchParams()
  const period: PeriodKey = isPeriodKey(params.get('period')) ? (params.get('period') as PeriodKey) : 'this_month'
  const tab = params.get('tab') === 'editors' ? 'editors' : 'overview'
  const from = params.get('from') ?? format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const to = params.get('to') ?? format(new Date(), 'yyyy-MM-dd')

  // `now` is fixed per visit so the range (and the API query) stays stable.
  const [now] = useState(() => new Date())
  const range = useMemo(() => periodRange(period, now, { from, to }), [period, now, from, to])
  const query = rangeQuery(range)

  const { data: projects = [] } = useQuery({ queryKey: ['analytics_projects'], queryFn: () => apiFetch<Row[]>('/api/projects') })
  const perf = useEditorPerformanceRange(query)
  const { data: assignments = [] } = useQuery({ queryKey: ['analytics_assignments'], queryFn: () => apiFetch<Assignment[]>('/api/project-assignments/all') })

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k) }
    setParams(next, { replace: true })
  }

  return (
    <AdminLayout>
      <main className="px-4 md:px-6 py-5 md:py-6 space-y-4 max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-heading font-semibold tracking-tight">Analytics</h1>
          <button onClick={exportStatusHistory} className="min-h-[44px] px-3.5 rounded-full border border-border text-sm font-medium hover:bg-muted whitespace-nowrap">Export CSV</button>
        </div>

        <PeriodBar value={period} from={from} to={to}
          onChange={(n) => set({ period: n.period, from: n.period === 'custom' ? n.from : undefined, to: n.period === 'custom' ? n.to : undefined })} />

        <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted max-w-xs">
          {(['overview', 'editors'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => set({ tab: t === 'overview' ? undefined : t })}
              className={cn('min-h-[40px] rounded-lg text-sm font-medium', tab === t ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {t === 'overview' ? 'Overview' : 'Editors'}
            </button>
          ))}
        </div>

        {tab === 'overview' ? (
          <Overview range={range} projects={projects} perf={perf.data} assignments={assignments} />
        ) : perf.isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : perf.error ? (
          <div className="clay-card p-6 text-sm">{(perf.error as Error).message}</div>
        ) : perf.data ? <EditorsPanel data={perf.data} /> : null}
      </main>
    </AdminLayout>
  )
}
