import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import pinguWave from '@/assets/pingu-wave.png'
import { _galleryStore, _profilesStore, _projectsStore, MOCK_PLANS } from '../mockData'
import { formatDistanceToNow } from 'date-fns'
import { useDemoAuth } from '../DemoAuthContext'
import { useDemoNotifications } from '../useDemoNotifications'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/lib/theme'
import type { Project } from '@/types'

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconBell() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
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
function IconPlus() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
function IconChevronRight() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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

// ── Notification Bell ──────────────────────────────────────────────────────────
function DemoNotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const { notifications, unreadCount, markRead, markAllRead } = useDemoNotifications(userId)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        aria-label="Notifications"
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
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
              {notifications.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No notifications</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => markRead(n.id)}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors',
                      !n.read && 'bg-primary/5',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                      <div className={cn(!n.read ? '' : 'ml-4')}>
                        <p className="text-sm text-foreground">{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon,
  color,
  delay = '',
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
  delay?: string
}) {
  return (
    <div
      className={cn(
        'clay-card p-4 flex items-center gap-4 animate-slide-up hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200',
        delay,
      )}
    >
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-heading font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Project preview card (main panel) ─────────────────────────────────────────
function ProjectPreviewCard({ project }: { project: Project }) {
  const needsAction = project.status === 'client_reviewing'

  return (
    <div className="clay-card overflow-hidden animate-scale-in">
      {/* header */}
      <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-heading font-bold truncate">{project.title}</h2>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
          )}
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>

      {/* meta row */}
      <div className="px-6 py-3 flex items-center gap-6 text-xs text-muted-foreground border-b border-border/50 bg-muted/20">
        <span>Updated {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</span>
        {project.max_client_revisions !== -1 ? (
          <span>{project.max_client_revisions - project.client_revision_count} revision(s) left</span>
        ) : (
          <span>Unlimited revisions</span>
        )}
      </div>

      {/* status message + CTA */}
      <div className="px-6 py-5">
        {needsAction ? (
          <div className="bg-primary/8 border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary mb-4">
            Your video is ready to review. Open the project to approve or leave feedback.
          </div>
        ) : project.status === 'revision_requested' ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 mb-4">
            Revision requested — the team is working on your feedback.
          </div>
        ) : project.status === 'in_progress' ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 mb-4">
            Our team is actively editing your video. You'll be notified when it's ready.
          </div>
        ) : project.status === 'client_approved' ? (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 mb-4">
            Project complete! Your video has been approved and is available to download.
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-4">
            Waiting for a team member to be assigned. We'll notify you when work begins.
          </div>
        )}

        <Link
          to={`/workspace/projects/${project.id}`}
          className="btn-gradient inline-flex items-center gap-2 text-sm"
        >
          Open Project
          <IconChevronRight />
        </Link>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
type SidebarSection = 'active' | 'completed'

export default function DemoClientWorkspace() {
  const { profile, signOut } = useDemoAuth()
  const navigate = useNavigate()

  const clientProfile = _profilesStore.find((p) => p.id === profile?.id)
  const myProjects = _projectsStore.filter((p) => p.client_id === profile?.id)
  const active = myProjects.filter((p) => p.status !== 'client_approved')
  const completed = myProjects.filter((p) => p.status === 'client_approved')

  const clientPlan = clientProfile?.plan_id ? MOCK_PLANS.find((p) => p.id === clientProfile.plan_id) : null
  const now = new Date()
  const thisMonthProjects = myProjects.filter((p) => {
    const d = new Date(p.created_at)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const projectLimitReached = clientPlan && clientPlan.max_active_projects !== -1 && thisMonthProjects.length >= clientPlan.max_active_projects

  const [section, setSection] = useState<SidebarSection>('active')
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    active[0]?.id ?? completed[0]?.id ?? null,
  )

  const displayProjects = section === 'active' ? active : completed
  const selectedProject = myProjects.find((p) => p.id === activeProjectId)
  const timeSaved = clientProfile?.time_saved_hours ?? null

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
          {/* Profile */}
          <div className="px-4 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                {profile?.full_name.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{profile?.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
              </div>
            </div>
          </div>

          <div className="px-3 pb-2"><div className="h-px bg-border/60" /></div>

          {/* Nav */}
          <nav className="px-2 space-y-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mt-2">
              Projects
            </p>
            <button
              onClick={() => { setSection('active'); setActiveProjectId(active[0]?.id ?? null) }}
              className={cn('sidebar-item w-full', section === 'active' && 'active')}
            >
              <IconVideo />
              <span>Active</span>
              <span className="ml-auto text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">
                {active.length}
              </span>
            </button>
            <button
              onClick={() => { setSection('completed'); setActiveProjectId(completed[0]?.id ?? null) }}
              className={cn('sidebar-item w-full', section === 'completed' && 'active')}
            >
              <IconCheck />
              <span>Completed</span>
              {completed.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">{completed.length}</span>
              )}
            </button>
          </nav>

          <div className="px-3 py-3"><div className="h-px bg-border/60" /></div>

          {/* Gallery + Messages */}
          <nav className="px-2 space-y-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
              Files
            </p>
            <Link
              to="/workspace/gallery"
              className="sidebar-item w-full"
            >
              <IconFolder />
              <span>My Gallery</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {_galleryStore.filter((f) => f.owner_id === profile?.id).length}
              </span>
            </Link>
            <Link
              to="/workspace/messages"
              className="sidebar-item w-full"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span>Messages</span>
            </Link>
            <Link
              to="/workspace/calendar"
              className="sidebar-item w-full"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Calendar</span>
            </Link>
            <Link
              to="/workspace/analytics"
              className="sidebar-item w-full"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Analytics</span>
            </Link>
          </nav>

          <div className="px-3 py-3"><div className="h-px bg-border/60" /></div>

          {/* Project list */}
          <div className="px-2 flex-1 overflow-y-auto">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
              {section === 'active' ? 'Active' : 'Completed'}
            </p>
            {displayProjects.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-2">None yet</p>
            ) : (
              <div className="space-y-0.5">
                {displayProjects.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveProjectId(p.id)}
                    className={cn(
                      'sidebar-item w-full text-left animate-slide-up',
                      activeProjectId === p.id && 'active',
                      `stagger-${Math.min(i + 1, 7)}`,
                    )}
                  >
                    <span className="truncate flex-1 text-xs">{p.title}</span>
                    <IconChevronRight />
                  </button>
                ))}
              </div>
            )}
          </div>

        </aside>

        {/* ── Main panel ── */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {/* Welcome */}
          <div className="mb-6 animate-slide-up">
            <h1 className="text-2xl font-heading font-bold">
              Welcome back,{' '}
              <span className="text-shimmer">{profile?.full_name.split(' ')[0]}</span>!
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Here's an overview of your workspace.</p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <StatCard
              label="Active Projects"
              value={active.length}
              icon={<IconVideo />}
              color="bg-primary/10 text-primary"
              delay="stagger-1"
            />
            <StatCard
              label="Completed"
              value={completed.length}
              icon={<IconCheck />}
              color="bg-green-50 text-green-700"
              delay="stagger-2"
            />
            <StatCard
              label="Total Projects"
              value={myProjects.length}
              icon={<IconVideo />}
              color="bg-blue-50 text-blue-700"
              delay="stagger-3"
            />
            {timeSaved !== null ? (
              <StatCard
                label="Time Saved"
                value={`${timeSaved}h`}
                icon={<IconClock />}
                color="bg-amber-50 text-amber-700"
                delay="stagger-4"
              />
            ) : (
              <div className="clay-card p-4 flex items-center gap-4 animate-slide-up stagger-4 opacity-50">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">
                  <IconClock />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Time Saved</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Set by your account manager</p>
                </div>
              </div>
            )}
          </div>

          {/* New Project CTA */}
          <div className="mb-6 animate-slide-up stagger-5">
            {projectLimitReached ? (
              <div className="clay-card p-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold">Start a new project</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Monthly limit reached — {clientPlan!.max_active_projects}/{clientPlan!.max_active_projects} projects on the {clientPlan!.name} plan.
                  </p>
                </div>
                <div className="btn-gradient flex items-center gap-2 text-sm opacity-40 cursor-not-allowed pointer-events-none flex-shrink-0">
                  <IconPlus />
                  <span>New Project</span>
                </div>
              </div>
            ) : (
              <div className="clay-card p-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold">Start a new project</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Submit your footage and we'll take care of the rest.</p>
                </div>
                <Link
                  to="/workspace/new"
                  className="btn-gradient flex items-center gap-2 text-sm flex-shrink-0"
                >
                  <IconPlus />
                  <span>New Project</span>
                </Link>
              </div>
            )}
          </div>

          {/* Project preview */}
          {selectedProject ? (
            <ProjectPreviewCard project={selectedProject} />
          ) : (
            <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-xl animate-fade-in">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
                <IconVideo />
              </div>
              <p className="text-muted-foreground mb-4">
                {section === 'active' ? 'No active projects yet' : 'No completed projects yet'}
              </p>
              {section === 'active' && !projectLimitReached && (
                <Link to="/workspace/new" className="btn-gradient text-sm">
                  Create your first project →
                </Link>
              )}
            </div>
          )}
        </main>
      </div>

      {profile && <ChatPanel currentUserId={profile.id} />}
    </div>
  )
}
