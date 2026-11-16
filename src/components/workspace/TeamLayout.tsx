import { useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AppFrame, type FrameItem } from '@/components/ds/Frame'

type Link = { to: string; label: string; icon: string; exact?: boolean }

const NAV_LINKS: Link[] = [
  { to: '/team', label: 'Dashboard', icon: 'home', exact: true },
  { to: '/team/stats', label: 'My Stats', icon: 'bar_chart' },
  { to: '/team/gallery', label: 'Gallery', icon: 'photo_library' },
  { to: '/team/calendar', label: 'Calendar', icon: 'calendar_month' },
  { to: '/team/messages', label: 'Messages', icon: 'chat_bubble' },
]

// Copywriters only (production plans of their assigned clients). Appended so
// editors' menus are unchanged.
const PLANS_LINK: Link = { to: '/team/plans', label: 'Plans', icon: 'receipt_long' }
const SCRIPTS_LINK: Link = { to: '/team/scripts', label: 'Scripts', icon: 'edit_note' }
const SOPS_LINK: Link = { to: '/team/sops', label: 'SOPs', icon: 'menu_book' }
const ALL_PROJECTS_LINK: Link = { to: '/team/all', label: 'All projects', icon: 'view_kanban', exact: true }
// Editors only: the monthly leaderboard (copywriters aren't scored).
const LEADERBOARD_LINK: Link = { to: '/team/leaderboard', label: 'Leaderboard', icon: 'leaderboard' }

interface TeamLayoutProps {
  children: React.ReactNode
  /** The page draws its own header. */
  bare?: boolean
}

export function TeamLayout({ children, bare }: TeamLayoutProps) {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  // Editors: "Home" (their videos + limit) and the full board under "All projects".
  const links = profile?.team_role === 'copywriter'
    ? [...NAV_LINKS, PLANS_LINK, SCRIPTS_LINK]
    : [{ ...NAV_LINKS[0], label: 'Home' }, ALL_PROJECTS_LINK, ...NAV_LINKS.slice(1)]

  const item = (l: Link): FrameItem => ({ ...l, on: l.exact ? pathname === l.to : pathname.startsWith(l.to) })
  // Sidebar: the leaderboard right after My Stats. Bottom bar is full, so on
  // phones it (like SOPs) lives in the ☰ menu.
  const side = profile?.team_role === 'copywriter'
    ? links
    : links.flatMap((l) => (l.to === '/team/stats' ? [l, LEADERBOARD_LINK] : [l]))
  return (
    <AppFrame
      groups={[side.map(item), [item(SOPS_LINK)]]}
      bottom={links.map(item)}
      subtitle={profile?.email}
      viewingAs="team"
      bare={bare}
    >
      {children}
    </AppFrame>
  )
}
