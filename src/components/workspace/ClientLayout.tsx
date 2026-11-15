import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { useCanCreateVideo } from '@/hooks/useCanCreateVideo'
import { AppFrame, type FrameItem } from '@/components/ds/Frame'
import { Ms } from '@/components/ds'
import type { Project } from '@/types'

interface ClientLayoutProps {
  children: React.ReactNode
  /** The page draws its own header. */
  bare?: boolean
}

const count = (n: number) => n > 0
  ? <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 600, color: 'var(--faint)' }}>{n}</span>
  : undefined

export function ClientLayout({ children, bare }: ClientLayoutProps) {
  // Full-package clients record the scripts on their Home: no free "New video".
  const canCreate = useCanCreateVideo()
  const { profile } = useAuth()
  const { data: projects = [] } = useProjects()
  const { pathname, search } = useLocation()

  const active = (projects as Project[]).filter((p) => p.status !== 'client_approved')
  const completed = (projects as Project[]).filter((p) => p.status === 'client_approved')
  const at = (to: string, exact = false) => exact ? pathname === to : pathname.startsWith(to)
  const completedOn = pathname === '/workspace/videos' && new URLSearchParams(search).get('tab') === 'completed'

  const groups: FrameItem[][] = [
    [
      // Home is also the Active list.
      { to: '/workspace', label: 'Home', icon: 'home', on: at('/workspace', true), badge: count(active.length) },
      { to: '/workspace/onboarding', label: 'Onboarding', icon: 'assignment', on: at('/workspace/onboarding') },
      { to: '/workspace/videos?tab=completed', label: 'Completed', icon: 'task_alt', on: completedOn, badge: count(completed.length) },
    ],
    [
      { to: '/workspace/gallery', label: 'My Gallery', icon: 'photo_library', on: at('/workspace/gallery') },
      { to: '/workspace/messages', label: 'Messages', icon: 'chat_bubble', on: at('/workspace/messages') },
      { to: '/workspace/calendar', label: 'Calendar', icon: 'calendar_month', on: at('/workspace/calendar') },
      { to: '/workspace/analytics', label: 'Analytics', icon: 'monitoring', on: at('/workspace/analytics') },
    ],
  ]

  // Phone bottom bar: Home = dashboard; Videos = the project list.
  const bottom: FrameItem[] = [
    { to: '/workspace', label: 'Home', icon: 'home', on: at('/workspace', true) },
    { to: '/workspace/videos', label: 'Videos', icon: 'movie', on: at('/workspace/videos') },
    { to: '/workspace/messages', label: 'Messages', icon: 'chat_bubble', on: at('/workspace/messages') },
    { to: '/workspace/calendar', label: 'Calendar', icon: 'calendar_month', on: at('/workspace/calendar') },
    ...(canCreate ? [{ to: '/workspace/new', label: 'New video', icon: 'add', on: at('/workspace/new') }] : []),
  ]

  return (
    <AppFrame
      groups={groups}
      bottom={bottom}
      subtitle={profile?.email}
      viewingAs="client"
      bare={bare}
      footer={canCreate ? (close) => (
        <Link to="/workspace/new" onClick={close} className="ds-primary justify-center" style={{ width: '100%' }}>
          <Ms name="add" style={{ color: 'inherit' }} />New video
        </Link>
      ) : undefined}
    >
      {children}
    </AppFrame>
  )
}
