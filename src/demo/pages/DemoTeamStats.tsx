import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import pinguPhone from '@/assets/pingu-phone.png'
import { formatDistanceToNow } from 'date-fns'
import { useDemoAuth } from '../DemoAuthContext'
import { useDemoNotifications } from '../useDemoNotifications'
import {
  _profilesStore,
  MOCK_PROJECTS, MOCK_ASSIGNMENTS, MOCK_COMMENTS, _deadlinesStore,
} from '../mockData'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/lib/theme'

function IconBell() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
}
function IconLogout() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
}
function IconChevronLeft() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
}
function IconChevronRight() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
}

const NAV_LINKS = [
  { to: '/team',          label: 'Dashboard', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
  { to: '/team/stats',    label: 'My Stats',  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
  { to: '/team/gallery',  label: 'Gallery',   icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg> },
  { to: '/team/calendar', label: 'Calendar',  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
  { to: '/team/messages', label: 'Messages',  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg> },
]

function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const { notifications, unreadCount, markRead, markAllRead } = useDemoNotifications(userId)
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
        <IconBell />
        {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>}
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
              {notifications.length === 0
                ? <p className="text-center text-muted-foreground text-sm py-8">No notifications</p>
                : notifications.map((n) => (
                  <button key={n.id} onClick={() => markRead(n.id)} className={cn('w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors', !n.read && 'bg-primary/5')}>
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                      <div className={cn(!n.read ? '' : 'ml-4')}>
                        <p className="text-sm">{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
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

const STATUS_LABEL: Record<string, string> = {
  pending_assignment: 'Pending',
  in_progress: 'In Progress',
  in_review: 'In Review',
  admin_approved: 'Admin OK',
  client_reviewing: 'Client Review',
  revision_requested: 'Revision',
  client_approved: 'Approved',
}
const STATUS_COLOR: Record<string, string> = {
  pending_assignment: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-violet-100 text-violet-700',
  admin_approved: 'bg-cyan-100 text-cyan-700',
  client_reviewing: 'bg-orange-100 text-orange-700',
  revision_requested: 'bg-red-100 text-red-700',
  client_approved: 'bg-green-100 text-green-700',
}

export default function DemoTeamStats() {
  const { profile, signOut } = useDemoAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  if (!profile) return null

  const memberId = profile.id
  const myAssignments = MOCK_ASSIGNMENTS.filter((a) => a.team_member_id === memberId)
  const myProjectIds = myAssignments.map((a) => a.project_id)
  const myProjects = MOCK_PROJECTS.filter((p) => myProjectIds.includes(p.id))

  const myDeadlines = _deadlinesStore.filter((d) => d.team_member_id === memberId)
  const deadlineMet = myDeadlines.filter((d) => d.status === 'met').length
  const deadlineMissed = myDeadlines.filter((d) => d.status === 'missed').length
  const deadlinePending = myDeadlines.filter((d) => d.status === 'pending').length
  const totalResolved = deadlineMet + deadlineMissed
  const metRate = totalResolved > 0 ? Math.round((deadlineMet / totalResolved) * 100) : null

  // Revisions: total client_revision_count across my projects + per-project breakdown
  const totalRevisions = myProjects.reduce((acc, p) => acc + p.client_revision_count, 0)
  const projectsWithRevisions = myProjects.filter((p) => p.client_revision_count > 0)
  const currentlyInRevision = myProjects.filter((p) => p.status === 'revision_requested').length
  // Revision comments left by clients/admin on my projects (timeline feedback)
  const myProjectIds2 = new Set(myProjectIds)
  const revisionComments = MOCK_COMMENTS.filter(
    (c) => myProjectIds2.has(c.project_id) && c.author_role !== 'team'
  )

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top bar ── */}
      <header className="h-[52px] border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30 flex items-center px-4 gap-3 flex-shrink-0">
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <IconChevronLeft /> : <IconChevronRight />}
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          <img src={pinguPhone} alt="Pingu Studio" className="w-8 h-8 object-contain rounded-lg" />
          <span className="font-heading font-semibold text-sm hidden sm:block">Pingu Studio</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <NotificationBell userId={profile.id} />
          <ThemeToggle />
          <span className="text-sm text-muted-foreground hidden md:block">{profile.full_name}</span>
          <button onClick={() => { signOut(); navigate('/login') }} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Sign out">
            <IconLogout />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 'calc(100vh - 52px)' }}>
        {/* ── Sidebar ── */}
        <aside className={cn(
          'border-r border-border bg-background flex flex-col flex-shrink-0 transition-all duration-200 overflow-hidden',
          sidebarOpen ? 'w-56' : 'w-0',
        )}>
          <div className="px-4 pt-5 pb-3 whitespace-nowrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                {profile.full_name.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{profile.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
              </div>
            </div>
          </div>
          <div className="px-3 pb-2"><div className="h-px bg-border/60" /></div>
          <nav className="px-2 space-y-0.5 flex-1 overflow-y-auto">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mt-1 whitespace-nowrap">Team</p>
            {NAV_LINKS.map(({ to, label, icon }) => {
              const isActive = location.pathname === to
              return (
                <Link key={to} to={to} className={cn('sidebar-item w-full whitespace-nowrap', isActive && 'active')}>
                  {icon}
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mb-6 animate-slide-up">
            <h1 className="text-2xl font-heading font-bold">My Stats</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Your personal performance overview.</p>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 animate-slide-up stagger-1">
            <div className="clay-card p-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Projects</p>
              <p className="text-3xl font-bold mt-1">{myProjects.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">assigned to me</p>
            </div>
            <div className="clay-card p-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Deadlines Met</p>
              <p className="text-3xl font-bold mt-1 text-green-600">{deadlineMet}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{deadlineMissed} missed · {deadlinePending} pending</p>
            </div>
            <div className="clay-card p-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">On-time Rate</p>
              <p className={cn('text-3xl font-bold mt-1',
                metRate === null ? 'text-muted-foreground'
                  : metRate >= 80 ? 'text-green-600'
                  : metRate >= 50 ? 'text-amber-600'
                  : 'text-red-600',
              )}>
                {metRate !== null ? `${metRate}%` : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalResolved > 0 ? `from ${totalResolved} resolved` : 'no resolved deadlines'}
              </p>
            </div>
            <div className="clay-card p-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Revisions Received</p>
              <p className={cn('text-3xl font-bold mt-1', totalRevisions > 0 ? 'text-red-600' : 'text-green-600')}>
                {totalRevisions}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentlyInRevision > 0 ? `${currentlyInRevision} project${currentlyInRevision > 1 ? 's' : ''} pending revision` : revisionComments.length > 0 ? `${revisionComments.length} feedback comment${revisionComments.length > 1 ? 's' : ''}` : 'no active revisions'}
              </p>
            </div>
          </div>

          {/* Deadline breakdown */}
          {myDeadlines.length > 0 && (
            <div className="clay-card p-4 mb-6 animate-slide-up stagger-2">
              <p className="text-sm font-semibold mb-3">Deadline breakdown</p>
              <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                {deadlineMet > 0 && <div className="bg-green-500 h-full rounded-full" style={{ flex: deadlineMet }} title={`${deadlineMet} met`} />}
                {deadlineMissed > 0 && <div className="bg-red-500 h-full rounded-full" style={{ flex: deadlineMissed }} title={`${deadlineMissed} missed`} />}
                {deadlinePending > 0 && <div className="bg-orange-400 h-full rounded-full" style={{ flex: deadlinePending }} title={`${deadlinePending} pending`} />}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{deadlineMet} met</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{deadlineMissed} missed</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />{deadlinePending} pending</span>
              </div>
            </div>
          )}

          {/* Revision breakdown */}
          {projectsWithRevisions.length > 0 && (
            <div className="clay-card p-4 mb-6 animate-slide-up stagger-3">
              <p className="text-sm font-semibold mb-3">Revision history per project</p>
              <div className="space-y-3">
                {projectsWithRevisions.map((p) => {
                  const comments = revisionComments.filter((c) => c.project_id === p.id)
                  return (
                    <div key={p.id} className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-xs font-medium truncate">{p.title}</p>
                          <span className={cn(
                            'text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
                            p.status === 'revision_requested' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-muted text-muted-foreground',
                          )}>
                            {p.client_revision_count} revision{p.client_revision_count !== 1 ? 's' : ''}
                            {p.status === 'revision_requested' && ' · pending'}
                          </span>
                        </div>
                        {/* Comment snippets */}
                        {comments.length > 0 && (
                          <div className="space-y-1 pl-2 border-l-2 border-red-200 dark:border-red-900/50">
                            {comments.map((c) => (
                              <p key={c.id} className="text-[11px] text-muted-foreground leading-relaxed line-clamp-1">
                                <span className="font-medium text-foreground">{c.profiles.full_name}:</span> {c.comment_text}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {revisionComments.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                  {revisionComments.length} total feedback comment{revisionComments.length !== 1 ? 's' : ''} across all projects
                </p>
              )}
            </div>
          )}

          {/* Assigned projects */}
          <div className="clay-card p-4 animate-slide-up stagger-4">
            <p className="text-sm font-semibold mb-3">My Projects</p>
            {myProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {myProjects.map((p) => {
                  const client = _profilesStore.find((pr) => pr.id === p.client_id)
                  const deadline = _deadlinesStore.find((d) => d.project_id === p.id && d.team_member_id === memberId)
                  return (
                    <Link
                      key={p.id}
                      to={`/team/projects/${p.id}`}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors group border border-transparent hover:border-border"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{p.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{client?.full_name ?? '—'}</p>
                      </div>
                      {p.client_revision_count > 0 && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          {p.client_revision_count}× revision
                        </span>
                      )}
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0', STATUS_COLOR[p.status] ?? 'bg-muted text-muted-foreground')}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                      {deadline && (
                        <span className={cn(
                          'text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
                          deadline.status === 'met' ? 'bg-green-100 text-green-700'
                            : deadline.status === 'missed' ? 'bg-red-100 text-red-700'
                            : 'bg-orange-100 text-orange-700',
                        )}>
                          {deadline.status === 'met' ? '✓ deadline' : deadline.status === 'missed' ? '✗ deadline' : '⏰ deadline'}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      <ChatPanel currentUserId={profile.id} />
    </div>
  )
}
