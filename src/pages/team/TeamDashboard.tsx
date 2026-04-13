import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { useProjects } from '@/hooks/useProjects'
import { TeamLayout } from '@/components/workspace/TeamLayout'
import { ProjectStatusBadge } from '@/components/project/ProjectStatusBadge'
import { cn } from '@/lib/utils'
import type { Project, ProjectStatus } from '@/types'

// ── Kanban columns ────────────────────────────────────────────────────────────
const COLUMNS: { status: ProjectStatus; label: string; color: string }[] = [
  { status: 'pending_assignment', label: 'Pending',       color: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
  { status: 'in_progress',        label: 'In Progress',   color: 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' },
  { status: 'in_review',          label: 'In Review',     color: 'text-violet-700 bg-violet-50 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800' },
  { status: 'admin_approved',     label: 'Admin OK',      color: 'text-cyan-700 bg-cyan-50 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800' },
  { status: 'client_reviewing',   label: 'Client Review', color: 'text-orange-700 bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800' },
  { status: 'revision_requested', label: 'Revision',      color: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800' },
  { status: 'client_approved',    label: 'Approved',      color: 'text-green-700 bg-green-50 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800' },
]

type View = 'kanban' | 'list'

// ── Kanban board ──────────────────────────────────────────────────────────────
function TeamKanban({ projects }: { projects: Project[] }) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<ProjectStatus | null>(null)

  return (
    <div className="flex gap-3 overflow-x-auto pb-6 animate-fade-in">
      {COLUMNS.map((col, colIdx) => {
        const cards = projects.filter((p) => p.status === col.status)
        const isOver = dragOver === col.status
        return (
          <div
            key={col.status}
            className={cn(
              'flex-shrink-0 w-56 flex flex-col rounded-xl border transition-all duration-150 animate-slide-up',
              `stagger-${Math.min(colIdx + 1, 7)}`,
              isOver ? 'border-primary/50 bg-primary/5' : 'border-border bg-card/30',
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(col.status) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => { setDragging(null); setDragOver(null) }}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className={cn('text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border', col.color)}>
                {col.label}
              </span>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
                {cards.length}
              </span>
            </div>

            <div className="flex-1 px-2 pb-3 space-y-2 min-h-[60px]">
              {cards.map((p, i) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => setDragging(p.id)}
                  onDragEnd={() => { setDragging(null); setDragOver(null) }}
                  className={cn(
                    'clay-card p-3 transition-all duration-150 animate-slide-up cursor-grab active:cursor-grabbing hover:shadow-lg hover:-translate-y-0.5',
                    `stagger-${Math.min(i + 1, 7)}`,
                    dragging === p.id && 'opacity-40 scale-95',
                  )}
                >
                  <Link to={`/team/projects/${p.id}`} className="block">
                    <p className="font-medium text-sm text-foreground line-clamp-2 leading-snug">{p.title}</p>
                    {(p as any).profiles?.full_name && (
                      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                        {(p as any).profiles.full_name}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                    </p>
                  </Link>
                </div>
              ))}
              {cards.length === 0 && (
                <div className={cn(
                  'border border-dashed rounded-lg p-3 flex items-center justify-center text-xs text-muted-foreground/50 min-h-[60px] transition-colors',
                  isOver ? 'border-primary/40 text-primary/50' : 'border-border/50',
                )}>
                  {isOver ? 'Drop here' : 'Empty'}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TeamDashboard() {
  const { data: projects, isLoading } = useProjects()
  const [view, setView] = useState<View>('kanban')

  const allProjects = (projects ?? []) as Project[]

  return (
    <TeamLayout>
      <main className="px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-heading font-semibold tracking-tight">My Assignments</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {allProjects.length} project{allProjects.length !== 1 ? 's' : ''} assigned to you
            </p>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setView('kanban')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5',
                view === 'kanban' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              Kanban
            </button>
            <button
              onClick={() => setView('list')}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5',
                view === 'list' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              List
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : allProjects.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-2xl">
            <p className="text-muted-foreground text-sm">No projects assigned yet. Check back soon!</p>
          </div>
        ) : view === 'kanban' ? (
          <TeamKanban projects={allProjects} />
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden animate-slide-up">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left bg-muted/20">
                  {['Client', 'Title', 'Status', 'Updated'].map((h) => (
                    <th key={h} className="px-4 py-3 text-muted-foreground font-medium text-xs uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {allProjects.map((p, i) => (
                  <tr
                    key={p.id}
                    className={cn('transition-colors hover:bg-muted/20 animate-slide-up', `stagger-${Math.min(i + 1, 7)}`)}
                  >
                    <td className="px-4 py-3 text-muted-foreground text-sm">{(p as any).profiles?.full_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Link to={`/team/projects/${p.id}`} className="text-primary hover:underline font-medium">{p.title}</Link>
                    </td>
                    <td className="px-4 py-3"><ProjectStatusBadge status={p.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </TeamLayout>
  )
}
