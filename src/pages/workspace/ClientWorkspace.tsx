import { useClerk } from '@clerk/react'
import { Link, useLocation } from 'react-router-dom'
import pinguWave from '@/assets/pingu-wave.png'
import { useProjects } from '@/hooks/useProjects'
import { ProjectCard } from '@/components/project/ProjectCard'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { ThemeToggle } from '@/lib/theme'
import type { Project } from '@/types'

const clientLinks = [
  { to: '/workspace', label: 'Projects', exact: true },
  { to: '/workspace/gallery', label: 'Gallery' },
  { to: '/workspace/calendar', label: 'Calendar' },
  { to: '/workspace/messages', label: 'Messages' },
  { to: '/workspace/analytics', label: 'Analytics' },
]

export default function ClientWorkspace() {
  const { signOut } = useClerk()
  const { data: projects, isLoading } = useProjects()
  const { profile } = useAuth()
  const { pathname } = useLocation()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
  }

  const active = (projects ?? []).filter((p) => p.status !== 'client_approved')
  const completed = (projects ?? []).filter((p) => p.status === 'client_approved')

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between" style={{ height: '52px' }}>
          <div className="flex items-center gap-2.5">
            <img src={pinguWave} alt="Pingu Studio" className="w-8 h-8 object-contain rounded-lg" />
            <span className="font-heading font-semibold text-sm">Pingu Studio</span>
          </div>
          <div className="flex items-center gap-1">
            {profile && <NotificationBell userId={profile.id} />}
            <ThemeToggle />
            <button onClick={handleSignOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted">Sign out</button>
          </div>
        </div>
      </header>

      <nav className="border-b border-border bg-background">
        <div className="max-w-5xl mx-auto px-6 flex gap-1 h-10 items-center">
          {clientLinks.map(({ to, label, exact }) => {
            const active = exact ? pathname === to : pathname.startsWith(to)
            return <Link key={to} to={to} className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{label}</Link>
          })}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Welcome */}
        <div className="mb-8 animate-slide-up">
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Welcome back{profile ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
          <p className="text-muted-foreground mt-1 text-sm">Here's an overview of your projects.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { label: 'Active Projects', value: active.length, color: 'text-primary' },
            { label: 'Completed', value: completed.length, color: 'text-green-600' },
            { label: 'Total', value: (projects ?? []).length, color: 'text-foreground' },
          ].map((s, i) => (
            <div key={s.label} className={`clay-card p-4 text-center animate-slide-up stagger-${i + 1}`}>
              <p className={`text-3xl font-heading font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* New project CTA */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-semibold">Active Projects</h2>
          <Link
            to="/workspace/new"
            className="px-4 py-2 bg-primary rounded-xl text-white text-sm font-semibold shadow-clay hover:brightness-110 transition-all active:scale-[0.98]"
          >
            + New Project
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : active.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-2xl">
            <p className="text-muted-foreground mb-4 text-sm">No active projects yet</p>
            <Link to="/workspace/new" className="text-primary hover:underline text-sm font-medium">Create your first project →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {active.map((p, i) => (
              <div key={p.id} className={`animate-slide-up stagger-${Math.min(i + 1, 7)}`}>
                <ProjectCard project={p as Project} href={`/workspace/projects/${p.id}`} />
              </div>
            ))}
          </div>
        )}

        {completed.length > 0 && (
          <div className="mt-10">
            <h2 className="font-heading font-semibold mb-4 text-muted-foreground">Completed</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-60">
              {completed.map((p) => (
                <ProjectCard key={p.id} project={p as Project} href={`/workspace/projects/${p.id}`} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
