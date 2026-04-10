import { useProjects } from '@/hooks/useProjects'
import { ProjectCard } from '@/components/project/ProjectCard'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import type { Project } from '@/types'

export default function TeamDashboard() {
  const { data: projects, isLoading } = useProjects()

  const active = (projects ?? []).filter((p) => p.status !== 'client_approved')
  const done = (projects ?? []).filter((p) => p.status === 'client_approved')

  return (
    <TeamLayout>
      <main className="px-6 py-8">
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
    </TeamLayout>
  )
}
