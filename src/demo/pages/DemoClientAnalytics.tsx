import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  format, subMonths, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, isWithinInterval, parseISO,
} from 'date-fns'
import pinguWave from '@/assets/pingu-wave.png'
import {
  _projectsStore, _profilesStore, MOCK_FILES, MOCK_COMMENTS,
  MOCK_NOTIFICATIONS, _deadlinesStore, _calendarEventsStore, MOCK_PLANS,
} from '../mockData'
import { useDemoAuth } from '../DemoAuthContext'
import { useDemoNotifications } from '../useDemoNotifications'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/lib/theme'
import type { ProjectStatus } from '@/types'

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconBell() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}
function IconLogout() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  )
}
function IconVideo() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
  )
}
function IconCheck() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}
function IconClock() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function IconFolder() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  )
}
function IconBar() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}
function IconChevronRight() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

// ── Notification Bell ──────────────────────────────────────────────────────────
function DemoNotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const { notifications, unreadCount, markRead, markAllRead } = useDemoNotifications(userId)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      >
        <IconBell />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold animate-badge-pop">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-heading font-semibold text-sm">Notifications</h3>
              {unreadCount > 0 && <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all read</button>}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
              {notifications.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No notifications</p>
              ) : notifications.map((n) => (
                <button key={n.id} onClick={() => markRead(n.id)} className={cn('w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors', !n.read && 'bg-primary/5')}>
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                    <div className={cn(!n.read ? '' : 'ml-4')}>
                      <p className="text-sm text-foreground">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(parseISO(n.created_at), 'd MMM, HH:mm')}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon, color, delay = '',
}: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; color: string; delay?: string
}) {
  return (
    <div className={cn('clay-card p-5 flex items-start gap-4 animate-slide-up', delay)}>
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-heading font-bold leading-none">{value}</p>
        {sub && <p className="text-xs text-primary font-medium mt-0.5">{sub}</p>}
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  )
}

// ── Mini bar chart ─────────────────────────────────────────────────────────────
function MiniBarChart({
  data,
  color = 'bg-primary',
}: {
  data: { label: string; value: number }[]
  color?: string
}) {
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

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<ProjectStatus, string> = {
  pending_assignment: 'Pending',
  in_progress: 'In Progress',
  in_review: 'In Review',
  admin_approved: 'Admin Approved',
  client_reviewing: 'Reviewing',
  client_approved: 'Approved',
  revision_requested: 'Revision',
}
const STATUS_COLORS: Record<ProjectStatus, string> = {
  pending_assignment: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  in_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  admin_approved: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  client_reviewing: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  client_approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  revision_requested: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

// ── Time frame types ──────────────────────────────────────────────────────────
type TimeFrame = 'week' | 'month' | 'custom'

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DemoClientAnalytics() {
  const { profile, signOut } = useDemoAuth()
  const navigate = useNavigate()

  // ── Time frame state ───────────────────────────────────────────────────────
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('month')
  const today = new Date()
  const [customFrom, setCustomFrom] = useState(format(subMonths(today, 3), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(format(today, 'yyyy-MM-dd'))

  const dateRange = useMemo((): { start: Date; end: Date } => {
    if (timeFrame === 'week') {
      return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) }
    }
    if (timeFrame === 'month') {
      return { start: startOfMonth(today), end: endOfMonth(today) }
    }
    return { start: parseISO(customFrom), end: parseISO(customTo) }
  }, [timeFrame, customFrom, customTo])

  function inRange(dateStr: string) {
    try {
      return isWithinInterval(parseISO(dateStr), dateRange)
    } catch {
      return false
    }
  }

  // ── Client data ───────────────────────────────────────────────────────────
  const myProfile = _profilesStore.find((p) => p.id === profile?.id)
  const myProjects = _projectsStore.filter((p) => p.client_id === profile?.id)
  const plan = MOCK_PLANS.find((pl) => pl.id === myProfile?.plan_id)

  // All-time counts
  const totalProjects = myProjects.length
  const completedProjects = myProjects.filter((p) => p.status === 'client_approved').length
  const activeProjects = myProjects.filter((p) => p.status !== 'client_approved').length
  const totalRevisions = myProjects.reduce((acc, p) => acc + p.client_revision_count, 0)
  const timeSaved = myProfile?.time_saved_hours ?? 0

  // In-range projects (created within date range)
  const rangeProjects = myProjects.filter((p) => inRange(p.created_at))

  // In-range files: deliverables uploaded for my projects
  const myProjectIds = new Set(myProjects.map((p) => p.id))
  const myDeliverables = MOCK_FILES.filter((f) => myProjectIds.has(f.project_id) && f.file_type === 'deliverable')
  const rangeDeliverables = myDeliverables.filter((f) => inRange(f.created_at))

  // In-range comments (revisions left by client)
  const myComments = MOCK_COMMENTS.filter((c) => c.author_id === profile?.id)
  const rangeComments = myComments.filter((c) => inRange(c.created_at))

  // In-range notifications for client
  const myNotifications = MOCK_NOTIFICATIONS.filter((n) => n.recipient_id === profile?.id)
  const _rangeNotifs = myNotifications.filter((n) => inRange(n.created_at))
  void _rangeNotifs

  // Calendar events assigned or owned by this client
  const myCalEvents = _calendarEventsStore.filter(
    (e) => e.type === 'manual' && (e.owner_id === profile?.id || e.assigned_client_ids?.includes(profile?.id ?? ''))
  )
  const rangeCalEvents = myCalEvents.filter((e) => inRange(e.created_at))

  // Projects by status (all-time)
  const byStatus = (Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => ({
    status: s,
    count: myProjects.filter((p) => p.status === s).length,
  })).filter((s) => s.count > 0)

  // Revision usage per project
  const revisionData = myProjects
    .filter((p) => p.max_client_revisions > 0)
    .map((p) => ({
      title: p.title,
      used: p.client_revision_count,
      max: p.max_client_revisions,
    }))

  // Activity over last 6 months for bar chart
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(today, 5 - i)
    return {
      label: format(d, 'MMM'),
      start: startOfMonth(d),
      end: endOfMonth(d),
    }
  })
  const activityChart = last6Months.map((m) => ({
    label: m.label,
    value: myProjects.filter((p) => isWithinInterval(parseISO(p.created_at), { start: m.start, end: m.end })).length,
  }))

  // Deliverables over last 6 months
  const deliverableChart = last6Months.map((m) => ({
    label: m.label,
    value: myDeliverables.filter((f) => isWithinInterval(parseISO(f.created_at), { start: m.start, end: m.end })).length,
  }))

  // ── Sidebar projects ──────────────────────────────────────────────────────
  const active = myProjects.filter((p) => p.status !== 'client_approved')
  const completed = myProjects.filter((p) => p.status === 'client_approved')

  const rangeLabel = timeFrame === 'week'
    ? 'This week'
    : timeFrame === 'month'
    ? 'This month'
    : `${format(parseISO(customFrom), 'd MMM')} – ${format(parseISO(customTo), 'd MMM yyyy')}`

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top bar ── */}
      <header className="h-[52px] border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30 flex items-center px-4 gap-4">
        <div className="flex items-center gap-2 mr-2">
          <img src={pinguWave} alt="Pingu Studio" className="w-8 h-8 object-contain rounded-lg flex-shrink-0" />
          <span className="font-heading font-semibold text-sm hidden sm:block">Pingu Studio</span>
        </div>
        <div className="flex-1" />
        {profile && <DemoNotificationBell userId={profile.id} />}
        <ThemeToggle />
        <button
          onClick={() => { signOut(); navigate('/login') }}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Sign out"
        >
          <IconLogout />
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 'calc(100vh - 52px)' }}>
        {/* ── Sidebar ── */}
        <aside className="w-60 border-r border-border bg-background flex flex-col flex-shrink-0 animate-slide-in-left">
          <div className="px-4 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                {myProfile?.full_name.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{myProfile?.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{myProfile?.email}</p>
              </div>
            </div>
          </div>
          <div className="px-3 pb-2"><div className="h-px bg-border/60" /></div>

          <nav className="px-2 space-y-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mt-2">Projects</p>
            <Link to="/workspace" className="sidebar-item w-full">
              <IconVideo />
              <span>Active</span>
              <span className="ml-auto text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">{active.length}</span>
            </Link>
            <Link to="/workspace" className="sidebar-item w-full">
              <IconCheck />
              <span>Completed</span>
              {completed.length > 0 && <span className="ml-auto text-xs text-muted-foreground">{completed.length}</span>}
            </Link>
          </nav>

          <div className="px-3 py-3"><div className="h-px bg-border/60" /></div>

          <nav className="px-2 space-y-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">Files</p>
            <Link to="/workspace/gallery" className="sidebar-item w-full">
              <IconFolder />
              <span>My Gallery</span>
            </Link>
            <Link to="/workspace/messages" className="sidebar-item w-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span>Messages</span>
            </Link>
            <Link to="/workspace/calendar" className="sidebar-item w-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Calendar</span>
            </Link>
            <Link to="/workspace/analytics" className="sidebar-item w-full active">
              <IconBar />
              <span>Analytics</span>
            </Link>
          </nav>

          <div className="px-3 py-3"><div className="h-px bg-border/60" /></div>

          <div className="px-2 flex-1 overflow-y-auto">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">My Projects</p>
            <div className="space-y-0.5">
              {myProjects.map((p, i) => (
                <Link
                  key={p.id}
                  to={`/workspace/projects/${p.id}`}
                  className={cn('sidebar-item w-full text-left animate-slide-up', `stagger-${Math.min(i + 1, 7)}`)}
                >
                  <span className="truncate flex-1 text-xs">{p.title}</span>
                  <IconChevronRight />
                </Link>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {/* Header */}
          <div className="mb-6 animate-slide-up">
            <h1 className="text-2xl font-heading font-bold">Analytics</h1>
            <p className="text-muted-foreground text-sm mt-1">Track your project activity and progress over time.</p>
          </div>

          {/* ── Time frame filter ── */}
          <div className="clay-card p-4 mb-6 animate-slide-up stagger-1 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-foreground flex-shrink-0">Time frame:</span>
            <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
              {(['week', 'month', 'custom'] as TimeFrame[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeFrame(tf)}
                  className={cn(
                    'px-3 py-1.5 rounded text-xs font-medium capitalize transition-all',
                    timeFrame === tf ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tf === 'week' ? 'This week' : tf === 'month' ? 'This month' : 'Custom'}
                </button>
              ))}
            </div>
            {timeFrame === 'custom' && (
              <div className="flex items-center gap-2 animate-scale-in">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="text-xs px-2 py-1.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">→</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="text-xs px-2 py-1.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}
            <span className="text-xs text-muted-foreground ml-auto hidden sm:block">{rangeLabel}</span>
          </div>

          {/* ── KPI cards (time-filtered) ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              label={`Projects started · ${rangeLabel}`}
              value={rangeProjects.length}
              icon={<IconVideo />}
              color="bg-primary/10 text-primary"
              delay="stagger-2"
            />
            <StatCard
              label={`Deliverables received · ${rangeLabel}`}
              value={rangeDeliverables.length}
              icon={<IconCheck />}
              color="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
              delay="stagger-3"
            />
            <StatCard
              label={`Revision comments · ${rangeLabel}`}
              value={rangeComments.length}
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>}
              color="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
              delay="stagger-4"
            />
            <StatCard
              label={`Calendar events · ${rangeLabel}`}
              value={rangeCalEvents.length}
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
              color="bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400"
              delay="stagger-5"
            />
          </div>

          {/* ── All-time summary ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              label="Total projects (all time)"
              value={totalProjects}
              sub={`${activeProjects} active · ${completedProjects} completed`}
              icon={<IconVideo />}
              color="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
              delay="stagger-1"
            />
            <StatCard
              label="Revisions requested (all time)"
              value={totalRevisions}
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
              color="bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400"
              delay="stagger-2"
            />
            <StatCard
              label="Time saved (all time)"
              value={`${timeSaved}h`}
              icon={<IconClock />}
              color="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
              delay="stagger-3"
            />
            <StatCard
              label="Deliverables received (all time)"
              value={myDeliverables.length}
              icon={<IconFolder />}
              color="bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400"
              delay="stagger-4"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* ── Projects over time chart ── */}
            <div className="clay-card p-5 animate-slide-up stagger-2">
              <h3 className="font-heading font-semibold text-sm mb-1">Projects started per month</h3>
              <p className="text-xs text-muted-foreground mb-4">Last 6 months</p>
              <MiniBarChart data={activityChart} color="bg-primary" />
            </div>

            {/* ── Deliverables chart ── */}
            <div className="clay-card p-5 animate-slide-up stagger-3">
              <h3 className="font-heading font-semibold text-sm mb-1">Deliverables received per month</h3>
              <p className="text-xs text-muted-foreground mb-4">Last 6 months</p>
              <MiniBarChart data={deliverableChart} color="bg-green-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* ── Projects by status ── */}
            <div className="clay-card p-5 animate-slide-up stagger-3">
              <h3 className="font-heading font-semibold text-sm mb-4">Projects by status</h3>
              {byStatus.length === 0 ? (
                <p className="text-sm text-muted-foreground">No projects yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {byStatus.map(({ status, count }) => (
                    <div key={status} className="flex items-center gap-3">
                      <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', STATUS_COLORS[status])}>
                        {STATUS_LABELS[status]}
                      </span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/60 rounded-full transition-all duration-700"
                          style={{ width: `${(count / totalProjects) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-foreground w-4 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Plan usage ── */}
            <div className="clay-card p-5 animate-slide-up stagger-4">
              <h3 className="font-heading font-semibold text-sm mb-4">Plan usage</h3>
              {plan ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-foreground">{plan.name} plan</span>
                    <span className="text-xs text-muted-foreground">{myProfile?.client_id_label ?? 'No ID'}</span>
                  </div>

                  {/* Active projects vs limit */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Active projects</span>
                      <span className="font-medium">
                        {activeProjects} / {plan.max_active_projects === -1 ? '∞' : plan.max_active_projects}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-700"
                        style={{
                          width: plan.max_active_projects === -1
                            ? '30%'
                            : `${Math.min((activeProjects / plan.max_active_projects) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Revisions */}
                  {plan.max_client_revisions !== -1 && myProjects.map((p) => (
                    p.max_client_revisions > 0 && (
                      <div key={p.id}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground truncate max-w-[160px]">{p.title} — revisions</span>
                          <span className={cn('font-medium', p.client_revision_count >= p.max_client_revisions ? 'text-red-600' : '')}>
                            {p.client_revision_count} / {p.max_client_revisions}
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all duration-700',
                              p.client_revision_count >= p.max_client_revisions ? 'bg-red-500' :
                              p.client_revision_count / p.max_client_revisions > 0.7 ? 'bg-amber-500' : 'bg-green-500'
                            )}
                            style={{ width: `${Math.min((p.client_revision_count / p.max_client_revisions) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )
                  ))}

                  {/* Storage */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Storage</span>
                      <span className="font-medium">
                        {plan.storage_limit_mb === -1 ? 'Unlimited' : `${plan.storage_limit_mb / 1024} GB`}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full w-[12%]" />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No plan assigned.</p>
              )}
            </div>
          </div>

          {/* ── Revision detail table ── */}
          {revisionData.length > 0 && (
            <div className="clay-card p-5 animate-slide-up stagger-5 mb-6">
              <h3 className="font-heading font-semibold text-sm mb-4">Revision usage per project</h3>
              <div className="space-y-3">
                {revisionData.map((r) => (
                  <div key={r.title}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-foreground font-medium truncate max-w-xs">{r.title}</span>
                      <span className={cn('font-semibold flex-shrink-0 ml-2', r.used >= r.max ? 'text-red-600' : r.used / r.max > 0.6 ? 'text-amber-600' : 'text-green-600')}>
                        {r.used} / {r.max} used
                      </span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-700',
                          r.used >= r.max ? 'bg-red-500' : r.used / r.max > 0.6 ? 'bg-amber-500' : 'bg-green-500'
                        )}
                        style={{ width: `${Math.min((r.used / r.max) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Recent activity (in range) ── */}
          <div className="clay-card p-5 animate-slide-up stagger-6">
            <h3 className="font-heading font-semibold text-sm mb-1">Recent activity</h3>
            <p className="text-xs text-muted-foreground mb-4">{rangeLabel}</p>
            {rangeProjects.length === 0 && rangeDeliverables.length === 0 && rangeComments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity in this period.</p>
            ) : (
              <div className="space-y-2">
                {rangeProjects.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <IconVideo />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground">Project started</p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{format(parseISO(p.created_at), 'd MMM')}</span>
                  </div>
                ))}
                {rangeDeliverables.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                    <div className="w-7 h-7 rounded-lg bg-green-100 dark:bg-green-900/20 flex items-center justify-center flex-shrink-0 text-green-700 dark:text-green-400">
                      <IconCheck />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.file_name}</p>
                      <p className="text-xs text-muted-foreground">Deliverable uploaded</p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{format(parseISO(f.created_at), 'd MMM')}</span>
                  </div>
                ))}
                {rangeComments.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0 text-amber-700 dark:text-amber-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.comment_text}</p>
                      <p className="text-xs text-muted-foreground">Revision comment</p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">{format(parseISO(c.created_at), 'd MMM')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </main>
      </div>
    </div>
  )
}
