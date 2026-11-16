import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import logoLine from '@/assets/logo-line.png'
import { clearToken } from '@/lib/auth'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { ProductionChatPanel } from '@/components/chat/ProductionChatPanel'
import { Ms, ThemeFadeButton } from '@/components/ds'
import { cn } from '@/lib/utils'
import { ProfileMenu } from '@/components/ds/ProfileMenu'
import { useCardTilt } from '@/hooks/useCardTilt'

// Admin frame (DESIGN.md): 236px sidebar with a single sliding indicator,
// logo on top, profile + sign out at the bottom; no top bar on desktop.
// Pages that draw their own header (`bare`) place <HeaderTools /> in it;
// the others get the theme toggle and bell on a thin row above them.

type Item = { to: string; label: string; icon: string; match: (p: string) => boolean; fullAdminOnly?: boolean }

const GROUPS: Item[][] = [
  [
    { to: '/admin/home', label: 'Home', icon: 'home', match: (p) => p === '/admin/home' },
    { to: '/admin', label: 'Projects', icon: 'view_kanban', match: (p) => p === '/admin' || p.startsWith('/admin/projects') },
    { to: '/admin/calendar', label: 'Calendar', icon: 'calendar_month', match: (p) => p.startsWith('/admin/calendar') },
    { to: '/admin/messages', label: 'Messages', icon: 'chat_bubble', match: (p) => p.startsWith('/admin/messages') },
    { to: '/admin/gallery', label: 'Gallery', icon: 'photo_library', match: (p) => p.startsWith('/admin/gallery') },
  ],
  [
    { to: '/admin/users', label: 'Users', icon: 'group', match: (p) => p.startsWith('/admin/users') },
    { to: '/admin/analytics', label: 'Analytics', icon: 'monitoring', match: (p) => p.startsWith('/admin/analytics') },
    { to: '/admin/leaderboard', label: 'Leaderboard', icon: 'leaderboard', match: (p) => p.startsWith('/admin/leaderboard'), fullAdminOnly: true },
    { to: '/admin/plans', label: 'Plans', icon: 'receipt_long', match: (p) => p.startsWith('/admin/plans') },
  ],
  [
    { to: '/admin/sops', label: 'SOPs', icon: 'menu_book', match: (p) => p.startsWith('/admin/sops') },
    { to: '/admin/care', label: 'Client Care', icon: 'favorite', match: (p) => p.startsWith('/admin/care'), fullAdminOnly: true },
    { to: '/admin/onboarding-questions', label: 'Questions', icon: 'help', match: (p) => p.startsWith('/admin/onboarding-questions'), fullAdminOnly: true },
  ],
]

// Phone bottom bar: Home, Projects, Users, Analytics, Messages (+ More).
const BOTTOM = ['/admin/home', '/admin', '/admin/users', '/admin/analytics', '/admin/messages']

/** Theme toggle + notifications, for page headers. */
export function HeaderTools() {
  const { profile } = useAuth()
  return (
    <div className="flex items-center gap-1">
      <ThemeFadeButton />
      {profile && <NotificationBell userId={profile.id} isAdmin />}
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 h-10 px-2.5">
      <img src={logoLine} alt="Pingu" className="w-7 h-[23px] object-contain dark:invert" style={{ transition: 'filter .5s' }} />
      <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.015em', color: 'var(--strong)' }}>Pingu Studio</span>
    </div>
  )
}

interface AdminLayoutProps {
  children: React.ReactNode
  /** The page draws its own header (with <HeaderTools />). */
  bare?: boolean
}

export function AdminLayout({ children, bare }: AdminLayoutProps) {
  const { profile, impersonating: isImpersonatingUser, stopImpersonating } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  useCardTilt()

  const handleSignOut = () => {
    clearToken(); qc.clear(); toast.success('Signed out'); navigate('/login', { replace: true })
  }

  const groups = GROUPS.map((g) => g.filter((i) => !(i.fullAdminOnly && profile?.admin_role === 'manager'))).filter((g) => g.length)
  // One sliding indicator: its offset is 34px per item and 17px per gap.
  let y = 0
  let indY: number | null = null
  groups.forEach((g, gi) => {
    if (gi > 0) y += 17
    for (const item of g) {
      if (indY === null && item.match(pathname)) indY = y
      y += 34
    }
  })

  const Sidebar = ({ onPick }: { onPick?: () => void }) => (
    <>
      <Brand />
      <nav className="ds-side-list" aria-label="Main">
        {indY !== null && <div className="ds-side-ind" style={{ transform: `translateY(${indY}px)` }} />}
        {groups.map((g, gi) => (
          <div key={gi} className="flex flex-col">
            {gi > 0 && <div className="ds-sep" />}
            {g.map((item) => {
              const on = item.match(pathname)
              return (
                <Link key={item.to} to={item.to} onClick={onPick} className={cn('ds-nav', on && 'on')} aria-current={on ? 'page' : undefined}>
                  <Ms name={item.icon} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="mt-auto"><ProfileMenu subtitle={profile?.admin_role === 'manager' ? 'Manager' : 'Admin'} onSignOut={handleSignOut} /></div>
    </>
  )

  return (
    <div className="ds min-h-screen flex flex-col">
      {isImpersonatingUser && (
        <div className="bg-amber-500 text-white flex items-center justify-between px-4 py-1.5 text-sm font-medium z-50 flex-shrink-0">
          <span>Viewing as <strong>{profile?.full_name}</strong> ({profile?.role})</span>
          <button onClick={stopImpersonating} className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-xs font-semibold">
            ← Back to Admin
          </button>
        </div>
      )}

      {/* Phone: slim top bar (menu, logo, theme + bell) */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-1 h-14 px-2" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}>
        <button type="button" className="ds-ibtn" aria-label="Menu" onClick={() => setDrawerOpen(true)}><Ms name="menu" /></button>
        <img src={logoLine} alt="Pingu Studio" className="w-7 h-[23px] object-contain dark:invert" />
        <div className="flex-1" />
        <HeaderTools />
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0" style={{ background: 'var(--veil)' }} onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] flex flex-col gap-[22px] overflow-y-auto animate-slide-in-left" style={{ background: 'var(--bg)', padding: '18px 12px', borderRight: '1px solid var(--line)' }}>
            <Sidebar onPick={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex flex-col gap-[22px] flex-none w-[236px] sticky top-0 h-screen overflow-y-auto" style={{ padding: '18px 12px', borderRight: '1px solid var(--line)' }}>
          <Sidebar />
        </aside>
        <div className="flex-1 min-w-0 pb-16 md:pb-0">
          {!bare && (
            <div className="hidden md:flex justify-end px-6 pt-4">
              <HeaderTools />
            </div>
          )}
          {children}
        </div>
      </div>

      {/* Phone bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch h-16 safe-area-bottom" style={{ background: 'var(--bg)', borderTop: '1px solid var(--line)' }}>
        {BOTTOM.map((to) => {
          const item = GROUPS.flat().find((i) => i.to === to)!
          const on = item.match(pathname)
          return (
            <Link key={to} to={to} className={cn('ds-nav flex-1 flex-col justify-center !gap-0.5 !h-auto !px-0', on && 'on')} style={{ fontSize: 10.5 }} aria-current={on ? 'page' : undefined}>
              <Ms name={item.icon} />
              {item.label}
            </Link>
          )
        })}
        <button type="button" onClick={() => setDrawerOpen(true)} className="ds-nav flex-1 flex-col justify-center !gap-0.5 !h-auto !px-0" style={{ fontSize: 10.5 }}>
          <Ms name="menu" />
          More
        </button>
      </nav>

      <ProductionChatPanel />
    </div>
  )
}
