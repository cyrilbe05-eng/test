import { Link } from 'react-router-dom'
import { useProjects } from '@/hooks/useProjects'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { cn } from '@/lib/utils'
import type { Project, ProjectStatus, TimelineComment } from '@/types'

const STATUS_LABELS: Record<ProjectStatus, string> = {
  pending_assignment: 'Pending',
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

interface Deadline {
  id: string
  project_id: string
  team_member_id: string
  assignment_id: string
  due_at: string
  status: 'met' | 'missed' | 'pending'
  project_title: string
}

export default function TeamStats() {
  const { data: projects, isLoading } = useProjects()
  const apiFetch = useApiFetch()

  // Only show projects this team member is assigned to
  const allProjects = ((projects ?? []) as (Project & { is_assigned?: boolean })[]).filter((p) => p.is_assigned)
  const active = allProjects.filter((p) => p.status !== 'client_approved')
  const completed = allProjects.filter((p) => p.status === 'client_approved')

  const totalRevisions = allProjects.reduce((acc, p) => acc + p.client_revision_count, 0)
  const currentlyInRevision = allProjects.filter((p) => p.status === 'revision_requested').length
  const projectsWithRevisions = allProjects.filter((p) => p.client_revision_count > 0)

  // Deadlines
  const { data: deadlines = [] } = useQuery<Deadline[]>({
    queryKey: ['my_deadlines'],
    queryFn: () => apiFetch<Deadline[]>('/api/deadlines/my'),
  })
  const deadlineMet = deadlines.filter((d) => d.status === 'met').length
  const deadlineMissed = deadlines.filter((d) => d.status === 'missed').length
  const deadlinePending = deadlines.filter((d) => d.status === 'pending').length
  const totalResolved = deadlineMet + deadlineMissed
  const metRate = totalResolved > 0 ? Math.round((deadlineMet / totalResolved) * 100) : null

  // Revision comments on my projects from clients/admin
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

  return (
    <TeamLayout>
      <main className="px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-heading font-semibold tracking-tight">My Stats</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Your personal performance overview.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="clay-card p-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assigned</p>
                <p className="text-3xl font-bold mt-1">{allProjects.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{active.length} active · {completed.length} done</p>
              </div>
              <div className="clay-card p-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Deadlines Met</p>
                <p className="text-3xl font-bold mt-1 text-green-600">{deadlineMet}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{deadlineMissed} missed · {deadlinePending} pending</p>
              </div>
              <div className="clay-card p-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">On-time Rate</p>
                <p className={cn('text-3xl font-bold mt-1',
                  metRate === null ? 'text-muted-foreground'
                  : metRate >= 80 ? 'text-green-600'
                  : metRate >= 50 ? 'text-amber-600'
                  : 'text-red-600'
                )}>
                  {metRate !== null ? `${metRate}%` : '—'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {totalResolved > 0 ? `from ${totalResolved} resolved` : 'no resolved deadlines'}
                </p>
              </div>
              <div className="clay-card p-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Revisions Received</p>
                <p className={cn('text-3xl font-bold mt-1', totalRevisions > 0 ? 'text-red-600' : 'text-green-600')}>
                  {totalRevisions}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {currentlyInRevision > 0
                    ? `${currentlyInRevision} project${currentlyInRevision > 1 ? 's' : ''} pending revision`
                    : 'no active revisions'}
                </p>
              </div>
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

            {/* Deadline breakdown bar */}
            {deadlines.length > 0 && (
              <div className="clay-card p-5 mb-6">
                <p className="text-sm font-semibold mb-3">Deadline Breakdown</p>
                <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                  {deadlineMet > 0 && <div className="bg-green-500 h-full rounded-full" style={{ flex: deadlineMet }} />}
                  {deadlineMissed > 0 && <div className="bg-red-500 h-full rounded-full" style={{ flex: deadlineMissed }} />}
                  {deadlinePending > 0 && <div className="bg-orange-400 h-full rounded-full" style={{ flex: deadlinePending }} />}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{deadlineMet} met</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{deadlineMissed} missed</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />{deadlinePending} pending</span>
                </div>
              </div>
            )}

            {/* Revision history per project */}
            {projectsWithRevisions.length > 0 && (
              <div className="clay-card p-5 mb-6">
                <p className="text-sm font-semibold mb-3">Revision History</p>
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
                          <div key={c.id} className="ml-3 pl-3 border-l-2 border-red-200 dark:border-red-900/50">
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

            {/* Project list */}
            {allProjects.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-border rounded-2xl">
                <p className="text-muted-foreground text-sm">No projects assigned yet. Check back soon!</p>
              </div>
            ) : (
              <div className="clay-card overflow-hidden">
                <p className="font-heading font-semibold text-sm px-5 pt-5 pb-3">My Projects</p>
                <div className="divide-y divide-border">
                  {allProjects.map((p) => {
                    const deadline = deadlines.find((d) => d.project_id === p.id)
                    return (
                      <Link
                        key={p.id}
                        to={`/team/projects/${p.id}`}
                        className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/50 transition-colors group"
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
                        {deadline && (
                          <span className={cn(
                            'text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0',
                            deadline.status === 'met' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : deadline.status === 'missed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                          )}>
                            {deadline.status === 'met' ? '✓ deadline' : deadline.status === 'missed' ? '✗ deadline' : '⏰ deadline'}
                          </span>
                        )}
                        <span className={cn('flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[p.status])}>
                          {STATUS_LABELS[p.status]}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </TeamLayout>
  )
}
