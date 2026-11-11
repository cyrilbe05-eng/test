import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { useNotifications } from '@/hooks/useNotifications'
import { useUrgentRequests, type UrgentRequest } from '@/hooks/useUrgentRequests'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types'

/** Admins: an editor's "Request urgent" notification gets Approve / Decline. */
function UrgentActions({ n, requests }: { n: Notification; requests: ReturnType<typeof useUrgentRequests> }) {
  const r: UrgentRequest | undefined = (requests.data ?? []).find((x) =>
    x.project_id === n.project_id && n.message.includes(x.editor_name) && Math.abs(new Date(x.created_at).getTime() - new Date(n.created_at).getTime()) < 120_000)
  if (!r) return null
  if (r.status !== 'pending') {
    return <p className={cn('mt-1.5 text-xs font-semibold', r.status === 'declined' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
      {r.status === 'declined' ? 'Declined' : 'Approved'}
    </p>
  }
  const decide = (decision: 'approve' | 'decline') =>
    requests.decide.mutate({ id: r.id, decision }, { onError: (e) => toast.error((e as Error).message) })
  return (
    <div className="mt-2 flex gap-2">
      <button disabled={requests.decide.isPending} onClick={() => decide('approve')}
        className="min-h-[44px] px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:brightness-110 disabled:opacity-50">Approve</button>
      <button disabled={requests.decide.isPending} onClick={() => decide('decline')}
        className="min-h-[44px] px-4 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50">Decline</button>
    </div>
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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-heading font-semibold text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No notifications</p>
              ) : (
                notifications.map((n) => isAdmin && n.message.startsWith('Urgent request:') ? (
                  <div key={n.id} onClick={() => { if (!n.read) markRead(n.id) }}
                    className={cn('px-4 py-3 border-b border-border/50 last:border-0', !n.read && 'bg-primary/5')}>
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                      <div className={cn('min-w-0', !n.read ? '' : 'ml-4')}>
                        <button onClick={(e) => { e.stopPropagation(); openProject(n) }} className="text-sm text-foreground text-left hover:underline">{n.message}</button>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                        <UrgentActions n={n} requests={urgent} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    key={n.id}
                    onClick={() => openProject(n)}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0',
                      !n.read && 'bg-primary/5',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                      <div className={cn(!n.read ? '' : 'ml-4')}>
                        <p className="text-sm text-foreground">{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
