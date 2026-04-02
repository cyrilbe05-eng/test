import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { useProjects } from '@/hooks/useProjects'
import { KanbanBoard } from '@/components/admin/KanbanBoard'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { AdminNav } from '@/components/admin/AdminNav'

type View = 'kanban' | 'list'

export default function AdminProjects() {
  const [view, setView] = useState<View>('kanban')
  const { data: projects, isLoading } = useProjects()

  if (isLoading) return <PageLoader />

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-heading font-semibold tracking-tight">Projects</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{projects?.length ?? 0} total</p>
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1 border border-border">
            {(['kanban', 'list'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
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
    </div>
  )
}

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
}
