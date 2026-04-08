import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useAuth } from '@/hooks/useAuth'
import { ThemeToggle } from '@/lib/theme'
import { clearToken } from '@/lib/auth'
import { useQueryClient } from '@tanstack/react-query'
import pinguSuit from '@/assets/pingu-suit.png'

const NAV_LINKS = [
  { to: '/admin',           label: 'Projects',  exact: true },
  { to: '/admin/users',     label: 'Users' },
  { to: '/admin/analytics', label: 'Analytics' },
  { to: '/admin/gallery',   label: 'Gallery' },
  { to: '/admin/plans',     label: 'Plans' },
  { to: '/admin/messages',  label: 'Messages' },
  { to: '/admin/calendar',  label: 'Calendar' },
]

export function AdminNav() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const handleSignOut = () => {
    clearToken()
    qc.clear()
    toast.success('Signed out')
    navigate('/login', { replace: true })
  }

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30">
      <div className="max-w-screen-2xl mx-auto px-6 h-13 flex items-center justify-between" style={{ height: '52px' }}>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <img src={pinguSuit} alt="Pingu Studio" className="w-8 h-8 object-contain rounded-lg flex-shrink-0" />
            <span className="font-heading font-semibold text-sm text-foreground">Pingu Studio</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <nav className="flex items-center gap-0.5">
            {NAV_LINKS.map(({ to, label, exact }) => {
              const active = exact ? pathname === to : pathname.startsWith(to)
              return (
                <Link
                  key={to}
                  to={to}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          {profile && <NotificationBell userId={profile.id} />}
          <ThemeToggle />
          <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted">
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
