import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import pinguWave from '@/assets/pingu-wave.png'
import { formatDistanceToNow } from 'date-fns'
import { useDemoAuth } from '../DemoAuthContext'
import { useDemoNotifications } from '../useDemoNotifications'
import { _galleryStore, MOCK_PLANS, _profilesStore } from '../mockData'
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
function IconVideo() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
}
function IconCheck() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
}
function IconFolder() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
}
function IconPlus() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function DemoNotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const { notifications, unreadCount, markRead, markAllRead } = useDemoNotifications(userId)
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" aria-label="Notifications">
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
              {notifications.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">No notifications</p>
              ) : notifications.map((n) => (
                <button key={n.id} onClick={() => markRead(n.id)} className={cn('w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors', !n.read && 'bg-primary/5')}>
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                    <div className={cn(!n.read ? '' : 'ml-4')}>
                      <p className="text-sm text-foreground">{n.message}</p>
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

export default function DemoClientGallery() {
  const { profile, signOut } = useDemoAuth()
  const navigate = useNavigate()
  if (!profile) return null

  const myFiles = _galleryStore.filter((f) => f.owner_id === profile.id)
  const totalSize = myFiles.reduce((s, f) => s + f.file_size, 0)
  const userProfile = _profilesStore.find((u) => u.id === profile.id)
  const plan = MOCK_PLANS.find((p) => p.id === userProfile?.plan_id)
  const limitBytes = plan && plan.storage_limit_mb !== -1 ? plan.storage_limit_mb * 1024 * 1024 : null
  const usagePct = limitBytes ? Math.min(100, (totalSize / limitBytes) * 100) : null

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Topbar */}
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30 flex items-center px-4 gap-4" style={{ height: '52px' }}>
        <div className="flex items-center gap-2 mr-2">
          <img src={pinguWave} alt="Pingu Studio" className="w-8 h-8 object-contain rounded-lg flex-shrink-0" />
          <span className="font-heading font-semibold text-sm hidden sm:block">Pingu Studio</span>
        </div>
        <div className="flex-1" />
        <DemoNotificationBell userId={profile.id} />
        <ThemeToggle />
        <button onClick={() => { signOut(); navigate('/login') }} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Sign out"><IconLogout /></button>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 'calc(100vh - 52px)' }}>
        {/* Sidebar */}
        <aside className="w-60 border-r border-border bg-background flex flex-col flex-shrink-0 animate-slide-in-left">
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
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1 mt-2">Projects</p>
            <Link to="/workspace" className="sidebar-item w-full flex items-center gap-2"><IconVideo /><span>Active</span></Link>
            <Link to="/workspace" className="sidebar-item w-full flex items-center gap-2"><IconCheck /><span>Completed</span></Link>
          </nav>

          <div className="px-3 py-3"><div className="h-px bg-border/60" /></div>

          <nav className="px-2 space-y-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">Files</p>
            <button className="sidebar-item w-full active">
              <IconFolder /><span>My Gallery</span>
              <span className="ml-auto text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-medium">{myFiles.length}</span>
            </button>
          </nav>

          {/* Storage usage */}
          {usagePct !== null && (
            <div className="mx-3 mt-3 p-3 bg-muted/50 rounded-xl">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Storage</span>
                <span className="font-medium">{formatBytes(totalSize)}{limitBytes ? ` / ${formatBytes(limitBytes)}` : ''}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-500', usagePct >= 90 ? 'bg-red-500' : usagePct >= 70 ? 'bg-amber-400' : 'bg-primary')} style={{ width: `${usagePct}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{usagePct.toFixed(0)}% of {plan?.name} plan used</p>
            </div>
          )}

          <div className="flex-1" />

          <div className="p-3 border-t border-border/60">
            <Link to="/workspace/new" className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
              <IconPlus /><span>New Project</span>
            </Link>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto px-6 py-6 flex flex-col">
          <div className="mb-4">
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2"><IconFolder /> My Gallery</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Your personal file storage — organize into folders, upload assets.</p>
          </div>
          <div className="flex-1">
            <DemoGallery
              filterOwnerId={profile.id}
              currentUserId={profile.id}
              showOwner={false}
              storageLimitOwnerId={profile.id}
            />
          </div>
        </main>
      </div>

      <ChatPanel currentUserId={profile.id} />
    </div>
  )
}
