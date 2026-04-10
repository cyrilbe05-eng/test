import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { useProjects } from '@/hooks/useProjects'
import { KanbanBoard } from '@/components/admin/KanbanBoard'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { cn } from '@/lib/utils'

function IconLayout() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  )
}
function IconList() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  )
}

type View = 'kanban' | 'list'

export default function AdminProjects() {
  const [view, setView] = useState<View>('kanban')
  const { data: projects, isLoading } = useProjects()

  if (isLoading) return <PageLoader />

  return (
    <AdminLayout>
      <main className="px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-heading font-bold">Projects</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{projects?.length ?? 0} total</p>
          </div>
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border border-border">
            {(['kanban', 'list'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all capitalize',
                  view === v ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'kanban' ? <IconLayout /> : <IconList />}
                {v}
              </button>
            ))}
          </div>
        </div>

        {view === 'kanban' ? (
          <KanbanBoard projects={projects ?? []} />
        ) : (
          <div className="clay-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {['Client', 'Title', 'Status', 'Assigned', 'Created', 'Updated'].map((h) => (
                    <th key={h} className="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(projects ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{(p as any).profiles?.full_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Link to={`/admin/projects/${p.id}`} className="text-primary hover:underline font-medium">{p.title}</Link>
                    </td>
                    <td className="px-4 py-3"><ProjectStatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">—</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AdminLayout>
  )
}

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
}
