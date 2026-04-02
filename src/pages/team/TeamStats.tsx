import { useClerk } from '@clerk/react'
import { Link, useLocation } from 'react-router-dom'
import pinguPhone from '@/assets/pingu-phone.png'
import { useProjects } from '@/hooks/useProjects'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'
import { ThemeToggle } from '@/lib/theme'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import type { Project, ProjectStatus, TimelineComment } from '@/types'

const STATUS_LABELS: Record<ProjectStatus, string> = {
  pending_assignment: 'Pending Assignment',
  in_progress: 'In Progress',
  in_review: 'In Review',
  admin_approved: 'Admin Approved',
  client_reviewing: 'Client Reviewing',
  client_approved: 'Completed',
  revision_requested: 'Revision Requested',
}

const STATUS_COLORS: Record<ProjectStatus, string> = {
  pending_assignment: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  in_review: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  admin_approved: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  client_reviewing: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  client_approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  revision_requested: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const teamLinks = [
  { to: '/team', label: 'Dashboard', exact: true },
  { to: '/team/stats', label: 'My Stats' },
  { to: '/team/gallery', label: 'Gallery' },
  { to: '/team/calendar', label: 'Calendar' },
  { to: '/team/messages', label: 'Messages' },
]

export default function TeamStats() {
  const { signOut } = useClerk()
  const { data: projects, isLoading } = useProjects()
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const apiFetch = useApiFetch()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
  }

  const allProjects = (projects ?? []) as Project[]
  const active = allProjects.filter((p) => p.status !== 'client_approved')
  const completed = allProjects.filter((p) => p.status === 'client_approved')

  // Revision stats
  const totalRevisions = allProjects.reduce((acc, p) => acc + p.client_revision_count, 0)
  const currentlyInRevision = allProjects.filter((p) => p.status === 'revision_requested').length

  // Group by status
  const byStatus = allProjects.reduce<Record<string, Project[]>>((acc, p) => {
    if (!acc[p.status]) acc[p.status] = []
    acc[p.status].push(p)
    return acc
  }, {})

  // Fetch revision comments for my projects
  const myProjectIds = allProjects.map((p) => p.id)
  const { data: allComments = [] } = useQuery<(TimelineComment & { profiles: { full_name: string; avatar_url: string | null } })[]>({
    queryKey: ['revision_comments', myProjectIds.join(',')],
    queryFn: async () => {
      if (myProjectIds.length === 0) return []
      const results = await Promise.all(
        myProjectIds.map((id) =>
          apiFetch<(TimelineComment & { profiles: { full_name: string; avatar_url: string | null } })[]>(`/api/timeline-comments/${id}`)
        )
      )
      return results.flat()
    },
    enabled: myProjectIds.length > 0,
  })

  const revisionComments = allComments.filter((c) => c.author_role !== 'team')
  const projectsWithRevisions = allProjects.filter((p) => p.client_revision_count > 0)

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
            const isActive = exact ? pathname === to : pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              >
                {label}
              </Link>
            )
          })}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-heading font-semibold tracking-tight mb-6">My Stats</h1>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'Total Projects', value: allProjects.length, color: 'text-foreground' },
                { label: 'Active', value: active.length, color: 'text-primary' },
                { label: 'Completed', value: completed.length, color: 'text-green-600' },
                { label: 'Revisions Received', value: totalRevisions, color: totalRevisions > 0 ? 'text-red-500' : 'text-green-600' },
              ].map((s, i) => (
                <div key={s.label} className={`clay-card p-4 text-center animate-slide-up stagger-${i + 1}`}>
                  <p className={`text-3xl font-heading font-semibold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Currently in revision alert */}
            {currentlyInRevision > 0 && (
              <div className="mb-6 flex items-center gap-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-2xl px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 animate-pulse" />
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                  {currentlyInRevision} project{currentlyInRevision > 1 ? 's' : ''} currently awaiting revision
                </p>
              </div>
            )}

            {/* Status Breakdown */}
            {Object.keys(byStatus).length > 0 && (
              <div className="clay-card p-5 mb-8">
                <h2 className="font-heading font-semibold text-sm mb-4">Projects by Status</h2>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(byStatus) as [ProjectStatus, Project[]][]).map(([status, items]) => (
                    <div key={status} className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
                        {STATUS_LABELS[status]}
                        <span className="font-semibold">{items.length}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Revision breakdown per project */}
            {projectsWithRevisions.length > 0 && (
              <div className="clay-card p-5 mb-8">
                <h2 className="font-heading font-semibold text-sm mb-4">Revision History</h2>
                <div className="space-y-4">
                  {projectsWithRevisions.map((p) => {
                    const projectComments = revisionComments.filter((c) => c.project_id === p.id)
                    return (
                      <div key={p.id} className="space-y-2">
                        <div className="flex items-center gap-3">
                          <Link to={`/team/projects/${p.id}`} className="text-sm font-medium hover:text-primary transition-colors flex-1 truncate">{p.title}</Link>
                          <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            {p.client_revision_count}× revision
                          </span>
                        </div>
                        {projectComments.slice(0, 3).map((c) => (
                          <div key={c.id} className="ml-3 pl-3 border-l-2 border-red-300 dark:border-red-700">
                            <p className="text-xs text-muted-foreground line-clamp-2">{c.comment_text}</p>
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">{c.profiles.full_name} · {new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                          </div>
                        ))}
                        {projectComments.length > 3 && (
                          <p className="ml-3 text-[10px] text-muted-foreground">+{projectComments.length - 3} more comments</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Project List Table */}
            {allProjects.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-border rounded-2xl">
                <p className="text-muted-foreground text-sm">No projects assigned yet. Check back soon!</p>
              </div>
            ) : (
              <div className="clay-card overflow-hidden">
                <h2 className="font-heading font-semibold text-sm px-5 pt-5 pb-3">All Projects</h2>
                <div className="divide-y divide-border">
                  {allProjects.map((p) => (
                    <Link
                      key={p.id}
                      to={`/team/projects/${p.id}`}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{p.title}</p>
                          {p.client_revision_count > 0 && (
                            <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                              {p.client_revision_count}×
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Updated {new Date(p.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <span className={`ml-4 flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                    </Link>
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
