import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { formatDistanceToNow, isToday } from 'date-fns'
import { toast } from 'sonner'
import { useNotifications } from '@/hooks/useNotifications'
import { useUrgentRequests, type UrgentRequest } from '@/hooks/useUrgentRequests'
import { Ms } from '@/components/ds'
import { notificationParts } from '@/lib/notificationText'
import { cn } from '@/lib/utils'
import type { Notification, NotificationType } from '@/types'

// The bell and its panel (design system): grouped Today / Earlier, an icon
// per kind, the project name in bold (no quote marks, no dashes), a quiet
// unread dot. Admins get Approve / Decline on an editor's urgent request.

const ICON: Record<NotificationType, string> = {
  project_created: 'add_circle',
  team_assigned: 'person_add',
  status_changed: 'sync_alt',
  comment_added: 'chat_bubble',
  video_ready_for_review: 'smart_display',
  revision_requested: 'edit_note',
  project_approved: 'check_circle',
  deadline_due: 'schedule',
}

/** Admins: an editor's "Request urgent" notification gets Approve / Decline. */
function UrgentActions({ n, requests }: { n: Notification; requests: ReturnType<typeof useUrgentRequests> }) {
  const r: UrgentRequest | undefined = (requests.data ?? []).find((x) =>
    x.project_id === n.project_id && n.message.includes(x.editor_name) && Math.abs(new Date(x.created_at).getTime() - new Date(n.created_at).getTime()) < 120_000)
  if (!r) return null
  if (r.status !== 'pending') {
    return <p className={cn('mt-1.5 ds-tag', r.status === 'declined' ? 'text-red-600' : 'text-emerald-600')} style={{ fontSize: 12 }}>
      {r.status === 'declined' ? 'Declined' : 'Approved'}
    </p>
  }
  const decide = (decision: 'approve' | 'decline') =>
    requests.decide.mutate({ id: r.id, decision }, { onError: (e) => toast.error((e as Error).message) })
  return (
    <div className="mt-2 flex gap-2">
      <button disabled={requests.decide.isPending} onClick={(e) => { e.stopPropagation(); decide('approve') }} className="ds-primary ds-tap disabled:opacity-50" style={{ height: 34 }}>Approve</button>
      <button disabled={requests.decide.isPending} onClick={(e) => { e.stopPropagation(); decide('decline') }} className="ds-ghost-btn ds-tap disabled:opacity-50" style={{ height: 34 }}>Decline</button>
    </div>
  )
}

function Text({ message }: { message: string }) {
  return (
    <p style={{ fontSize: 13.5, lineHeight: 1.4, color: 'var(--text)' }}>
      {notificationParts(message).map((p, i) => p.strong
        ? <strong key={i} style={{ fontWeight: 600, color: 'var(--strong)' }}>{p.text}</strong>
        : <span key={i}>{p.text}</span>)}
    </p>
  )
}

export function NotificationBell({ userId, isAdmin = false }: { userId: string; isAdmin?: boolean }) {
  const [open, setOpen] = useState(false)
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(userId)
  const urgent = useUrgentRequests(isAdmin && open)
  const navigate = useNavigate()
  const { profile } = useAuth()
  // A notification about a project opens that project.
  const base = profile?.role === 'admin' ? '/admin/projects/' : profile?.role === 'team' ? '/team/projects/' : '/workspace/projects/'
  const openProject = (n: Notification) => {
    if (!n.read) markRead(n.id)
    if (!n.project_id) return
    setOpen(false)
    navigate(base + n.project_id)
  }
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open])

  const today = notifications.filter((n) => isToday(new Date(n.created_at)))
  const earlier = notifications.filter((n) => !isToday(new Date(n.created_at)))

  const row = (n: Notification) => {
    const isUrgent = isAdmin && n.message.startsWith('Urgent request:')
    const body = (
      <>
        <span className="ds-notif-icon" aria-hidden><Ms name={isUrgent ? 'bolt' : ICON[n.type] ?? 'notifications'} style={{ fontSize: 18, width: 18, color: 'inherit' }} /></span>
        <div className="flex-1 min-w-0">
          <Text message={n.message} />
          <p className="mt-0.5" style={{ fontSize: 12, color: 'var(--faint)' }}>{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
          {isUrgent && <UrgentActions n={n} requests={urgent} />}
        </div>
        {!n.read && <span className="w-2 h-2 rounded-full flex-none mt-1.5" style={{ background: 'var(--strong)' }} aria-label="Unread" />}
      </>
    )
    // Urgent requests hold their own buttons, so the row isn't one big button.
    return isUrgent ? (
      <div key={n.id} onClick={() => openProject(n)} className={cn('ds-notif', !n.read && 'unread')} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') openProject(n) }}>
        {body}
      </div>
    ) : (
      <button key={n.id} onClick={() => openProject(n)} className={cn('ds-notif w-full text-left', !n.read && 'unread')}>{body}</button>
    )
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="ds-ibtn" aria-label="Notifications" aria-expanded={open}>
        <Ms name="notifications" style={{ color: 'inherit', fontVariationSettings: open ? "'FILL' 1, 'wght' 400" : undefined }} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full grid place-items-center tabular-nums"
            style={{ fontSize: 10, fontWeight: 700, background: 'var(--strong)', color: 'var(--bg)' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="ds-notif-panel" role="dialog" aria-label="Notifications">
            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
              <h3 style={{ fontSize: 15, fontWeight: 650, color: 'var(--strong)' }}>Notifications</h3>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="ds-ghost-btn" style={{ height: 30, fontSize: 12.5, padding: '0 10px' }}>Mark all read</button>
              )}
            </div>
            <div className="ds-notif-list">
              {notifications.length === 0 ? (
                <div className="text-center py-10">
                  <Ms name="notifications_off" style={{ fontSize: 26, width: 26 }} />
                  <p className="mt-2" style={{ fontSize: 13.5, color: 'var(--faint)' }}>No notifications</p>
                </div>
              ) : (
                <>
                  {today.length > 0 && <p className="ds-notif-group">Today</p>}
                  {today.map(row)}
                  {earlier.length > 0 && <p className="ds-notif-group">Earlier</p>}
                  {earlier.map(row)}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
