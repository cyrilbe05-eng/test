import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import logoLine from '@/assets/logo-line.png'
import { clearToken } from '@/lib/auth'
import { useAuth } from '@/hooks/useAuth'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { ProductionChatPanel } from '@/components/chat/ProductionChatPanel'
import { Ms, ThemeFadeButton } from '@/components/ds'
import { cn } from '@/lib/utils'
import { ProfileMenu } from '@/components/ds/ProfileMenu'
import { useCardTilt } from '@/hooks/useCardTilt'

// The app frame of the design system (same as the admin frame): 236px
// sidebar with one sliding indicator, profile + sign out at the bottom;
// on phones a slim top bar, a drawer and a bottom bar. Used by the team and
// client areas; each passes its own menu.

export type FrameItem = { to: string; label: string; icon: string; on: boolean; badge?: React.ReactNode }

interface FrameProps {
  groups: FrameItem[][]
  /** Phone bottom bar. */
  bottom: FrameItem[]
  /** Second line under the name in the profile card. */
  subtitle?: string
  /** "Viewing as … (who)" banner while an admin is viewing as this user. */
  viewingAs: string
  /** Extra action above the profile card (e.g. "New video"). */
  footer?: (close: () => void) => React.ReactNode
  /** The page draws its own header (with <FrameTools />). */
  bare?: boolean
  children: React.ReactNode
}

/** Theme toggle + notifications, for pages that draw their own header. */
export function FrameTools() {
  const { profile } = useAuth()
  return (
    <div className="flex items-center gap-1">
      <ThemeFadeButton />
      {profile && <NotificationBell userId={profile.id} />}
    </div>
  )
}

export function AppFrame({ groups, bottom, subtitle, viewingAs, footer, bare, children }: FrameProps) {
  const { profile, impersonating, stopImpersonating } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [drawerOpen, setDrawerOpen] = useState(false)
  useCardTilt()
  const close = () => setDrawerOpen(false)

  const handleSignOut = () => {
    clearToken(); qc.clear(); toast.success('Signed out'); navigate('/login', { replace: true })
  }

  // One sliding indicator: 34px per item, 17px per gap.
  let y = 0
  let indY: number | null = null
  groups.forEach((g, gi) => {
    if (gi > 0) y += 17
    for (const item of g) {
      if (indY === null && item.on) indY = y
      y += 34
    }
  })

  const Sidebar = ({ onPick }: { onPick?: () => void }) => (
    <>
      <div className="flex items-center gap-2.5 h-10 px-2.5">
        <img src={logoLine} alt="Pingu" className="w-7 h-[23px] object-contain dark:invert" style={{ transition: 'filter .5s' }} />
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.015em', color: 'var(--strong)' }}>Pingu Studio</span>
      </div>
      <nav className="ds-side-list" aria-label="Main">
        {indY !== null && <div className="ds-side-ind" style={{ transform: `translateY(${indY}px)` }} />}
        {groups.map((g, gi) => (
          <div key={gi} className="flex flex-col">
            {gi > 0 && <div className="ds-sep" />}
            {g.map((item) => (
              <Link key={item.to} to={item.to} onClick={onPick} className={cn('ds-nav', item.on && 'on')} aria-current={item.on ? 'page' : undefined}>
                <Ms name={item.icon} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2.5">
        {footer?.(onPick ?? (() => {}))}
        <ProfileMenu subtitle={subtitle} onSignOut={handleSignOut} />
      </div>
    </>
  )

  return (
    <div className="ds min-h-screen flex flex-col">
      {impersonating && (
        <div className="bg-amber-500 text-white flex items-center justify-between px-4 py-1.5 text-sm font-medium z-50 flex-shrink-0">
          <span>Viewing as <strong>{profile?.full_name}</strong> ({viewingAs})</span>
          <button onClick={stopImpersonating} className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-xs font-semibold">
            ← Back to Admin
          </button>
        </div>
      )}

      {/* Phone: slim top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-1 h-14 px-2" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}>
        <button type="button" className="ds-ibtn" aria-label="Menu" onClick={() => setDrawerOpen(true)} style={{ width: 44, height: 44 }}><Ms name="menu" /></button>
        <img src={logoLine} alt="Pingu Studio" className="w-7 h-[23px] object-contain dark:invert" />
        <div className="flex-1" />
        <FrameTools />
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0" style={{ background: 'var(--veil)' }} onClick={close} />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] flex flex-col gap-[22px] overflow-y-auto animate-slide-in-left" style={{ background: 'var(--bg)', padding: '18px 12px', borderRight: '1px solid var(--line)' }}>
            <Sidebar onPick={close} />
          </aside>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex flex-col gap-[22px] flex-none w-[236px] sticky top-0 h-screen overflow-y-auto" style={{ padding: '18px 12px', borderRight: '1px solid var(--line)' }}>
          <Sidebar />
        </aside>
        <div className="flex-1 min-w-0 pb-16 md:pb-0">
          {!bare && <div className="hidden md:flex justify-end px-6 pt-4"><FrameTools /></div>}
          {children}
        </div>
      </div>

      {/* Phone bottom bar (none while a client is locked into onboarding) */}
      {bottom.length > 0 && <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch h-16 safe-area-bottom" style={{ background: 'var(--bg)', borderTop: '1px solid var(--line)' }}>
        {bottom.map((item) => (
          <Link key={item.to} to={item.to} className={cn('ds-nav flex-1 flex-col justify-center !gap-0.5 !h-auto !px-0 min-w-0', item.on && 'on')} style={{ fontSize: 10.5 }} aria-current={item.on ? 'page' : undefined}>
            <Ms name={item.icon} />
            <span className="truncate max-w-full">{item.label}</span>
          </Link>
        ))}
      </nav>}

      <ProductionChatPanel />
    </div>
  )
}
