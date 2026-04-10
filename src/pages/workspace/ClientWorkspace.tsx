import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { useProjects } from '@/hooks/useProjects'
import { useAuth } from '@/hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { useApiFetch } from '@/lib/api'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { ClientLayout } from '@/components/workspace/ClientLayout'
import { cn } from '@/lib/utils'
import type { Project, Plan } from '@/types'

function IconVideo() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
}
function IconCheck() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
}
function IconClock() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}
function IconPlus() {
  return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}
function IconChevronRight() {
  return <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
}

function StatCard({ label, value, sub, icon, color, delay = '' }: {
  label: string; value: string | number; sub?: string
  icon: React.ReactNode; color: string; delay?: string
}) {
  return (
    <div className={cn('clay-card p-4 flex items-center gap-4 animate-slide-up hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200', delay)}>
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>{icon}</div>
      <div>
        <p className="text-2xl font-heading font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
      </div>
    </div>
  )
}

function ProjectPreviewCard({ project }: { project: Project }) {
  const needsAction = project.status === 'client_reviewing'
  return (
    <div className="clay-card overflow-hidden animate-scale-in">
      <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-heading font-bold truncate">{project.title}</h2>
          {project.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
          )}
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>
      <div className="px-6 py-3 flex items-center gap-6 text-xs text-muted-foreground border-b border-border/50 bg-muted/20">
        <span>Updated {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}</span>
        {project.max_client_revisions !== -1
          ? <span>{project.max_client_revisions - project.client_revision_count} revision(s) left</span>
          : <span>Unlimited revisions</span>}
      </div>
      <div className="px-6 py-5">
        {needsAction ? (
          <div className="bg-primary/8 border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary mb-4">
            Your video is ready to review. Open the project to approve or leave feedback.
          </div>
        ) : project.status === 'revision_requested' ? (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 mb-4">
            Revision requested — the team is working on your feedback.
          </div>
        ) : project.status === 'in_progress' ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 mb-4">
            Our team is actively editing your video. You'll be notified when it's ready.
          </div>
        ) : project.status === 'client_approved' ? (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 mb-4">
            Project complete! Your video has been approved and is available to download.
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-4">
            Waiting for a team member to be assigned. We'll notify you when work begins.
          </div>
        )}
        <Link to={`/workspace/projects/${project.id}`} className="btn-gradient inline-flex items-center gap-2 text-sm">
          Open Project <IconChevronRight />
        </Link>
      </div>
    </div>
  )
}

export default function ClientWorkspace() {
  const { data: projects, isLoading } = useProjects()
  const { profile } = useAuth()
  const apiFetch = useApiFetch()
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'completed' ? 'completed' : 'active'

  const { data: plan } = useQuery<Plan>({
    queryKey: ['plan', profile?.plan_id],
    queryFn: () => apiFetch<Plan>('/api/plans/' + profile!.plan_id),
    enabled: !!profile?.plan_id,
  })

  const allProjects = (projects ?? []) as Project[]
  const active = allProjects.filter((p) => p.status !== 'client_approved')
  const completed = allProjects.filter((p) => p.status === 'client_approved')
  const displayProjects = tab === 'active' ? active : completed

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const selectedProject = allProjects.find((p) => p.id === (activeProjectId ?? displayProjects[0]?.id))

  const projectLimitReached = plan && plan.max_active_projects !== -1 && active.length >= plan.max_active_projects
  const timeSaved = profile?.time_saved_hours ?? null

  return (
    <ClientLayout>
      <main className="px-6 py-6 max-w-4xl">
        {/* Welcome */}
        <div className="mb-6 animate-slide-up">
          <h1 className="text-2xl font-heading font-bold">
            Welcome back, <span className="text-shimmer">{profile?.full_name.split(' ')[0]}</span>!
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Here's an overview of your workspace.</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <StatCard label="Active Projects" value={active.length} icon={<IconVideo />} color="bg-primary/10 text-primary" delay="stagger-1" />
          <StatCard label="Completed" value={completed.length} icon={<IconCheck />} color="bg-green-50 text-green-700" delay="stagger-2" />
          <StatCard label="Total Projects" value={allProjects.length} icon={<IconVideo />} color="bg-blue-50 text-blue-700" delay="stagger-3" />
          {timeSaved !== null ? (
            <StatCard label="Time Saved" value={`${timeSaved}h`} icon={<IconClock />} color="bg-amber-50 text-amber-700" delay="stagger-4" />
          ) : (
            <div className="clay-card p-4 flex items-center gap-4 animate-slide-up stagger-4 opacity-50">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0"><IconClock /></div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Time Saved</p>
                <p className="text-xs text-muted-foreground mt-0.5">Set by your account manager</p>
              </div>
            </div>
          )}
        </div>

        {/* New project CTA */}
        <div className="mb-6 animate-slide-up stagger-5">
          <div className="clay-card p-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold">Start a new project</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {projectLimitReached
                  ? `Monthly limit reached — ${plan!.max_active_projects}/${plan!.max_active_projects} active projects on the ${plan!.name} plan.`
                  : "Submit your footage and we'll take care of the rest."}
              </p>
            </div>
            {projectLimitReached ? (
              <div className="btn-gradient flex items-center gap-2 text-sm opacity-40 cursor-not-allowed pointer-events-none flex-shrink-0">
                <IconPlus /><span>New Project</span>
              </div>
            ) : (
              <Link to="/workspace/new" className="btn-gradient flex items-center gap-2 text-sm flex-shrink-0">
                <IconPlus /><span>New Project</span>
              </Link>
            )}
          </div>
        </div>

        {/* Project list + preview */}
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
        ) : displayProjects.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-xl">
            <p className="text-muted-foreground text-sm mb-4">
              {tab === 'active' ? 'No active projects yet' : 'No completed projects yet'}
            </p>
            {tab === 'active' && !projectLimitReached && (
              <Link to="/workspace/new" className="text-primary hover:underline text-sm font-medium">
                Create your first project →
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              {displayProjects.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setActiveProjectId(p.id)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-xl border transition-all duration-150 flex items-center gap-3 animate-slide-up',
                    `stagger-${Math.min(i + 1, 7)}`,
                    selectedProject?.id === p.id
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-card border-border hover:bg-muted/50',
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', {
                    'bg-amber-400': p.status === 'pending_assignment',
                    'bg-blue-500': p.status === 'in_progress',
                    'bg-violet-500': p.status === 'in_review',
                    'bg-orange-500': p.status === 'client_reviewing',
                    'bg-red-500': p.status === 'revision_requested',
                    'bg-green-500': p.status === 'client_approved',
                    'bg-indigo-500': p.status === 'admin_approved',
                  })} />
                  <span className="flex-1 text-sm font-medium truncate">{p.title}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}</span>
                  <IconChevronRight />
                </button>
              ))}
            </div>

            {selectedProject && (
              <div className="mt-6">
                <ProjectPreviewCard project={selectedProject} />
              </div>
            )}
          </div>
        )}
      </main>
    </ClientLayout>
  )
}
