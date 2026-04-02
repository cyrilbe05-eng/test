import { useClerk } from '@clerk/react'
import { Link, useLocation } from 'react-router-dom'
import pinguPhone from '@/assets/pingu-phone.png'
import { useProjects } from '@/hooks/useProjects'
import { ProjectCard } from '@/components/project/ProjectCard'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { ThemeToggle } from '@/lib/theme'
import type { Project } from '@/types'

const teamLinks = [
  { to: '/team', label: 'Dashboard', exact: true },
  { to: '/team/stats', label: 'My Stats' },
  { to: '/team/gallery', label: 'Gallery' },
  { to: '/team/calendar', label: 'Calendar' },
  { to: '/team/messages', label: 'Messages' },
]

export default function TeamDashboard() {
  const { signOut } = useClerk()
  const { data: projects, isLoading } = useProjects()
  const { profile } = useAuth()
  const { pathname } = useLocation()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
  }

  const active = (projects ?? []).filter((p) => p.status !== 'client_approved')
  const done = (projects ?? []).filter((p) => p.status === 'client_approved')

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between" style={{ height: '52px' }}>
          <div className="flex items-center gap-2.5">
            <img src={pinguPhone} alt="Pingu Studio" className="w-8 h-8 object-contain rounded-lg" />
            <span className="font-heading font-semibold text-sm">Pingu Studio</span>
          </div>
          <div className="flex items-center gap-1">
            {profile && <NotificationBell userId={profile.id} />}
            <ThemeToggle />
            <span className="text-sm text-muted-foreground hidden sm:block">{profile?.full_name}</span>
            <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted">Sign out</button>
          </div>
        </div>
      </header>

      <nav className="border-b border-border bg-background">
        <div className="max-w-5xl mx-auto px-6 flex gap-1 h-10 items-center">
          {teamLinks.map(({ to, label, exact }) => {
            const active = exact ? pathname === to : pathname.startsWith(to)
            return <Link key={to} to={to} className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{label}</Link>
          })}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-heading font-semibold tracking-tight mb-6">My Assignments</h1>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : active.length === 0 && done.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-2xl">
            <p className="text-muted-foreground text-sm">No projects assigned yet. Check back soon!</p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div className="mb-8">
                <h2 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-3">Active</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {active.map((p) => (
                    <ProjectCard key={p.id} project={p as Project} href={`/team/projects/${p.id}`} showClient />
                  ))}
                </div>
              </div>
            )}
            {done.length > 0 && (
              <div className="opacity-60">
                <h2 className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-3">Completed</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {done.map((p) => (
                    <ProjectCard key={p.id} project={p as Project} href={`/team/projects/${p.id}`} showClient />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
