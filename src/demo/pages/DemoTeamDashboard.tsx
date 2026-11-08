import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import pinguPhone from '@/assets/pingu-phone.png'
import { formatDistanceToNow } from 'date-fns'
import { useDemoAuth } from '../DemoAuthContext'
import { useDemoNotifications } from '../useDemoNotifications'
import { MOCK_PROJECTS, MOCK_ASSIGNMENTS, MOCK_PROFILES, _galleryStore, _galleryFoldersStore, formatProjectTitle } from '../mockData'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/lib/theme'
import type { Project, ProjectStatus } from '@/types'

// ── Kanban columns config ──────────────────────────────────────────────────────
const COLUMNS: { status: ProjectStatus; label: string; color: string }[] = [
  { status: 'pending_assignment',  label: 'Pending',       color: 'text-amber-700 bg-amber-50 border-amber-200' },
  { status: 'in_progress',         label: 'In Progress',   color: 'text-blue-700 bg-blue-50 border-blue-200' },
  { status: 'in_review',           label: 'In Review',     color: 'text-violet-700 bg-violet-50 border-violet-200' },
  { status: 'admin_approved',      label: 'Admin OK',      color: 'text-cyan-700 bg-cyan-50 border-cyan-200' },
  { status: 'client_reviewing',    label: 'Client Review', color: 'text-orange-700 bg-orange-50 border-orange-200' },
  { status: 'revision_requested',  label: 'Revision',      color: 'text-red-700 bg-red-50 border-red-200' },
  { status: 'client_approved',     label: 'Approved',      color: 'text-green-700 bg-green-50 border-green-200' },
]

type View = 'kanban' | 'list'

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
function IconChevronLeft() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}
function IconChevronRight() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

// ── Nav links ──────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  {
    to: '/team',
    label: 'Dashboard',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    to: '/team/stats',
    label: 'My Stats',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
  },
  {
    to: '/team/gallery',
    label: 'Gallery',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>,
  },
  {
    to: '/team/calendar',
    label: 'Calendar',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
  },
  {
    to: '/team/messages',
    label: 'Messages',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>,
  },
]

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
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all read</button>
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
                    className={cn('w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors', !n.read && 'bg-primary/5')}
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

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DemoTeamDashboard() {
  const { profile, signOut } = useDemoAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [openFolder, setOpenFolder] = useState<string | null>(null)
  const [view, setView] = useState<View>('kanban')
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS)

  const myAssignments = MOCK_ASSIGNMENTS.filter((a) => a.team_member_id === profile?.id)
  const myProjectIds = myAssignments.map((a) => a.project_id)
  const getClientName = (id: string) => MOCK_PROFILES.find((p) => p.id === id)?.full_name ?? '—'

  const handleDrop = (projectId: string, _from: ProjectStatus, to: ProjectStatus) => {
    setProjects((prev) =>
      prev.map((p) => p.id === projectId ? { ...p, status: to, updated_at: new Date().toISOString() } : p),
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top bar ── */}
      <header className="h-[52px] border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30 flex items-center px-4 gap-3 flex-shrink-0">
        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <IconChevronLeft /> : <IconChevronRight />}
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <img src={pinguPhone} alt="Pingu Studio" className="w-8 h-8 object-contain rounded-lg" />
          <span className="font-heading font-semibold text-sm hidden sm:block">Pingu Studio</span>
        </div>

        <div className="flex-1" />

        {/* Right */}
        <div className="flex items-center gap-2">
          {profile && <DemoNotificationBell userId={profile.id} />}
          <ThemeToggle />
          <span className="text-sm text-muted-foreground hidden md:block">{profile?.full_name}</span>
          <button
            onClick={() => { signOut(); navigate('/login') }}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Sign out"
          >
            <IconLogout />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 'calc(100vh - 52px)' }}>
        {/* ── Sidebar ── */}
        <aside
          className={cn(
            'border-r border-border bg-background flex flex-col flex-shrink-0 transition-all duration-200 overflow-hidden animate-slide-in-left',
            sidebarOpen ? 'w-56' : 'w-0',
          )}
        >
          {/* Profile */}
          <div className="px-4 pt-5 pb-3 whitespace-nowrap">
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
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mt-1 whitespace-nowrap">
              Team
            </p>
            {NAV_LINKS.map(({ to, label, icon }) => {
              const isActive = location.pathname === to
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn('sidebar-item w-full whitespace-nowrap', isActive && 'active')}
                >
                  {icon}
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="px-3 py-3"><div className="h-px bg-border/60" /></div>

          {/* Client folders — quick access to gallery files per client */}
          <div className="px-2 flex-1 overflow-y-auto pb-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 whitespace-nowrap">
              Client Folders
            </p>
            {MOCK_PROFILES.filter((p) => p.role === 'client').map((client) => {
              const clientFolders = _galleryFoldersStore.filter((f) => f.owner_id === client.id)
              const clientFiles = _galleryStore.filter((f) => f.owner_id === client.id && f.folder_id === null)
              const isOpen = openFolder === client.id
              const totalItems = clientFolders.length + clientFiles.length
              return (
                <div key={client.id}>
                  <button
                    onClick={() => setOpenFolder(isOpen ? null : client.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-left whitespace-nowrap',
                      isOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <span className="text-sm flex-shrink-0">{isOpen ? '📂' : '📁'}</span>
                    <span className="flex-1 truncate text-xs font-medium">{client.full_name}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{totalItems}</span>
                  </button>
                  {isOpen && (
                    <div className="ml-3 pl-3 border-l border-border/60 py-1 space-y-0.5">
                      {/* Subfolders */}
                      {clientFolders.map((folder) => {
                        const folderFiles = _galleryStore.filter((f) => f.folder_id === folder.id)
                        return (
                          <div key={folder.id} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/50">
                            <span className="text-xs flex-shrink-0">📁</span>
                            <span className="text-[11px] truncate flex-1 text-foreground/70">{folder.name}</span>
                            <span className="text-[10px] text-muted-foreground">{folderFiles.length}</span>
                          </div>
                        )
                      })}
                      {/* Root-level files */}
                      {clientFiles.map((f) => (
                        <div key={f.id} className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/50">
                          <span className="text-xs flex-shrink-0">
                            {f.mime_type.startsWith('video') ? '🎬' : f.mime_type.startsWith('image') ? '🖼️' : '📎'}
                          </span>
                          <span className="text-[11px] truncate flex-1 text-foreground/70">{f.file_name}</span>
                        </div>
                      ))}
                      {totalItems === 0 && (
                        <p className="text-[11px] text-muted-foreground px-2 py-1">Empty</p>
                      )}
                      <Link
                        to="/team/gallery"
                        className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-primary hover:bg-primary/10 transition-colors mt-1"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Open in Gallery
                      </Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6 animate-slide-up">
            <div>
              <h1 className="text-2xl font-heading font-bold">All Projects</h1>
              <p className="text-muted-foreground text-sm mt-0.5">{projects.length} total · {myProjectIds.length} assigned to you</p>
            </div>
            {/* View toggle */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border border-border">
              {(['kanban', 'list'] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all duration-150 capitalize',
                    view === v ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v === 'kanban' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  )}
                  {v}
                </button>
              ))}
            </div>
          </div>

          {view === 'kanban' ? (
            <TeamKanban projects={projects} myProjectIds={myProjectIds} getClientName={getClientName} onDrop={handleDrop} />
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden animate-slide-up">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left bg-muted/20">
                    {['Client', 'Title', 'Status', 'Updated', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {projects.map((p, i) => {
                    const isAssigned = myProjectIds.includes(p.id)
                    return (
                      <tr
                        key={p.id}
                        className={cn('transition-colors animate-slide-up', `stagger-${Math.min(i + 1, 7)}`, isAssigned ? 'hover:bg-muted/20' : 'opacity-60')}
                      >
                        <td className="px-4 py-3 text-muted-foreground text-sm">{getClientName(p.client_id)}</td>
                        <td className="px-4 py-3">
                          {isAssigned ? (
                            <Link to={`/team/projects/${p.id}`} className="text-primary hover:underline font-medium">
                              {formatProjectTitle(p.title, p.client_id)}
                            </Link>
                          ) : (
                            <span className="font-medium flex items-center gap-1.5 text-muted-foreground">
                              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                              {formatProjectTitle(p.title, p.client_id)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3"><ProjectStatusBadge status={p.status} /></td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {isAssigned ? (
                            <span className="text-green-600 font-medium">Assigned</span>
                          ) : (
                            <span>View only</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {profile && <ChatPanel currentUserId={profile.id} />}

    </div>
  )
}

// ── Team Kanban ────────────────────────────────────────────────────────────────
function TeamKanban({
  projects,
  myProjectIds,
  getClientName,
  onDrop,
}: {
  projects: Project[]
  myProjectIds: string[]
  getClientName: (id: string) => string
  onDrop: (id: string, from: ProjectStatus, to: ProjectStatus) => void
}) {
  const [dragging, setDragging] = useState<{ id: string; from: ProjectStatus } | null>(null)
  const [dragOver, setDragOver] = useState<ProjectStatus | null>(null)

  return (
    <div className="flex gap-3 overflow-x-auto pb-6 animate-fade-in">
      {COLUMNS.map((col, colIdx) => {
        const cards = projects.filter((p) => p.status === col.status)
        const isOver = dragOver === col.status
        return (
          <div
            key={col.status}
            className={cn(
              'flex-shrink-0 w-56 flex flex-col rounded-xl border transition-all duration-150 animate-slide-up',
              `stagger-${Math.min(colIdx + 1, 7)}`,
              isOver ? 'border-primary/50 bg-primary/5' : 'border-border bg-card/30',
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(col.status) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => {
              if (dragging && dragging.from !== col.status) {
                const isAssigned = myProjectIds.includes(dragging.id)
                if (isAssigned) onDrop(dragging.id, dragging.from, col.status)
              }
              setDragging(null)
              setDragOver(null)
            }}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className={cn('text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border', col.color)}>
                {col.label}
              </span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
                {cards.length}
              </span>
            </div>

            <div className="flex-1 px-2 pb-3 space-y-2 min-h-[60px]">
              {cards.map((p, i) => {
                const isAssigned = myProjectIds.includes(p.id)
                return (
                  <div
                    key={p.id}
                    draggable={isAssigned}
                    onDragStart={() => isAssigned && setDragging({ id: p.id, from: p.status })}
                    onDragEnd={() => { setDragging(null); setDragOver(null) }}
                    className={cn(
                      'clay-card p-3 transition-all duration-150 animate-slide-up',
                      `stagger-${Math.min(i + 1, 7)}`,
                      isAssigned
                        ? 'cursor-grab active:cursor-grabbing hover:shadow-lg hover:-translate-y-0.5'
                        : 'opacity-50 cursor-default',
                      dragging?.id === p.id && 'opacity-40 scale-95',
                    )}
                  >
                    {isAssigned ? (
                      <Link to={`/team/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="block">
                        <p className="font-medium text-sm text-foreground line-clamp-2 leading-snug">{formatProjectTitle(p.title, p.client_id)}</p>
                        <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                          {getClientName(p.client_id)}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                        </p>
                      </Link>
                    ) : (
                      <div>
                        <div className="flex items-start gap-1.5">
                          <svg className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <p className="font-medium text-sm text-foreground line-clamp-2 leading-snug">{formatProjectTitle(p.title, p.client_id)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                          {getClientName(p.client_id)}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
              {cards.length === 0 && (
                <div className={cn(
                  'border border-dashed rounded-lg p-3 flex items-center justify-center text-xs text-muted-foreground/50 min-h-[60px] transition-colors',
                  isOver ? 'border-primary/40 text-primary/50' : 'border-border/50',
                )}>
                  {isOver ? 'Drop here' : 'Empty'}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
