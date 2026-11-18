import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProjects } from '@/hooks/useProjects'
import { useCanCreateVideo } from '@/hooks/useCanCreateVideo'
import { useClientDashboard } from '@/hooks/useClientDashboard'
import { useNewVideoPath } from '@/hooks/useAppSettings'
import { AppFrame, type FrameItem } from '@/components/ds/Frame'
import { Ms } from '@/components/ds'
import type { Project } from '@/types'
import { PLAYBOOK_NAME, PLAYBOOK_PATH } from '@/lib/playbook'

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
  const { profile, impersonating } = useAuth()
  const { data: dash } = useClientDashboard()
  const newVideo = useNewVideoPath()
  const { data: projects = [] } = useProjects()
  const { pathname } = useLocation()

  const active = (projects as Project[]).filter((p) => p.status !== 'client_approved')
  const at = (to: string, exact = false) => exact ? pathname === to : pathname.startsWith(to)

  // Until the questionnaire is finished, it is the whole app: no menu, and
  // every other page sends them back to it (not when an admin views as them).
  const locked = !!dash?.needs_onboarding && !impersonating
  if (locked && pathname !== '/workspace/onboarding') return <Navigate to="/workspace/onboarding" replace />

  const groups: FrameItem[][] = locked ? [] : [
    [
      // Home is also the Active list.
      { to: '/workspace', label: 'Home', icon: 'home', on: at('/workspace', true), badge: count(active.length) },
      { to: '/workspace/videos', label: 'Videos', icon: 'movie', on: at('/workspace/videos') },
    ],
    [
      { to: '/workspace/gallery', label: 'My Gallery', icon: 'photo_library', on: at('/workspace/gallery') },
      { to: '/workspace/messages', label: 'Messages', icon: 'chat_bubble', on: at('/workspace/messages') },
      { to: '/workspace/calendar', label: 'Calendar', icon: 'calendar_month', on: at('/workspace/calendar') },
      { to: '/workspace/analytics', label: 'Analytics', icon: 'monitoring', on: at('/workspace/analytics') },
    ],
    // Playbook, then Onboarding last in the sidebar.
    [
      { to: `/workspace/${PLAYBOOK_PATH}`, label: PLAYBOOK_NAME, icon: 'video_library', on: at(`/workspace/${PLAYBOOK_PATH}`) },
      { to: '/workspace/onboarding', label: 'Onboarding', icon: 'assignment', on: at('/workspace/onboarding') },
    ],
  ]

  // Phone bottom bar: Home = dashboard; Videos = the project list.
  const bottom: FrameItem[] = locked ? [] : [
    { to: '/workspace', label: 'Home', icon: 'home', on: at('/workspace', true) },
    { to: '/workspace/videos', label: 'Videos', icon: 'movie', on: at('/workspace/videos') },
    { to: '/workspace/messages', label: 'Messages', icon: 'chat_bubble', on: at('/workspace/messages') },
    { to: '/workspace/calendar', label: 'Calendar', icon: 'calendar_month', on: at('/workspace/calendar') },
    ...(canCreate ? [{ to: newVideo, label: 'New video', icon: 'add', on: at('/workspace/new') || at('/workspace/start') || at('/workspace/batch') }] : []),
  ]

  return (
    <AppFrame
      groups={groups}
      bottom={bottom}
      subtitle={profile?.email}
      viewingAs="client"
      bare={bare}
      footer={canCreate && !locked ? (close) => (
        <Link to={newVideo} onClick={close} className="ds-primary justify-center" style={{ width: '100%' }}>
          <Ms name="add" style={{ color: 'inherit' }} />New video
        </Link>
      ) : undefined}
    >
      {children}
    </AppFrame>
  )
}
