import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import pinguSuit from '@/assets/pingu-suit.png'
import { clearToken } from '@/lib/auth'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { ProductionChatPanel } from '@/components/chat/ProductionChatPanel'
import { ThemeToggle } from '@/lib/theme'
import { cn } from '@/lib/utils'

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconChevronLeft() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
}
function IconChevronRight() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
}
function IconLogout() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
}
function IconMenu() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
}
function IconClose() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
}

// ── Nav links ──────────────────────────────────────────────────────────────────
const NAV_LINKS = [
  { to: '/admin',           label: 'Projects',  exact: true, icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg> },
  { to: '/admin/users',     label: 'Users',     icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
  { to: '/admin/analytics', label: 'Analytics', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
  { to: '/admin/plans',     label: 'Plans',     icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
  { to: '/admin/messages',  label: 'Messages',  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg> },
  { to: '/admin/calendar',  label: 'Calendar',  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
  { to: '/admin/gallery',   label: 'Gallery',   icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg> },
]

// Bottom nav shows the 5 most important links for admin mobile
const BOTTOM_NAV = NAV_LINKS.slice(0, 5)

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { profile, impersonating: isImpersonatingUser, stopImpersonating } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleSignOut = () => {
    clearToken(); qc.clear(); toast.success('Signed out'); navigate('/login', { replace: true })
  }

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || (to !== '/admin' && pathname.startsWith(to))

  const SidebarContent = ({ onClick }: { onClick?: () => void }) => (
    <>
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

      <nav className="px-2 space-y-0.5 flex-1 overflow-y-auto">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mt-1 whitespace-nowrap">
          Admin
        </p>
        {NAV_LINKS.map(({ to, label, icon, exact }) => (
          <Link
            key={to}
            to={to}
            onClick={onClick}
            className={cn('sidebar-item w-full whitespace-nowrap', isActive(to, exact) && 'active')}
          >
            {icon}
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </>
  )

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Impersonation banner ── */}
      {isImpersonatingUser && (
        <div className="bg-amber-500 text-white flex items-center justify-between px-4 py-1.5 text-sm font-medium z-50 flex-shrink-0">
          <span>Viewing as <strong>{profile?.full_name}</strong> ({profile?.role})</span>
          <button
            onClick={stopImpersonating}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-xs font-semibold"
          >
            ← Back to Admin
          </button>
        </div>
      )}

      {/* ── Top bar ── */}
      <header className="h-[52px] border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30 flex items-center px-4 gap-3 flex-shrink-0">
        {/* Mobile: hamburger */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground md:hidden"
        >
          <IconMenu />
        </button>
        {/* Desktop: collapse toggle */}
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0 hidden md:flex"
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <IconChevronLeft /> : <IconChevronRight />}
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          <img src={pinguSuit} alt="Pingu Studio" className="w-8 h-8 object-contain" />
          <span className="font-heading font-semibold text-sm hidden sm:block">Pingu Studio</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {profile && <NotificationBell userId={profile.id} />}
          <ThemeToggle />
          <span className="text-sm text-muted-foreground hidden md:block">{profile?.full_name}</span>
          <button
            onClick={handleSignOut}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Sign out"
          >
            <IconLogout />
          </button>
        </div>
      </header>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-background border-r border-border flex flex-col shadow-2xl animate-slide-in-left overflow-y-auto">
            <div className="flex items-center justify-between px-4 h-[52px] border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <img src={pinguSuit} alt="Pingu Studio" className="w-7 h-7 object-contain" />
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
        {/* ── Sidebar — hidden on mobile, collapsible on desktop ── */}
        <aside
          className={cn(
            'hidden md:flex flex-col flex-shrink-0 border-r border-border bg-background transition-all duration-200 overflow-hidden',
            sidebarOpen ? 'w-56' : 'w-0',
          )}
        >
          <SidebarContent />
        </aside>

        {/* ── Page content ── */}
        <div className="flex-1 min-w-0 overflow-y-auto pb-16 md:pb-0">
          {children}
        </div>
      </div>

      {/* ── Bottom nav — mobile only ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/90 backdrop-blur-xl border-t border-border flex items-stretch h-16 safe-area-bottom">
        {BOTTOM_NAV.map(({ to, label, icon, exact }) => {
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
        {/* "More" button opens drawer for remaining links */}
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          </span>
          More
        </button>
      </nav>

      <ProductionChatPanel />
    </div>
  )
}
