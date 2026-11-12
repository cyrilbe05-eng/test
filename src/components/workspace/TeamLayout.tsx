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
const SOPS_LINK: Link = { to: '/team/sops', label: 'SOPs', icon: 'menu_book' }
const ALL_PROJECTS_LINK: Link = { to: '/team/all', label: 'All projects', icon: 'view_kanban', exact: true }

interface TeamLayoutProps {
  children: React.ReactNode
}

export function TeamLayout({ children }: TeamLayoutProps) {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  // Editors: "Home" (their videos + limit) and the full board under "All projects".
  const links = profile?.team_role === 'copywriter'
    ? [...NAV_LINKS, PLANS_LINK]
    : [{ ...NAV_LINKS[0], label: 'Home' }, ALL_PROJECTS_LINK, ...NAV_LINKS.slice(1)]

  const item = (l: Link): FrameItem => ({ ...l, on: l.exact ? pathname === l.to : pathname.startsWith(l.to) })
  // Bottom bar is full; SOPs stays in the ☰ menu on phones.
  return (
    <AppFrame
      groups={[links.map(item), [item(SOPS_LINK)]]}
      bottom={links.map(item)}
      subtitle={profile?.email}
      viewingAs="team"
    >
      {children}
    </AppFrame>
  )
}
