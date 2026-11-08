import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import pinguPhone from '@/assets/pingu-phone.png'
import { formatDistanceToNow } from 'date-fns'
import { useDemoAuth } from '../DemoAuthContext'
import { useDemoNotifications } from '../useDemoNotifications'
import { _profilesStore, _galleryStore } from '../mockData'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/lib/theme'
import DemoGallery from './DemoGallery'

// ── Icons ──────────────────────────────────────────────────────────────────────
function IconBell() {
  return <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
}
function IconLogout() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
}

const NAV_LINKS = [
  { to: '/team',          label: 'Dashboard', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
  { to: '/team/stats',    label: 'My Stats',  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
  { to: '/team/gallery',  label: 'Gallery',   icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg> },
  { to: '/team/calendar', label: 'Calendar',  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
  { to: '/team/messages', label: 'Messages',  icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg> },
]

function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const { notifications, unreadCount, markRead, markAllRead } = useDemoNotifications(userId)
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
        <IconBell />
        {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-heading font-semibold text-sm">Notifications</h3>
              {unreadCount > 0 && <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all read</button>}
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
              {notifications.length === 0 ? <p className="text-center text-muted-foreground text-sm py-8">No notifications</p>
                : notifications.map((n) => (
                  <button key={n.id} onClick={() => markRead(n.id)} className={cn('w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors', !n.read && 'bg-primary/5')}>
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                      <div className={cn(!n.read ? '' : 'ml-4')}>
                        <p className="text-sm">{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DemoTeamGallery() {
  const { profile, signOut } = useDemoAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // 'all' or a client id
  const [tab, setTab] = useState<'all' | string>('all')

  if (!profile) return null

  const clients = _profilesStore.filter((p) => p.role === 'client')

  const galleryFilter: string | null = tab === 'all' ? null : tab
  const galleryTitle = tab === 'all' ? 'All Files' : _profilesStore.find((p) => p.id === tab)?.full_name ?? 'Client Files'

  function clientFileCount(clientId: string) {
    return _galleryStore.filter((f) => f.owner_id === clientId).length
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Topbar */}
      <header className="h-[52px] border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30 flex items-center px-4 gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <img src={pinguPhone} alt="Pingu Studio" className="w-8 h-8 object-contain rounded-lg" />
          <span className="font-heading font-semibold text-sm hidden sm:block">Pingu Studio</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <NotificationBell userId={profile.id} />
          <ThemeToggle />
          <span className="text-sm text-muted-foreground hidden md:block">{profile.full_name}</span>
          <button onClick={() => { signOut(); navigate('/login') }} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Sign out"><IconLogout /></button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 'calc(100vh - 52px)' }}>
        {/* ── Left nav sidebar ── */}
        <aside className="w-56 border-r border-border bg-background flex flex-col flex-shrink-0 overflow-y-auto animate-slide-in-left">
          <div className="px-4 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">{profile.full_name.charAt(0)}</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{profile.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
              </div>
            </div>
          </div>
          <div className="px-3 pb-2"><div className="h-px bg-border/60" /></div>
          <nav className="px-2 space-y-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mt-1">Team</p>
            {NAV_LINKS.map(({ to, label, icon }) => {
              const isActive = location.pathname === to
              return (
                <Link key={to} to={to} className={cn('sidebar-item w-full flex items-center gap-2', isActive && 'active')}>
                  {icon}<span>{label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="px-3 py-3"><div className="h-px bg-border/60" /></div>

          {/* Gallery sub-nav */}
          <nav className="px-2 space-y-0.5 pb-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Gallery</p>

            {/* All Files */}
            <button
              onClick={() => setTab('all')}
              className={cn('sidebar-item w-full flex items-center gap-2', tab === 'all' && 'active')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              <span>All Files</span>
              <span className="ml-auto text-xs text-muted-foreground">{_galleryStore.length}</span>
            </button>

            {/* Per client */}
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest px-2 pt-2 pb-1 font-semibold">By Client</p>
            {clients.map((client) => {
              const count = clientFileCount(client.id)
              return (
                <button
                  key={client.id}
                  onClick={() => setTab(client.id)}
                  className={cn('sidebar-item w-full flex items-center gap-2', tab === client.id && 'active')}
                >
                  <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0', tab === client.id ? 'bg-primary text-white' : 'bg-muted text-foreground')}>
                    {client.full_name.charAt(0)}
                  </div>
                  <span className="truncate flex-1 text-left">{client.full_name}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{count}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        {/* ── Main area ── */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <div className="px-6 pt-5 pb-3 border-b border-border flex-shrink-0">
            <h1 className="text-xl font-heading font-bold">{galleryTitle}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {tab === 'all' ? 'All client files — view and organize assets.' : 'Files belonging to this client.'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <DemoGallery
              filterOwnerId={galleryFilter}
              currentUserId={profile.id}
              showOwner={tab === 'all'}
              storageLimitOwnerId={null}
            />
          </div>
        </div>
      </div>

      <ChatPanel currentUserId={profile.id} />
    </div>
  )
}
