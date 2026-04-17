import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import pinguWave from '@/assets/pingu-wave.png'
import { clearToken } from '@/lib/auth'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { ProductionChatPanel } from '@/components/chat/ProductionChatPanel'
import { ThemeToggle } from '@/lib/theme'
import { cn } from '@/lib/utils'
import type { Project } from '@/types'

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconVideo() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
}
function IconCheck() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
}
function IconFolder() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
}
function IconChat() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
}
function IconCalendar() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
}
function IconBar() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
}
function IconPlus() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}
function IconLogout() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
}
function IconChevronRight() {
  return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
}
function IconMenu() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
}
function IconClose() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
}

interface ClientLayoutProps {
  children: React.ReactNode
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const { profile, impersonating, stopImpersonating } = useAuth()
  const { data: projects = [] } = useProjects()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const active = (projects as Project[]).filter((p) => p.status !== 'client_approved')
  const completed = (projects as Project[]).filter((p) => p.status === 'client_approved')

  const handleSignOut = () => {
    clearToken(); qc.clear(); toast.success('Signed out'); navigate('/login', { replace: true })
  }

  const isActive = (to: string, exact = false) =>
    exact ? pathname === to : pathname.startsWith(to)

  // Bottom nav items for mobile (most important 5)
  const bottomNav = [
    { to: '/workspace', label: 'Projects', icon: <IconVideo />, exact: true },
    { to: '/workspace/gallery', label: 'Gallery', icon: <IconFolder /> },
    { to: '/workspace/messages', label: 'Messages', icon: <IconChat /> },
    { to: '/workspace/calendar', label: 'Calendar', icon: <IconCalendar /> },
    { to: '/workspace/new', label: 'New', icon: <IconPlus /> },
  ]

  const SidebarContent = ({ onClick }: { onClick?: () => void }) => (
    <>
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

      {/* Projects nav */}
      <nav className="px-2 space-y-0.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mt-2">Projects</p>
        <Link
          to="/workspace"
          onClick={onClick}
          className={cn('sidebar-item w-full', isActive('/workspace', true) && 'active')}
        >
          <IconVideo />
          <span>Active</span>
          <span className="ml-auto text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">{active.length}</span>
        </Link>
        <Link
          to="/workspace?tab=completed"
          onClick={onClick}
          className={cn('sidebar-item w-full', pathname === '/workspace' && new URLSearchParams(window.location.search).get('tab') === 'completed' && 'active')}
        >
          <IconCheck />
          <span>Completed</span>
          {completed.length > 0 && <span className="ml-auto text-xs text-muted-foreground">{completed.length}</span>}
        </Link>
      </nav>

      <div className="px-3 py-3"><div className="h-px bg-border/60" /></div>

      {/* Files & other nav */}
      <nav className="px-2 space-y-0.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">Files & More</p>
        <Link to="/workspace/gallery" onClick={onClick} className={cn('sidebar-item w-full', isActive('/workspace/gallery') && 'active')}>
          <IconFolder /><span>My Gallery</span>
        </Link>
        <Link to="/workspace/messages" onClick={onClick} className={cn('sidebar-item w-full', isActive('/workspace/messages') && 'active')}>
          <IconChat /><span>Messages</span>
        </Link>
        <Link to="/workspace/calendar" onClick={onClick} className={cn('sidebar-item w-full', isActive('/workspace/calendar') && 'active')}>
          <IconCalendar /><span>Calendar</span>
        </Link>
        <Link to="/workspace/analytics" onClick={onClick} className={cn('sidebar-item w-full', isActive('/workspace/analytics') && 'active')}>
          <IconBar /><span>Analytics</span>
        </Link>
      </nav>

      <div className="px-3 py-3"><div className="h-px bg-border/60" /></div>

      {/* Project list */}
      <div className="px-2 flex-1 overflow-y-auto">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">My Projects</p>
        {(projects as Project[]).length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-2">None yet</p>
        ) : (
          <div className="space-y-0.5">
            {(projects as Project[]).map((p, i) => (
              <Link
                key={p.id}
                to={`/workspace/projects/${p.id}`}
                onClick={onClick}
                className={cn(
                  'sidebar-item w-full text-left animate-slide-up',
                  isActive(`/workspace/projects/${p.id}`) && 'active',
                  `stagger-${Math.min(i + 1, 7)}`,
                )}
              >
                <span className="truncate flex-1 text-xs">{p.title}</span>
                <IconChevronRight />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border/60">
        <Link
          to="/workspace/new"
          onClick={onClick}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <IconPlus /><span>New Project</span>
        </Link>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Impersonation banner ── */}
      {impersonating && (
        <div className="bg-amber-500 text-white flex items-center justify-between px-4 py-1.5 text-sm font-medium z-50 flex-shrink-0">
          <span>Viewing as <strong>{profile?.full_name}</strong> (client)</span>
          <button
            onClick={stopImpersonating}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-xs font-semibold"
          >
            ← Back to Admin
          </button>
        </div>
      )}

      {/* ── Top bar ── */}
      <header className="h-[52px] border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30 flex items-center px-4 gap-4">
        {/* Hamburger — mobile only */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground md:hidden"
        >
          <IconMenu />
        </button>
        <div className="flex items-center gap-2 mr-2">
          <img src={pinguWave} alt="Pingu Studio" className="w-8 h-8 object-contain flex-shrink-0" />
          <span className="font-heading font-semibold text-sm hidden sm:block">Pingu Studio</span>
        </div>
        <div className="flex-1" />
        {profile && <NotificationBell userId={profile.id} />}
        <ThemeToggle />
        <button
          onClick={handleSignOut}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Sign out"
        >
          <IconLogout />
        </button>
      </header>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-background border-r border-border flex flex-col shadow-2xl animate-slide-in-left overflow-y-auto">
            <div className="flex items-center justify-between px-4 h-[52px] border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <img src={pinguWave} alt="Pingu Studio" className="w-7 h-7 object-contain" />
                <span className="font-heading font-semibold text-sm">Pingu Studio</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <IconClose />
              </button>
            </div>
            <SidebarContent onClick={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 'calc(100vh - 52px)' }}>
        {/* ── Sidebar — tablet icon rail + desktop full ── */}
        <aside className="hidden md:flex flex-col flex-shrink-0 border-r border-border bg-background animate-slide-in-left w-12 lg:w-60 transition-all duration-200 overflow-hidden">
          {/* Tablet: icon rail */}
          <div className="flex flex-col items-center gap-1 py-3 lg:hidden flex-1">
            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary mb-2">
              {profile?.full_name.charAt(0)}
            </div>
            <div className="w-full h-px bg-border/60 mb-1" />
            {[
              { to: '/workspace', icon: <IconVideo />, label: 'Active', exact: true },
              { to: '/workspace/gallery', icon: <IconFolder />, label: 'Gallery' },
              { to: '/workspace/messages', icon: <IconChat />, label: 'Messages' },
              { to: '/workspace/calendar', icon: <IconCalendar />, label: 'Calendar' },
              { to: '/workspace/analytics', icon: <IconBar />, label: 'Analytics' },
            ].map(({ to, icon, label, exact }) => (
              <Link
                key={to}
                to={to}
                title={label}
                className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors',
                  isActive(to, exact) && 'bg-primary/10 text-primary',
                )}
              >
                {icon}
              </Link>
            ))}
            <div className="flex-1" />
            <Link
              to="/workspace/new"
              title="New Project"
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/20 transition-colors mb-1"
            >
              <IconPlus />
            </Link>
          </div>

          {/* Desktop: full sidebar */}
          <div className="hidden lg:flex lg:flex-col lg:flex-1 overflow-hidden">
            <SidebarContent />
          </div>
        </aside>

        {/* ── Page content ── */}
        <div className="flex-1 min-w-0 overflow-y-auto pb-16 md:pb-0">
          {children}
        </div>
      </div>

      {/* ── Bottom nav — mobile only ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/90 backdrop-blur-xl border-t border-border flex items-stretch h-16 safe-area-bottom">
        {bottomNav.map(({ to, label, icon, exact }) => {
          const active = isActive(to, exact)
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={cn('w-6 h-6 flex items-center justify-center rounded-lg transition-colors', active && 'bg-primary/10')}>
                {icon}
              </span>
              {label}
            </Link>
          )
        })}
      </nav>

      <ProductionChatPanel />
    </div>
  )
}
