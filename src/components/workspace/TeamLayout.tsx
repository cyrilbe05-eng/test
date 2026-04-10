import { Link, useLocation, useNavigate } from 'react-router-dom'
import pinguPhone from '@/assets/pingu-phone.png'
import { clearToken } from '@/lib/auth'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { ThemeToggle } from '@/lib/theme'
import { cn } from '@/lib/utils'

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconHome() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
}
function IconBar() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
}
function IconFolder() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
}
function IconCalendar() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
}
function IconChat() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
}
function IconLogout() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
}

const NAV_LINKS = [
  { to: '/team', label: 'Dashboard', icon: <IconHome />, exact: true },
  { to: '/team/stats', label: 'My Stats', icon: <IconBar /> },
  { to: '/team/gallery', label: 'Gallery', icon: <IconFolder /> },
  { to: '/team/calendar', label: 'Calendar', icon: <IconCalendar /> },
  { to: '/team/messages', label: 'Messages', icon: <IconChat /> },
]

interface TeamLayoutProps {
  children: React.ReactNode
}

export function TeamLayout({ children }: TeamLayoutProps) {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const handleSignOut = () => {
    clearToken(); qc.clear(); toast.success('Signed out'); navigate('/login', { replace: true })
  }

  const isActive = (to: string, exact = false) =>
    exact ? pathname === to : pathname.startsWith(to)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top bar ── */}
      <header className="h-[52px] border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30 flex items-center px-4 gap-4">
        <div className="flex items-center gap-2 mr-2">
          <img src={pinguPhone} alt="Pingu Studio" className="w-8 h-8 object-contain rounded-lg flex-shrink-0" />
          <span className="font-heading font-semibold text-sm hidden sm:block">Pingu Studio</span>
        </div>
        <div className="flex-1" />
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
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 'calc(100vh - 52px)' }}>
        {/* ── Sidebar ── */}
        <aside className="w-56 border-r border-border bg-background flex flex-col flex-shrink-0 animate-slide-in-left">
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
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mt-1">Team</p>
            {NAV_LINKS.map(({ to, label, icon, exact }) => (
              <Link
                key={to}
                to={to}
                className={cn('sidebar-item w-full', isActive(to, exact) && 'active')}
              >
                {icon}
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        </aside>

        {/* ── Page content ── */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}
